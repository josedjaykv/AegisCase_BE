# API Reference

Investigation Management System — V1

All endpoints are exposed by the **API Gateway** at `http://localhost:3000`. The gateway forwards requests to the appropriate microservice. Live, interactive documentation per service is available via Swagger UI (see [Swagger Endpoints](#swagger-endpoints)).

---

## Authentication

All endpoints except `/auth/login` and `/auth/refresh` require a JWT obtained from Keycloak via the auth-service.

```
Authorization: Bearer <access_token>
```

Tokens are issued by `POST /auth/login`. The JWT `realm_access.roles` claim is mapped to one of `ADMIN`, `DETECTIVE`, `ANALYST` and enforced by `@Roles()` guards on each route.

---

## Common Response Envelope

### Success — collection endpoints
```json
{
  "data": [ /* items */ ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### Success — single resource
The entity JSON directly (no envelope).

### Error
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

---

## Common Status Codes

| Code | Meaning                                                              |
|-----:|----------------------------------------------------------------------|
| 200  | OK — successful read or update                                       |
| 201  | Created — resource created                                           |
| 204  | No Content — successful delete/soft-delete                           |
| 400  | Bad Request — validation failed (missing field, wrong type/enum)     |
| 401  | Unauthorized — no/invalid/expired token                              |
| 403  | Forbidden — token valid but role insufficient                        |
| 404  | Not Found — entity does not exist                                    |
| 409  | Conflict — unique constraint violation (case_code, document, etc.)   |
| 422  | Unprocessable — business rule rejected (e.g. closed case write)      |
| 502  | Bad Gateway — downstream microservice unreachable                    |
| 503  | Service Unavailable — S3 / database / RabbitMQ unavailable           |

---

## Swagger Endpoints

When services run locally, every service exposes interactive OpenAPI docs at `/api/docs`:

| Service          | Swagger UI                          |
|------------------|-------------------------------------|
| API Gateway      | http://localhost:3000/api/docs      |
| Auth Service     | http://localhost:3001/api/docs      |
| User Service     | http://localhost:3002/api/docs      |
| Case Service     | http://localhost:3003/api/docs      |
| Involved Service | http://localhost:3004/api/docs      |
| Evidence Service | http://localhost:3005/api/docs      |
| Task Service     | http://localhost:3006/api/docs      |
| Media Service    | http://localhost:3007/api/docs      |
| Audit Service    | http://localhost:3008/api/docs      |

Use the **Authorize** button (top right) in any Swagger UI to paste a bearer token; subsequent "Try it out" calls send `Authorization: Bearer …` automatically.

---

## Auth

| Method | Path             | Roles            | Purpose                              |
|--------|------------------|------------------|--------------------------------------|
| POST   | `/auth/login`    | public           | Exchange credentials for tokens      |
| POST   | `/auth/refresh`  | public           | Refresh access token                 |
| POST   | `/auth/logout`   | authenticated    | Revoke refresh token                 |
| GET    | `/auth/me`       | authenticated    | Current user from JWT                |
| POST   | `/auth/validate` | authenticated    | Validate the bearer token            |

---

## Users

Base path: `/users`

| Method | Path             | Roles                       | Purpose                |
|--------|------------------|-----------------------------|------------------------|
| POST   | `/users`         | ADMIN                       | Create user            |
| GET    | `/users`         | ADMIN                       | List users (paginated) |
| GET    | `/users/:id`     | ADMIN, DETECTIVE, ANALYST   | Get user by ID         |
| PUT    | `/users/:id`     | ADMIN                       | Update user            |

---

## Cases

Base path: `/cases`

| Method | Path                       | Roles                       | Purpose                        |
|--------|----------------------------|-----------------------------|--------------------------------|
| POST   | `/cases`                   | ADMIN, DETECTIVE            | Create case                    |
| GET    | `/cases`                   | ADMIN, DETECTIVE, ANALYST   | List cases (paginated)         |
| GET    | `/cases/:id`               | ADMIN, DETECTIVE, ANALYST   | Get case                       |
| PUT    | `/cases/:id`               | ADMIN, DETECTIVE            | Update case                    |
| PATCH  | `/cases/:id/status`        | ADMIN, DETECTIVE            | Change status                  |
| PATCH  | `/cases/:id/archive`       | ADMIN                       | Archive case                   |
| POST   | `/cases/:id/team`          | ADMIN, DETECTIVE            | Add team member                |
| GET    | `/cases/:id/team`          | ADMIN, DETECTIVE, ANALYST   | List team members              |

**Business rules:** closed cases cannot be modified operationally; only `ADMIN` can archive or reopen.

---

## Involved Persons

Base path: `/involved-persons`

| Method | Path                                  | Roles                       | Purpose                    |
|--------|---------------------------------------|-----------------------------|----------------------------|
| POST   | `/involved-persons`                   | ADMIN, DETECTIVE            | Register person            |
| GET    | `/involved-persons`                   | ADMIN, DETECTIVE, ANALYST   | List persons               |
| GET    | `/involved-persons/:id`               | ADMIN, DETECTIVE, ANALYST   | Get person                 |
| PUT    | `/involved-persons/:id`               | ADMIN, DETECTIVE            | Update person              |
| POST   | `/involved-persons/:id/cases/:caseId` | ADMIN, DETECTIVE            | Link person to case        |
| GET    | `/involved-persons/:id/cases`         | ADMIN, DETECTIVE, ANALYST   | List cases linked          |

---

## Evidence

Base path: `/evidence`

| Method | Path                              | Roles                       | Purpose                      |
|--------|-----------------------------------|-----------------------------|------------------------------|
| POST   | `/evidence`                       | ADMIN, DETECTIVE            | Register evidence            |
| GET    | `/evidence?caseId=<uuid>`         | ADMIN, DETECTIVE, ANALYST   | List (optionally by case)    |
| GET    | `/evidence/:id`                   | ADMIN, DETECTIVE, ANALYST   | Get evidence (logs view)     |
| PUT    | `/evidence/:id`                   | ADMIN, DETECTIVE            | Update evidence              |
| PATCH  | `/evidence/:id/transfer-custody`  | ADMIN, DETECTIVE            | Transfer custody             |
| GET    | `/evidence/:id/chain-of-custody`  | ADMIN, DETECTIVE, ANALYST   | Full custody chain history   |
| PATCH  | `/evidence/:id/archive`           | ADMIN                       | Archive evidence             |

**Business rules:** evidence is never physically deleted (V1). Chain-of-custody is append-only. Viewing evidence (`GET /evidence/:id`) records a custody-view event — the viewer becomes the last-known responsible party.

---

## Tasks

Base path: `/tasks`

| Method | Path                              | Roles                                | Purpose                       |
|--------|-----------------------------------|--------------------------------------|-------------------------------|
| POST   | `/tasks`                          | ADMIN, DETECTIVE                     | Create task                   |
| GET    | `/tasks?assignedToUserId=<uuid>`  | ADMIN, DETECTIVE, ANALYST            | List tasks                    |
| GET    | `/tasks/:id`                      | ADMIN, DETECTIVE, ANALYST            | Get task                      |
| PUT    | `/tasks/:id`                      | ADMIN, DETECTIVE, ANALYST (assignee) | Update task                   |
| PATCH  | `/tasks/:id/status`               | ADMIN, DETECTIVE, ANALYST (assignee) | Change status / complete      |

**Business rules:** tasks may only be assigned to `DETECTIVE` or `ANALYST`. A `COMPLETED` task cannot be reopened in V1.

---

## Media

Base path: `/media`

| Method | Path                                            | Roles                       | Purpose                          |
|--------|-------------------------------------------------|-----------------------------|----------------------------------|
| POST   | `/media`                                        | ADMIN, DETECTIVE, ANALYST   | Upload file (multipart) to S3    |
| GET    | `/media/entity/:entityType/:entityId`           | ADMIN, DETECTIVE, ANALYST   | List media for an entity         |
| GET    | `/media/:id`                                    | ADMIN, DETECTIVE, ANALYST   | Get media metadata               |
| GET    | `/media/:id/download-url`                       | ADMIN, DETECTIVE, ANALYST   | Pre-signed S3 download URL       |
| DELETE | `/media/:id`                                    | ADMIN                       | Soft-delete media                |

Upload uses `multipart/form-data` with fields:
- `file` — binary
- `entity_type` — `CASE | TASK | EVIDENCE | INVOLVED_PERSON | USER`
- `entity_id` — UUID (string for `USER`)

Hard cap: 100 MB per file (multer level). Stricter MIME/size rules may apply per `entity_type` — see `docs/MEDIA.md`.

---

## Audit

Base path: `/audit`

| Method | Path                                     | Roles                       | Purpose                              |
|--------|------------------------------------------|-----------------------------|--------------------------------------|
| GET    | `/audit`                                 | ADMIN, DETECTIVE, ANALYST   | Query audit records (filters)        |
| GET    | `/audit/entity/:entityType/:entityId`    | ADMIN, DETECTIVE, ANALYST   | Full history for an entity           |
| GET    | `/audit/user/:userId`                    | ADMIN, DETECTIVE, ANALYST   | Actions performed by a user          |
| GET    | `/audit/:id`                             | ADMIN, DETECTIVE, ANALYST   | Single audit record                  |

Query parameters on `GET /audit`:
- `entity_type`, `entity_id`, `user_id`, `action`
- `from_date`, `to_date` (`YYYY-MM-DD` or ISO 8601)
- `page` (default 1), `limit` (default 20, max 1000)

Audit is **read-only** — it is populated by event consumers, not by direct writes. See `docs/AUDIT.md` and `docs/EVENTS.md`.

---

## Related Documents

- `docs/EVENTS.md` — RabbitMQ event catalog
- `docs/AUDIT.md` — Audit semantics and event-to-record mapping
- `docs/MEDIA.md` — Media service, S3 integration, upload limits
- `docs/TESTING_GUIDE.md` — How to run smoke tests via Swagger / Postman
- `docs/DEPLOYMENT_CHECKLIST.md` — Pre/post-deployment checks
