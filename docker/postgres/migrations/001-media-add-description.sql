-- Migration 001 — media.description (Feature 006)
-- Adds an optional free-text description to media rows.
--
-- In dev/test, TypeORM `synchronize: true` (DatabaseModule, NODE_ENV !== 'production')
-- creates this column automatically. In production (`synchronize: false`) run this
-- idempotent statement manually / via your migration runner before deploying the
-- updated media-service.

ALTER TABLE media_db.media
  ADD COLUMN IF NOT EXISTS description text NULL;
