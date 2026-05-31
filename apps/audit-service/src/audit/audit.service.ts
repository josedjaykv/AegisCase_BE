import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audit } from './audit.entity';
import { BaseEvent } from '@aegiscase/events';
import { QueryAuditDto } from './dto/query-audit.dto';

const ACTION_MAP: Record<string, string> = {
  'case.created':           'CASE_CREATED',
  'case.updated':           'CASE_UPDATED',
  'case.closed':            'CASE_CLOSED',
  'case.archived':          'CASE_ARCHIVED',
  'involved.person.linked':   'INVOLVED_PERSON_LINKED',
  'involved.person.unlinked': 'INVOLVED_PERSON_UNLINKED',
  'evidence.added':         'EVIDENCE_ADDED',
  'evidence.transferred':   'EVIDENCE_CUSTODY_TRANSFERRED',
  'evidence.archived':      'EVIDENCE_ARCHIVED',
  'evidence.custody.accessed': 'EVIDENCE_CUSTODY_ACCESSED',
  'evidence.media.viewed':  'EVIDENCE_MEDIA_VIEWED',
  'task.assigned':          'TASK_ASSIGNED',
  'task.completed':         'TASK_COMPLETED',
  'task.overdue':           'TASK_OVERDUE',
  'media.uploaded':         'MEDIA_UPLOADED',
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(Audit)
    private readonly repo: Repository<Audit>,
  ) {}

  async record(event: BaseEvent): Promise<void> {
    const existing = await this.repo.findOne({ where: { eventId: event.event_id } });
    if (existing) {
      this.logger.warn(`Duplicate event ignored: ${event.event_id}`);
      return;
    }

    const action = ACTION_MAP[event.event_type] ?? event.event_type.toUpperCase().replace('.', '_');
    const { previousState, newState } = this.mapStates(event);

    const record = this.repo.create({
      eventId: event.event_id,
      userId: event.actor_user_id,
      action,
      entityType: event.entity_type,
      entityId: event.entity_id,
      previousState,
      newState,
      eventPayload: event as unknown as Record<string, any>,
    });

    await this.repo.save(record);
    this.logger.log(`Audit recorded: ${action} [${event.entity_id}]`);
  }

  async findAll(query: QueryAuditDto): Promise<[Audit[], number]> {
    const { page = 1, limit = 20, entity_type, entity_id, user_id, action, from_date, to_date } = query;

    const qb = this.repo.createQueryBuilder('audit').orderBy('audit.created_at', 'DESC');

    if (entity_type) qb.andWhere('audit.entity_type = :entity_type', { entity_type });
    if (entity_id)   qb.andWhere('audit.entity_id = :entity_id', { entity_id });
    if (user_id)     qb.andWhere('audit.user_id = :user_id', { user_id });
    if (action)      qb.andWhere('audit.action = :action', { action });
    if (from_date)   qb.andWhere('audit.created_at >= :from_date', { from_date });
    if (to_date)     qb.andWhere('audit.created_at <= :to_date', { to_date });

    qb.skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount();
  }

  async findOne(id: string): Promise<Audit> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Audit record ${id} not found`);
    return record;
  }

  async findByEntity(entityType: string, entityId: string): Promise<Audit[]> {
    return this.repo.find({
      where: { entityType, entityId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByUser(userId: string, query: QueryAuditDto): Promise<[Audit[], number]> {
    return this.findAll({ ...query, user_id: userId });
  }

  private mapStates(event: BaseEvent): { previousState: Record<string, any> | null; newState: Record<string, any> | null } {
    const p = event.payload;

    switch (event.event_type) {
      case 'case.created':
        return {
          previousState: null,
          newState: { case_code: p.case_code, title: p.title, priority: p.priority, leader_user_id: p.leader_user_id, status: 'OPEN' },
        };

      case 'case.closed':
        return {
          previousState: null,
          newState: { status: 'CLOSED', closed_by_user_id: p.closed_by_user_id },
        };

      case 'case.archived':
        return {
          previousState: { archived: false },
          newState: { archived: true, archived_by_user_id: p.archived_by_user_id },
        };

      case 'case.updated':
        return {
          previousState: null,
          newState: { changed_fields: p.changed_fields },
        };

      case 'evidence.added':
        return {
          previousState: null,
          newState: { case_id: p.case_id, evidence_type: p.evidence_type, custodian_user_id: p.custodian_user_id, title: p.title, status: 'REGISTERED' },
        };

      case 'evidence.transferred':
        return {
          previousState: { current_custodian_id: p.previous_custodian_id },
          newState: { current_custodian_id: p.new_custodian_id, transfer_reason: p.transfer_reason },
        };

      case 'evidence.archived':
        return {
          previousState: { archived: false },
          newState: { archived: true, archived_by_user_id: p.archived_by_user_id },
        };

      case 'task.assigned':
        return {
          previousState: null,
          newState: { case_id: p.case_id, assigned_to_user_id: p.assigned_to_user_id, assigned_by_user_id: p.assigned_by_user_id, due_date: p.due_date, status: 'PENDING' },
        };

      case 'task.completed':
        return {
          previousState: { status: 'IN_PROGRESS' },
          newState: { status: 'COMPLETED', completed_by_user_id: p.completed_by_user_id },
        };

      case 'task.overdue':
        return {
          previousState: { status: 'PENDING' },
          newState: { status: 'OVERDUE', due_date: p.due_date },
        };

      case 'involved.person.linked':
        return {
          previousState: null,
          newState: { case_id: p.case_id, involvement_type: p.involvement_type },
        };

      case 'involved.person.unlinked':
        return {
          previousState: { case_id: p.case_id, linked: true },
          newState: { case_id: p.case_id, linked: false },
        };

      case 'evidence.custody.accessed':
        return {
          previousState: { custodian_id: p.previous_custodian_id },
          newState: { custodian_id: p.new_custodian_id, reason: p.reason },
        };

      case 'evidence.media.viewed':
        return {
          previousState: null,
          newState: { evidence_id: p.evidence_id, media_id: p.media_id },
        };

      case 'media.uploaded':
        return {
          previousState: null,
          newState: {
            url: p.url,
            entity_type: p.entity_type,
            entity_id: p.entity_id,
            description: p.description,
          },
        };

      default:
        return { previousState: null, newState: p };
    }
  }
}
