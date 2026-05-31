import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { S3Service } from './s3.service';
import { EventPublisherService } from '../events/event-publisher.service';
import { MediaEntityType } from '@aegiscase/enums';

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
  ({ publishMediaUploaded: jest.fn() }) as any;

// A plain-text file: file-type detects no magic bytes, so validateFile accepts it
// when the declared mimetype is text/plain (no S3/network needed).
const textFile = (originalname = 'orig.txt'): Express.Multer.File =>
  ({
    originalname,
    mimetype: 'text/plain',
    size: 12,
    buffer: Buffer.from('hello world'),
  }) as any;

describe('MediaService.upload', () => {
  let service: MediaService;
  let repo: Mocked<Repository<Media>>;
  let s3: Mocked<S3Service>;
  let events: Mocked<EventPublisherService>;

  beforeEach(async () => {
    repo = mockRepo();
    s3 = mockS3();
    events = mockEvents();

    const module = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(Media), useValue: repo },
        { provide: S3Service, useValue: s3 },
        { provide: EventPublisherService, useValue: events },
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
