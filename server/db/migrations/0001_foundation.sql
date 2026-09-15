-- 0001 foundation: extensions, the private `app` schema, the application role,
-- shared helper functions and reference data tables.
-- Every statement is idempotent-safe (IF NOT EXISTS / OR REPLACE) so a partially
-- applied database can be migrated again; the runner still applies each file once.

-- Extensions. On Supabase they live in the `extensions` schema; elsewhere in the default schema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app;
SET LOCAL search_path = app, public;

-- Nobody but the migration owner and ralo_app may touch the private schema.
REVOKE ALL ON SCHEMA app FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA app FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA app FROM authenticated';
  END IF;
END $$;

-- Least-privilege runtime role used by the Express server. Created NOLOGIN; operators
-- run `ALTER ROLE ralo_app LOGIN PASSWORD '...'` once per environment (never in a migration).
-- ralo_app is NOT a superuser, does NOT have BYPASSRLS and owns no table (the migration role owns
-- them), so the row level security policies in 0009 apply to it. schema.test.ts asserts all three.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ralo_app') THEN
    CREATE ROLE ralo_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app TO ralo_app;
ALTER ROLE ralo_app SET search_path = app, public;

-- Request scope for the RLS tenant backstop (0009). The API sets it per transaction:
--   SET LOCAL app.scope = 'club:<club uuid>'   club panel and coach requests
--   SET LOCAL app.scope = 'global'             player, platform admin and background job requests
-- Unset or malformed scope fails closed on the tenant-scoped tables.
CREATE OR REPLACE FUNCTION app.request_scope() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.scope', true), '')
$$;

CREATE OR REPLACE FUNCTION app.club_in_scope(p_club uuid) RETURNS boolean
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  v_scope text := app.request_scope();
BEGIN
  IF v_scope = 'global' THEN
    RETURN true;
  END IF;
  IF v_scope ~ '^club:[0-9a-fA-F-]{36}$' THEN
    RETURN p_club IS NOT NULL AND p_club = substring(v_scope FROM 6)::uuid;
  END IF;
  RETURN false;
END $$;

-- Shared trigger: keep updated_at current.
CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Time-ordered UUIDv7 (RFC 9562) for append-heavy tables: better index locality than v4.
-- Postgres 15-17 have no native uuidv7(); only pg_catalog functions are used, so no search_path needed.
CREATE OR REPLACE FUNCTION app.uuid_v7() RETURNS uuid LANGUAGE plpgsql VOLATILE PARALLEL SAFE AS $$
DECLARE
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_ms    bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
BEGIN
  v_bytes := overlay(v_bytes PLACING substring(int8send(v_ms) FROM 3) FROM 1 FOR 6);
  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 112);  -- version 7
  v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);  -- RFC variant
  RETURN encode(v_bytes, 'hex')::uuid;
END $$;

