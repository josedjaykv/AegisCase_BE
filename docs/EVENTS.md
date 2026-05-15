# AegisCase — Event Architecture

## RabbitMQ Broker

| Setting | Value |
|---------|-------|
| URL | `amqp://aegiscase:aegiscase@localhost:5672/aegiscase` |
| Management UI | http://localhost:15672 (admin / admin) |
| Exchange | `investigation-system` (type: **topic**) |
| DLQ Exchange | `dlq.investigation-system` |

## Exchange & Queue Naming

| Service | Producer Queue | Consumer Queue |
|---------|---------------|----------------|
| case-service | `case-service.events` | — |
| involved-service | `involved-service.events` | — |
| evidence-service | `evidence-service.events` | — |
| task-service | `task-service.events` | — |
| audit-service | — | `audit-service.events` |

All queues are **durable**. The audit queue routes dead-letters to `dlq.investigation-system`.

## Event Catalog

| Event Type | Routing Key | Producer | Consumers | Trigger |
|-----------|------------|----------|-----------|---------|
| CaseCreated | `case.created` | case-service | audit-service | POST /cases |
| CaseUpdated | `case.updated` | case-service | audit-service | PUT /cases/:id |
| CaseClosed | `case.closed` | case-service | audit-service | PATCH /cases/:id/status → CLOSED |
| CaseArchived | `case.archived` | case-service | audit-service | PATCH /cases/:id/archive |
| InvolvedPersonLinked | `involved.person.linked` | involved-service | audit-service | POST /involved-persons/:id/cases/:caseId |
| EvidenceAdded | `evidence.added` | evidence-service | audit-service | POST /evidence |
| EvidenceTransferred | `evidence.transferred` | evidence-service | audit-service | PATCH /evidence/:id/transfer-custody |
| EvidenceArchived | `evidence.archived` | evidence-service | audit-service | PATCH /evidence/:id/archive |
| TaskAssigned | `task.assigned` | task-service | audit-service | POST /tasks |
| TaskCompleted | `task.completed` | task-service | audit-service | PATCH /tasks/:id/status → COMPLETED |
| TaskOverdue | `task.overdue` | task-service | audit-service | Auto-marked (lazy evaluation on findAll/findOne) |
| MediaUploaded | `media.uploaded` | media-service | audit-service | POST /media (Phase 6) |

## Base Event Structure

Every event published to RabbitMQ conforms to `BaseEvent` (`libs/events/src/base-event.interface.ts`):

```json
{
  "event_id": "uuid-v4",
  "event_type": "case.created",
  "occurred_at": "2024-05-12T10:30:00.000Z",
  "actor_user_id": "uuid-of-user-who-triggered",
  "entity_type": "Case",
  "entity_id": "uuid-of-affected-entity",
  "payload": { }
}
```

`event_id` is a unique UUID v4 generated per publish. The audit-service uses it to enforce idempotency (unique index on `event_id`).

## Example Payloads

### CaseCreated
```json
{
  "event_type": "case.created",
  "entity_type": "Case",
  "payload": {
    "case_code": "CASE-2024-1234",
    "title": "Operation Nexus",
    "priority": "HIGH",
    "leader_user_id": "uuid"
  }
}
```

### EvidenceTransferred
```json
{
  "event_type": "evidence.transferred",
  "entity_type": "Evidence",
  "payload": {
    "case_id": "uuid",
    "previous_custodian_id": "uuid",
    "new_custodian_id": "uuid",
    "transfer_reason": "Moving to forensics lab"
  }
}
```

### TaskOverdue
```json
{
  "event_type": "task.overdue",
  "actor_user_id": "system",
  "entity_type": "Task",
  "payload": {
    "case_id": "uuid",
    "assigned_to_user_id": "uuid",
    "due_date": "2024-05-10"
  }
}
```

## Implementation Pattern

### Publishing an Event (producer services)

```typescript
// Injected via EventsModule → EventPublisherService
this.events.publishCaseCreated(actor.sub, caseId, { ... });
```

- Called **after** successful DB save — never before
- Fire-and-forget: HTTP response returns immediately; error is logged if publish fails
- Each `EventPublisherService` method generates a fresh `event_id` (UUID v4)

### Consuming an Event (audit-service)

```typescript
@EventPattern('case.created')
async onCaseCreated(@Payload() event: BaseEvent) {
  await this.auditService.record(event);
}
```

- If processing fails → message is nacked → routed to `dlq.investigation-system` after max retries
- `AuditService.record()` checks `event_id` uniqueness before saving (idempotent)

## Audit Service HTTP API

All endpoints require `ADMIN` role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit` | Query audit log |

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `entity_type` | string | Filter by entity: `Case`, `Evidence`, `Task`, `InvolvedPerson` |
| `entity_id` | uuid | Filter by entity ID |
| `user_id` | uuid | Filter by actor user ID |
| `action` | string | Filter by event type, e.g. `case.created` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Page size (default: 20) |

## Error Handling

- **Publish failure**: logged at ERROR level, HTTP response not affected
- **RabbitMQ unavailable on startup**: warning logged, connection retried automatically
- **Consumer processing error**: message nacked → dead-letter queue
- **Duplicate event**: `event_id` unique index on `audit` table — silently skipped

## Closed Decisions

| Decision | Rationale |
|----------|-----------|
| Topic exchange over direct | Single exchange handles all routing keys; wildcards allow future subscriptions |
| Fire-and-forget publish | Events must not block HTTP responses; consistency is eventual |
| audit-service idempotency via `event_id` | Prevents duplicate audit records from redelivered messages |
| No outbox pattern in V1 | Complexity deferred; in-process publish is acceptable for V1 volume |
| `actor_user_id = "system"` for TaskOverdue | No human actor; auto-marked by lazy evaluation |
