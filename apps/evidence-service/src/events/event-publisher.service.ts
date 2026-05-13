import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  RABBITMQ_CLIENT,
  EvidenceAddedEvent,
  EvidenceTransferredEvent,
  EvidenceArchivedEvent,
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

  publishEvidenceAdded(
    actorUserId: string,
    evidenceId: string,
    payload: EvidenceAddedEvent['payload'],
  ): void {
    this.emit<EvidenceAddedEvent>(EventPatterns.EVIDENCE_ADDED, {
      event_id: uuidv4(),
      event_type: 'evidence.added',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  publishEvidenceTransferred(
    actorUserId: string,
    evidenceId: string,
    payload: EvidenceTransferredEvent['payload'],
  ): void {
    this.emit<EvidenceTransferredEvent>(EventPatterns.EVIDENCE_TRANSFERRED, {
      event_id: uuidv4(),
      event_type: 'evidence.transferred',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  publishEvidenceArchived(
    actorUserId: string,
    evidenceId: string,
    payload: EvidenceArchivedEvent['payload'],
  ): void {
    this.emit<EvidenceArchivedEvent>(EventPatterns.EVIDENCE_ARCHIVED, {
      event_id: uuidv4(),
      event_type: 'evidence.archived',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  private emit<T>(pattern: string, event: T): void {
    lastValueFrom(this.client.emit(pattern, event)).catch((err) =>
      this.logger.error(`Failed to publish ${pattern}: ${err?.message}`, err?.stack),
    );
  }
}
