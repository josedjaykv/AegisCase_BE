import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  INVESTIGATION_EXCHANGE,
  getRmqUrl,
  TaskAssignedEvent,
  TaskCompletedEvent,
  TaskOverdueEvent,
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

  publishTaskAssigned(actorUserId: string, taskId: string, payload: TaskAssignedEvent['payload']): void {
    this.publish(EventPatterns.TASK_ASSIGNED, {
      event_id: uuidv4(),
      event_type: 'task.assigned',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Task',
      entity_id: taskId,
      payload,
    });
  }

  publishTaskCompleted(actorUserId: string, taskId: string, payload: TaskCompletedEvent['payload']): void {
    this.publish(EventPatterns.TASK_COMPLETED, {
      event_id: uuidv4(),
      event_type: 'task.completed',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Task',
      entity_id: taskId,
      payload,
    });
  }

  publishTaskOverdue(taskId: string, payload: TaskOverdueEvent['payload']): void {
    this.publish(EventPatterns.TASK_OVERDUE, {
      event_id: uuidv4(),
      event_type: 'task.overdue',
      occurred_at: new Date(),
      actor_user_id: 'system',
      entity_type: 'Task',
      entity_id: taskId,
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
