-- 0010 email + password sign-in replaces SMS OTP login.
-- Accounts are identified by a verified email address and a scrypt password hash (server/auth.ts).
-- The phone number becomes an optional contact field. OTP challenges are dropped; single-use email
-- links (email verification, password reset, staff invitation) live in auth_tokens.
SET LOCAL search_path = app, public;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS email              text,
  ADD COLUMN IF NOT EXISTS email_verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS password_hash      text,          -- scrypt$N$r$p$salt$key; NULL until an invited user sets one
  ADD COLUMN IF NOT EXISTS terms_accepted_at  timestamptz;

-- The phone was the account key until now; an active account now needs an email instead.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'app.users'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%phone IS NOT NULL%'
  LOOP
    EXECUTE format('ALTER TABLE app.users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE app.users
  ADD CONSTRAINT users_email_format_check CHECK (
    email IS NULL OR (email = lower(btrim(email)) AND char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  ADD CONSTRAINT users_active_needs_email_check CHECK (status = 'deleted' OR email IS NOT NULL),
  ADD CONSTRAINT users_email_verified_needs_email_check CHECK (email_verified_at IS NULL OR email IS NOT NULL),
  ADD CONSTRAINT users_password_hash_format_check CHECK (password_hash IS NULL OR password_hash LIKE 'scrypt$%');

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON app.users (email) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Single-use email links
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS app.otp_challenges;

CREATE TABLE IF NOT EXISTS app.auth_tokens (
  token_hash   bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),   -- sha256(token); the token itself only travels in the email
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  purpose      text NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  email        text NOT NULL,                                             -- address the link was sent to; a changed email invalidates it
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  request_ip   inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
-- Only the newest link per purpose stays usable; the API deletes older ones when it issues a new link.
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx    ON app.auth_tokens (user_id, purpose) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON app.auth_tokens (expires_at);

ALTER TABLE app.auth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ralo_app_access ON app.auth_tokens;
CREATE POLICY ralo_app_access ON app.auth_tokens AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.auth_tokens TO ralo_app;

-- ---------------------------------------------------------------------------
-- Staff invitations by email
-- ---------------------------------------------------------------------------

ALTER TABLE app.club_staff_invites DROP COLUMN IF EXISTS phone;   -- drops the phone indexes with it
ALTER TABLE app.club_staff_invites
  ADD COLUMN IF NOT EXISTS email text NOT NULL
    CHECK (email = lower(btrim(email)) AND char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
CREATE UNIQUE INDEX IF NOT EXISTS club_staff_invites_open_uq
  ON app.club_staff_invites (club_id, email) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS club_staff_invites_email_idx
  ON app.club_staff_invites (email) WHERE accepted_at IS NULL;

-- ---------------------------------------------------------------------------
-- KVKK consent proof keyed by email
-- ---------------------------------------------------------------------------

ALTER TABLE app.consent_records RENAME COLUMN subject_phone_hmac TO subject_hmac;
ALTER INDEX IF EXISTS app.consent_records_phone_hmac_idx RENAME TO consent_records_subject_hmac_idx;
COMMENT ON COLUMN app.consent_records.subject_hmac IS
  'HMAC-SHA256 of the normalized email: proof of consent that survives anonymization';

-- ---------------------------------------------------------------------------
-- anonymize_user: same steps as 0008, plus email, password and email links
-- ---------------------------------------------------------------------------

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
  DELETE FROM auth_tokens WHERE user_id = p_user;
  DELETE FROM club_staff_invites WHERE email = v_user.email AND accepted_at IS NULL;
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
  SET email = NULL, email_verified_at = NULL, password_hash = NULL, terms_accepted_at = NULL,
      phone = NULL, display_name = 'Silinmiş Kullanıcı', masked_name = 'Silinmiş K.', avatar_url = NULL,
      gender = NULL, home_city_id = NULL, play_side = 'both', dominant_hand = 'right',
      preferred_weekdays = '{}', preferred_time_ranges = '{}',
      push_notifications_enabled = false, reminder_2h_enabled = false, notification_sound_enabled = false,
      suspended_reason = NULL, last_login_at = NULL, legacy_id = NULL,
      status = 'deleted', anonymized_at = v_now
  WHERE id = p_user;

  -- 9. Consent proof survives through the email HMAC only
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
