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
│   ├── Dockerfile          — Multi-stage build for any service
│   └── postgres/init.sql   — Schema initialization
├── docker-compose.yml
├── .env.example
└── nest-cli.json
```

## Prerequisites

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

### 3. Start infrastructure (PostgreSQL + RabbitMQ)

```bash
docker-compose up postgres rabbitmq -d
docker-compose ps
```

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
| Swagger Docs     | http://localhost:3000/api/docs | API documentation    |
| Auth Service     | http://localhost:3001          | Authentication       |
| User Service     | http://localhost:3002          | User profiles        |
| Case Service     | http://localhost:3003          | Case management      |
| Involved Service | http://localhost:3004          | Involved persons     |
| Evidence Service | http://localhost:3005          | Evidence management  |
| Task Service     | http://localhost:3006          | Task management      |
| Media Service    | http://localhost:3007          | File uploads         |
| Audit Service    | http://localhost:3008          | Audit logs           |
| RabbitMQ UI      | http://localhost:15672         | Message broker admin |

Default RabbitMQ credentials: `aegiscase` / `aegiscase`

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
| 2 — Security | Pending | Keycloak, JWT, Guards |
| 3 — Core Services | Pending | Business logic per service |
| 4 — Events | Pending | RabbitMQ publishers/consumers |
| 5 — Audit | Pending | Traceability |
| 6 — Media | Pending | S3 integration |
| 7 — Testing & Docs | Pending | Postman, E2E tests |

## Useful Commands

```bash
npm run lint       # Lint all code
npm run format     # Format all code
npm test           # Run tests
npx nest build case-service  # Build a specific service
```
