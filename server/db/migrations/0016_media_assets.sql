-- Club cover and court photos uploaded from the admin and club panels. Until an object store is worth its cost,
-- the resized image bytes live in Postgres and are served (immutable, long cached) from /api/media/<id>.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.media_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES app.clubs(id) ON DELETE CASCADE,
  purpose       text NOT NULL CHECK (purpose IN ('club_cover','court_photo')),
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  data          bytea NOT NULL CHECK (octet_length(data) BETWEEN 100 AND 700000),
  created_by    uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_club_idx ON app.media_assets (club_id);

ALTER TABLE app.court_photos ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES app.media_assets(id) ON DELETE CASCADE;

ALTER TABLE app.media_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ralo_app_access ON app.media_assets;
CREATE POLICY ralo_app_access ON app.media_assets AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.media_assets TO ralo_app;
