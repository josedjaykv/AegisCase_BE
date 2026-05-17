# AegisCase — Audit Service

El audit-service mantiene el historial completo de todas las acciones críticas del sistema. Es un consumidor puro — no produce eventos ni tiene endpoints de escritura manual.

---

## Cómo funciona

1. Cada servicio (case, evidence, task, involved) publica un evento a RabbitMQ cuando ocurre una acción importante
2. El audit-service escucha **todos** los eventos via la binding `#` (wildcard total) sobre el exchange `investigation-system`
3. Por cada evento recibido, crea un registro en la tabla `audit` (schema `audit_db`)
4. Los registros se pueden consultar via API

```
Servicio  →  RabbitMQ (investigation-system)  →  audit-service  →  PostgreSQL (audit_db)
```

---

## API

Todos los endpoints requieren autenticación. Roles permitidos: **ADMIN, DETECTIVE, ANALYST**.

### `GET /audit`

Lista registros con filtros opcionales.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `entity_type` | string | `Case`, `Evidence`, `Task`, `InvolvedPerson` |
| `entity_id` | string | UUID de la entidad |
| `user_id` | string | UUID del usuario que realizó la acción |
| `action` | string | Ver tabla de acciones abajo |
| `from_date` | ISO 8601 | Ejemplo: `2024-05-01T00:00:00Z` |
| `to_date` | ISO 8601 | Ejemplo: `2024-05-31T23:59:59Z` |
| `page` | number | Default: 1 |
| `limit` | number | Default: 20, máx: 1000 |

```bash
# Historial de un caso específico
GET /audit?entity_type=Case&entity_id=<uuid>

# Acciones de un usuario en una fecha
GET /audit?user_id=<uuid>&from_date=2024-05-01T00:00:00Z

# Solo casos creados
GET /audit?action=CASE_CREATED
```

---

### `GET /audit/:id`

Retorna un registro de auditoría por su ID interno.

---

### `GET /audit/entity/:entityType/:entityId`

Retorna el historial completo de una entidad en orden cronológico (ASC).

```bash
# Todos los cambios de un caso: creado → cerrado → archivado
GET /audit/entity/Case/<case-uuid>

# Cadena de custodia de una evidencia
GET /audit/entity/Evidence/<evidence-uuid>
```

---

### `GET /audit/user/:userId`

Retorna todas las acciones realizadas por un usuario. Acepta los mismos filtros que `GET /audit`.

```bash
GET /audit/user/<user-uuid>?from_date=2024-05-01T00:00:00Z
```

---

## Tabla de acciones (`action`)

| `action` | Evento origen | Descripción |
|----------|--------------|-------------|
| `CASE_CREATED` | `case.created` | Caso creado |
| `CASE_UPDATED` | `case.updated` | Caso modificado |
| `CASE_CLOSED` | `case.closed` | Caso cerrado |
| `CASE_ARCHIVED` | `case.archived` | Caso archivado |
| `INVOLVED_PERSON_LINKED` | `involved.person.linked` | Persona vinculada a caso |
| `EVIDENCE_ADDED` | `evidence.added` | Evidencia registrada |
| `EVIDENCE_CUSTODY_TRANSFERRED` | `evidence.transferred` | Custodia de evidencia transferida |
| `EVIDENCE_ARCHIVED` | `evidence.archived` | Evidencia archivada |
| `TASK_ASSIGNED` | `task.assigned` | Tarea asignada |
| `TASK_COMPLETED` | `task.completed` | Tarea completada |
| `TASK_OVERDUE` | `task.overdue` | Tarea vencida (actor: `system`) |
| `MEDIA_UPLOADED` | `media.uploaded` | Archivo multimedia subido |

---

## Estructura de un registro

```json
{
  "id": "uuid",
  "eventId": "uuid",
  "userId": "uuid-del-actor",
  "action": "CASE_CREATED",
  "entityType": "Case",
  "entityId": "uuid-del-caso",
  "previousState": null,
  "newState": {
    "case_code": "CASE-2024-1234",
    "title": "Operación Nexus",
    "priority": "HIGH",
    "leader_user_id": "uuid",
    "status": "OPEN"
  },
  "eventPayload": { },
  "createdAt": "2024-05-12T10:30:00.000Z"
}
```

### Campos

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador interno del registro de auditoría |
| `eventId` | UUID del evento original (único — previene duplicados) |
| `userId` | Usuario que realizó la acción (`system` para acciones automáticas) |
| `action` | Nombre semántico de la acción (ver tabla arriba) |
| `entityType` | Tipo de entidad afectada |
| `entityId` | ID de la entidad afectada |
| `previousState` | Estado antes de la acción (null si es creación) |
| `newState` | Estado después de la acción |
| `eventPayload` | Evento original completo (para trazabilidad máxima) |
| `createdAt` | Timestamp UTC del registro |

---

## Mapeo de estados por evento

### CaseClosed
```json
{
  "previousState": null,
  "newState": { "status": "CLOSED", "closed_by_user_id": "uuid" }
}
```

### EvidenceTransferred
```json
{
  "previousState": { "current_custodian_id": "user-anterior-uuid" },
  "newState": { "current_custodian_id": "user-nuevo-uuid", "transfer_reason": "Enviando a laboratorio" }
}
```

### TaskOverdue
```json
{
  "previousState": { "status": "PENDING" },
  "newState": { "status": "OVERDUE", "due_date": "2024-05-10" },
  "userId": "system"
}
```

---

## Idempotencia

El campo `event_id` tiene un índice único. Si el mismo evento llega dos veces (por reentrega de RabbitMQ), el segundo se ignora con un log de warning:

```
[AuditService] Duplicate event ignored: <event-id>
```

---

## Dead Letter Queue

Si el procesamiento de un mensaje falla (error al guardar en BD, JSON inválido), el mensaje es nacked y va al exchange `dlq.investigation-system`.

Para monitorear mensajes fallidos:
1. Abre http://localhost:15672
2. Ve a **Queues** → busca colas que empiecen con `dlq`
3. Inspecciona los mensajes y sus headers de error

---

## Troubleshooting

### El audit no aparece después de una acción

1. Verifica que el servicio productor muestre `Connected to RabbitMQ` en sus logs
2. Verifica que en RabbitMQ (http://localhost:15672) → Exchanges exista `investigation-system`
3. Verifica que en RabbitMQ → Queues exista `audit-service.events` con el binding `#`
4. Revisa los logs del audit-service — debe mostrar `Consumed X.Y [uuid]` y `Audit recorded: ACTION [uuid]`

### Error "Duplicate event ignored"

Normal si el mensaje fue reentregado. No requiere acción.

### La tabla audit no existe

El audit-service con `synchronize: true` la crea automáticamente al arrancar. Verifica que el schema `audit_db` exista en PostgreSQL (está en `docker/postgres/init.sql`).
