-- 0005 platform billing: fee rates, billing policies, fee ledger, monthly statements.
SET LOCAL search_path = app, public;

-- Append-only rate history (effective_from versions, never updated or deleted).
--   app_reservation: ONE flat platform-wide rate (club_id NULL). Launch value 10000 kurus (100 TL).
--   lesson:          a per-club setting (club_id NOT NULL) with its own history; a club without a
--                    lesson rate cannot create lessons. The billing basis travels with the rate.
-- No seed rows: the launch runbook inserts ('app_reservation', NULL, 10000) once the first
-- platform admin exists (created_by is required).
CREATE TABLE IF NOT EXISTS app.platform_fee_rates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_type          text NOT NULL CHECK (fee_type IN ('app_reservation','lesson')),
  club_id           uuid REFERENCES app.clubs(id) ON DELETE RESTRICT,
  amount_kurus      integer NOT NULL CHECK (amount_kurus >= 0),
  lesson_fee_basis  text CHECK (lesson_fee_basis IN ('per_session','per_lesson','per_enrolled_student_session')),
  effective_from    timestamptz NOT NULL,
  reason            text,
  created_by        uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (fee_type, club_id, effective_from),
  CONSTRAINT platform_fee_rates_scope_chk CHECK (
       (fee_type = 'app_reservation' AND club_id IS NULL     AND lesson_fee_basis IS NULL)
    OR (fee_type = 'lesson'          AND club_id IS NOT NULL AND lesson_fee_basis IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS platform_fee_rates_lookup_idx
  ON app.platform_fee_rates (fee_type, club_id, effective_from DESC);
CREATE OR REPLACE TRIGGER trg_platform_fee_rates_immutable BEFORE UPDATE OR DELETE ON app.platform_fee_rates
  FOR EACH ROW EXECUTE FUNCTION app.reject_update_delete();
CREATE OR REPLACE TRIGGER trg_platform_fee_rates_no_backdate BEFORE INSERT ON app.platform_fee_rates
  FOR EACH ROW EXECUTE FUNCTION app.reject_backdated_effective_from();

-- Versioned, append-only answers to the still-open billing questions (never hardcoded in code).
-- There is deliberately no "charge on cancellation" setting: a cancelled reservation NEVER incurs the
-- platform fee, whoever cancels (enforced by the cancellation trigger in 0008).
CREATE TABLE IF NOT EXISTS app.billing_policies (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                             uuid REFERENCES app.clubs(id) ON DELETE RESTRICT,
  effective_from                      timestamptz NOT NULL,
  charge_no_show                      boolean NOT NULL DEFAULT true,
  statement_due_days                  smallint NOT NULL DEFAULT 15 CHECK (statement_due_days BETWEEN 1 AND 90),
  vat_rate_bps                        integer NOT NULL DEFAULT 2000 CHECK (vat_rate_bps BETWEEN 0 AND 10000),
  amounts_include_vat                 boolean NOT NULL,                 -- no default: must be decided
  created_by                          uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (club_id, effective_from)
);
-- lessons.fee_rate_id (0004) points at the club's lesson rate snapshot.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_fee_rate_fk') THEN
    ALTER TABLE app.lessons ADD CONSTRAINT lessons_fee_rate_fk
      FOREIGN KEY (fee_rate_id) REFERENCES app.platform_fee_rates(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE TRIGGER trg_billing_policies_immutable BEFORE UPDATE OR DELETE ON app.billing_policies
  FOR EACH ROW EXECUTE FUNCTION app.reject_update_delete();
CREATE OR REPLACE TRIGGER trg_billing_policies_no_backdate BEFORE INSERT ON app.billing_policies
  FOR EACH ROW EXECUTE FUNCTION app.reject_backdated_effective_from();

CREATE TABLE IF NOT EXISTS app.monthly_statements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_no           text NOT NULL UNIQUE,                   -- 'RALO-202609-000123'
  club_id                uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  period_start           date NOT NULL CHECK (extract(day FROM period_start) = 1),
  period_end             date NOT NULL,                          -- exclusive
  reservation_fee_count  integer NOT NULL DEFAULT 0 CHECK (reservation_fee_count >= 0),
  reservation_fee_kurus  integer NOT NULL DEFAULT 0,
  lesson_fee_count       integer NOT NULL DEFAULT 0 CHECK (lesson_fee_count >= 0),
  lesson_fee_kurus       integer NOT NULL DEFAULT 0,
  adjustments_kurus      integer NOT NULL DEFAULT 0 CHECK (adjustments_kurus <= 0),
  subtotal_kurus         integer NOT NULL,
  vat_rate_bps           integer NOT NULL CHECK (vat_rate_bps BETWEEN 0 AND 10000),
  vat_kurus              integer NOT NULL,
  total_kurus            integer NOT NULL,
  status                 text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','overdue','cancelled')),
  issued_at              timestamptz NOT NULL DEFAULT now(),
  due_date               date NOT NULL,
  paid_at                timestamptz,
  paid_amount_kurus      integer,
  payment_reference      text,
  marked_paid_by         uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  cancelled_reason       text,
  invoice_reference      text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end = (period_start + interval '1 month')::date),
  CHECK (subtotal_kurus = reservation_fee_kurus + lesson_fee_kurus + adjustments_kurus),
  CHECK (total_kurus = subtotal_kurus + vat_kurus),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL AND marked_paid_by IS NOT NULL)),
  CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS monthly_statements_club_period_uq
  ON app.monthly_statements (club_id, period_start) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS monthly_statements_status_due_idx ON app.monthly_statements (status, due_date);