-- Istanbul local calendar date of an instant (used by functions; generated columns inline the expression).
-- Note: `AT TIME ZONE '+03:00'` (text) is a POSIX offset and means UTC-3. Always use the zone name.
CREATE OR REPLACE FUNCTION app.istanbul_date(p_ts timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (p_ts AT TIME ZONE 'Europe/Istanbul')::date
$$;

-- Append-only history tables: reject UPDATE and DELETE.
CREATE OR REPLACE FUNCTION app.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not allowed (append-only history)', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- Versioned configuration: new rows may not be back-dated (5 minutes grace for clock skew).
CREATE OR REPLACE FUNCTION app.reject_backdated_effective_from() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.effective_from < now() - interval '5 minutes' THEN
    RAISE EXCEPTION '%.effective_from cannot be in the past', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.cities (
  id    smallint PRIMARY KEY CHECK (id BETWEEN 1 AND 81),   -- license plate code
  name  text NOT NULL UNIQUE,
  slug  text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS app.districts (
  id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city_id  smallint NOT NULL REFERENCES app.cities(id) ON DELETE RESTRICT,
  name     text NOT NULL,
  slug     text NOT NULL,
  UNIQUE (city_id, slug),
  UNIQUE (id, city_id)                                   -- composite FK target for clubs
);

CREATE TABLE IF NOT EXISTS app.amenities (
  code        text PRIMARY KEY,
  label_tr    text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0
);

INSERT INTO app.amenities (code, label_tr, sort_order) VALUES
  ('parking',          'Otopark',             1),
  ('cafe',             'Kafe',                2),
  ('locker_room',      'Soyunma Odası',       3),
  ('shower',           'Duş',                 4),
  ('equipment_rental', 'Ekipman Kiralama',    5),
  ('pro_shop',         'Mağaza',              6),
  ('night_lighting',   'Gece Aydınlatması',   7),
  ('wifi',             'Wi-Fi',               8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.cities (id, name, slug) VALUES
  (1,'Adana','adana'),(2,'Adıyaman','adiyaman'),(3,'Afyonkarahisar','afyonkarahisar'),(4,'Ağrı','agri'),
  (5,'Amasya','amasya'),(6,'Ankara','ankara'),(7,'Antalya','antalya'),(8,'Artvin','artvin'),
  (9,'Aydın','aydin'),(10,'Balıkesir','balikesir'),(11,'Bilecik','bilecik'),(12,'Bingöl','bingol'),
  (13,'Bitlis','bitlis'),(14,'Bolu','bolu'),(15,'Burdur','burdur'),(16,'Bursa','bursa'),
  (17,'Çanakkale','canakkale'),(18,'Çankırı','cankiri'),(19,'Çorum','corum'),(20,'Denizli','denizli'),
  (21,'Diyarbakır','diyarbakir'),(22,'Edirne','edirne'),(23,'Elazığ','elazig'),(24,'Erzincan','erzincan'),
  (25,'Erzurum','erzurum'),(26,'Eskişehir','eskisehir'),(27,'Gaziantep','gaziantep'),(28,'Giresun','giresun'),
  (29,'Gümüşhane','gumushane'),(30,'Hakkari','hakkari'),(31,'Hatay','hatay'),(32,'Isparta','isparta'),
  (33,'Mersin','mersin'),(34,'İstanbul','istanbul'),(35,'İzmir','izmir'),(36,'Kars','kars'),
  (37,'Kastamonu','kastamonu'),(38,'Kayseri','kayseri'),(39,'Kırklareli','kirklareli'),(40,'Kırşehir','kirsehir'),
  (41,'Kocaeli','kocaeli'),(42,'Konya','konya'),(43,'Kütahya','kutahya'),(44,'Malatya','malatya'),
  (45,'Manisa','manisa'),(46,'Kahramanmaraş','kahramanmaras'),(47,'Mardin','mardin'),(48,'Muğla','mugla'),
  (49,'Muş','mus'),(50,'Nevşehir','nevsehir'),(51,'Niğde','nigde'),(52,'Ordu','ordu'),
  (53,'Rize','rize'),(54,'Sakarya','sakarya'),(55,'Samsun','samsun'),(56,'Siirt','siirt'),
  (57,'Sinop','sinop'),(58,'Sivas','sivas'),(59,'Tekirdağ','tekirdag'),(60,'Tokat','tokat'),
  (61,'Trabzon','trabzon'),(62,'Tunceli','tunceli'),(63,'Şanlıurfa','sanliurfa'),(64,'Uşak','usak'),
  (65,'Van','van'),(66,'Yozgat','yozgat'),(67,'Zonguldak','zonguldak'),(68,'Aksaray','aksaray'),
  (69,'Bayburt','bayburt'),(70,'Karaman','karaman'),(71,'Kırıkkale','kirikkale'),(72,'Batman','batman'),
  (73,'Şırnak','sirnak'),(74,'Bartın','bartin'),(75,'Ardahan','ardahan'),(76,'Iğdır','igdir'),
  (77,'Yalova','yalova'),(78,'Karabük','karabuk'),(79,'Kilis','kilis'),(80,'Osmaniye','osmaniye'),
  (81,'Düzce','duzce')
ON CONFLICT (id) DO NOTHING;
