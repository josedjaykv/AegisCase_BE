import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CasesService } from './cases.service';
import { Case } from './case.entity';
import { CaseTeam } from './case-team.entity';
import { EventPublisherService } from '../events/event-publisher.service';
import { CasePriority, CaseStatus, TeamRole, UserRole } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const mockRepo = <T>(): Mocked<Repository<T>> =>
  ({
    create: jest.fn((dto) => dto),
    save: jest.fn(async (e) => ({ id: 'case-1', ...e })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
  }) as any;

const mockEvents = (): Mocked<EventPublisherService> =>
  ({
    publishCaseCreated: jest.fn(),
    publishCaseClosed: jest.fn(),
    publishCaseArchived: jest.fn(),
  }) as any;

const actor = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'u@x.com',
  role: UserRole.DETECTIVE,
  keycloak_user_id: 'kc-1',
  ...overrides,
});

describe('CasesService', () => {
  let service: CasesService;
  let caseRepo: Mocked<Repository<Case>>;
  let teamRepo: Mocked<Repository<CaseTeam>>;
  let events: Mocked<EventPublisherService>;

  beforeEach(async () => {
    caseRepo = mockRepo<Case>();
    teamRepo = mockRepo<CaseTeam>();
    events = mockEvents();

    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: getRepositoryToken(Case), useValue: caseRepo },
        { provide: getRepositoryToken(CaseTeam), useValue: teamRepo },
        { provide: EventPublisherService, useValue: events },
      ],
    }).compile();

    service = module.get(CasesService);
  });

  describe('create', () => {
    it('creates a case in OPEN status, generates a code, and adds the creator to the team', async () => {
      const persisted: Case = {
        id: 'case-1',
        caseCode: 'CASE-2026-1234',
        status: CaseStatus.OPEN,
        leaderUserId: 'user-1',
        title: 't',
        priority: CasePriority.HIGH,
      } as any;
      caseRepo.save.mockResolvedValueOnce(persisted);
      caseRepo.findOne.mockResolvedValueOnce(persisted);

      const result = await service.create(
        { title: 't', priority: CasePriority.HIGH, leaderUserId: 'user-1' },
        actor(),
      );

      expect(caseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CaseStatus.OPEN,
          createdByUserId: 'user-1',
          caseCode: expect.stringMatching(/^CASE-\d{4}-\d{4}$/),
        }),
      );
      expect(teamRepo.save).toHaveBeenCalledTimes(1); // creator is also leader → no extra row
      expect(events.publishCaseCreated).toHaveBeenCalledWith('user-1', 'case-1', expect.any(Object));
      expect(result).toBe(persisted);
    });

    it('adds a separate LEAD team row when leader differs from creator', async () => {
      caseRepo.save.mockResolvedValueOnce({ id: 'case-1' } as any);
      caseRepo.findOne.mockResolvedValueOnce({ id: 'case-1' } as any);

      await service.create(
        { title: 't', priority: CasePriority.HIGH, leaderUserId: 'user-2' },
        actor(),
      );

      expect(teamRepo.save).toHaveBeenCalledTimes(2);
      expect(teamRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', teamRole: TeamRole.CREATOR }),
      );
      expect(teamRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-2', teamRole: TeamRole.LEAD }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the case with team relation', async () => {
      const c = { id: 'case-1', team: [] } as any;
      caseRepo.findOne.mockResolvedValueOnce(c);
      await expect(service.findOne('case-1')).resolves.toBe(c);
      expect(caseRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        relations: ['team'],
      });
    });

    it('throws NotFoundException when missing', async () => {
      caseRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects updates on closed cases', async () => {
      caseRepo.findOne.mockResolvedValueOnce({ id: 'c1', status: CaseStatus.CLOSED } as any);
      await expect(service.update('c1', { title: 'x' }, actor())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(caseRepo.save).not.toHaveBeenCalled();
    });

    it('persists changes on open cases', async () => {
      caseRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: CaseStatus.OPEN,
        title: 'old',
      } as any);
      caseRepo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.update('c1', { title: 'new' }, actor());
      expect(result.title).toBe('new');
    });
  });

  describe('changeStatus', () => {
    it('forbids non-admin from reopening a closed case', async () => {
      caseRepo.findOne.mockResolvedValueOnce({ id: 'c1', status: CaseStatus.CLOSED } as any);
      await expect(
        service.changeStatus('c1', { status: CaseStatus.OPEN }, actor({ role: UserRole.DETECTIVE })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('publishes CaseClosed when transitioning to CLOSED', async () => {
      caseRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: CaseStatus.OPEN,
        caseCode: 'CASE-1',
      } as any);
      caseRepo.save.mockImplementationOnce(async (e: any) => e);

      await service.changeStatus('c1', { status: CaseStatus.CLOSED }, actor());

      expect(events.publishCaseClosed).toHaveBeenCalledWith('user-1', 'c1', expect.any(Object));
    });

    it('does not publish CaseClosed for non-CLOSED transitions', async () => {
      caseRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: CaseStatus.OPEN,
      } as any);
      caseRepo.save.mockImplementationOnce(async (e: any) => e);

      await service.changeStatus('c1', { status: CaseStatus.PAUSED }, actor());
      expect(events.publishCaseClosed).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('marks archived, sets archivedAt, and publishes CaseArchived', async () => {
      caseRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        archived: false,
        caseCode: 'CASE-1',
      } as any);
      caseRepo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.archive('c1', actor());

      expect(result.archived).toBe(true);
      expect(result.archivedAt).toBeInstanceOf(Date);
      expect(events.publishCaseArchived).toHaveBeenCalled();
    });

    it('throws Conflict when already archived', async () => {
      caseRepo.findOne.mockResolvedValueOnce({ id: 'c1', archived: true } as any);
      await expect(service.archive('c1', actor())).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('addTeamMember', () => {
    it('rejects duplicate membership', async () => {
      caseRepo.findOne.mockResolvedValueOnce({ id: 'c1' } as any);
      teamRepo.findOne.mockResolvedValueOnce({ caseId: 'c1', userId: 'u9' } as any);

      await expect(
        service.addTeamMember('c1', { userId: 'u9', teamRole: TeamRole.MEMBER }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('persists new member', async () => {
      caseRepo.findOne.mockResolvedValueOnce({ id: 'c1' } as any);
      teamRepo.findOne.mockResolvedValueOnce(null);

      await service.addTeamMember('c1', { userId: 'u9', teamRole: TeamRole.MEMBER });
      expect(teamRepo.save).toHaveBeenCalled();
    });
  });
});
