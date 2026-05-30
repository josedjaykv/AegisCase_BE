import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  INVESTIGATION_EXCHANGE,
  getRmqUrl,
  InvolvedPersonLinkedEvent,
  InvolvedPersonUnlinkedEvent,
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

  publishInvolvedPersonLinked(
    actorUserId: string,
    involvedPersonId: string,
    payload: InvolvedPersonLinkedEvent['payload'],
  ): void {
    this.publish(EventPatterns.INVOLVED_PERSON_LINKED, {
      event_id: uuidv4(),
      event_type: 'involved.person.linked',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'InvolvedPerson',
      entity_id: involvedPersonId,
      payload,
    });
  }

  publishInvolvedPersonUnlinked(
    actorUserId: string,
    involvedPersonId: string,
    payload: InvolvedPersonUnlinkedEvent['payload'],
  ): void {
    this.publish(EventPatterns.INVOLVED_PERSON_UNLINKED, {
      event_id: uuidv4(),
      event_type: 'involved.person.unlinked',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'InvolvedPerson',
      entity_id: involvedPersonId,
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
