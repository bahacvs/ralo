-- 0003 court time: one booking model with a database-enforced no-overlap rule.
SET LOCAL search_path = app, public;

-- Every use of a court (app/panel/lesson reservation, maintenance or event block) owns exactly one
-- court_bookings row. Only active rows take part in the EXCLUDE constraint (SQLSTATE 23P01 on conflict).
-- The constraint is DEFERRABLE INITIALLY IMMEDIATE: normal writes are checked per statement, and a
-- transaction that swaps two bookings can run `SET CONSTRAINTS app.court_bookings_no_overlap DEFERRED`.
CREATE TABLE IF NOT EXISTS app.court_bookings (
  id           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  club_id      uuid NOT NULL,
  court_id     uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('reservation','block')),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  during       tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  local_date   date      GENERATED ALWAYS AS ((starts_at AT TIME ZONE 'Europe/Istanbul')::date) STORED,
  is_active    boolean NOT NULL DEFAULT true,
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (court_id, club_id) REFERENCES app.courts(id, club_id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at),
  CHECK (ends_at - starts_at <= interval '14 days'),
  CHECK (is_active = (released_at IS NULL)),
  CONSTRAINT court_bookings_id_kind_key UNIQUE (id, kind),       -- FK target: a block cannot point at a reservation booking
  CONSTRAINT court_bookings_no_overlap
    EXCLUDE USING gist (court_id WITH =, during WITH &&) WHERE (is_active)
    DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS court_bookings_club_during_gist ON app.court_bookings USING gist (club_id, during);
CREATE INDEX IF NOT EXISTS court_bookings_club_date_idx    ON app.court_bookings (club_id, local_date);

-- A released booking is history: it can never become active again (rebook instead), and a booking
-- never moves to another club or changes kind.
CREATE OR REPLACE FUNCTION app.court_bookings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT OLD.is_active AND NEW.is_active THEN
    RAISE EXCEPTION 'released court booking % cannot be reactivated', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.club_id IS DISTINCT FROM OLD.club_id OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'court booking % cannot change club or kind', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NOT OLD.is_active AND (NEW.court_id, NEW.starts_at, NEW.ends_at) IS DISTINCT FROM (OLD.court_id, OLD.starts_at, OLD.ends_at) THEN
    RAISE EXCEPTION 'released court booking % cannot be moved', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_court_bookings_guard BEFORE UPDATE ON app.court_bookings
  FOR EACH ROW EXECUTE FUNCTION app.court_bookings_guard();

-- reservations and court_blocks keep copies of court/club/time for indexing. The copies are owned by
-- court_bookings: a BEFORE INSERT/UPDATE trigger on the child fills and validates them, and an AFTER
-- UPDATE trigger on court_bookings pushes a reschedule down (instead of ON UPDATE CASCADE composite FKs).
CREATE OR REPLACE FUNCTION app.booking_copy_sync() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
DECLARE
  v_b court_bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM court_bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RETURN NEW;                                            -- the FK reports the missing booking
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (NEW.court_id IS NOT NULL AND NEW.court_id <> v_b.court_id)
       OR (NEW.club_id IS NOT NULL AND NEW.club_id <> v_b.club_id)
       OR (NEW.starts_at IS NOT NULL AND NEW.starts_at <> v_b.starts_at)
       OR (NEW.ends_at IS NOT NULL AND NEW.ends_at <> v_b.ends_at) THEN
      RAISE EXCEPTION '%: court/club/time must match court booking %', TG_TABLE_NAME, NEW.booking_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
    RAISE EXCEPTION '%: booking_id cannot change', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  ELSIF (NEW.court_id, NEW.club_id, NEW.starts_at, NEW.ends_at)
        IS DISTINCT FROM (v_b.court_id, v_b.club_id, v_b.starts_at, v_b.ends_at) THEN
    RAISE EXCEPTION '%: court/club/time follow court booking %; update the booking instead', TG_TABLE_NAME, NEW.booking_id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.court_id  := v_b.court_id;
  NEW.club_id   := v_b.club_id;
  NEW.starts_at := v_b.starts_at;
  NEW.ends_at   := v_b.ends_at;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS app.court_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL UNIQUE,
  booking_kind  text NOT NULL DEFAULT 'block' CHECK (booking_kind = 'block'),
  club_id       uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  court_id      uuid NOT NULL,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('maintenance','private_event','tournament','other')),
  reason_note   text CHECK (char_length(reason_note) <= 300),
  created_by    uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  removed_by    uuid REFERENCES app.users(id) ON DELETE SET NULL,
  removed_at    timestamptz,                                   -- soft delete; releases the booking
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, booking_kind) REFERENCES app.court_bookings(id, kind) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS court_blocks_club_idx ON app.court_blocks (club_id, starts_at);
CREATE INDEX IF NOT EXISTS court_blocks_club_active_idx ON app.court_blocks (club_id) WHERE removed_at IS NULL;
CREATE OR REPLACE TRIGGER trg_court_blocks_copy_sync BEFORE INSERT OR UPDATE ON app.court_blocks
  FOR EACH ROW EXECUTE FUNCTION app.booking_copy_sync();

