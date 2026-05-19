# Deployment Checklist — V1

A practical checklist for releasing AegisCase backend. Each section is meant to be ticked off in order; a failed item is a release blocker, not a "TODO for later".

---

## Pre-Deployment

### Code & build
- [ ] `git status` clean on the release branch
- [ ] `npx tsc --noEmit -p tsconfig.json` passes
- [ ] `npx nest build <service>` succeeds for each app in `apps/`
- [ ] `npm run lint` is clean
- [ ] All migrations applied (or auto-sync disabled in non-dev envs)

### Configuration
- [ ] `.env` for the target environment populated (no commits of secrets)
- [ ] PostgreSQL connection string verified (host, schema-per-service)
- [ ] RabbitMQ URL + credentials verified
- [ ] Keycloak realm URL + client credentials verified
- [ ] AWS S3: bucket, region, IAM credentials, prefix layout verified
- [ ] JWT public key / JWKS URL reachable from each service

### Documentation
- [ ] Swagger UI loads at `/api/docs` for every service
- [ ] `docs/API_REFERENCE.md` reflects the deployed endpoints
- [ ] `docs/EVENTS.md`, `docs/AUDIT.md`, `docs/MEDIA.md` reflect deployed behavior

---

## Staging

- [ ] Deploy to staging via `docker-compose` (or target orchestrator)
- [ ] Smoke flow from `docs/TESTING_GUIDE.md` §5 passes end-to-end
- [ ] Permission spot-checks pass: 401 / 403 / 200 for at least one endpoint per role
- [ ] Audit events appear after each critical action (CaseCreated, EvidenceTransferred, TaskCompleted, MediaUploaded, …)
- [ ] Media upload writes the object to S3 and pre-signed download URLs work
- [ ] RabbitMQ management UI shows no messages in any DLQ
- [ ] Application logs are free of unhandled errors
- [ ] Health endpoints return `200` for every service

---

## Production

### Before cut-over
- [ ] Final review of staging smoke-flow output
- [ ] Database backup taken and verified
- [ ] Off-hours / low-traffic window scheduled (if applicable)
- [ ] Rollback plan documented (previous image tags noted)

### Cut-over
- [ ] Deploy containers with pinned image tags (no `:latest`)
- [ ] All services reach `Listening on …` in logs
- [ ] Health endpoints `200` from production network
- [ ] Smoke flow §5 of testing guide runs against production

### Monitoring
- [ ] Error-rate dashboard configured and within baseline
- [ ] CPU / memory baseline captured for each service
- [ ] RabbitMQ queue depth dashboard configured
- [ ] PostgreSQL connection-pool utilization within target

---

## Post-Deployment

- [ ] Critical user-facing flows verified (login, create case, upload media, query audit)
- [ ] Application logs reviewed for the first ~30 minutes — no new error spikes
- [ ] No 5xx errors in gateway logs
- [ ] `p95` latency for critical endpoints within target:
  - `POST /auth/login` < 500 ms
  - `POST /cases` < 1 000 ms
  - `GET  /cases` (paginated) < 2 000 ms
- [ ] Stakeholders notified of release completion
- [ ] Release tag pushed; changelog updated

---

## Rollback

If any post-deployment check fails:

1. Re-tag the previous image as current in the orchestrator.
2. Restart services in dependency order: postgres → rabbitmq → keycloak → core services → gateway.
3. Verify smoke flow passes against the rolled-back deployment.
4. File an incident note with: trigger, timeline, root cause hypothesis, follow-up.

Database rollbacks: never replay destructive migrations against production. If a migration is the trigger, restore from the pre-deployment backup.
