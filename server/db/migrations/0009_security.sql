-- 0009 security: row level security and least-privilege grants for ralo_app.
--
-- Layers:
--  1. The `app` schema is not exposed to anon/authenticated (0001). RLS is enabled on every table;
--     roles without a policy (anon, authenticated, any future role) see no rows at all.
--  2. ralo_app (NOSUPERUSER, NOBYPASSRLS, owns nothing) gets one permissive policy per table.
--  3. Tenant backstop: on tables that hold one club's operational or financial data a RESTRICTIVE
--     policy requires app.club_in_scope(club_id). The API runs club panel and coach requests with
--     `SET LOCAL app.scope = 'club:<uuid>'`, so a missing WHERE club_id = ... cannot leak another
--     club's rows; player, platform admin and job requests use `SET LOCAL app.scope = 'global'`.
--     Unset scope fails closed on these tables.
-- The migration owner owns the tables and is not subject to RLS. Future migrations that add tables
-- must enable RLS and add the ralo_app policy; server/db/schema.test.ts asserts both.
SET LOCAL search_path = app, public;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind IN ('r','p') AND c.relname <> 'schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS ralo_app_access ON app.%I', t.relname);
    EXECUTE format('CREATE POLICY ralo_app_access ON app.%I AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true)', t.relname);
  END LOOP;

  FOR t IN
    SELECT unnest(ARRAY['court_bookings','court_blocks','reservations','lessons','coach_student_notes',
                        'fee_ledger_entries','monthly_statements','audit_log']) AS relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON app.%I', t.relname);
    EXECUTE format('CREATE POLICY tenant_scope ON app.%I AS RESTRICTIVE FOR ALL TO ralo_app '
                   'USING (app.club_in_scope(club_id)) WITH CHECK (app.club_in_scope(club_id))', t.relname);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ralo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ralo_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ralo_app;

-- History that must not be rewritten by the application (triggers enforce this for owners too).
REVOKE UPDATE, DELETE ON app.audit_log, app.platform_fee_rates, app.billing_policies FROM ralo_app;
REVOKE DELETE ON app.fee_ledger_entries, app.monthly_statements, app.statement_lines,
                 app.venue_payments, app.consent_records, app.legal_documents, app.elo_events FROM ralo_app;
-- The migration bookkeeping table is not the application's business.
REVOKE ALL ON app.schema_migrations FROM ralo_app;
GRANT SELECT ON app.schema_migrations TO ralo_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ralo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO ralo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO ralo_app;
