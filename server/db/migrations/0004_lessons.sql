-- 0004 coach lessons: lessons, sessions on court slots, enrollments, attendance, student notes.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.lessons (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                  uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  coach_user_id            uuid NOT NULL,
  contract_id              uuid NOT NULL,
  kind                     text NOT NULL CHECK (kind IN ('group','private')),
  title                    text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  description              text CHECK (char_length(description) <= 2000),
  level                    text NOT NULL DEFAULT 'all' CHECK (level IN ('beginner','intermediate','advanced','all')),
  capacity                 smallint NOT NULL,
  enrolled_count           smallint NOT NULL DEFAULT 0,
  price_per_student_kurus  integer CHECK (price_per_student_kurus >= 0),   -- informational, paid at venue
  min_elo                  integer,
  max_elo                  integer,
  status                   text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','cancelled','completed')),
  notes                    text CHECK (char_length(notes) <= 2000),
  -- Billing snapshot taken at creation (0008 trigger): the club's lesson fee rate and basis in effect
  -- then. Every session of this lesson bills under it, whatever rate changes happen later.
  -- FK to platform_fee_rates is added in 0005.
  fee_rate_id              uuid NOT NULL,
  fee_basis                text NOT NULL CHECK (fee_basis IN ('per_session','per_lesson','per_enrolled_student_session')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  -- The lesson is tied to the concrete contract that allowed it; coach and club must match that contract.
  FOREIGN KEY (contract_id, coach_user_id, club_id)
    REFERENCES app.coach_club_contracts(id, coach_user_id, club_id) ON DELETE RESTRICT,
  CHECK ((kind = 'private' AND capacity BETWEEN 1 AND 4) OR (kind = 'group' AND capacity BETWEEN 2 AND 16)),
  CHECK (enrolled_count BETWEEN 0 AND capacity),                           -- DB-enforced lesson capacity
  CHECK (min_elo IS NULL OR max_elo IS NULL OR min_elo <= max_elo)
);
CREATE INDEX IF NOT EXISTS lessons_club_status_idx ON app.lessons (club_id, status);
CREATE INDEX IF NOT EXISTS lessons_coach_idx       ON app.lessons (coach_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lessons_contract_idx    ON app.lessons (contract_id);
CREATE OR REPLACE TRIGGER trg_lessons_updated BEFORE UPDATE ON app.lessons
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- One row per court slot; the court time lives in reservations(source='lesson') -> court_bookings.
-- Session status (scheduled/cancelled/completed) is read from the reservation, never copied.
CREATE TABLE IF NOT EXISTS app.lesson_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id            uuid NOT NULL REFERENCES app.lessons(id) ON DELETE RESTRICT,
  reservation_id       uuid NOT NULL UNIQUE,
  reservation_source   text NOT NULL DEFAULT 'lesson' CHECK (reservation_source = 'lesson'),
  session_no           smallint NOT NULL CHECK (session_no > 0),
  attendance_taken_at  timestamptz,
  coach_summary        text CHECK (char_length(coach_summary) <= 2000),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (reservation_id, reservation_source) REFERENCES app.reservations(id, source) ON DELETE RESTRICT,
  UNIQUE (lesson_id, session_no)
);
CREATE OR REPLACE TRIGGER trg_lesson_sessions_updated BEFORE UPDATE ON app.lesson_sessions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Waitlist positions are sparse and never renumbered (new entry = max + 1, rank = row_number()).
CREATE TABLE IF NOT EXISTS app.lesson_enrollments (
  id                 uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  lesson_id          uuid NOT NULL REFERENCES app.lessons(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  status             text NOT NULL CHECK (status IN ('enrolled','waitlisted','cancelled','removed')),
  waitlist_position  integer CHECK (waitlist_position > 0),
  enrolled_at        timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id),
  CHECK ((status = 'waitlisted') = (waitlist_position IS NOT NULL)),
  CHECK (status <> 'enrolled' OR enrolled_at IS NOT NULL),
  CHECK ((status IN ('cancelled','removed')) = (cancelled_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_enrollments_waitlist_uq
  ON app.lesson_enrollments (lesson_id, waitlist_position) WHERE status = 'waitlisted';
CREATE INDEX IF NOT EXISTS lesson_enrollments_user_idx
  ON app.lesson_enrollments (user_id) WHERE status IN ('enrolled','waitlisted');
CREATE OR REPLACE TRIGGER trg_lesson_enrollments_updated BEFORE UPDATE ON app.lesson_enrollments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.lesson_attendance (
  session_id     uuid NOT NULL REFERENCES app.lesson_sessions(id) ON DELETE CASCADE,
  enrollment_id  uuid NOT NULL REFERENCES app.lesson_enrollments(id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('present','late','absent','excused')),
  marked_by      uuid REFERENCES app.users(id) ON DELETE SET NULL,
  marked_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, enrollment_id)
);
-- A student's attendance history, and the cascade from lesson_enrollments.
CREATE INDEX IF NOT EXISTS lesson_attendance_enrollment_idx ON app.lesson_attendance (enrollment_id);

CREATE TABLE IF NOT EXISTS app.coach_student_notes (
  id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  coach_user_id       uuid NOT NULL REFERENCES app.coach_profiles(user_id) ON DELETE RESTRICT,
  student_user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  club_id             uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  lesson_id           uuid REFERENCES app.lessons(id) ON DELETE SET NULL,
  session_id          uuid REFERENCES app.lesson_sessions(id) ON DELETE SET NULL,
  note                text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 4000),
  skill_scores        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(skill_scores) = 'object'),
  assessed_level      text CHECK (assessed_level IN ('beginner','intermediate','advanced')),
  visible_to_student  boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_student_notes_student_idx
  ON app.coach_student_notes (student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_student_notes_coach_idx
  ON app.coach_student_notes (coach_user_id, student_user_id, created_at DESC);
CREATE OR REPLACE TRIGGER trg_coach_student_notes_updated BEFORE UPDATE ON app.coach_student_notes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
