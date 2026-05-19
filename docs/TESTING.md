# Testing — AegisCase Backend

This doc is your operator's manual for the test suites we built during Phase 7. It tells you **what each test layer covers, how to run it, what to read when something fails, and when to add new tests.**

For end-user / API testing (Swagger, Postman smoke flow) see [TESTING_GUIDE.md](TESTING_GUIDE.md). This file is for **developer-driven automated tests**.

---

## At a glance

| Layer            | Where                                          | Runner           | Infra needed       | Run time | What it proves |
|------------------|------------------------------------------------|------------------|--------------------|----------|----------------|
| Unit (Jest)      | `apps/*/src/**/*.service.spec.ts`              | `npm test`       | None (mocks only)  | ~9s      | Business rules in `*.service.ts` |
| E2E (Jest)       | `test/e2e/*.e2e-spec.ts`                       | `npm run test:e2e` | Docker daemon   | ~70s     | Full async flow: HTTP → Postgres → RabbitMQ → consumer → Postgres → HTTP |
| API smoke        | Swagger UI / `postman/AegisCase.postman_collection.json` | manual / Newman | Full docker-compose stack | minutes | Real auth via Keycloak, frontend-facing API |

The unit + E2E suites are the ones you run locally before pushing. The API smoke is for pre-release validation. None of them require talking to a real cloud.

---

## 1. Unit tests

### What they cover

| Service | Spec | Tests | Focus |
|---------|------|-------|-------|
| case-service     | `apps/case-service/src/cases/cases.service.spec.ts`           | 13 | code generation, creator/leader team rows, closed-case write rejection, admin-only reopen, CaseClosed/CaseArchived publication |
| evidence-service | `apps/evidence-service/src/evidence/evidence.service.spec.ts` |  9 | initial chain-of-custody seeding, view-tracking on `findOne`, custody transfer (append-only), archive idempotency |
| task-service     | `apps/task-service/src/tasks/tasks.service.spec.ts`           | 13 | PENDING on create, terminal-state guard, analyst own-task scope, no-reopen of COMPLETED, analyst-cannot-cancel, overdue auto-marking |

Total: **35 tests, ~9s**, no Docker, no network, no `.env`.

### How they work

- TypeORM `Repository<T>` is replaced with a typed `jest.fn()`-backed mock (`mockRepo()` helper at the top of each spec).
- `EventPublisherService` is replaced with a `jest.fn()` stub — we assert it was *called with the right payload*, never that an event was actually published.
- No NestJS HTTP, no guards, no DTO pipes. We instantiate the service via `Test.createTestingModule()` and call its methods directly.

### Run

```bash
npm test                                 # all unit specs
npm test -- apps/case-service            # only one service
npm test -- --watch                      # watch mode
npm run test:cov                         # with coverage report
```

### When a unit test fails

1. **Read the assertion**, not the stack. Jest tells you exactly which `expect(...)` didn't match.
2. The mock setup in `beforeEach` is your simulated DB. If the test expects a `findOne` call but the service does something else, that's the bug surface.
3. **You almost never need a debugger.** If you do: `node --inspect-brk node_modules/.bin/jest --runInBand <spec>` and attach.

### Adding a new unit test

1. Find the service file: `apps/<svc>/src/**/<name>.service.ts`.
2. Sit a `*.service.spec.ts` next to it.
3. Copy the `mockRepo<T>()` and `actor()` helpers from one of the existing specs — they're identical on purpose.
4. Cover the **non-trivial branch**, not happy-path getters. Rule of thumb: if the method has an `if`, a `throw`, a status check or a published event, write a test.
5. **Don't test the framework.** Skip tests for plain CRUD pass-through.

### What unit tests do NOT cover

- SQL generation. TypeORM is mocked, so a typo in a `where` clause may pass unit tests and still break in prod. That's what the E2E suite is for.
- Auth guards / JwtAuthGuard / RolesGuard. Those are exercised in E2E.
- Validation pipes (`@IsUUID`, etc.). Same — exercised in E2E.

