import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  RABBITMQ_CLIENT,
  CaseCreatedEvent,
  CaseClosedEvent,
  CaseArchivedEvent,
} from '@aegiscase/events';

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(@Inject(RABBITMQ_CLIENT) private readonly client: ClientProxy) {}

  async onModuleInit() {
    await this.client.connect().catch((err) =>
      this.logger.warn(`RabbitMQ connect failed (will retry): ${err?.message}`),
    );
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  publishCaseCreated(
    actorUserId: string,
    caseId: string,
    payload: CaseCreatedEvent['payload'],
  ): void {
    this.emit<CaseCreatedEvent>(EventPatterns.CASE_CREATED, {
      event_id: uuidv4(),
      event_type: 'case.created',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Case',
      entity_id: caseId,
      payload,
    });
  }

  publishCaseClosed(
    actorUserId: string,
    caseId: string,
    payload: CaseClosedEvent['payload'],
  ): void {
    this.emit<CaseClosedEvent>(EventPatterns.CASE_CLOSED, {
      event_id: uuidv4(),
      event_type: 'case.closed',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Case',
      entity_id: caseId,
      payload,
    });
  }

  publishCaseArchived(
    actorUserId: string,
    caseId: string,
    payload: CaseArchivedEvent['payload'],
  ): void {
    this.emit<CaseArchivedEvent>(EventPatterns.CASE_ARCHIVED, {
      event_id: uuidv4(),
      event_type: 'case.archived',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Case',
      entity_id: caseId,
      payload,
    });
  }

  private emit<T>(pattern: string, event: T): void {
    lastValueFrom(this.client.emit(pattern, event)).catch((err) =>
      this.logger.error(`Failed to publish ${pattern}: ${err?.message}`, err?.stack),
    );
  }
}
