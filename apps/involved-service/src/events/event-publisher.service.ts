import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  RABBITMQ_CLIENT,
  InvolvedPersonLinkedEvent,
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

  publishInvolvedPersonLinked(
    actorUserId: string,
    involvedPersonId: string,
    payload: InvolvedPersonLinkedEvent['payload'],
  ): void {
    this.emit<InvolvedPersonLinkedEvent>(EventPatterns.INVOLVED_PERSON_LINKED, {
      event_id: uuidv4(),
      event_type: 'involved.person.linked',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'InvolvedPerson',
      entity_id: involvedPersonId,
      payload,
    });
  }

  private emit<T>(pattern: string, event: T): void {
    lastValueFrom(this.client.emit(pattern, event)).catch((err) =>
      this.logger.error(`Failed to publish ${pattern}: ${err?.message}`, err?.stack),
    );
  }
}
