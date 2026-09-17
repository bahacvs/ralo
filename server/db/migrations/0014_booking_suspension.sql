-- Clubs with a statement unpaid well past its due date lose app bookings automatically; the reason column
-- lets the system re-open them when the debt is settled without overriding a manual admin decision.
SET LOCAL search_path = app, public;

ALTER TABLE app.clubs ADD COLUMN IF NOT EXISTS booking_suspended_reason text
  CHECK (booking_suspended_reason IN ('overdue_statement'));
ALTER TABLE app.clubs ADD COLUMN IF NOT EXISTS booking_suspended_at timestamptz;

ALTER TABLE app.clubs ADD CONSTRAINT clubs_booking_suspension_check CHECK (
  (booking_suspended_reason IS NULL) = (booking_suspended_at IS NULL)
  AND (booking_suspended_reason IS NULL OR NOT app_booking_enabled));
