-- Web push: browser subscriptions per user and a push outbox marker on notifications. A background loop sends
-- every new notification to the user's devices (once) and creates 2-hour match reminders server-side.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.push_subscriptions (
  id             uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id        uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  endpoint       text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh         text NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth           text NOT NULL CHECK (char_length(auth) BETWEEN 8 AND 100),
  user_agent     text CHECK (char_length(user_agent) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  failure_count  smallint NOT NULL DEFAULT 0 CHECK (failure_count >= 0)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON app.push_subscriptions (user_id);

-- Existing notifications are never pushed
ALTER TABLE app.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
UPDATE app.notifications SET pushed_at = created_at WHERE pushed_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_push_pending_idx ON app.notifications (created_at) WHERE pushed_at IS NULL;

-- Device subscriptions are personal data: removed when anonymize_user marks the account deleted
CREATE OR REPLACE FUNCTION app.remove_push_subscriptions_of_deleted_user() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  DELETE FROM push_subscriptions WHERE user_id = NEW.id;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_users_deleted_push_subscriptions AFTER UPDATE OF status ON app.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted')
  EXECUTE FUNCTION app.remove_push_subscriptions_of_deleted_user();

ALTER TABLE app.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ralo_app_access ON app.push_subscriptions;
CREATE POLICY ralo_app_access ON app.push_subscriptions AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.push_subscriptions TO ralo_app;
