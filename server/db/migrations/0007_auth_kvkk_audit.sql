-- 0007 auth and infrastructure state shared by all instances, KVKK records, audit log.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.sessions (
  token_hash    bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),   -- sha256(token)
  user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  ip            inet,
  user_agent    text CHECK (char_length(user_agent) <= 400)
);
CREATE INDEX IF NOT EXISTS sessions_user_idx    ON app.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON app.sessions (expires_at);

CREATE TABLE IF NOT EXISTS app.otp_challenges (
  id             uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  phone          text NOT NULL CHECK (phone ~ '^905[0-9]{9}$'),
  purpose        text NOT NULL DEFAULT 'login' CHECK (purpose IN ('login','phone_change','account_delete')),
  code_hash      bytea NOT NULL CHECK (octet_length(code_hash) = 32),     -- HMAC-SHA256(OTP_PEPPER, phone:purpose:code)
  attempts       smallint NOT NULL DEFAULT 0,
  max_attempts   smallint NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  expires_at     timestamptz NOT NULL,
  consumed_at    timestamptz,
  superseded_at  timestamptz,
  request_ip     inet,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (attempts BETWEEN 0 AND max_attempts)
);
CREATE UNIQUE INDEX IF NOT EXISTS otp_challenges_live_uq
  ON app.otp_challenges (phone, purpose) WHERE consumed_at IS NULL AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS otp_challenges_phone_idx   ON app.otp_challenges (phone);
CREATE INDEX IF NOT EXISTS otp_challenges_expires_idx ON app.otp_challenges (expires_at);

-- UNLOGGED: no WAL, a crash only resets counters (acceptable for rate limiting).
CREATE UNLOGGED TABLE IF NOT EXISTS app.rate_limit_counters (
  bucket_key    text NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_idx ON app.rate_limit_counters (expires_at);

CREATE TABLE IF NOT EXISTS app.job_runs (
  job_name     text NOT NULL,
  run_key      text NOT NULL,
  status       text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  error        text,
  PRIMARY KEY (job_name, run_key)
);

-- ---------------------------------------------------------------------------
-- KVKK
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.legal_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type             text NOT NULL CHECK (doc_type IN ('kvkk_disclosure','explicit_consent','terms_of_use','privacy_policy',
                                                         'marketing_communication','club_service_agreement','coach_agreement')),
  version              text NOT NULL,
  title_tr             text NOT NULL,
  content_url          text NOT NULL,
  content_sha256       bytea NOT NULL CHECK (octet_length(content_sha256) = 32),
  requires_acceptance  boolean NOT NULL DEFAULT true,
  published_at         timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_type, version)
);

CREATE TABLE IF NOT EXISTS app.consent_records (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id             uuid REFERENCES app.users(id) ON DELETE SET NULL,
  subject_phone_hmac  bytea NOT NULL,                     -- proof of consent that survives anonymization
  document_id         uuid NOT NULL REFERENCES app.legal_documents(id) ON DELETE RESTRICT,
  action              text NOT NULL CHECK (action IN ('accepted','withdrawn')),
  channel             text NOT NULL CHECK (channel IN ('signup','in_app_prompt','profile_settings','club_panel','admin_panel')),
  club_id             uuid REFERENCES app.clubs(id) ON DELETE SET NULL,
  accepted_at         timestamptz NOT NULL DEFAULT now(),
  ip                  inet,
  user_agent          text CHECK (char_length(user_agent) <= 400)
);
CREATE INDEX IF NOT EXISTS consent_records_user_idx       ON app.consent_records (user_id, document_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS consent_records_phone_hmac_idx ON app.consent_records (subject_phone_hmac);

CREATE TABLE IF NOT EXISTS app.account_deletion_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  rejected_reason  text CHECK (rejected_reason IN ('active_club_owner','active_coach_contract','platform_admin','unpaid_statement','other')),
  completed_at     timestamptz,
  processed_by     uuid REFERENCES app.users(id) ON DELETE SET NULL,   -- NULL = self-service
  request_ip       inet,
  CHECK ((status = 'rejected') = (rejected_reason IS NOT NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_pending_uq
  ON app.account_deletion_requests (user_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.audit_log (
  id             uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  actor_user_id  uuid REFERENCES app.users(id) ON DELETE SET NULL,
  actor_scope    text NOT NULL CHECK (actor_scope IN ('platform_admin','club_staff','coach','player','system')),
  action         text NOT NULL,
  target_type    text NOT NULL,
  target_id      uuid,
  club_id        uuid REFERENCES app.clubs(id) ON DELETE SET NULL,
  before_data    jsonb,          -- never OTP codes or session tokens
  after_data     jsonb,
  reason         text,
  ip             inet,
  user_agent     text,
  request_id     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_target_idx  ON app.audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx   ON app.audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_club_idx    ON app.audit_log (club_id, created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_created_brin ON app.audit_log USING brin (created_at);

-- Append-only. The only permitted UPDATE is an FK ON DELETE SET NULL of actor/club (manual repair).
CREATE OR REPLACE FUNCTION app.audit_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.actor_scope, NEW.action, NEW.target_type, NEW.target_id, NEW.before_data, NEW.after_data,
      NEW.reason, NEW.ip, NEW.user_agent, NEW.request_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.actor_scope, OLD.action, OLD.target_type, OLD.target_id, OLD.before_data, OLD.after_data,
      OLD.reason, OLD.ip, OLD.user_agent, OLD.request_id, OLD.created_at)
     OR (NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id AND NEW.actor_user_id IS NOT NULL)
     OR (NEW.club_id IS DISTINCT FROM OLD.club_id AND NEW.club_id IS NOT NULL) THEN
    RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_audit_log_guard BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_log_guard();
