import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  EventPatterns,
  RABBITMQ_CLIENT,
  TaskAssignedEvent,
  TaskCompletedEvent,
  TaskOverdueEvent,
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

  publishTaskAssigned(
    actorUserId: string,
    taskId: string,
    payload: TaskAssignedEvent['payload'],
  ): void {
    this.emit<TaskAssignedEvent>(EventPatterns.TASK_ASSIGNED, {
      event_id: uuidv4(),
      event_type: 'task.assigned',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Task',
      entity_id: taskId,
      payload,
    });
  }

  publishTaskCompleted(
    actorUserId: string,
    taskId: string,
    payload: TaskCompletedEvent['payload'],
  ): void {
    this.emit<TaskCompletedEvent>(EventPatterns.TASK_COMPLETED, {
      event_id: uuidv4(),
      event_type: 'task.completed',
      occurred_at: new Date(),
      actor_user_id: actorUserId,
      entity_type: 'Task',
      entity_id: taskId,
      payload,
    });
  }

  publishTaskOverdue(
    taskId: string,
    payload: TaskOverdueEvent['payload'],
  ): void {
    this.emit<TaskOverdueEvent>(EventPatterns.TASK_OVERDUE, {
      event_id: uuidv4(),
      event_type: 'task.overdue',
      occurred_at: new Date(),
      actor_user_id: 'system',
      entity_type: 'Task',
      entity_id: taskId,
      payload,
    });
  }

  private emit<T>(pattern: string, event: T): void {
    lastValueFrom(this.client.emit(pattern, event)).catch((err) =>
      this.logger.error(`Failed to publish ${pattern}: ${err?.message}`, err?.stack),
    );
  }
}
