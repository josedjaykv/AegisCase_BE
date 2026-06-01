import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  INVESTIGATION_EXCHANGE,
  getRmqUrl,
  MediaUploadedEvent,
  EvidenceMediaViewedEvent,
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

  publishMediaUploaded(
    actorUserId: string,
    mediaId: string,
    payload: MediaUploadedEvent['payload'],
  ): void {
    this.publish(EventPatterns.MEDIA_UPLOADED, {
      event_id: uuidv4(),
      event_type: 'media.uploaded',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Media',
      entity_id: mediaId,
      payload,
    });
  }

  publishEvidenceMediaViewed(
    actorUserId: string,
    mediaId: string,
    payload: EvidenceMediaViewedEvent['payload'],
  ): void {
    this.publish(EventPatterns.EVIDENCE_MEDIA_VIEWED, {
      event_id: uuidv4(),
      event_type: 'evidence.media.viewed',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Media',
      entity_id: mediaId,
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
