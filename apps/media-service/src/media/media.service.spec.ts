import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { ForbiddenException } from '@nestjs/common';
import { S3Service } from './s3.service';
import { EventPublisherService } from '../events/event-publisher.service';
import { EvidenceCustodyClient } from './evidence-custody.client';
import { MediaEntityType, UserRole } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';

// `file-type` is ESM-only and dynamically imported by the service. Mock it so the
// magic-byte check returns "undetected" → the text/plain validation path is used.
jest.mock(
  'file-type',
  () => ({ fileTypeFromBuffer: jest.fn(async () => undefined) }),
  { virtual: true },
);

type Mocked<T> = { [K in keyof T]: jest.Mock };

const mockRepo = (): Mocked<Repository<Media>> =>
  ({
    create: jest.fn((dto) => dto),
    save: jest.fn(async (e) => ({ id: 'media-1', ...e })),
    find: jest.fn(),
    findOne: jest.fn(),
  }) as any;

const mockS3 = (): Mocked<S3Service> =>
  ({
    upload: jest.fn(async () => 'https://bucket.s3.amazonaws.com/key'),
    delete: jest.fn(),
    getPresignedUrl: jest.fn(),
  }) as any;

const mockEvents = (): Mocked<EventPublisherService> =>
  ({ publishMediaUploaded: jest.fn(), publishEvidenceMediaViewed: jest.fn() }) as any;

const mockCustodyClient = (): Mocked<EvidenceCustodyClient> =>
  ({ getCurrentCustodianId: jest.fn() }) as any;

const actor = (sub = 'user-1'): JwtPayload =>
  ({ sub, email: 'u@x.com', role: UserRole.ANALYST, keycloak_user_id: 'kc-1' }) as any;

// A plain-text file: file-type detects no magic bytes, so validateFile accepts it
// when the declared mimetype is text/plain (no S3/network needed).
const textFile = (originalname = 'orig.txt'): Express.Multer.File =>
  ({
    originalname,
    mimetype: 'text/plain',
    size: 12,
    buffer: Buffer.from('hello world'),
  }) as any;