CREATE OR REPLACE FUNCTION app.court_block_removal_sync() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  IF OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL THEN
    RAISE EXCEPTION 'removed court block % cannot be restored', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN
    UPDATE court_bookings SET is_active = false, released_at = NEW.removed_at
    WHERE id = NEW.booking_id AND is_active;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_court_block_removal_sync AFTER UPDATE OF removed_at ON app.court_blocks
  FOR EACH ROW EXECUTE FUNCTION app.court_block_removal_sync();

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.reservations (
  id                        uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  booking_id                uuid NOT NULL UNIQUE,
  booking_kind              text NOT NULL DEFAULT 'reservation' CHECK (booking_kind = 'reservation'),
  club_id                   uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  court_id                  uuid NOT NULL,
  city_id                   smallint NOT NULL REFERENCES app.cities(id) ON DELETE RESTRICT,  -- filled from the club
  starts_at                 timestamptz NOT NULL,
  ends_at                   timestamptz NOT NULL,
  local_date                date     GENERATED ALWAYS AS ((starts_at AT TIME ZONE 'Europe/Istanbul')::date) STORED,
  duration_minutes          smallint GENERATED ALWAYS AS ((extract(epoch FROM (ends_at - starts_at)) / 60)::smallint) STORED,
  source                    text NOT NULL CHECK (source IN ('app','panel','lesson')),
  owner_user_id             uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  guest_name                text CHECK (char_length(guest_name) <= 60),
  guest_phone               text CHECK (guest_phone ~ '^905[0-9]{9}$'),
  created_by                uuid REFERENCES app.users(id) ON DELETE SET NULL,
  status                    text NOT NULL DEFAULT 'confirmed'
                              CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  total_price_kurus         integer NOT NULL CHECK (total_price_kurus >= 0),
  payment_status            text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  cancellation_deadline     timestamptz,     -- snapshot: starts_at - clubs.cancellation_window_hours (filled on insert)
  cancelled_at              timestamptz,
  cancelled_by_user_id      uuid REFERENCES app.users(id) ON DELETE SET NULL,
  cancelled_by_party        text CHECK (cancelled_by_party IN ('player','club','coach','admin','system')),
  cancel_reason             text CHECK (char_length(cancel_reason) <= 300),
  is_open_match             boolean NOT NULL DEFAULT false,
  open_match_note           text CHECK (char_length(open_match_note) <= 300),
  participant_limit         smallint NOT NULL DEFAULT 4 CHECK (participant_limit BETWEEN 1 AND 4),
  active_participant_count  smallint NOT NULL DEFAULT 0,
  min_elo                   integer,
  max_elo                   integer,
  match_type                text CHECK (match_type IN ('casual','competitive')),
  gender_preference         text CHECK (gender_preference IN ('mixed','female','male','any')),
  approval_required         boolean NOT NULL DEFAULT false,
  note                      text CHECK (char_length(note) <= 300),
  legacy_id                 text UNIQUE,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, booking_kind) REFERENCES app.court_bookings(id, kind) ON DELETE RESTRICT,
  FOREIGN KEY (court_id, club_id) REFERENCES app.courts(id, club_id) ON DELETE RESTRICT,
  UNIQUE (id, source),                                              -- FK target for lesson_sessions
  CHECK (active_participant_count BETWEEN 0 AND participant_limit), -- DB-enforced match capacity
  CHECK (source <> 'app'    OR owner_user_id IS NOT NULL),
  CHECK (source <> 'lesson' OR (owner_user_id IS NOT NULL AND NOT is_open_match)),
  CHECK (source <> 'panel'  OR owner_user_id IS NOT NULL OR guest_name IS NOT NULL),
  CHECK (NOT is_open_match OR source = 'app'),
  CHECK (source = 'lesson' OR (extract(epoch FROM (ends_at - starts_at)) / 60) IN (60, 90, 120)),
  CHECK (min_elo IS NULL OR max_elo IS NULL OR min_elo <= max_elo),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK (status <> 'cancelled' OR cancelled_by_party IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reservations_club_date_idx   ON app.reservations (club_id, local_date, starts_at);
CREATE INDEX IF NOT EXISTS reservations_owner_start_idx ON app.reservations (owner_user_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS reservations_court_idx       ON app.reservations (court_id, starts_at);
CREATE INDEX IF NOT EXISTS reservations_open_match_idx  ON app.reservations (city_id, local_date, starts_at)
  WHERE is_open_match AND status = 'confirmed';
CREATE INDEX IF NOT EXISTS reservations_upcoming_idx    ON app.reservations (starts_at)
  WHERE status IN ('pending','confirmed');
CREATE OR REPLACE TRIGGER trg_reservations_updated BEFORE UPDATE ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
-- Named "a_..." so it fires before the other BEFORE triggers (Postgres fires them alphabetically).
CREATE OR REPLACE TRIGGER trg_a_reservations_copy_sync BEFORE INSERT OR UPDATE ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.booking_copy_sync();

-- Insert: a live reservation needs an active booking; city and cancellation deadline come from the club.
-- Update: the source never changes (it decides whether a platform fee applies).
CREATE OR REPLACE FUNCTION app.reservation_write_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
DECLARE
  v_city   smallint;
  v_window smallint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'cancelled' AND NOT EXISTS (
      SELECT 1 FROM court_bookings WHERE id = NEW.booking_id AND is_active
    ) THEN
      RAISE EXCEPTION 'court booking % is not active', NEW.booking_id USING ERRCODE = 'check_violation';
    END IF;
    SELECT city_id, cancellation_window_hours INTO v_city, v_window FROM clubs WHERE id = NEW.club_id;
    IF NEW.city_id IS NOT NULL AND NEW.city_id <> v_city THEN
      RAISE EXCEPTION 'reservation city must match the club city' USING ERRCODE = 'check_violation';
    END IF;
    NEW.city_id := v_city;
    IF NEW.cancellation_deadline IS NULL AND NEW.starts_at IS NOT NULL THEN
      NEW.cancellation_deadline := NEW.starts_at - make_interval(hours => v_window);
    END IF;
  ELSIF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'reservation % cannot change source', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_b_reservation_write_guard BEFORE INSERT OR UPDATE ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.reservation_write_guard();

-- Cancelling releases the court time; a cancelled reservation cannot be reactivated (rebook instead).
-- 0008 adds the fee side of cancellation (the platform fee is always voided).
CREATE OR REPLACE FUNCTION app.reservation_status_sync() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE court_bookings SET is_active = false, released_at = NEW.cancelled_at
    WHERE id = NEW.booking_id AND is_active;
  ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'cancelled reservation % cannot be reactivated', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_reservation_status_sync AFTER UPDATE OF status ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.reservation_status_sync();

-- Reschedule / court move: push the booking's new court and time into its reservation or block.
CREATE OR REPLACE FUNCTION app.court_booking_propagate() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  IF (NEW.court_id, NEW.starts_at, NEW.ends_at) IS DISTINCT FROM (OLD.court_id, OLD.starts_at, OLD.ends_at) THEN
    IF NEW.kind = 'reservation' THEN
      UPDATE reservations SET court_id = NEW.court_id, starts_at = NEW.starts_at, ends_at = NEW.ends_at
      WHERE booking_id = NEW.id;
    ELSE
      UPDATE court_blocks SET court_id = NEW.court_id, starts_at = NEW.starts_at, ends_at = NEW.ends_at
      WHERE booking_id = NEW.id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_court_booking_propagate AFTER UPDATE OF court_id, starts_at, ends_at ON app.court_bookings
  FOR EACH ROW EXECUTE FUNCTION app.court_booking_propagate();

-- Open match participants. pending_approval rows do not take a slot and do not count against
-- participant_limit (capacity is only checked when the organizer approves).
CREATE TABLE IF NOT EXISTS app.reservation_participants (
  id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  reservation_id  uuid NOT NULL REFERENCES app.reservations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('active','pending_approval')),
  slot_index      smallint CHECK (slot_index BETWEEN 0 AND 3),
  is_organizer    boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz,
  UNIQUE (reservation_id, user_id),
  CHECK ((status = 'active') = (slot_index IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reservation_participants_slot_uq
  ON app.reservation_participants (reservation_id, slot_index) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS reservation_participants_organizer_uq
  ON app.reservation_participants (reservation_id) WHERE is_organizer;
CREATE INDEX IF NOT EXISTS reservation_participants_user_idx
  ON app.reservation_participants (user_id, reservation_id);

-- Waitlist positions are sparse and never renumbered: a new entry takes max(position) + 1 and the
-- displayed rank is row_number() OVER (ORDER BY position). A plain (non-deferrable) UNIQUE is enough.
CREATE TABLE IF NOT EXISTS app.reservation_waitlist (
  id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  reservation_id  uuid NOT NULL REFERENCES app.reservations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  position        integer NOT NULL CHECK (position > 0),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, user_id),
  UNIQUE (reservation_id, position)
);
CREATE INDEX IF NOT EXISTS reservation_waitlist_user_idx ON app.reservation_waitlist (user_id);

CREATE TABLE IF NOT EXISTS app.venue_payments (
  id                uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  reservation_id    uuid NOT NULL REFERENCES app.reservations(id) ON DELETE RESTRICT,
  amount_kurus      integer NOT NULL,                        -- negative for refund
  method            text NOT NULL CHECK (method IN ('cash','pos_terminal','bank_transfer','other')),
  resulting_status  text NOT NULL CHECK (resulting_status IN ('unpaid','paid','refunded')),
  recorded_by       uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_payments_reservation_idx ON app.venue_payments (reservation_id);

-- Elo follows the chess Elo formula. Doubles: each team's rating is the average of its two players,
-- expected score E = 1 / (1 + 10^((R_opponent - R_team) / 400)), delta = round(K * (S - E)) with
-- S = 1 / 0.5 / 0. The inputs are stored so every change can be recomputed and audited.
-- Who confirms a match result is undecided; no result/confirmation table exists yet.
CREATE TABLE IF NOT EXISTS app.elo_events (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id          uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  reservation_id   uuid REFERENCES app.reservations(id) ON DELETE SET NULL,
  delta            integer NOT NULL,
  elo_before       integer NOT NULL,
  elo_after        integer NOT NULL CHECK (elo_after BETWEEN 0 AND 4000),
  reason           text NOT NULL CHECK (reason IN ('match_result','admin_adjustment','initial_calibration')),
  team_rating      integer,                                  -- average of the player's team
  opponent_rating  integer,                                  -- average of the opposing team
  expected_score   numeric(5,4) CHECK (expected_score BETWEEN 0 AND 1),
  actual_score     numeric(2,1) CHECK (actual_score IN (0, 0.5, 1)),
  k_factor         smallint CHECK (k_factor BETWEEN 1 AND 100),
  algorithm_ver    text NOT NULL,
  created_by       uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reservation_id, reason),
  CHECK (elo_after = elo_before + delta),
  CHECK (reason <> 'match_result' OR (team_rating IS NOT NULL
         AND opponent_rating IS NOT NULL AND expected_score IS NOT NULL AND actual_score IS NOT NULL
         AND k_factor IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS elo_events_user_idx ON app.elo_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS elo_events_reservation_idx ON app.elo_events (reservation_id) WHERE reservation_id IS NOT NULL;
