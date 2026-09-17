-- Unexpected server errors and browser errors, grouped by fingerprint in the admin panel. No user id, email or
-- IP is stored; messages are scrubbed before insert and rows are purged after 30 days by a background job.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.error_events (
  id           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  source       text NOT NULL CHECK (source IN ('server','client')),
  fingerprint  text NOT NULL CHECK (char_length(fingerprint) = 64),
  message      text NOT NULL CHECK (char_length(message) <= 1000),
  stack        text CHECK (char_length(stack) <= 8000),
  path         text CHECK (char_length(path) <= 500),
  method       text CHECK (char_length(method) <= 10),
  user_agent   text CHECK (char_length(user_agent) <= 300),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_events_fingerprint_idx ON app.error_events (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS error_events_created_idx ON app.error_events (created_at);

ALTER TABLE app.error_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ralo_app_access ON app.error_events;
CREATE POLICY ralo_app_access ON app.error_events AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON app.error_events TO ralo_app;
