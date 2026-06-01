# AegisCase Backend

Investigation Management System — NestJS Microservices Monorepo

## Architecture

```
backend/
├── apps/
│   ├── api-gateway/     (port 3000) — Single entry point, routing, Swagger
│   ├── auth-service/    (port 3001) — Keycloak integration, JWT
│   ├── user-service/    (port 3002) — User operational profiles
│   ├── case-service/    (port 3003) — Case and team management
│   ├── involved-service/(port 3004) — Involved persons management
│   ├── evidence-service/(port 3005) — Evidence and chain of custody
│   ├── task-service/    (port 3006) — Task management
│   ├── media-service/   (port 3007) — Multimedia files (AWS S3)
│   └── audit-service/   (port 3008) — Event traceability (RabbitMQ consumer)
├── libs/
│   ├── common/     — Filters, interceptors, decorators, pipes
│   ├── auth/       — JWT strategy, guards, role decorators
│   ├── dto/        — Shared DTOs (pagination, id params)
│   ├── enums/      — Domain enums (roles, statuses, priorities)
│   ├── events/     — RabbitMQ event interfaces and patterns
│   └── database/   — TypeORM base entity and DatabaseModule
├── docker/
│   ├── Dockerfile                  — Multi-stage build for any service
│   ├── keycloak/realm-export.json  — Pre-configured realm (auto-imported)
│   └── postgres/init.sql           — Schema initialization
├── postman/
│   └── AegisCase.postman_collection.json
├── docker-compose.yml
├── .env.example
└── nest-cli.json
```

## Run the full stack (Backend + Frontend) with Docker

The single `docker-compose.yml` brings up **everything**: infrastructure (PostgreSQL, RabbitMQ,
Keycloak), the 9 backend services, and the frontend. Only Docker is required.

> 🇪🇸 Guía paso a paso en español: [`COMO-EJECUTAR.md`](COMO-EJECUTAR.md)

**1. Clone both repos as sibling folders** (the compose builds the FE from `../AegisCase_FE`):

```
parent/
├── AegisCase_BE/   ← this repo (has docker-compose.yml)
└── AegisCase_FE/   ← frontend repo (branch with its Dockerfile)
```

**2. From inside `AegisCase_BE`, build and start:**

```bash
# Build sequentially to avoid npm network timeouts (first image caches the
# shared npm layer, the rest reuse it). First run takes a few minutes.
COMPOSE_PARALLEL_LIMIT=1 docker compose build

# Start the whole system
docker compose up -d

# Check status (all Up; postgres/rabbitmq/keycloak Healthy)
docker compose ps
```

No `.env` file is needed — the compose ships working defaults for local development.

**3. Open the app** at **http://localhost:4200** and log in.

| URL | What |
|---|---|
| http://localhost:4200 | Frontend (the app) |
| http://localhost:3000 | API Gateway |
| http://localhost:3000/api/docs | API docs (Swagger) |
| http://localhost:15672 | RabbitMQ console (`aegiscase` / `aegiscase`) |
| http://localhost:8080 | Keycloak console (`admin` / `admin`) |

**Seeded test users:**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@aegiscase.com` | `Admin1234!` |
| Detective | `detective@aegiscase.com` | `Detective1234!` |
| Analyst | `analyst@aegiscase.com` | `Analyst1234!` |

**Stop everything:** `docker compose down` (add `-v` to also wipe data).

> Note: file uploads use AWS S3 — without `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` that single
> feature is unavailable, but the rest of the system works normally.

---

## Prerequisites (local development without Docker)

- Node.js 22+
- npm 10+
- Docker & Docker Compose

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values (defaults work for local development)
```

### 3. Start infrastructure (PostgreSQL + RabbitMQ + Keycloak)

```bash
# Start all infrastructure services
docker-compose up postgres rabbitmq keycloak -d

# Wait ~60s for Keycloak to finish importing the realm
docker-compose logs -f keycloak | grep -m 1 "Listening on"
```

Keycloak auto-imports the realm from `docker/keycloak/realm-export.json` on first start.

### 4. Run services locally

```bash
npm run start:gateway
npm run start:user
npm run start:case
# ... etc
```

### 5. Run everything with Docker

```bash
docker-compose up --build
```

## Service URLs