CREATE OR REPLACE TRIGGER trg_monthly_statements_updated BEFORE UPDATE ON app.monthly_statements
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.fee_ledger_entries (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  idempotency_key       text NOT NULL UNIQUE,
  club_id               uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  fee_type              text NOT NULL CHECK (fee_type IN ('app_reservation','lesson')),
  entry_type            text NOT NULL CHECK (entry_type IN ('charge','reversal')),
  reservation_id        uuid REFERENCES app.reservations(id) ON DELETE RESTRICT,
  lesson_session_id     uuid REFERENCES app.lesson_sessions(id) ON DELETE RESTRICT,
  lesson_enrollment_id  uuid REFERENCES app.lesson_enrollments(id) ON DELETE RESTRICT,
  reverses_entry_id     uuid REFERENCES app.fee_ledger_entries(id) ON DELETE RESTRICT,
  rate_id               uuid REFERENCES app.platform_fee_rates(id) ON DELETE RESTRICT,
  policy_id             uuid REFERENCES app.billing_policies(id) ON DELETE RESTRICT,
  amount_kurus          integer NOT NULL,                       -- snapshot
  service_date          date NOT NULL,                          -- Istanbul local date of play
  billing_period        date NOT NULL CHECK (extract(day FROM billing_period) = 1),
  status                text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','voided','billed')),
  void_reason           text CHECK (void_reason IN (
                          'player_cancelled','club_cancelled','coach_cancelled','admin_cancelled','system_cancelled',
                          'account_deleted','lesson_session_cancelled','no_show_waived','duplicate','admin_waiver')),
  voided_at             timestamptz,
  voided_by             uuid REFERENCES app.users(id) ON DELETE SET NULL,
  statement_id          uuid REFERENCES app.monthly_statements(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(reservation_id, lesson_session_id) = 1),
  CHECK ((fee_type = 'app_reservation') = (reservation_id IS NOT NULL)),
  CHECK (lesson_enrollment_id IS NULL OR lesson_session_id IS NOT NULL),
  CHECK ((entry_type = 'charge'   AND amount_kurus >= 0 AND reverses_entry_id IS NULL)
      OR (entry_type = 'reversal' AND amount_kurus <= 0 AND reverses_entry_id IS NOT NULL)),
  CHECK ((status = 'voided') = (voided_at IS NOT NULL)),
  CHECK (entry_type = 'charge' OR status <> 'voided'),                 -- reversals are never voided
  -- charges carry void_reason exactly when voided; reversals always carry the reason they were issued
  CHECK (CASE entry_type WHEN 'charge' THEN (status = 'voided') = (void_reason IS NOT NULL)
                         ELSE void_reason IS NOT NULL END),
  CHECK ((status = 'billed') = (statement_id IS NOT NULL)),
  CHECK (entry_type <> 'charge' OR rate_id IS NOT NULL),
  -- billing period is the service month (charges) or the month the reversal was issued (reversals)
  CHECK (billing_period = date_trunc('month', service_date)::date)
);
CREATE UNIQUE INDEX IF NOT EXISTS fee_ledger_one_charge_per_reservation
  ON app.fee_ledger_entries (reservation_id) WHERE entry_type = 'charge';
