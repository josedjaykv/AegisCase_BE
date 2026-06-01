import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  INVESTIGATION_EXCHANGE,
  getRmqUrl,
  EvidenceAddedEvent,
  EvidenceUpdatedEvent,
  EvidenceTransferredEvent,
  EvidenceArchivedEvent,
  EvidenceCustodyAccessedEvent,
} from '@aegiscase/events';

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private connection: AmqpConnectionManager;
  private channel: ChannelWrapper;

  async onModuleInit() {
    this.connection = connect([getRmqUrl()]);
    this.channel = this.connection.createChannel({
      setup: (ch: any) =>
        ch.assertExchange(INVESTIGATION_EXCHANGE, 'topic', { durable: true }),
    });
    await this.channel
      .waitForConnect()
      .catch((err) => this.logger.warn(`RabbitMQ connect failed: ${err?.message}`));
    this.logger.log('Connected to RabbitMQ');
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  publishEvidenceAdded(actorUserId: string, evidenceId: string, payload: EvidenceAddedEvent['payload']): void {
    this.publish(EventPatterns.EVIDENCE_ADDED, {
      event_id: uuidv4(),
      event_type: 'evidence.added',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  publishEvidenceUpdated(actorUserId: string, evidenceId: string, payload: EvidenceUpdatedEvent['payload']): void {
    this.publish(EventPatterns.EVIDENCE_UPDATED, {
      event_id: uuidv4(),
      event_type: 'evidence.updated',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  publishEvidenceTransferred(actorUserId: string, evidenceId: string, payload: EvidenceTransferredEvent['payload']): void {
    this.publish(EventPatterns.EVIDENCE_TRANSFERRED, {
      event_id: uuidv4(),
      event_type: 'evidence.transferred',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  publishEvidenceArchived(actorUserId: string, evidenceId: string, payload: EvidenceArchivedEvent['payload']): void {
    this.publish(EventPatterns.EVIDENCE_ARCHIVED, {
      event_id: uuidv4(),
      event_type: 'evidence.archived',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  publishEvidenceCustodyAccessed(
    actorUserId: string,
    evidenceId: string,
    payload: EvidenceCustodyAccessedEvent['payload'],
  ): void {
    this.publish(EventPatterns.EVIDENCE_CUSTODY_ACCESSED, {
      event_id: uuidv4(),
      event_type: 'evidence.custody.accessed',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Evidence',
      entity_id: evidenceId,
      payload,
    });
  }

  private publish(routingKey: string, event: unknown): void {
    this.channel
      .publish(
        INVESTIGATION_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(event)),
        { persistent: true, contentType: 'application/json' },
      )
      .catch((err) =>
        this.logger.error(`Failed to publish ${routingKey}: ${err?.message}`, err?.stack),
      );
  }
}
