-- One legal document can carry several consents (the explicit consent text lists separate purposes),
-- so each consent record names what was accepted or withdrawn. The latest record per purpose wins.
SET LOCAL search_path = app, public;

ALTER TABLE app.consent_records ADD COLUMN IF NOT EXISTS purpose text
  CHECK (purpose IN ('terms_of_use','privacy_notice','share_card','club_service_agreement'));

CREATE INDEX IF NOT EXISTS consent_records_user_purpose_idx
  ON app.consent_records (user_id, purpose, accepted_at DESC) WHERE user_id IS NOT NULL;
