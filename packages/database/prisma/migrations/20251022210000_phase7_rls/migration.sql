-- Phase 7 — PostgreSQL Row-Level Security (defense-in-depth tenant isolation).
--
-- This is the belt behind the application-layer tenant guard (the Prisma client
-- extension in apps/api/src/tenancy). Even if that guard is bypassed, the database
-- refuses to return or write another tenant's rows once the app connects as the
-- non-superuser `ovozai_app` role.
--
-- This migration enables RLS and the per-table policy. The enforced role
-- `ovozai_app` and its GRANTs are created out of band by a superuser (cluster-wide
-- privilege management is not part of an app migration, and managed-Postgres deploy
-- roles typically cannot CREATE ROLE): see infrastructure/rls/create-app-role.sql
-- and docs/COMPLIANCE.md §1.
--
-- Mechanics:
--   * The policy is keyed on the transaction-local GUC `app.current_org`, set per
--     request/transaction via `SELECT set_config('app.current_org', '<orgId>', true)`
--     (see PrismaService.runWithOrgScope).
--   * `organization_id` is TEXT; `current_setting('app.current_org', true)` returns
--     NULL when the GUC is unset, so a missing tenant context yields zero rows and
--     blocks inserts (fail-closed).
--   * The migration owner (`ovozai`) keeps bypassing RLS, so the existing app
--     connection is unaffected until a deployment switches it to `ovozai_app`.
--   * Global tables (organizations, users, memberships, sessions, audit_logs,
--     plans) are intentionally NOT under RLS: they are used before/across a tenant
--     context (auth bootstrap) and are governed by the application-layer guard.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'api_keys','invitations','agents','agent_versions','knowledge_bases',
    'knowledge_documents','knowledge_chunks','customers','appointments','calls',
    'call_events','transcripts','transcript_turns','usage_records','phone_numbers',
    'webhook_endpoints','webhook_deliveries','wer_measurements','subscriptions',
    'integrations','notifications','usage_rollups'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL '
      || 'USING (organization_id = current_setting(''app.current_org'', true)) '
      || 'WITH CHECK (organization_id = current_setting(''app.current_org'', true));',
      t
    );
  END LOOP;
END
$$;
