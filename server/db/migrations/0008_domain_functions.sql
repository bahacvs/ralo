-- 0008 domain functions: config resolution, fee ledger rules, waitlist promotion, KVKK anonymization.
-- All functions pin search_path so they behave the same for every caller role. They run as the
-- caller (SECURITY INVOKER), so the RLS scope of the calling transaction applies.
SET LOCAL search_path = app, public;

-- ---------------------------------------------------------------------------
-- Configuration resolution
-- ---------------------------------------------------------------------------

-- app_reservation rates only exist platform-wide and lesson rates only per club (CHECK in 0005),
-- so the same lookup serves both: the club row wins when there is one.
CREATE OR REPLACE FUNCTION app.resolve_fee_rate(p_fee_type text, p_club uuid, p_at timestamptz)
RETURNS app.platform_fee_rates LANGUAGE sql STABLE SET search_path = app, public AS $$
  SELECT * FROM platform_fee_rates
  WHERE fee_type = p_fee_type AND (club_id = p_club OR club_id IS NULL) AND effective_from <= p_at
  ORDER BY (club_id IS NULL), effective_from DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_billing_policy(p_club uuid, p_at timestamptz)
RETURNS app.billing_policies LANGUAGE sql STABLE SET search_path = app, public AS $$
  SELECT * FROM billing_policies
  WHERE (club_id = p_club OR club_id IS NULL) AND effective_from <= p_at
  ORDER BY (club_id IS NULL), effective_from DESC
  LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- Lessons: snapshot the club's lesson fee terms at creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.lesson_fee_snapshot() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
DECLARE
  v_rate platform_fee_rates%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_rate := resolve_fee_rate('lesson', NEW.club_id, now());
    IF v_rate.id IS NULL THEN
      RAISE EXCEPTION 'no lesson fee rate configured for club %', NEW.club_id
        USING ERRCODE = 'no_data_found', HINT = 'A platform admin must set the club lesson fee first.';
    END IF;
    NEW.fee_rate_id := v_rate.id;
    NEW.fee_basis   := v_rate.lesson_fee_basis;
  ELSIF (NEW.fee_rate_id, NEW.fee_basis) IS DISTINCT FROM (OLD.fee_rate_id, OLD.fee_basis) THEN
    RAISE EXCEPTION 'lesson % fee terms are a snapshot and cannot change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_lessons_fee_snapshot BEFORE INSERT OR UPDATE ON app.lessons
  FOR EACH ROW EXECUTE FUNCTION app.lesson_fee_snapshot();

-- ---------------------------------------------------------------------------
-- Fee ledger: validation of every entry against the business row it bills
-- ---------------------------------------------------------------------------

-- Cross-table rules a CHECK cannot express:
--  * a charge never targets a cancelled reservation (a cancelled reservation never incurs the fee)
--  * app_reservation charges only for source='app'; lesson charges only for lesson sessions
--  * club matches the billed row; service_date equals the Istanbul local date of play
--  * a reversal mirrors the charge it reverses
CREATE OR REPLACE FUNCTION app.fee_ledger_validate() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
DECLARE
  v_res     reservations%ROWTYPE;
  v_lesson  lessons%ROWTYPE;
  v_charge  fee_ledger_entries%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.service_date IS NOT DISTINCT FROM OLD.service_date THEN
    RETURN NEW;
  END IF;

  IF NEW.entry_type = 'reversal' THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'reversal % service date cannot change', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_charge FROM fee_ledger_entries WHERE id = NEW.reverses_entry_id;
    IF NOT FOUND OR v_charge.entry_type <> 'charge'
       OR (v_charge.club_id, v_charge.fee_type, v_charge.reservation_id, v_charge.lesson_session_id, v_charge.lesson_enrollment_id)
          IS DISTINCT FROM (NEW.club_id, NEW.fee_type, NEW.reservation_id, NEW.lesson_session_id, NEW.lesson_enrollment_id)
       OR NEW.amount_kurus <> -v_charge.amount_kurus THEN
      RAISE EXCEPTION 'reversal must mirror the charge it reverses' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.fee_type = 'app_reservation' THEN
    SELECT * INTO v_res FROM reservations WHERE id = NEW.reservation_id;
    IF NOT FOUND OR v_res.source <> 'app' THEN
      RAISE EXCEPTION 'app_reservation fee requires an app reservation' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT rv.* INTO v_res FROM lesson_sessions s JOIN reservations rv ON rv.id = s.reservation_id
    WHERE s.id = NEW.lesson_session_id;
    SELECT l.* INTO v_lesson FROM lesson_sessions s JOIN lessons l ON l.id = s.lesson_id
    WHERE s.id = NEW.lesson_session_id;
    IF NEW.lesson_enrollment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM lesson_enrollments WHERE id = NEW.lesson_enrollment_id AND lesson_id = v_lesson.id
    ) THEN
      RAISE EXCEPTION 'lesson fee enrollment does not belong to the session lesson' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND v_res.status = 'cancelled' THEN
    RAISE EXCEPTION 'reservation % is cancelled; a cancelled reservation never incurs a platform fee', v_res.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.club_id <> v_res.club_id THEN
    RAISE EXCEPTION 'fee ledger club must match the reservation club' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_date <> v_res.local_date THEN
    RAISE EXCEPTION 'fee ledger service_date % must equal the Istanbul play date %', NEW.service_date, v_res.local_date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_fee_ledger_validate BEFORE INSERT OR UPDATE ON app.fee_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.fee_ledger_validate();

