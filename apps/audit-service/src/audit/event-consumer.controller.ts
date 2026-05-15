import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EventPatterns, BaseEvent } from '@aegiscase/events';
import { AuditService } from './audit.service';

@Controller()
export class EventConsumerController {
  private readonly logger = new Logger(EventConsumerController.name);

  constructor(private readonly auditService: AuditService) {}

  @EventPattern(EventPatterns.CASE_CREATED)
  async onCaseCreated(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.CASE_UPDATED)
  async onCaseUpdated(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.CASE_CLOSED)
  async onCaseClosed(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.CASE_ARCHIVED)
  async onCaseArchived(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.EVIDENCE_ADDED)
  async onEvidenceAdded(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.EVIDENCE_TRANSFERRED)
  async onEvidenceTransferred(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.EVIDENCE_ARCHIVED)
  async onEvidenceArchived(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.TASK_ASSIGNED)
  async onTaskAssigned(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.TASK_COMPLETED)
  async onTaskCompleted(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.TASK_OVERDUE)
  async onTaskOverdue(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.INVOLVED_PERSON_LINKED)
  async onInvolvedPersonLinked(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }

  @EventPattern(EventPatterns.MEDIA_UPLOADED)
  async onMediaUploaded(@Payload() event: BaseEvent) {
    this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
    await this.auditService.record(event);
  }
}
