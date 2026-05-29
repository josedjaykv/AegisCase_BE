# Testing Guide

Phase 7 ships two testing surfaces:

1. **Swagger UI** per service — interactive, OpenAPI 3.0, generated from controllers/DTOs.
2. **Postman collection** at `postman/AegisCase.postman_collection.json` — kept as a smoke-test starting point.

This guide is the practical "how do I exercise the API end-to-end" reference.

---

## 1. Prerequisites

Bring up infrastructure and the services:

```bash
docker-compose up postgres rabbitmq keycloak -d
# Wait for Keycloak realm import (~60s)
docker-compose logs -f keycloak | grep -m 1 "Listening on"

# In separate terminals (or via docker-compose up):
npm run start:gateway
npm run start:auth
npm run start:user
npm run start:case
npm run start:involved
npm run start:evidence
npm run start:task
npm run start:media
npm run start:audit
```

Service map: see [README §Service URLs](../README.md#service-urls).

---

## 2. Obtain a JWT

Pick any seeded user — they all live in the imported `aegiscase` realm:

| Email                     | Password         | Role      |
|---------------------------|------------------|-----------|
| admin@aegiscase.com       | `Admin1234!`     | ADMIN     |
| detective@aegiscase.com   | `Detective1234!` | DETECTIVE |
| analyst@aegiscase.com     | `Analyst1234!`   | ANALYST   |

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"detective@aegiscase.com","password":"Detective1234!"}' \
  | jq -r .access_token
```

Save the token:
```bash
export TOKEN=$(curl -s ... | jq -r .access_token)
```

---

## 3. Test via Swagger UI

Each service publishes its own OpenAPI doc:

| Service          | URL                              |
|------------------|----------------------------------|
| API Gateway      | http://localhost:3000/api/docs   |
| Auth Service     | http://localhost:3001/api/docs   |
| User Service     | http://localhost:3002/api/docs   |
| Case Service     | http://localhost:3003/api/docs   |
| Involved Service | http://localhost:3004/api/docs   |
| Evidence Service | http://localhost:3005/api/docs   |
| Task Service     | http://localhost:3006/api/docs   |
| Media Service    | http://localhost:3007/api/docs   |
| Audit Service    | http://localhost:3008/api/docs   |

**Workflow:**
1. Open the service's `/api/docs`.
2. Click **Authorize** → paste the bearer token from §2.
3. Use **Try it out** on any endpoint; request/response examples are generated from the DTOs.

> Hitting a service Swagger URL directly bypasses the gateway. Auth still works because each service validates the same JWT. Permission errors (403) and validation errors (400) will be identical to going through the gateway.

---

## 4. Test via Postman

Import `postman/AegisCase.postman_collection.json` into Postman, then set the collection variables:

| Variable      | Suggested value                |
|---------------|--------------------------------|
| `base_url`    | `http://localhost:3000`        |
| `access_token`| (paste token from §2)          |

The collection contains the smoke-test requests for the auth flow and a baseline of CRUD calls per service. A full per-service expansion (happy path + permission + error suites) is out of scope for this PR.

To run from the CLI:
```bash
npx newman run postman/AegisCase.postman_collection.json \
  --env-var "base_url=http://localhost:3000" \
  --env-var "access_token=$TOKEN"
```

---

## 5. End-to-End Smoke Flow

Verifies the golden investigation path across every service:

1. **Login as DETECTIVE** (§2).
2. **Create a case** — `POST /cases` → save `caseId`.
   - Expect `201`, status `OPEN`.
3. **Add team members** — `POST /cases/:caseId/team`.
4. **Register an involved person** — `POST /involved-persons` → save `personId`.
5. **Link person to case** — `POST /involved-persons/:personId/cases/:caseId`.
6. **Register evidence** — `POST /evidence` → save `evidenceId`.
   - Expect initial chain-of-custody record auto-created.
7. **Transfer custody** — `PATCH /evidence/:evidenceId/transfer-custody`.
8. **Upload a file to the case** — `POST /media` (multipart, `entity_type=CASE`).
9. **Create + assign a task** — `POST /tasks` → save `taskId`.
10. **Complete the task** as the assignee — `PATCH /tasks/:taskId/status` `{ "status": "COMPLETED" }`.
11. **Close the case** — `PATCH /cases/:caseId/status` `{ "status": "CLOSED" }`.
12. **Verify the audit trail** — `GET /audit/entity/Case/:caseId`.
    - Expect a chronological history with at minimum `CaseCreated`, `CaseClosed`, and the events for media/evidence/task that referenced this case.

If any step returns a 4xx unexpectedly, see [Troubleshooting](#7-troubleshooting).

---

## 6. Permission Smoke Checks

For each protected route, the same three checks apply. Run them quickly with curl:

```bash
# 401 — no token
curl -i -X POST http://localhost:3000/cases -d '{}' -H 'Content-Type: application/json'

# 403 — analyst attempting a detective-only action
curl -i -X POST http://localhost:3000/cases \
  -H "Authorization: Bearer $ANALYST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"X","priority":"LOW","leaderUserId":"…"}'

# 200/201 — detective with valid input
curl -i -X POST http://localhost:3000/cases \
  -H "Authorization: Bearer $DETECTIVE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"X","priority":"LOW","leaderUserId":"…"}'
```

The expected role/status matrix per endpoint is documented in `docs/API_REFERENCE.md`.

---

## 7. Troubleshooting

| Symptom                                  | Likely cause                                                       |
|------------------------------------------|---------------------------------------------------------------------|
| `401 Unauthorized` on every call         | Token missing/expired; re-issue via `/auth/login`.                  |
| `403 Forbidden`                          | Role insufficient; check `realm_access.roles` in the JWT.           |
| `502 Bad Gateway`                        | Downstream service not running; check service logs and ports.      |
| Audit endpoint returns no events         | RabbitMQ consumer not started, or message went to DLQ. See `docs/AUDIT.md`. |
| Media upload returns `503`               | S3 credentials/bucket misconfigured. See `docs/MEDIA.md`.           |
| Validation message `must be a valid UUID`| Field expects a UUID — check DTO in Swagger.                        |

---

## 8. Not in This Phase

The following are explicitly out of scope for the current Phase 7 docs sprint and remain TODO:

- Per-service Postman collections (currently a single collection).
- Newman-driven CI suite with permission/error/integration folders.
- Automated Jest integration tests covering the full investigation flow.
- Load / performance baselines for critical endpoints.

These items are tracked separately and will land in follow-up PRs.
