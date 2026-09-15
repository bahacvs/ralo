-- 0006 messaging, notifications and social features.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.conversations (
  id                    uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  kind                  text NOT NULL CHECK (kind IN ('direct','match','lesson')),
  reservation_id        uuid REFERENCES app.reservations(id) ON DELETE SET NULL,
  lesson_id             uuid REFERENCES app.lessons(id) ON DELETE SET NULL,
  direct_key            text UNIQUE,                     -- least(uuid)||':'||greatest(uuid)
  title                 text CHECK (char_length(title) <= 120),
  last_message_at       timestamptz,
  last_message_preview  text CHECK (char_length(last_message_preview) <= 120),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'direct') = (direct_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_match_uq  ON app.conversations (reservation_id) WHERE kind = 'match';
CREATE UNIQUE INDEX IF NOT EXISTS conversations_lesson_uq ON app.conversations (lesson_id) WHERE kind = 'lesson';
CREATE OR REPLACE TRIGGER trg_conversations_updated BEFORE UPDATE ON app.conversations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.conversation_participants (
  conversation_id  uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  last_read_at     timestamptz,
  muted            boolean NOT NULL DEFAULT false,
  left_at          timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON app.conversation_participants (user_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS app.messages (
  id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  conversation_id  uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  sender_user_id   uuid REFERENCES app.users(id) ON DELETE SET NULL,
  body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON app.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx       ON app.messages (sender_user_id);

CREATE TABLE IF NOT EXISTS app.notifications (
  id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN (
                    'match_join','match_leave','match_invite','new_message','friend_add',
                    'match_approved','slot_available','reservation_update','match_reminder_2h',
                    'lesson_enrolled','lesson_waitlist_promoted','lesson_cancelled','coach_note',
                    'statement_issued','statement_overdue')),
  title           text NOT NULL,
  body            text NOT NULL,
  reservation_id  uuid REFERENCES app.reservations(id) ON DELETE SET NULL,
  court_id        uuid REFERENCES app.courts(id) ON DELETE SET NULL,
  lesson_id       uuid REFERENCES app.lessons(id) ON DELETE SET NULL,
  actor_user_id   uuid REFERENCES app.users(id) ON DELETE SET NULL,
  dedupe_key      text,                                  -- 'reminder2h:<reservation_id>'
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx   ON app.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON app.notifications (user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uq
  ON app.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_actor_idx
  ON app.notifications (actor_user_id) WHERE actor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.feed_posts (
  id           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  author_id    uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  category     text NOT NULL CHECK (category IN ('chat','looking_for_players','match_announcement','equipment')),
  content      text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  venue_name   text CHECK (char_length(venue_name) <= 100),
  club_id      uuid REFERENCES app.clubs(id) ON DELETE SET NULL,
  city_id      smallint REFERENCES app.cities(id) ON DELETE SET NULL,
  like_count   integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  reply_count  integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  hidden_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_posts_recent_idx   ON app.feed_posts (created_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS feed_posts_category_idx ON app.feed_posts (category, created_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS feed_posts_author_idx   ON app.feed_posts (author_id);
CREATE OR REPLACE TRIGGER trg_feed_posts_updated BEFORE UPDATE ON app.feed_posts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.feed_replies (
  id          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  post_id     uuid NOT NULL REFERENCES app.feed_posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  hidden_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_replies_post_idx   ON app.feed_replies (post_id, created_at);
CREATE INDEX IF NOT EXISTS feed_replies_author_idx ON app.feed_replies (author_id);

CREATE TABLE IF NOT EXISTS app.feed_post_likes (
  post_id     uuid NOT NULL REFERENCES app.feed_posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS feed_post_likes_user_idx ON app.feed_post_likes (user_id);

-- Directed follow, matching the current toggleFriend() behaviour.
CREATE TABLE IF NOT EXISTS app.friendships (
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  friend_user_id  uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_user_id),
  CHECK (user_id <> friend_user_id)
);
CREATE INDEX IF NOT EXISTS friendships_friend_idx ON app.friendships (friend_user_id);

CREATE TABLE IF NOT EXISTS app.favorite_courts (
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  court_id    uuid NOT NULL REFERENCES app.courts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, court_id)
);
CREATE INDEX IF NOT EXISTS favorite_courts_court_idx ON app.favorite_courts (court_id);