describe('MediaService', () => {
  let service: MediaService;
  let repo: Mocked<Repository<Media>>;
  let s3: Mocked<S3Service>;
  let events: Mocked<EventPublisherService>;
  let custodyClient: Mocked<EvidenceCustodyClient>;

  beforeEach(async () => {
    repo = mockRepo();
    s3 = mockS3();
    events = mockEvents();
    custodyClient = mockCustodyClient();

    const module = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(Media), useValue: repo },
        { provide: S3Service, useValue: s3 },
        { provide: EventPublisherService, useValue: events },
        { provide: EvidenceCustodyClient, useValue: custodyClient },
        { provide: ConfigService, useValue: { get: (_k: string, d?: any) => d } },
      ],
    }).compile();

    service = module.get(MediaService);
  });

  const dto = (description?: string) => ({
    entity_type: MediaEntityType.EVIDENCE,
    entity_id: '550e8400-e29b-41d4-a716-446655440000',
    description,
  });

  describe('upload', () => {
  it('persists the optional description when provided', async () => {
    await service.upload(textFile(), dto('Front building camera clip'), 'user-1');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Front building camera clip' }),
    );
  });

  it('stores description = null when omitted (backward-compatible)', async () => {
    await service.upload(textFile(), dto(), 'user-1');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it('stores the multipart filename verbatim as originalFilename (custom rename)', async () => {
    await service.upload(textFile('Cámara frontal edificio.txt'), dto(), 'user-1');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ originalFilename: 'Cámara frontal edificio.txt' }),
    );
  });

  it('includes description in the media.uploaded event payload', async () => {
    repo.save.mockResolvedValueOnce({
      id: 'media-1',
      url: 'https://bucket.s3.amazonaws.com/key',
      description: 'A note',
    } as any);

    await service.upload(textFile(), dto('A note'), 'user-1');

    expect(events.publishMediaUploaded).toHaveBeenCalledWith(
      'user-1',
      'media-1',
      expect.objectContaining({ description: 'A note' }),
    );
  });
  });

  describe('getDownloadUrl', () => {
    const evidenceMedia = (custodian = 'user-2') =>
      ({
        id: 'media-1',
        entityType: MediaEntityType.EVIDENCE,
        entityId: 'evidence-1',
        s3Key: 'evidence/evidence-1/abc.jpg',
        originalFilename: 'Front camera.jpg',
        deleted: false,
      }) as any;

    it('blocks an attachment download of EVIDENCE media for a non-custodian (403)', async () => {
      repo.findOne.mockResolvedValueOnce(evidenceMedia());
      custodyClient.getCurrentCustodianId.mockResolvedValueOnce('user-2'); // not the caller

      await expect(
        service.getDownloadUrl('media-1', { disposition: 'attachment', actor: actor('user-1') }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(s3.getPresignedUrl).not.toHaveBeenCalled();
    });

    it('allows an attachment download of EVIDENCE media for the custodian', async () => {
      repo.findOne.mockResolvedValueOnce(evidenceMedia());
      custodyClient.getCurrentCustodianId.mockResolvedValueOnce('user-1'); // the caller
      s3.getPresignedUrl.mockResolvedValueOnce('https://signed');

      const res = await service.getDownloadUrl('media-1', {
        disposition: 'attachment',
        actor: actor('user-1'),
      });

      expect(res.url).toBe('https://signed');
      expect(s3.getPresignedUrl).toHaveBeenCalledWith(
        'evidence/evidence-1/abc.jpg',
        3600,
        expect.objectContaining({ disposition: 'attachment', filename: 'Front camera.jpg' }),
      );
    });

    it('treats an unknown/blank disposition as attachment (fail-safe gating)', async () => {
      repo.findOne.mockResolvedValueOnce(evidenceMedia());
      custodyClient.getCurrentCustodianId.mockResolvedValueOnce('user-2');

      await expect(
        service.getDownloadUrl('media-1', { disposition: undefined, actor: actor('user-1') }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not gate an inline preview of EVIDENCE media (no custody check)', async () => {
      repo.findOne.mockResolvedValueOnce(evidenceMedia());
      s3.getPresignedUrl.mockResolvedValueOnce('https://inline');

      const res = await service.getDownloadUrl('media-1', {
        disposition: 'inline',
        actor: actor('user-1'),
      });

      expect(res.url).toBe('https://inline');
      expect(custodyClient.getCurrentCustodianId).not.toHaveBeenCalled();
    });

    it('logs an evidence media view only when context=viewer (not thumbnails)', async () => {
      repo.findOne.mockResolvedValueOnce(evidenceMedia());
      s3.getPresignedUrl.mockResolvedValueOnce('https://inline');

      await service.getDownloadUrl('media-1', {
        disposition: 'inline',
        context: 'viewer',
        actor: actor('user-1'),
      });

      expect(events.publishEvidenceMediaViewed).toHaveBeenCalledWith(
        'user-1',
        'media-1',
        expect.objectContaining({ evidence_id: 'evidence-1', media_id: 'media-1' }),
      );
    });

    it('does not log inline views without the viewer context (thumbnail noise guard)', async () => {
      repo.findOne.mockResolvedValueOnce(evidenceMedia());
      s3.getPresignedUrl.mockResolvedValueOnce('https://inline');

      await service.getDownloadUrl('media-1', { disposition: 'inline', actor: actor('user-1') });

      expect(events.publishEvidenceMediaViewed).not.toHaveBeenCalled();
    });

    it('does not gate or check custody for non-EVIDENCE media', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'media-2',
        entityType: MediaEntityType.CASE,
        entityId: 'case-1',
        s3Key: 'cases/case-1/abc.pdf',
        originalFilename: 'report.pdf',
        deleted: false,
      } as any);
      s3.getPresignedUrl.mockResolvedValueOnce('https://signed-case');

      const res = await service.getDownloadUrl('media-2', {
        disposition: 'attachment',
        actor: actor('user-1'),
      });

      expect(res.url).toBe('https://signed-case');
      expect(custodyClient.getCurrentCustodianId).not.toHaveBeenCalled();
    });
  });
});
