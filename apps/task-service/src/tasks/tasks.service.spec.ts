import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { TasksService } from './tasks.service';
import { Task } from './task.entity';
import { EventPublisherService } from '../events/event-publisher.service';
import { TaskPriority, TaskStatus, UserRole } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const mockRepo = <T>(): Mocked<Repository<T>> =>
  ({
    create: jest.fn((dto) => dto),
    save: jest.fn(async (e) => ({ id: 't-1', ...e })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  }) as any;

const mockEvents = (): Mocked<EventPublisherService> =>
  ({
    publishTaskAssigned: jest.fn(),
    publishTaskCompleted: jest.fn(),
    publishTaskOverdue: jest.fn(),
  }) as any;

const actor = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'u@x.com',
  role: UserRole.DETECTIVE,
  keycloak_user_id: 'kc-1',
  ...overrides,
});

describe('TasksService', () => {
  let service: TasksService;
  let repo: Mocked<Repository<Task>>;
  let events: Mocked<EventPublisherService>;

  beforeEach(async () => {
    repo = mockRepo<Task>();
    events = mockEvents();

    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: repo },
        { provide: EventPublisherService, useValue: events },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  describe('create', () => {
    it('persists with PENDING status and publishes TaskAssigned', async () => {
      repo.save.mockResolvedValueOnce({
        id: 't-1',
        caseId: 'case-1',
        assignedToUserId: 'user-9',
      } as any);

      await service.create(
        {
          caseId: 'case-1',
          title: 't',
          priority: TaskPriority.MEDIUM,
          assignedToUserId: 'user-9',
        },
        actor(),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TaskStatus.PENDING,
          assignedByUserId: 'user-1',
          createdByUserId: 'user-1',
        }),
      );
      expect(events.publishTaskAssigned).toHaveBeenCalledWith(
        'user-1',
        't-1',
        expect.objectContaining({ assigned_to_user_id: 'user-9' }),
      );
    });
  });

  describe('update', () => {
    it('rejects updates on COMPLETED tasks', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.COMPLETED,
        assignedToUserId: 'user-1',
      } as any);
      await expect(
        service.update('t-1', { title: 'x' }, actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects updates on CANCELLED tasks', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.CANCELLED,
        assignedToUserId: 'user-1',
      } as any);
      await expect(
        service.update('t-1', { title: 'x' }, actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("forbids analysts from updating someone else's task", async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.PENDING,
        assignedToUserId: 'someone-else',
      } as any);
      await expect(
        service.update('t-1', { title: 'x' }, actor({ role: UserRole.ANALYST })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the assignee update their own task', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.PENDING,
        assignedToUserId: 'user-1',
        title: 'old',
      } as any);
      repo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.update(
        't-1',
        { title: 'new' },
        actor({ role: UserRole.ANALYST }),
      );
      expect(result.title).toBe('new');
    });

    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.update('t-1', { title: 'x' }, actor()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('changeStatus', () => {
    it('rejects reopening a COMPLETED task', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.COMPLETED,
        assignedToUserId: 'user-1',
      } as any);
      await expect(
        service.changeStatus('t-1', { status: TaskStatus.PENDING }, actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids analysts from cancelling tasks', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.PENDING,
        assignedToUserId: 'user-1',
      } as any);
      await expect(
        service.changeStatus(
          't-1',
          { status: TaskStatus.CANCELLED },
          actor({ role: UserRole.ANALYST }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("forbids analysts from changing someone else's task status", async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.PENDING,
        assignedToUserId: 'someone-else',
      } as any);
      await expect(
        service.changeStatus(
          't-1',
          { status: TaskStatus.IN_PROGRESS },
          actor({ role: UserRole.ANALYST }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('publishes TaskCompleted when transitioning to COMPLETED', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        caseId: 'case-1',
        status: TaskStatus.IN_PROGRESS,
        assignedToUserId: 'user-1',
      } as any);
      repo.save.mockImplementationOnce(async (e: any) => e);

      await service.changeStatus('t-1', { status: TaskStatus.COMPLETED }, actor());
      expect(events.publishTaskCompleted).toHaveBeenCalledWith(
        'user-1',
        't-1',
        expect.objectContaining({ case_id: 'case-1', completed_by_user_id: 'user-1' }),
      );
    });

    it('does not publish TaskCompleted for non-COMPLETED transitions', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        status: TaskStatus.PENDING,
        assignedToUserId: 'user-1',
      } as any);
      repo.save.mockImplementationOnce(async (e: any) => e);

      await service.changeStatus('t-1', { status: TaskStatus.IN_PROGRESS }, actor());
      expect(events.publishTaskCompleted).not.toHaveBeenCalled();
    });
  });

  describe('overdue auto-marking', () => {
    it('marks overdue candidates and publishes TaskOverdue per task', async () => {
      const overdue = [
        { id: 't-1', caseId: 'c1', dueDate: '2026-05-01', assignedToUserId: 'u1' },
        { id: 't-2', caseId: 'c2', dueDate: '2026-05-02', assignedToUserId: 'u2' },
      ];
      // findOne for the eventual findOne lookup (won't be called here but safe to mock)
      repo.find.mockResolvedValueOnce(overdue as any);
      repo.update.mockResolvedValueOnce({ affected: 2 } as any);
      repo.findAndCount.mockResolvedValueOnce([[], 0]);

      await service.findAll({ page: 1, limit: 20 });

      expect(repo.update).toHaveBeenCalled();
      expect(events.publishTaskOverdue).toHaveBeenCalledTimes(2);
      expect(events.publishTaskOverdue).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({ case_id: 'c1', assigned_to_user_id: 'u1' }),
      );
    });

    it('skips work when there are no overdue candidates', async () => {
      repo.find.mockResolvedValueOnce([]);
      repo.findAndCount.mockResolvedValueOnce([[], 0]);

      await service.findAll({ page: 1, limit: 20 });

      expect(repo.update).not.toHaveBeenCalled();
      expect(events.publishTaskOverdue).not.toHaveBeenCalled();
    });
  });
});
