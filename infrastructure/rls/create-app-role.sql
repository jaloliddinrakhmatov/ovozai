-- Phase 7 — enforced application role for PostgreSQL Row-Level Security.
--
-- Run ONCE per database cluster, as a superuser, BEFORE pointing the app at the
-- RLS-enforced connection (DATABASE_APP_URL). It is intentionally separate from
-- the Prisma migrations (packages/database/prisma/migrations/..._phase7_rls):
-- cluster-wide role/privilege management requires superuser and is an ops action,
-- not an app-deploy action. See docs/COMPLIANCE.md §1.
--
-- Why a separate role: `ovozai_app` is neither a superuser nor the owner of the
-- tables, so Row-Level Security is ENFORCED for it. The migration owner (`ovozai`)
-- continues to bypass RLS, which is why enabling RLS does not disturb the existing
-- app connection — the belt only tightens once the app connects as `ovozai_app`.
--
-- Usage:
--   psql "$SUPERUSER_DATABASE_URL" \
--     -v app_password="$(openssl rand -hex 24)" \
--     -f infrastructure/rls/create-app-role.sql
-- then set DATABASE_APP_URL for apps/api to:
--   postgresql://ovozai_app:<app_password>@<host>:5432/ovozai?schema=public

\set ON_ERROR_STOP on

-- Create (or keep) the enforced, least-privilege application role, then grant
-- LOGIN + a password supplied at runtime via -v app_password=... (never hard-coded
-- here). The CREATE is guarded in a DO block (idempotent); the password is set by a
-- top-level ALTER ROLE, because psql does not interpolate :variables inside a
-- dollar-quoted DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ovozai_app') THEN
    CREATE ROLE ovozai_app NOLOGIN;
  END IF;
END
$$;

ALTER ROLE ovozai_app LOGIN PASSWORD :'app_password';

-- Least-privilege DML on current and future tenant tables. No DDL, no superuser,
-- no BYPASSRLS — so the tenant_isolation policies always apply to this role.
GRANT USAGE ON SCHEMA public TO ovozai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ovozai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ovozai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ovozai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ovozai_app;
