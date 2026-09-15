-- 0011 profile photos: the app uploads camera pictures as data URLs (max ~900 KB) until object
-- storage exists, so users.avatar_url accepts https URLs and inline JPEG/PNG/WebP data URLs.
SET LOCAL search_path = app, public;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'app.users'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%avatar_url%'
  LOOP
    EXECUTE format('ALTER TABLE app.users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE app.users
  ADD CONSTRAINT users_avatar_url_check CHECK (
    avatar_url IS NULL
    OR (avatar_url ~ '^https://' AND char_length(avatar_url) <= 2000)
    OR (avatar_url ~ '^data:image/(jpeg|png|webp);base64,' AND char_length(avatar_url) <= 900000));