-- ---------------------------------------------------------------------------
-- Fee ledger: writes
-- ---------------------------------------------------------------------------

-- Writes the platform fee charge for an app reservation (call in the transaction that inserted it).
-- Idempotent: returns the existing charge id on retry. Raises when no app_reservation rate is in effect.
CREATE OR REPLACE FUNCTION app.charge_app_reservation(p_reservation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_res   reservations%ROWTYPE;
  v_rate  platform_fee_rates%ROWTYPE;
  v_id    uuid;
BEGIN
  SELECT * INTO v_res FROM reservations WHERE id = p_reservation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation % not found', p_reservation USING ERRCODE = 'no_data_found';
  END IF;
  IF v_res.source <> 'app' THEN
    RETURN NULL;                                          -- panel reservations are free; lessons bill per session
  END IF;

  v_rate := resolve_fee_rate('app_reservation', v_res.club_id, v_res.created_at);
  IF v_rate.id IS NULL THEN
    RAISE EXCEPTION 'no app_reservation fee rate in effect at %', v_res.created_at USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, reservation_id, rate_id,
                                  amount_kurus, service_date, billing_period)
  VALUES ('res:' || v_res.id || ':charge', v_res.club_id, 'app_reservation', 'charge', v_res.id, v_rate.id,
          v_rate.amount_kurus, v_res.local_date, date_trunc('month', v_res.local_date)::date)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM fee_ledger_entries WHERE idempotency_key = 'res:' || v_res.id || ':charge';
  END IF;
  RETURN v_id;
END $$;