CREATE UNIQUE INDEX IF NOT EXISTS fee_ledger_one_charge_per_session
  ON app.fee_ledger_entries (lesson_session_id, lesson_enrollment_id) NULLS NOT DISTINCT
  WHERE entry_type = 'charge' AND lesson_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fee_ledger_one_reversal
  ON app.fee_ledger_entries (reverses_entry_id) WHERE entry_type = 'reversal';
CREATE INDEX IF NOT EXISTS fee_ledger_club_period_idx
  ON app.fee_ledger_entries (club_id, billing_period, status);
CREATE INDEX IF NOT EXISTS fee_ledger_statement_idx
  ON app.fee_ledger_entries (statement_id) WHERE statement_id IS NOT NULL;

-- The ledger is the revenue audit trail: rows are never deleted, and only the state-transition
-- columns may change. Service date / billing period may move only while the entry is still accrued
-- (reschedule before billing). Allowed transitions: accrued -> voided | billed, billed -> accrued
-- (cancelled statement). voided is terminal.
CREATE OR REPLACE FUNCTION app.fee_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fee ledger entries cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;

  IF (NEW.id, NEW.idempotency_key, NEW.club_id, NEW.fee_type, NEW.entry_type, NEW.reservation_id,
      NEW.lesson_session_id, NEW.lesson_enrollment_id, NEW.reverses_entry_id, NEW.rate_id,
      NEW.amount_kurus, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.idempotency_key, OLD.club_id, OLD.fee_type, OLD.entry_type, OLD.reservation_id,
      OLD.lesson_session_id, OLD.lesson_enrollment_id, OLD.reverses_entry_id, OLD.rate_id,
      OLD.amount_kurus, OLD.created_at) THEN
    RAISE EXCEPTION 'fee ledger entry % is immutable except for its status columns', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status <> 'accrued'
     AND (NEW.service_date, NEW.billing_period) IS DISTINCT FROM (OLD.service_date, OLD.billing_period) THEN
    RAISE EXCEPTION 'fee ledger entry % is % and its service period cannot change', OLD.id, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'accrued' AND NEW.status IN ('voided','billed'))
    OR (OLD.status = 'billed'  AND NEW.status = 'accrued')
  ) THEN
    RAISE EXCEPTION 'fee ledger entry % cannot move from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- A voided entry is frozen, except for ON DELETE SET NULL of the actor reference.
  IF OLD.status = 'voided'
     AND ((NEW.void_reason, NEW.voided_at, NEW.policy_id, NEW.statement_id)
          IS DISTINCT FROM (OLD.void_reason, OLD.voided_at, OLD.policy_id, OLD.statement_id)
          OR (NEW.voided_by IS DISTINCT FROM OLD.voided_by AND NEW.voided_by IS NOT NULL)) THEN
    RAISE EXCEPTION 'voided fee ledger entry % cannot change', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_fee_ledger_guard BEFORE UPDATE OR DELETE ON app.fee_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.fee_ledger_guard();

CREATE TABLE IF NOT EXISTS app.statement_lines (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  statement_id     uuid NOT NULL REFERENCES app.monthly_statements(id) ON DELETE CASCADE,
  ledger_entry_id  uuid NOT NULL REFERENCES app.fee_ledger_entries(id) ON DELETE RESTRICT,
  line_type        text NOT NULL CHECK (line_type IN ('app_reservation','lesson','adjustment')),
  description      text NOT NULL,
  service_date     date NOT NULL,
  amount_kurus     integer NOT NULL,
  UNIQUE (statement_id, ledger_entry_id)
);
CREATE INDEX IF NOT EXISTS statement_lines_statement_idx ON app.statement_lines (statement_id, service_date);
CREATE INDEX IF NOT EXISTS statement_lines_entry_idx     ON app.statement_lines (ledger_entry_id);
