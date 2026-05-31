import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
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

// Fake EntityManager used inside dataSource.transaction(cb)
type FakeManager = {
  findOne: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const mockDataSource = (manager: FakeManager): { ds: Mocked<DataSource>; manager: FakeManager } => {
  const ds = {
    transaction: jest.fn(async (cb: (m: FakeManager) => Promise<unknown>) => cb(manager)),
  } as any;
  return { ds, manager };
};

const mockEvents = (): Mocked<EventPublisherService> =>
  ({
    publishEvidenceAdded: jest.fn(),
    publishEvidenceTransferred: jest.fn(),
    publishEvidenceArchived: jest.fn(),
    publishEvidenceCustodyAccessed: jest.fn(),
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
  let manager: FakeManager;
  let dataSource: Mocked<DataSource>;

  beforeEach(async () => {
    evidenceRepo = mockRepo<Evidence>();
    custodyRepo = mockRepo<ChainOfCustody>();
    events = mockEvents();
    manager = { findOne: jest.fn(), insert: jest.fn(), update: jest.fn() };
    ({ ds: dataSource } = mockDataSource(manager));

    const module = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: getRepositoryToken(Evidence), useValue: evidenceRepo },
        { provide: getRepositoryToken(ChainOfCustody), useValue: custodyRepo },
        { provide: DataSource, useValue: dataSource },
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
    it('inserts a "viewed by user" row and updates currentCustodianId atomically, then returns the reloaded entity with custodyChain', async () => {
      // 1st findOne (inside tx): current state. 2nd findOne: reload after the writes.
      manager.findOne
        .mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'user-2' })
        .mockResolvedValueOnce({
          id: 'ev-1',
          currentCustodianId: 'user-1',
          custodyChain: [{ id: 'r1', newCustodianId: 'user-1', transferReason: 'Viewed by user' }],
        });

      const result: any = await service.findOne('ev-1', actor());

      // Both writes go through the same transactional manager (atomic)
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenCalledWith(
        ChainOfCustody,
        expect.objectContaining({
          evidenceId: 'ev-1',
          previousCustodianId: 'user-2',
          newCustodianId: 'user-1',
          transferredByUserId: 'user-1',
          transferReason: 'Viewed by user',
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Evidence,
        { id: 'ev-1' },
        { currentCustodianId: 'user-1' },
      );
      // Response carries the reloaded entity + custodyChain (regression for the 500)
      expect(result.currentCustodianId).toBe('user-1');
      expect(result.custodyChain).toHaveLength(1);
    });

    it('is idempotent for self-views: no new row / no update when the actor already holds custody', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'user-1' })
        .mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'user-1', custodyChain: [] });

      const result: any = await service.findOne('ev-1', actor());

      expect(manager.insert).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
      expect(result.currentCustodianId).toBe('user-1');
    });

    it('rolls back the whole side effect when the reload throws (atomicity)', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'user-2' })
        .mockRejectedValueOnce(new Error('reload boom'));

      await expect(service.findOne('ev-1', actor())).rejects.toThrow('reload boom');
      // The insert/update happened inside the transaction; the rejection propagates
      // out of dataSource.transaction so the real DB tx rolls both back.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('does not open a transaction or append custody rows when trackView=false', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'u' } as any);
      const result: any = await service.findOne('ev-1', actor(), false);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
      expect(result.id).toBe('ev-1');
    });

    it('throws NotFoundException when missing', async () => {
      manager.findOne.mockResolvedValueOnce(null);
      await expect(service.findOne('ev-1', actor())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('takeCustody', () => {
    it('assigns custody to the caller, writes a fixed-reason chain row and publishes the event', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 'ev-1', caseId: 'case-1', currentCustodianId: 'user-2' })
        .mockResolvedValueOnce({
          id: 'ev-1',
          caseId: 'case-1',
          currentCustodianId: 'user-1',
          custodyChain: [{ id: 'r1', transferReason: 'Accessed evidence file' }],
        });

      const result: any = await service.takeCustody('ev-1', actor());

      expect(manager.insert).toHaveBeenCalledWith(
        ChainOfCustody,
        expect.objectContaining({
          previousCustodianId: 'user-2',
          newCustodianId: 'user-1',
          transferredByUserId: 'user-1',
          transferReason: 'Accessed evidence file',
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Evidence,
        { id: 'ev-1' },
        { currentCustodianId: 'user-1' },
      );
      expect(events.publishEvidenceCustodyAccessed).toHaveBeenCalledWith(
        'user-1',
        'ev-1',
        expect.objectContaining({
          previous_custodian_id: 'user-2',
          new_custodian_id: 'user-1',
          reason: 'Accessed evidence file',
        }),
      );
      expect(result.currentCustodianId).toBe('user-1');
    });

    it('is idempotent: caller already custodian → no new row, no update, no event', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 'ev-1', caseId: 'case-1', currentCustodianId: 'user-1' })
        .mockResolvedValueOnce({ id: 'ev-1', currentCustodianId: 'user-1', custodyChain: [] });

      const result: any = await service.takeCustody('ev-1', actor());

      expect(manager.insert).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publishEvidenceCustodyAccessed).not.toHaveBeenCalled();
      expect(result.currentCustodianId).toBe('user-1');
    });

    it('throws NotFoundException when missing', async () => {
      manager.findOne.mockResolvedValueOnce(null);
      await expect(service.takeCustody('ev-1', actor())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getCustodian', () => {
    it('returns the current custodian without side effects', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce({
        id: 'ev-1',
        currentCustodianId: 'user-2',
      } as any);

      const result = await service.getCustodian('ev-1');

      expect(result).toEqual({ evidenceId: 'ev-1', currentCustodianId: 'user-2' });
      expect(evidenceRepo.save).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when missing', async () => {
      evidenceRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.getCustodian('ev-1')).rejects.toBeInstanceOf(NotFoundException);
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