-- Writes the lesson fee for one session under the lesson's snapshotted rate and basis.
--   per_session                   one charge per session              key ls:<session>:charge
--   per_lesson                    one charge, on session_no = 1       key lesson:<lesson>:charge
--   per_enrolled_student_session  one charge per enrolled student     key ls:<session>:enr:<enrollment>:charge
--                                 (run when the session starts)
-- Idempotent. Returns the number of new entries.
CREATE OR REPLACE FUNCTION app.charge_lesson_session(p_session uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_session  lesson_sessions%ROWTYPE;
  v_lesson   lessons%ROWTYPE;
  v_res      reservations%ROWTYPE;
  v_rate     platform_fee_rates%ROWTYPE;
  v_count    integer := 0;
  v_n        integer;
  r          record;
BEGIN
  SELECT * INTO v_session FROM lesson_sessions WHERE id = p_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson session % not found', p_session USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_lesson FROM lessons WHERE id = v_session.lesson_id;
  SELECT * INTO v_res FROM reservations WHERE id = v_session.reservation_id;
  SELECT * INTO v_rate FROM platform_fee_rates WHERE id = v_lesson.fee_rate_id;
  IF v_res.status = 'cancelled' THEN
    RETURN 0;
  END IF;

  IF v_lesson.fee_basis = 'per_session' OR (v_lesson.fee_basis = 'per_lesson' AND v_session.session_no = 1) THEN
    INSERT INTO fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, lesson_session_id, rate_id,
                                    amount_kurus, service_date, billing_period)
    VALUES (CASE v_lesson.fee_basis WHEN 'per_lesson' THEN 'lesson:' || v_lesson.id || ':charge'
                                    ELSE 'ls:' || v_session.id || ':charge' END,
            v_lesson.club_id, 'lesson', 'charge', v_session.id, v_rate.id,
            v_rate.amount_kurus, v_res.local_date, date_trunc('month', v_res.local_date)::date)
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF v_lesson.fee_basis = 'per_enrolled_student_session' THEN
    FOR r IN SELECT id FROM lesson_enrollments WHERE lesson_id = v_lesson.id AND status = 'enrolled' ORDER BY id LOOP
      INSERT INTO fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, lesson_session_id,
                                      lesson_enrollment_id, rate_id, amount_kurus, service_date, billing_period)
      VALUES ('ls:' || v_session.id || ':enr:' || r.id || ':charge', v_lesson.club_id, 'lesson', 'charge',
              v_session.id, r.id, v_rate.id, v_rate.amount_kurus, v_res.local_date,
              date_trunc('month', v_res.local_date)::date)
      ON CONFLICT (idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_count := v_count + v_n;
    END LOOP;
  END IF;
  RETURN v_count;
END $$;

-- Removes the platform fee of a reservation (app charge, or every lesson charge of the session that
-- uses it). Accrued charges are voided; charges already on a statement get a reversal in the current
-- Istanbul month. Race-safe (guarded UPDATE + idempotent INSERT). Returns {"voided": n, "reversed": n}.
CREATE OR REPLACE FUNCTION app.void_reservation_fees(p_reservation uuid, p_reason text, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_today     date := istanbul_date(now());
  v_voided    integer;
  v_reversed  integer;
BEGIN
  WITH targets AS (
    SELECT e.id FROM fee_ledger_entries e
    WHERE e.entry_type = 'charge' AND e.status = 'accrued'
      AND (e.reservation_id = p_reservation
           OR e.lesson_session_id IN (SELECT id FROM lesson_sessions WHERE reservation_id = p_reservation))
  )
  UPDATE fee_ledger_entries e
  SET status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = p_actor
  FROM targets WHERE e.id = targets.id;
  GET DIAGNOSTICS v_voided = ROW_COUNT;

  INSERT INTO fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, reservation_id, lesson_session_id,
                                  lesson_enrollment_id, reverses_entry_id, rate_id, amount_kurus, service_date,
                                  billing_period, void_reason)
  SELECT 'rev:' || c.id, c.club_id, c.fee_type, 'reversal', c.reservation_id, c.lesson_session_id,
         c.lesson_enrollment_id, c.id, c.rate_id, -c.amount_kurus, v_today, date_trunc('month', v_today)::date, p_reason
  FROM fee_ledger_entries c
  WHERE c.entry_type = 'charge' AND c.status = 'billed'
    AND (c.reservation_id = p_reservation
         OR c.lesson_session_id IN (SELECT id FROM lesson_sessions WHERE reservation_id = p_reservation))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_reversed = ROW_COUNT;

  RETURN jsonb_build_object('voided', v_voided, 'reversed', v_reversed);
END $$;

-- Product rule: a cancelled reservation NEVER incurs the platform fee, no matter who cancels.
-- Enforced here rather than in application code, in the same statement that cancels.
CREATE OR REPLACE FUNCTION app.reservation_cancel_fees() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    PERFORM void_reservation_fees(
      NEW.id,
      CASE
        WHEN NEW.source = 'lesson'              THEN 'lesson_session_cancelled'
        WHEN NEW.cancelled_by_party = 'player'  THEN 'player_cancelled'
        WHEN NEW.cancelled_by_party = 'club'    THEN 'club_cancelled'
        WHEN NEW.cancelled_by_party = 'coach'   THEN 'coach_cancelled'
        WHEN NEW.cancelled_by_party = 'admin'   THEN 'admin_cancelled'
        ELSE 'system_cancelled'
      END,
      NEW.cancelled_by_user_id);
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_reservation_cancel_fees AFTER UPDATE OF status ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.reservation_cancel_fees();

-- A no-show keeps the charge unless the billing policy in effect says otherwise.
-- Returns 'kept', or the void_reservation_fees summary as text.
CREATE OR REPLACE FUNCTION app.settle_no_show_fee(p_reservation uuid, p_actor uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_res     reservations%ROWTYPE;
  v_policy  billing_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM reservations WHERE id = p_reservation;
  IF NOT FOUND OR v_res.status <> 'no_show' THEN
    RAISE EXCEPTION 'reservation % is not a no-show', p_reservation USING ERRCODE = 'check_violation';
  END IF;
  v_policy := resolve_billing_policy(v_res.club_id, now());
  IF v_policy.id IS NULL THEN
    RAISE EXCEPTION 'no billing policy in effect for club %', v_res.club_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_policy.charge_no_show THEN
    RETURN 'kept';
  END IF;
  UPDATE fee_ledger_entries SET policy_id = v_policy.id
  WHERE reservation_id = p_reservation AND entry_type = 'charge' AND status = 'accrued';
  RETURN void_reservation_fees(p_reservation, 'no_show_waived', p_actor)::text;
END $$;

-- Reschedule before billing moves the service month with the booking (billed entries stay put).
CREATE OR REPLACE FUNCTION app.reservation_reschedule_fees() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  IF NEW.local_date IS DISTINCT FROM OLD.local_date THEN
    UPDATE fee_ledger_entries e
    SET service_date = NEW.local_date, billing_period = date_trunc('month', NEW.local_date)::date
    WHERE e.entry_type = 'charge' AND e.status = 'accrued'
      AND (e.reservation_id = NEW.id
           OR e.lesson_session_id IN (SELECT id FROM lesson_sessions WHERE reservation_id = NEW.id));
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_reservation_reschedule_fees AFTER UPDATE OF starts_at ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.reservation_reschedule_fees();

-- Every live app reservation must have its platform fee charge by COMMIT. Turns a forgotten
-- charge_app_reservation() call into a hard failure instead of silently lost revenue.
-- Imported legacy rows (legacy_id set) are exempt: fees start at launch, no backfill.
CREATE OR REPLACE FUNCTION app.assert_app_reservation_charged() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
DECLARE
  v_res reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM reservations WHERE id = NEW.id;
  IF FOUND AND v_res.source = 'app' AND v_res.status <> 'cancelled' AND v_res.legacy_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM fee_ledger_entries
                     WHERE reservation_id = v_res.id AND entry_type = 'charge') THEN
    RAISE EXCEPTION 'app reservation % has no platform fee charge (call app.charge_app_reservation)', v_res.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_reservation_requires_fee ON app.reservations;
CREATE CONSTRAINT TRIGGER trg_reservation_requires_fee AFTER INSERT ON app.reservations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.assert_app_reservation_charged();

-- ---------------------------------------------------------------------------
-- Capacity: waitlist promotion (call inside the transaction that freed a place)
-- ---------------------------------------------------------------------------

-- Promotes the lowest waitlist position into the lowest free slot. Returns the promoted user or NULL.
CREATE OR REPLACE FUNCTION app.promote_reservation_waitlist(p_reservation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_res   reservations%ROWTYPE;
  v_wait  reservation_waitlist%ROWTYPE;
  v_slot  smallint;
BEGIN
  SELECT * INTO v_res FROM reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND OR v_res.status NOT IN ('pending','confirmed')
     OR v_res.active_participant_count >= v_res.participant_limit THEN
    RETURN NULL;
  END IF;

  SELECT w.* INTO v_wait FROM reservation_waitlist w
  WHERE w.reservation_id = p_reservation
    AND NOT EXISTS (SELECT 1 FROM reservation_participants p
                    WHERE p.reservation_id = p_reservation AND p.user_id = w.user_id)
  ORDER BY w.position
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT min(s)::smallint INTO v_slot
  FROM generate_series(0, v_res.participant_limit - 1) AS s
  WHERE NOT EXISTS (SELECT 1 FROM reservation_participants p
                    WHERE p.reservation_id = p_reservation AND p.status = 'active' AND p.slot_index = s);

  DELETE FROM reservation_waitlist WHERE id = v_wait.id;
  UPDATE reservations SET active_participant_count = active_participant_count + 1 WHERE id = p_reservation;
  INSERT INTO reservation_participants (reservation_id, user_id, status, slot_index, approved_at)
  VALUES (p_reservation, v_wait.user_id, 'active', v_slot, now());
  RETURN v_wait.user_id;
END $$;

CREATE OR REPLACE FUNCTION app.promote_lesson_waitlist(p_lesson uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_lesson  lessons%ROWTYPE;
  v_enr     lesson_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson FOR UPDATE;
  IF NOT FOUND OR v_lesson.status NOT IN ('draft','published') OR v_lesson.enrolled_count >= v_lesson.capacity THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_enr FROM lesson_enrollments
  WHERE lesson_id = p_lesson AND status = 'waitlisted'
  ORDER BY waitlist_position
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE lessons SET enrolled_count = enrolled_count + 1 WHERE id = p_lesson;
  UPDATE lesson_enrollments
  SET status = 'enrolled', waitlist_position = NULL, enrolled_at = now()
  WHERE id = v_enr.id;
  RETURN v_enr.user_id;
END $$;

-- Cancels one enrollment (student cancel, coach removal, account deletion) keeping the counter and
-- waitlist consistent. Returns the user promoted into the freed place, if any.
CREATE OR REPLACE FUNCTION app.cancel_lesson_enrollment(p_enrollment uuid, p_new_status text DEFAULT 'cancelled')
RETURNS uuid LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_enr  lesson_enrollments%ROWTYPE;
BEGIN
  IF p_new_status NOT IN ('cancelled','removed') THEN
    RAISE EXCEPTION 'invalid enrollment status %', p_new_status USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.* INTO v_enr FROM lesson_enrollments e WHERE e.id = p_enrollment;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM lessons WHERE id = v_enr.lesson_id FOR UPDATE;          -- serialize with enroll/promote
  SELECT e.* INTO v_enr FROM lesson_enrollments e WHERE e.id = p_enrollment FOR UPDATE;
  IF v_enr.status NOT IN ('enrolled','waitlisted') THEN
    RETURN NULL;
  END IF;

  UPDATE lesson_enrollments
  SET status = p_new_status, waitlist_position = NULL, cancelled_at = now()
  WHERE id = p_enrollment;

  IF v_enr.status = 'enrolled' THEN
    UPDATE lessons SET enrolled_count = enrolled_count - 1 WHERE id = v_enr.lesson_id;
    RETURN promote_lesson_waitlist(v_enr.lesson_id);
  END IF;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- KVKK account deletion: anonymize, never hard-delete
-- ---------------------------------------------------------------------------

-- Runs in the caller's transaction (which must use app.scope = 'global'). Raises
-- 'anonymize_refused:<reason>' (SQLSTATE P0001) when the account cannot be deleted yet. Returns a
-- PII-free summary the API uses to notify affected users.
-- Every table with a users(id) reference is either handled here or listed as retained history in
-- server/db/schema.test.ts, which fails when a new user reference is added without deciding.
CREATE OR REPLACE FUNCTION app.anonymize_user(p_user uuid, p_processed_by uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_user        users%ROWTYPE;
  v_now         timestamptz := now();
  v_today       date := istanbul_date(now());
  r             record;
  v_promoted    uuid;
  v_cancelled   uuid[] := '{}';
  v_left        uuid[] := '{}';
  v_lessons     uuid[] := '{}';
  v_promotions  jsonb := '[]';
  v_fee_results jsonb := '{}';
  v_convs       uuid[];
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found', p_user USING ERRCODE = 'no_data_found';
  END IF;
  IF v_user.status = 'deleted' THEN
    RETURN jsonb_build_object('status', 'already_deleted');
  END IF;

  -- 1. Refusals
  IF EXISTS (SELECT 1 FROM platform_admins WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'anonymize_refused:platform_admin' USING HINT = 'Revoke platform admin rights first.';
  END IF;
  IF EXISTS (SELECT 1 FROM club_memberships WHERE user_id = p_user AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'anonymize_refused:active_club_owner' USING HINT = 'Transfer club ownership first.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM lessons l
    JOIN lesson_sessions s ON s.lesson_id = l.id
    JOIN reservations rv ON rv.id = s.reservation_id
    WHERE l.coach_user_id = p_user AND rv.status IN ('pending','confirmed') AND rv.ends_at > v_now
  ) THEN
    RAISE EXCEPTION 'anonymize_refused:active_coach_contract' USING HINT = 'Cancel or hand over future lesson sessions first.';
  END IF;

  -- 2. Leave other players' upcoming matches (waitlist first so the user is never promoted)
  DELETE FROM reservation_waitlist WHERE user_id = p_user;

  FOR r IN
    SELECT p.id AS participant_id, p.status, p.reservation_id
    FROM reservation_participants p
    JOIN reservations rv ON rv.id = p.reservation_id
    WHERE p.user_id = p_user AND rv.owner_user_id IS DISTINCT FROM p_user
      AND rv.status IN ('pending','confirmed') AND rv.starts_at > v_now
    ORDER BY p.reservation_id
  LOOP
    PERFORM 1 FROM reservations WHERE id = r.reservation_id FOR UPDATE;
    DELETE FROM reservation_participants WHERE id = r.participant_id;
    IF r.status = 'active' THEN
      UPDATE reservations SET active_participant_count = active_participant_count - 1 WHERE id = r.reservation_id;
      v_promoted := promote_reservation_waitlist(r.reservation_id);
      IF v_promoted IS NOT NULL THEN
        v_promotions := v_promotions || jsonb_build_object('reservation_id', r.reservation_id, 'user_id', v_promoted);
      END IF;
    END IF;
    v_left := v_left || r.reservation_id;
  END LOOP;
  -- Pending join requests on past or closed matches are personal data with no remaining purpose.
  DELETE FROM reservation_participants WHERE user_id = p_user AND status = 'pending_approval';

  -- 3. Lesson enrollments in open lessons: same path as a student cancellation (counter + waitlist)
  FOR r IN
    SELECT e.id, e.lesson_id
    FROM lesson_enrollments e JOIN lessons l ON l.id = e.lesson_id
    WHERE e.user_id = p_user AND e.status IN ('enrolled','waitlisted') AND l.status IN ('draft','published')
    ORDER BY e.lesson_id
  LOOP
    v_promoted := cancel_lesson_enrollment(r.id, 'removed');
    IF v_promoted IS NOT NULL THEN
      v_promotions := v_promotions || jsonb_build_object('lesson_id', r.lesson_id, 'user_id', v_promoted);
    END IF;
    v_lessons := v_lessons || r.lesson_id;
  END LOOP;

  -- 4. Cancel the user's own upcoming reservations. Cancellation never incurs the fee; the charge is
  --    voided (or reversed if billed) with reason account_deleted before the status change.
  FOR r IN
    SELECT id, source FROM reservations
    WHERE owner_user_id = p_user AND status IN ('pending','confirmed') AND starts_at > v_now
      AND source IN ('app','panel')
    ORDER BY starts_at
    FOR UPDATE
  LOOP
    IF r.source = 'app' THEN
      v_fee_results := v_fee_results || jsonb_build_object(
        r.id::text, void_reservation_fees(r.id, 'account_deleted', p_processed_by));
    END IF;
    UPDATE reservations
    SET status = 'cancelled', cancelled_at = v_now, cancelled_by_party = 'system',
        cancelled_by_user_id = p_processed_by, cancel_reason = 'Hesap silindi'
    WHERE id = r.id;
    v_cancelled := v_cancelled || r.id;
  END LOOP;

  -- 5. Personal content
  SELECT COALESCE(array_agg(conversation_id), '{}') INTO v_convs
  FROM conversation_participants WHERE user_id = p_user;

  DELETE FROM messages WHERE sender_user_id = p_user;
  UPDATE conversations c
  SET (last_message_at, last_message_preview) = (
    SELECT m.created_at, left(m.body, 120) FROM messages m
    WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC LIMIT 1)
  WHERE c.id = ANY (v_convs);

  DELETE FROM feed_posts WHERE author_id = p_user;               -- cascades replies and likes on them
  WITH removed AS (DELETE FROM feed_replies WHERE author_id = p_user RETURNING post_id),
       counts AS (SELECT post_id, count(*)::int AS n FROM removed GROUP BY post_id)
  UPDATE feed_posts p SET reply_count = greatest(p.reply_count - counts.n, 0)
  FROM counts WHERE p.id = counts.post_id;
  WITH removed AS (DELETE FROM feed_post_likes WHERE user_id = p_user RETURNING post_id),
       counts AS (SELECT post_id, count(*)::int AS n FROM removed GROUP BY post_id)
  UPDATE feed_posts p SET like_count = greatest(p.like_count - counts.n, 0)
  FROM counts WHERE p.id = counts.post_id;

  DELETE FROM friendships WHERE user_id = p_user OR friend_user_id = p_user;
  DELETE FROM favorite_courts WHERE user_id = p_user;
  DELETE FROM notifications WHERE user_id = p_user OR actor_user_id = p_user;
  DELETE FROM sessions WHERE user_id = p_user;
  DELETE FROM otp_challenges WHERE phone = v_user.phone;
  DELETE FROM club_staff_invites WHERE phone = v_user.phone AND accepted_at IS NULL;
  DELETE FROM coach_student_notes WHERE student_user_id = p_user;

  UPDATE coach_profiles
  SET bio = NULL, certifications = '{}', years_experience = NULL, is_verified = false, verified_by = NULL
  WHERE user_id = p_user;
  UPDATE coach_club_contracts
  SET status = 'ended', ends_on = greatest(starts_on, v_today)
  WHERE coach_user_id = p_user AND status IN ('pending','active','suspended');

  -- 6. Leave conversations; drop direct conversations left with fewer than two people
  DELETE FROM conversation_participants WHERE user_id = p_user;
  DELETE FROM conversations c
  WHERE c.id = ANY (v_convs) AND c.kind = 'direct'
    AND (SELECT count(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) < 2;

  -- 7. Staff memberships
  UPDATE club_memberships SET status = 'revoked', revoked_at = v_now
  WHERE user_id = p_user AND status = 'active';

  -- 8. The user row stays (financial and history rows reference it); personal data goes
  UPDATE users
  SET phone = NULL, display_name = 'Silinmiş Kullanıcı', masked_name = 'Silinmiş K.', avatar_url = NULL,
      gender = NULL, home_city_id = NULL, play_side = 'both', dominant_hand = 'right',
      preferred_weekdays = '{}', preferred_time_ranges = '{}',
      push_notifications_enabled = false, reminder_2h_enabled = false, notification_sound_enabled = false,
      suspended_reason = NULL, last_login_at = NULL, legacy_id = NULL,
      status = 'deleted', anonymized_at = v_now
  WHERE id = p_user;

  -- 9. Consent proof survives through the phone HMAC only
  UPDATE consent_records SET user_id = NULL WHERE user_id = p_user;

  -- 10. Close the request and audit (no PII in the snapshot)
  UPDATE account_deletion_requests
  SET status = 'completed', completed_at = v_now, processed_by = p_processed_by
  WHERE user_id = p_user AND status = 'pending';

  INSERT INTO audit_log (actor_user_id, actor_scope, action, target_type, target_id, after_data)
  VALUES (p_processed_by, CASE WHEN p_processed_by IS NULL THEN 'system' ELSE 'platform_admin' END,
          'user.anonymize', 'user', p_user,
          jsonb_build_object('cancelled_reservations', cardinality(v_cancelled),
                             'left_matches', cardinality(v_left),
                             'left_lessons', cardinality(v_lessons),
                             'fee_results', v_fee_results));

  RETURN jsonb_build_object(
    'status', 'anonymized',
    'cancelled_reservation_ids', to_jsonb(v_cancelled),
    'left_reservation_ids', to_jsonb(v_left),
    'left_lesson_ids', to_jsonb(v_lessons),
    'promotions', v_promotions,
    'fee_results', v_fee_results);
END $$;
