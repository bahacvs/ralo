-- 0002 identity, roles, clubs, courts and coaches.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.users (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                       text UNIQUE CHECK (phone ~ '^905[0-9]{9}$'),   -- normalizePhone() output; NULL only when anonymized
  display_name                text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  masked_name                 text NOT NULL CHECK (char_length(masked_name) BETWEEN 1 AND 64),
  avatar_url                  text CHECK (avatar_url IS NULL OR avatar_url ~ '^https://'),
  gender                      text CHECK (gender IN ('female','male','undisclosed')),
  home_city_id                smallint REFERENCES app.cities(id) ON DELETE SET NULL,
  elo                         integer NOT NULL DEFAULT 1400 CHECK (elo BETWEEN 0 AND 4000),
  matches_count               integer NOT NULL DEFAULT 0 CHECK (matches_count >= 0),
  play_side                   text NOT NULL DEFAULT 'both'  CHECK (play_side IN ('left','right','both')),
  dominant_hand               text NOT NULL DEFAULT 'right' CHECK (dominant_hand IN ('left','right')),
  preferred_weekdays          smallint[] NOT NULL DEFAULT '{}' CHECK (preferred_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  preferred_time_ranges       text[] NOT NULL DEFAULT '{}',
  push_notifications_enabled  boolean NOT NULL DEFAULT true,
  reminder_2h_enabled         boolean NOT NULL DEFAULT true,
  notification_sound_enabled  boolean NOT NULL DEFAULT true,
  status                      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  suspended_reason            text,
  anonymized_at               timestamptz,
  last_login_at               timestamptz,
  legacy_id                   text UNIQUE,                                   -- import only; dropped after cutover
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'deleted') = (anonymized_at IS NOT NULL)),
  CHECK (status = 'deleted' OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS users_home_city_idx ON app.users (home_city_id) WHERE status = 'active';
CREATE OR REPLACE TRIGGER trg_users_updated BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.platform_admins (
  user_id     uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE RESTRICT,
  granted_by  uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Clubs and courts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.clubs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug                        text NOT NULL UNIQUE,
  legal_name                  text,
  tax_office                  text,
  tax_number                  text,
  billing_email               text,
  phone                       text CHECK (phone ~ '^90[0-9]{10}$'),
  city_id                     smallint NOT NULL REFERENCES app.cities(id) ON DELETE RESTRICT,
  district_id                 integer  NOT NULL,
  address                     text NOT NULL,
  latitude                    double precision CHECK (latitude  BETWEEN 35 AND 43),
  longitude                   double precision CHECK (longitude BETWEEN 25 AND 45),
  cover_image_url             text,
  policies                    text[] NOT NULL DEFAULT '{}',
  cancellation_window_hours   smallint NOT NULL DEFAULT 24 CHECK (cancellation_window_hours BETWEEN 0 AND 168),
  rating_avg                  numeric(2,1) CHECK (rating_avg BETWEEN 0 AND 5),
  reviews_count               integer NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  is_active                   boolean NOT NULL DEFAULT false,
  app_booking_enabled         boolean NOT NULL DEFAULT true,
  lessons_enabled             boolean NOT NULL DEFAULT false,
  created_by                  uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  approved_by                 uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  approved_at                 timestamptz,
  legacy_id                   text UNIQUE,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (district_id, city_id) REFERENCES app.districts(id, city_id) ON DELETE RESTRICT,
  CHECK (NOT is_active OR approved_at IS NOT NULL),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL))
);
CREATE INDEX IF NOT EXISTS clubs_city_district_idx ON app.clubs (city_id, district_id) WHERE is_active;
CREATE OR REPLACE TRIGGER trg_clubs_updated BEFORE UPDATE ON app.clubs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.club_opening_hours (
  club_id       uuid NOT NULL REFERENCES app.clubs(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),          -- ISO weekday
  is_closed     boolean NOT NULL DEFAULT false,
  open_minute   smallint CHECK (open_minute  BETWEEN 0 AND 1439),
  close_minute  smallint CHECK (close_minute BETWEEN 1 AND 2880),           -- > 1440 closes after midnight
  PRIMARY KEY (club_id, weekday),
  CHECK (is_closed OR (open_minute IS NOT NULL AND close_minute > open_minute))
);

