-- Club reviews: one rating (1-5) with an optional comment per player per club, only from players who
-- played there. clubs.rating_avg / reviews_count are maintained by trigger. Reviews are personal content,
-- so they are removed when the author's account is anonymized.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.club_reviews (
  id          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  club_id     uuid NOT NULL REFERENCES app.clubs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text CHECK (char_length(comment) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id)
);
CREATE INDEX IF NOT EXISTS club_reviews_club_idx ON app.club_reviews (club_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS club_reviews_user_idx ON app.club_reviews (user_id);
CREATE OR REPLACE TRIGGER trg_club_reviews_updated BEFORE UPDATE ON app.club_reviews
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_club_rating() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
DECLARE
  v_club uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.club_id ELSE NEW.club_id END;
BEGIN
  UPDATE clubs c
  SET rating_avg = r.avg_rating, reviews_count = r.n
  FROM (SELECT round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS n
        FROM club_reviews WHERE club_id = v_club) r
  WHERE c.id = v_club;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_club_reviews_rating AFTER INSERT OR UPDATE OR DELETE ON app.club_reviews
  FOR EACH ROW EXECUTE FUNCTION app.refresh_club_rating();

-- anonymize_user rewrites the user row with status 'deleted'; the author's reviews go with it
CREATE OR REPLACE FUNCTION app.remove_reviews_of_deleted_user() RETURNS trigger LANGUAGE plpgsql
SET search_path = app, public AS $$
BEGIN
  DELETE FROM club_reviews WHERE user_id = NEW.id;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_users_deleted_reviews AFTER UPDATE OF status ON app.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted')
  EXECUTE FUNCTION app.remove_reviews_of_deleted_user();

ALTER TABLE app.club_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ralo_app_access ON app.club_reviews;
CREATE POLICY ralo_app_access ON app.club_reviews AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.club_reviews TO ralo_app;
