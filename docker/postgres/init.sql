-- AegisCase PostgreSQL Schema Initialization
-- Creates separate schemas for each microservice domain

CREATE SCHEMA IF NOT EXISTS user_db;
CREATE SCHEMA IF NOT EXISTS case_db;
CREATE SCHEMA IF NOT EXISTS involved_db;
CREATE SCHEMA IF NOT EXISTS evidence_db;
CREATE SCHEMA IF NOT EXISTS task_db;
CREATE SCHEMA IF NOT EXISTS media_db;
CREATE SCHEMA IF NOT EXISTS audit_db;

-- Grant all privileges on schemas to the main user
GRANT ALL ON SCHEMA user_db     TO CURRENT_USER;
GRANT ALL ON SCHEMA case_db     TO CURRENT_USER;
GRANT ALL ON SCHEMA involved_db TO CURRENT_USER;
GRANT ALL ON SCHEMA evidence_db TO CURRENT_USER;
GRANT ALL ON SCHEMA task_db     TO CURRENT_USER;
GRANT ALL ON SCHEMA media_db    TO CURRENT_USER;
GRANT ALL ON SCHEMA audit_db    TO CURRENT_USER;
