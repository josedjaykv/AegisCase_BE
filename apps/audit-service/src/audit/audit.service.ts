import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audit } from './audit.entity';
import { BaseEvent } from '@aegiscase/events';
import { QueryAuditDto } from './dto/query-audit.dto';

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

    const record = this.repo.create({
      eventId: event.event_id,
      userId: event.actor_user_id,
      action: event.event_type,
      entityType: event.entity_type,
      entityId: event.entity_id,
      previousState: null,
      newState: event.payload,
    });

    await this.repo.save(record);
    this.logger.log(`Audit recorded: ${event.event_type} [${event.entity_id}]`);
  }

  async findAll(query: QueryAuditDto): Promise<[Audit[], number]> {
    const { page = 1, limit = 20, entity_type, entity_id, user_id, action } = query;

    const qb = this.repo.createQueryBuilder('audit').orderBy('audit.created_at', 'DESC');

    if (entity_type) qb.andWhere('audit.entity_type = :entity_type', { entity_type });
    if (entity_id) qb.andWhere('audit.entity_id = :entity_id', { entity_id });
    if (user_id) qb.andWhere('audit.user_id = :user_id', { user_id });
    if (action) qb.andWhere('audit.action = :action', { action });

    qb.skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount();
  }
}
