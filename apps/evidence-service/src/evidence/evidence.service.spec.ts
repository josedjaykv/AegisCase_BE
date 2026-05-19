import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EvidenceService } from './evidence.service';
import { Evidence } from './evidence.entity';
import { ChainOfCustody } from './chain-of-custody.entity';
import { EventPublisherService } from '../events/event-publisher.service';
import { EvidenceStatus, EvidenceType, UserRole } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const mockRepo = <T>(): Mocked<Repository<T>> =>
  ({
    create: jest.fn((dto) => dto),
    save: jest.fn(async (e) => ({ id: 'ev-1', ...e })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
  }) as any;

const mockEvents = (): Mocked<EventPublisherService> =>
  ({
    publishEvidenceAdded: jest.fn(),
    publishEvidenceTransferred: jest.fn(),
    publishEvidenceArchived: jest.fn(),
  }) as any;

const actor = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'u@x.com',
  role: UserRole.DETECTIVE,
  keycloak_user_id: 'kc-1',
  ...overrides,
});

describe('EvidenceService', () => {
  let service: EvidenceService;
  let evidenceRepo: Mocked<Repository<Evidence>>;
  let custodyRepo: Mocked<Repository<ChainOfCustody>>;
  let events: Mocked<EventPublisherService>;

  beforeEach(async () => {
    evidenceRepo = mockRepo<Evidence>();
    custodyRepo = mockRepo<ChainOfCustody>();
    events = mockEvents();

    const module = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: getRepositoryToken(Evidence), useValue: evidenceRepo },
        { provide: getRepositoryToken(ChainOfCustody), useValue: custodyRepo },
        { provide: EventPublisherService, useValue: events },
      ],
    }).compile();

    service = module.get(EvidenceService);
  });

  describe('create', () => {
    it('registers evidence and seeds an initial chain-of-custody row with the actor as custodian', async () => {
      const persisted: Evidence = {
        id: 'ev-1',
        caseId: 'case-1',
        evidenceType: EvidenceType.PHYSICAL,
        evidenceStatus: EvidenceStatus.REGISTERED,
        currentCustodianId: 'user-1',
      } as any;
      evidenceRepo.save.mockResolvedValueOnce(persisted);
      // findOne is called with trackView=false in create
      evidenceRepo.findOne.mockResolvedValueOnce(persisted);

      await service.create(
        {
          caseId: 'case-1',
          evidenceType: EvidenceType.PHYSICAL,
          description: 'gun',
        },
        actor(),
      );

      expect(evidenceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceStatus: EvidenceStatus.REGISTERED,
          currentCustodianId: 'user-1',
        }),
      );
      expect(custodyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousCustodianId: null,
          newCustodianId: 'user-1',
          transferredByUserId: 'user-1',
          transferReason: 'Initial registration',
        }),
      );
      expect(events.publishEvidenceAdded).toHaveBeenCalled();
    });

    it('honors an explicit currentCustodianId in the DTO', async () => {
      evidenceRepo.save.mockResolvedValueOnce({ id: 'ev-1' } as any);
      evidenceRepo.findOne.mockResolvedValueOnce({ id: 'ev-1' } as any);

      await service.create(
        {
          caseId: 'case-1',
          evidenceType: EvidenceType.PHYSICAL,
          description: 'gun',
          currentCustodianId: 'user-2',
        },
        actor(),
      );

      expect(custodyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ newCustodianId: 'user-2', transferredByUserId: 'user-1' }),
      );
    });
  });

  describe('findOne', () => {
    it('appends a "viewed by user" custody row and updates currentCustodianId when trackView=true', async () => {
      const existing = {
        id: 'ev-1',
        currentCustodianId: 'user-2',
        custodyChain: [],
      } as any;
      evidenceRepo.findOne.mockResolvedValueOnce(existing);

      const result: any = await service.findOne('ev-1', actor());

      expect(custodyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousCustodianId: 'user-2',
          newCustodianId: 'user-1',
          transferReason: 'Viewed by user',
        }),
      );
      expect(evidenceRepo.save).toHaveBeenCalled();
      expect(result.currentCustodianId).toBe('user-1');
    });

    it('does not append custody rows when trackView=false', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'u' } as any);
      await service.findOne('ev-1', actor(), false);
      expect(custodyRepo.create).not.toHaveBeenCalled();
      expect(evidenceRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when missing', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findOne('ev-1', actor())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('transferCustody', () => {
    it('appends a custody row, flips status to TRANSFERRED and publishes the event', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({
        id: 'ev-1',
        caseId: 'case-1',
        currentCustodianId: 'user-2',
        evidenceStatus: EvidenceStatus.IN_CUSTODY,
      } as any);
      evidenceRepo.save.mockImplementationOnce(async (e: any) => e);

      await service.transferCustody(
        'ev-1',
        { newCustodianId: 'user-3', transferReason: 'lab analysis' },
        actor(),
      );

      expect(custodyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousCustodianId: 'user-2',
          newCustodianId: 'user-3',
          transferReason: 'lab analysis',
        }),
      );
      expect(events.publishEvidenceTransferred).toHaveBeenCalledWith(
        'user-1',
        'ev-1',
        expect.objectContaining({
          previous_custodian_id: 'user-2',
          new_custodian_id: 'user-3',
          transfer_reason: 'lab analysis',
        }),
      );
    });
  });

  describe('getCustodyChain', () => {
    it('returns rows ordered ASC by createdAt', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({ id: 'ev-1' } as any);
      custodyRepo.find.mockResolvedValueOnce([{ id: 'r1' } as any]);

      const result = await service.getCustodyChain('ev-1');
      expect(custodyRepo.find).toHaveBeenCalledWith({
        where: { evidenceId: 'ev-1' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('archive', () => {
    it('marks archived, sets status to ARCHIVED and publishes the event', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({
        id: 'ev-1',
        archived: false,
      } as any);
      evidenceRepo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.archive('ev-1', actor());
      expect(result.archived).toBe(true);
      expect(result.evidenceStatus).toBe(EvidenceStatus.ARCHIVED);
      expect(events.publishEvidenceArchived).toHaveBeenCalled();
    });

    it('rejects re-archiving an already archived evidence', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({ id: 'ev-1', archived: true } as any);
      await expect(service.archive('ev-1', actor())).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