CREATE TABLE IF NOT EXISTS app.club_amenities (
  club_id       uuid NOT NULL REFERENCES app.clubs(id) ON DELETE CASCADE,
  amenity_code  text NOT NULL REFERENCES app.amenities(code) ON DELETE RESTRICT,
  PRIMARY KEY (club_id, amenity_code)
);

CREATE TABLE IF NOT EXISTS app.club_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES app.clubs(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner','staff')),
  permissions  text[] NOT NULL DEFAULT '{}' CHECK (permissions <@ ARRAY[
                 'RESERVATION_MANAGE','PAYMENT_COLLECT','COURT_BLOCK',
                 'COURT_MANAGE','STAFF_MANAGE','REPORTS_VIEW','LESSON_MANAGE','BILLING_VIEW']::text[]),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  invited_by   uuid REFERENCES app.users(id) ON DELETE SET NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS club_memberships_user_idx ON app.club_memberships (user_id) WHERE status = 'active';
CREATE OR REPLACE TRIGGER trg_club_memberships_updated BEFORE UPDATE ON app.club_memberships
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Staff invited by phone before they have an account (replaces ghost user creation).
CREATE TABLE IF NOT EXISTS app.club_staff_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES app.clubs(id) ON DELETE CASCADE,
  phone         text NOT NULL CHECK (phone ~ '^905[0-9]{9}$'),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  role          text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  permissions   text[] NOT NULL DEFAULT '{}' CHECK (permissions <@ ARRAY[
                  'RESERVATION_MANAGE','PAYMENT_COLLECT','COURT_BLOCK',
                  'COURT_MANAGE','STAFF_MANAGE','REPORTS_VIEW','LESSON_MANAGE','BILLING_VIEW']::text[]),
  invited_by    uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  expires_at    timestamptz NOT NULL,
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS club_staff_invites_open_uq
  ON app.club_staff_invites (club_id, phone) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS club_staff_invites_phone_idx
  ON app.club_staff_invites (phone) WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.courts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  court_type          text NOT NULL CHECK (court_type IN ('outdoor_panoramic','indoor_panoramic','outdoor_standard','indoor_standard')),
  surface             text NOT NULL,
  hourly_price_kurus  integer NOT NULL CHECK (hourly_price_kurus >= 0),
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          smallint NOT NULL DEFAULT 0,
  legacy_id           text UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, name),
  UNIQUE (id, club_id)
);
CREATE INDEX IF NOT EXISTS courts_club_idx ON app.courts (club_id) WHERE is_active;
CREATE OR REPLACE TRIGGER trg_courts_updated BEFORE UPDATE ON app.courts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.court_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id    uuid NOT NULL REFERENCES app.courts(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt_text    text,
  is_primary  boolean NOT NULL DEFAULT false,
  position    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS court_photos_primary_uq ON app.court_photos (court_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS court_photos_court_idx ON app.court_photos (court_id, position);

-- ---------------------------------------------------------------------------
-- Coaches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.coach_profiles (
  user_id           uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE RESTRICT,
  bio               text CHECK (char_length(bio) <= 2000),
  certifications    text[] NOT NULL DEFAULT '{}',
  years_experience  smallint CHECK (years_experience BETWEEN 0 AND 60),
  is_verified       boolean NOT NULL DEFAULT false,
  verified_by       uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER trg_coach_profiles_updated BEFORE UPDATE ON app.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- One live contract per (coach, club); ended contracts stay as history so a coach can re-contract.
CREATE TABLE IF NOT EXISTS app.coach_club_contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  uuid NOT NULL REFERENCES app.coach_profiles(user_id) ON DELETE RESTRICT,
  club_id        uuid NOT NULL REFERENCES app.clubs(id) ON DELETE RESTRICT,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','ended')),
  starts_on      date NOT NULL,
  ends_on        date,
  created_by     uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  notes          text CHECK (char_length(notes) <= 2000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, coach_user_id, club_id),                    -- composite FK target for lessons
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (status <> 'ended' OR ends_on IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS coach_club_contracts_live_uq
  ON app.coach_club_contracts (coach_user_id, club_id) WHERE status IN ('pending','active','suspended');
CREATE INDEX IF NOT EXISTS coach_club_contracts_club_idx
  ON app.coach_club_contracts (club_id) WHERE status = 'active';
CREATE OR REPLACE TRIGGER trg_coach_club_contracts_updated BEFORE UPDATE ON app.coach_club_contracts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