---

## 2. E2E tests

### What they cover

Two spec files, both running in-process against real Postgres + RabbitMQ containers:

#### `test/e2e/case-audit-flow.e2e-spec.ts` — anchor

3 tests that exercise the **critical async path** end-to-end:

```
HTTP POST /cases  →  Postgres write  →  RabbitMQ publish
                                              ↓
                                       audit-service consumer
                                              ↓
                                       Postgres write
                                              ↓
HTTP GET /audit/entity/Case/:id  ←  returns the audit record
```

Covered actions: `CASE_CREATED`, `CASE_CLOSED`, plus a 401 negative.

#### `test/e2e/investigation-flow.e2e-spec.ts` — extended

7 tests across 4 services + audit:

- Evidence sub-flow: `EVIDENCE_ADDED`, `EVIDENCE_CUSTODY_TRANSFERRED`, chain-of-custody append.
- Task sub-flow: `TASK_ASSIGNED`, `TASK_COMPLETED`, no-reopen rule (400).
- Permission checks: analyst forbidden on cases and evidence (403).

Total: **10 tests, ~70s**.

### How they work

- **Infrastructure** — `test/e2e/helpers/containers.ts` spins up `postgres:16-alpine` and `rabbitmq:3.13-management-alpine` via [testcontainers](https://node.testcontainers.org/). Per-service schemas are pre-created. Returns a `stop()` to teardown.
- **Env override** — `applyInfraEnv()` sets `DB_*`, `RABBITMQ_URL`, `JWT_SECRET`, and *empties* `KEYCLOAK_URL`. Empty (not deleted) so that the `.env` file loaded by `ConfigModule` doesn't repopulate it (dotenv skips already-set keys).
- **JWTs** — signed locally with HS256 against `JWT_SECRET`. `JwtStrategy` falls back to HS256 when `KEYCLOAK_URL` is falsy. No Keycloak in the loop. See `test/e2e/helpers/jwt.ts` for `TEST_DETECTIVE`, `TEST_ADMIN`, `TEST_ANALYST` and `signTestToken()`.
- **Bootstrap** — `bootstrapApp()` calls `NestFactory.create()` with the same global `ValidationPipe` + `AllExceptionsFilter` as production `main.ts`. Each spec orders **audit-service first** so the RabbitMQ consumer is bound before any publisher fires.
- **Polling** — `pollUntil()` retries `GET /audit/entity/...` every 250 ms until either the expected `action` appears or 15 s elapses. We never use a fixed `sleep`.

### Run

```bash
npm run test:e2e                                # both specs (~70s)
npm run test:e2e -- --testPathPattern=case-audit  # just the anchor
```

Prereqs:

- **Docker daemon running** (testcontainers needs it). On WSL2, make sure Docker Desktop's "WSL integration" includes your distro.
- Ports 5432 and 5672 free **or** Docker uses random ports (testcontainers does this automatically — no host port conflict).

### When an E2E test fails

E2E failures fall into four buckets. The error message tells you which:

| Symptom                                         | Bucket               | Where to look |
|-------------------------------------------------|----------------------|---------------|
| `Timed out waiting for ... after 15000ms`       | Event not consumed   | `apps/audit-service/src/audit/amqp-consumer.service.ts` logs; check the publisher actually called `.publish*()` |
| `expected 401 ... got 201`                      | Auth bypass          | `libs/auth/src/strategies/jwt.strategy.ts` — `KEYCLOAK_URL` may not be empty |
| `expected 201 ... got 400`                      | Validation rejected  | Check the body of `createRes.body` — the DTO validator is firing |
| `Could not connect ... Docker`                  | Infra                | `docker ps` — is the daemon running? Are you over the container limit? |

The deprecation warning about `pg.query()` during boot comes from testcontainers' own startup code, not from us. Ignore it.

### Adding a new E2E test

1. Decide: extension of the existing investigation-flow spec, or a brand-new spec for a different domain (involved, media)?
2. For a new spec: copy `case-audit-flow.e2e-spec.ts`'s `beforeAll`/`afterAll`, swap the AppModules you bootstrap.
3. **Always bootstrap audit-service before any publisher.** Otherwise events fire into a queue with no consumer bound and you'll get spurious timeouts.
4. **Always poll, never `sleep`.** Use `pollUntil()` from `helpers/bootstrap.ts`.
5. **Use real UUID v4 strings** for any field validated by `@IsUUID()`. The shortcut `'11111111-…-111111111111'` fails RFC 4122 (variant bits). See `TEST_*` constants in `helpers/jwt.ts` for working examples.
6. Keep specs serialized: `jest-e2e.json` has `maxWorkers: 1`. Don't try to parallelize — RabbitMQ queue ordering across workers gets ugly.

### What E2E tests do NOT cover

- The **API gateway**. Specs hit each service's HTTP server directly. If you change gateway routing, run the manual smoke (see TESTING_GUIDE.md §5).
- **Keycloak**. JWTs are signed locally. A broken Keycloak realm or JWKS misconfig will not be caught here.
- **AWS S3**. Media-service is not yet in the E2E. To extend, you'd need either a localstack container or a stubbed S3 client.
- **Production migrations.** TypeORM `synchronize: true` builds the schema fresh each run; we'd never catch a migration that breaks production data.

---

## 3. Running everything before a push

```bash
npx tsc --noEmit -p tsconfig.json   # typecheck
npm run lint                         # lint
npm test                             # unit (~9s)
npm run test:e2e                     # E2E (~70s, needs Docker)
```

If all four are green, the code is in good shape to push. If E2E fails but unit passes, you have a wiring or async bug, not a logic bug — start with the bucket table above.

---

## 4. CI guidance (when you wire it up)

Suggested pipeline:

```yaml
- name: install
  run: npm ci
- name: typecheck
  run: npx tsc --noEmit -p tsconfig.json
- name: lint
  run: npm run lint
- name: unit
  run: npm test
- name: e2e
  run: npm run test:e2e
  # GitHub Actions/GitLab CI runners with Docker support work out of the box.
  # On runners without Docker-in-Docker, gate this with `if: runner.has-docker`.
```

The unit step is fast and should block every PR. The E2E step adds ~70 s; gate it on PRs that touch `apps/`, `libs/auth`, `libs/events` or `libs/database`.

---

## 5. Coverage and gaps

What's covered today:

- ✅ Business rules in 3 of 9 services (case, evidence, task) at the unit level.
- ✅ Full happy-path async flow across 4 services + audit at the E2E level.
- ✅ Two permission-negative cases at the E2E level (analyst forbidden).

What's **not** covered today (deliberate, tracked in `docs/TESTING_GUIDE.md §8`):

- ❌ Unit tests for user, involved, media, audit services.
- ❌ E2E for involved-persons and media (S3) services.
- ❌ Performance / load tests.
- ❌ Security smoke (SQL injection, XSS, JWT tampering) — the JWT bypass is implicitly checked, the rest is not.
- ❌ Real Keycloak integration in E2E.

If you want to close any of these gaps the pattern is established — copying an existing spec is the fastest path.

---

## 6. Quick reference

```bash
# Layered test commands
npm test                             # unit
npm run test:watch                   # unit, watch
npm run test:cov                     # unit, coverage
npm run test:e2e                     # E2E (Docker required)

# Pick a single suite
npm test -- apps/task-service
npm run test:e2e -- --testPathPattern=investigation
```

```bash
# Useful files
test/e2e/helpers/containers.ts       # postgres + rabbitmq lifecycle
test/e2e/helpers/jwt.ts              # test user constants + signTestToken
test/e2e/helpers/bootstrap.ts        # bootstrapApp + pollUntil
jest-e2e.json                        # E2E Jest config (testRegex, timeout)
```