| Service          | URL                            | Purpose              |
|------------------|--------------------------------|----------------------|
| API Gateway      | http://localhost:3000          | Main entry point     |
| Auth Service     | http://localhost:3001          | Authentication       |
| User Service     | http://localhost:3002          | User profiles        |
| Case Service     | http://localhost:3003          | Case management      |
| Involved Service | http://localhost:3004          | Involved persons     |
| Evidence Service | http://localhost:3005          | Evidence management  |
| Task Service     | http://localhost:3006          | Task management      |
| Media Service    | http://localhost:3007          | File uploads         |
| Audit Service    | http://localhost:3008          | Audit logs           |

Each service exposes Swagger UI at `/api/docs` (e.g. http://localhost:3003/api/docs for cases). See [docs/API_REFERENCE.md](docs/API_REFERENCE.md#swagger-endpoints) for the full list.

| RabbitMQ UI      | http://localhost:15672         | Message broker admin |
| Keycloak Admin   | http://localhost:8080          | Identity provider    |

Default credentials:
- **RabbitMQ:** `aegiscase` / `aegiscase`
- **Keycloak admin console:** `admin` / `admin`

## Keycloak Setup

The realm is auto-imported from `docker/keycloak/realm-export.json`. No manual steps needed.

**Realm:** `aegiscase` · **Admin console:** http://localhost:8080/admin

### Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@aegiscase.com | Admin1234! | ADMIN |
| detective@aegiscase.com | Detective1234! | DETECTIVE |
| analyst@aegiscase.com | Analyst1234! | ANALYST |

### Clients

| Client ID | Type | Purpose |
|-----------|------|---------|
| `aegiscase-backend` | Confidential | Service-to-service (ROPC flow) |
| `aegiscase-frontend` | Public | SPA OAuth2 code flow |

### Auth Endpoints (via API Gateway)

```
POST /auth/login      — Exchange credentials for tokens
POST /auth/refresh    — Refresh access token
POST /auth/logout     — Revoke refresh token
GET  /auth/me         — Current user from token (requires Bearer)
POST /auth/validate   — Validate token (requires Bearer)
```

### Permission Matrix

| Action | ADMIN | DETECTIVE | ANALYST |
|--------|:-----:|:---------:|:-------:|
| Create/delete cases | ✓ | Create only | ✗ |
| Create/delete evidence | ✓ | Create only | ✗ |
| Create/assign tasks | ✓ | ✓ | ✗ |
| Update own tasks | ✓ | ✓ | ✓ |
| Manage users | ✓ | ✗ | ✗ |
| Archive cases/evidence | ✓ | ✗ | ✗ |
| Reopen closed cases | ✓ | ✗ | ✗ |
| Query audit logs | ✓ | ✗ | ✗ |
| Query all entities | ✓ | ✓ | ✓ |

## Tech Stack

- **Runtime:** Node.js 22 + TypeScript 5
- **Framework:** NestJS 10
- **Database:** PostgreSQL 16 (single instance, separate schemas per service)
- **Message Broker:** RabbitMQ 3.13
- **ORM:** TypeORM
- **Auth:** Keycloak + JWT (Passport)
- **Storage:** AWS S3 (media service)
- **Docs:** Swagger/OpenAPI

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 — Base Infrastructure | **Done** | Monorepo, scaffolding, Docker |
| 2 — Security | **Done** | Keycloak, JWT, Guards, Postman |
| 3 — Core Services | **Done** | Business logic per service |
| 4 — Events | **Done** | RabbitMQ publishers/consumers |
| 5 — Audit | **Done** | Traceability |
| 6 — Media | **Done** | S3 integration |
| 7 — Testing & Docs | In progress | Swagger on every service, reference docs (see [docs/](docs/)) |

## Documentation

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — Endpoint catalog + Swagger URLs
- [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) — How to smoke-test via Swagger / Postman
- [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md) — Pre/post-deployment checks
- [docs/EVENTS.md](docs/EVENTS.md) — RabbitMQ event catalog
- [docs/AUDIT.md](docs/AUDIT.md) — Audit semantics
- [docs/MEDIA.md](docs/MEDIA.md) — Media service, S3 details

## Useful Commands

```bash
npm run lint       # Lint all code
npm run format     # Format all code
npm test           # Run tests
npx nest build case-service  # Build a specific service
```
