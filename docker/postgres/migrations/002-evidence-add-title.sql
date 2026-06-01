-- Migration 002 — evidence.title (Feature 009)
-- Adds an optional short title/heading to evidence rows (distinct from the long description).
--
-- In dev/test, TypeORM `synchronize: true` (DatabaseModule, NODE_ENV !== 'production')
-- creates this column automatically. In production (`synchronize: false`) run this
-- idempotent statement manually / via your migration runner before deploying the
-- updated evidence-service. Nullable so pre-existing evidence (no title) is unaffected.

ALTER TABLE evidence_db.evidence
  ADD COLUMN IF NOT EXISTS title varchar(200) NULL;
