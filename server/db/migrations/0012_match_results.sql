-- Match results for Elo: a player of a finished 4-player app match submits the teams and set scores,
-- a player of the other team confirms or disputes, and an unanswered result is confirmed automatically
-- after confirm_deadline. Elo changes are written to elo_events only when a result is confirmed.
SET LOCAL search_path = app, public;

CREATE TABLE IF NOT EXISTS app.match_results (
  reservation_id    uuid PRIMARY KEY REFERENCES app.reservations(id) ON DELETE RESTRICT,
  team_a            uuid[] NOT NULL CHECK (cardinality(team_a) = 2),
  team_b            uuid[] NOT NULL CHECK (cardinality(team_b) = 2),
  sets              jsonb NOT NULL CHECK (jsonb_typeof(sets) = 'array' AND jsonb_array_length(sets) BETWEEN 1 AND 3),
  winner            text NOT NULL CHECK (winner IN ('a','b')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','disputed')),
  submitted_by      uuid REFERENCES app.users(id) ON DELETE SET NULL,
  confirmed_by      uuid REFERENCES app.users(id) ON DELETE SET NULL,   -- NULL on a confirmed result = confirmed automatically
  disputed_by       uuid REFERENCES app.users(id) ON DELETE SET NULL,
  dispute_reason    text CHECK (char_length(dispute_reason) <= 300),
  confirm_deadline  timestamptz NOT NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  CHECK (NOT (team_a && team_b)),
  CHECK (team_a[1] <> team_a[2] AND team_b[1] <> team_b[2]),
  CHECK ((status = 'pending') = (resolved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS match_results_pending_idx ON app.match_results (confirm_deadline) WHERE status = 'pending';

-- A confirmed result is final
CREATE OR REPLACE FUNCTION app.match_results_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'match results are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'confirmed' AND (NEW.status, NEW.team_a, NEW.team_b, NEW.sets, NEW.winner)
     IS DISTINCT FROM (OLD.status, OLD.team_a, OLD.team_b, OLD.sets, OLD.winner) THEN
    RAISE EXCEPTION 'confirmed match result % cannot change', OLD.reservation_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_match_results_guard BEFORE UPDATE OR DELETE ON app.match_results
  FOR EACH ROW EXECUTE FUNCTION app.match_results_guard();

ALTER TABLE app.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE app.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'match_join','match_leave','match_invite','new_message','friend_add',
  'match_approved','slot_available','reservation_update','match_reminder_2h',
  'lesson_enrolled','lesson_waitlist_promoted','lesson_cancelled','coach_note',
  'statement_issued','statement_overdue','match_result'));

ALTER TABLE app.match_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ralo_app_access ON app.match_results;
CREATE POLICY ralo_app_access ON app.match_results AS PERMISSIVE FOR ALL TO ralo_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON app.match_results TO ralo_app;
REVOKE DELETE ON app.match_results FROM ralo_app;
