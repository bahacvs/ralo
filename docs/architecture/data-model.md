# RALO production data model (Postgres 15+, Supabase)

Status: implemented as SQL migrations in `server/db/migrations/` and used by the API (`server/repo/*`).
Tests: `npm run test:db` (applies every migration to an in-process PGlite and checks the invariants below).
Apply to a real database: `npm run db:migrate` with `DATABASE_MIGRATION_URL` (direct or session connection, port 5432).

## 1. Product decisions this model encodes

| Decision | Where it is enforced |
|---|---|
| Players pay at the venue; the platform charges each club **10000 kurus (100 TL) per app reservation**, flat for every club. Panel reservations are free. | `platform_fee_rates` (`app_reservation` rows must have `club_id IS NULL`), `app.charge_app_reservation()`, deferred constraint trigger `trg_reservation_requires_fee` |
| **A cancelled reservation never incurs the platform fee**, whoever cancels. Cancelling voids the ledger entry (or reverses it if it was already billed). | `trg_reservation_cancel_fees` → `app.void_reservation_fees()`; `fee_ledger_validate` refuses a charge for a cancelled reservation. `billing_policies` has no charge-on-cancel setting. |
| **Lesson platform fee differs per club**, stored as a per-club setting with effective-from history. | `platform_fee_rates` `lesson` rows must have `club_id NOT NULL`; a lesson snapshots the rate in effect at creation (`lessons.fee_rate_id`, `fee_basis`). |
| **Player cancellation window** is a per-club setting, default 24 hours. | `clubs.cancellation_window_hours` (default 24), snapshotted to `reservations.cancellation_deadline` on insert. The deadline only matters for whether the player may cancel in the app; it has no fee effect. |
| **Elo** follows the chess Elo formula; doubles use team average rating, expected score and a K-factor (40 for the first 30 rated matches, 10 from 2400, else 20). A player submits the result, the opposing team confirms or disputes, unanswered results confirm after 48 h. | `match_results` (0012) holds teams, sets and confirmation state; `elo_events` stores `elo_before`, `team_rating`, `opponent_rating`, `expected_score`, `actual_score`, `k_factor`, `algorithm_ver` per confirmed result. |
| Monthly statement per club, paid by bank transfer, marked paid by an admin. | `monthly_statements`, `statement_lines`, `fee_ledger_entries.status = 'billed'` |
| Clubs are added by the platform owner. | `clubs.created_by`, `approved_by`, `platform_admins` |

## 2. Conventions

- Everything lives in the private schema `app` (not exposed to PostgREST; `anon`/`authenticated` have no rights).
- Extensions: `pgcrypto`, `btree_gist` (installed into `extensions` on Supabase).
- Keys: `uuid`. Append-heavy tables default to `app.uuid_v7()` (time ordered); others to `gen_random_uuid()`. `legacy_id` on users, clubs, courts, reservations is for the one-time import and is dropped after cutover.
- Enumerations are `text` + `CHECK` (lowercase English); the API maps them to the existing uppercase contract.
- Times are `timestamptz`. Istanbul local dates are `GENERATED ... STORED` with `AT TIME ZONE 'Europe/Istanbul'` (never `'+03:00'`, which Postgres reads as UTC-3).
- Money is `integer` kurus.
- Users are never hard-deleted (anonymized instead); `ON DELETE` on user FKs: `CASCADE` personal rows, `SET NULL` actor references, `RESTRICT` financial/history rows.
- Multi-row invariants are enforced by constraints, triggers, or counter columns with `CHECK` updated under the parent row lock. Nothing relies on process memory.

## 3. Entities (migration file)

| Area | Tables | File |
|---|---|---|
| Foundation | helper functions, `ralo_app` role, `cities` (81 seeded), `districts`, `amenities` (seeded) | 0001 |
| Identity and clubs | `users`, `platform_admins`, `clubs`, `club_opening_hours`, `club_amenities`, `club_memberships`, `club_staff_invites`, `courts`, `court_photos`, `coach_profiles`, `coach_club_contracts` | 0002 |
| Court time | `court_bookings`, `court_blocks`, `reservations`, `reservation_participants`, `reservation_waitlist`, `venue_payments`, `elo_events` | 0003 |
| Lessons | `lessons`, `lesson_sessions`, `lesson_enrollments`, `lesson_attendance`, `coach_student_notes` | 0004 |
| Billing | `platform_fee_rates`, `billing_policies`, `monthly_statements`, `fee_ledger_entries`, `statement_lines` | 0005 |
| Social | `conversations`, `conversation_participants`, `messages`, `notifications`, `feed_posts`, `feed_replies`, `feed_post_likes`, `friendships`, `favorite_courts` | 0006 |
| Auth, infra, KVKK, audit | `sessions`, `auth_tokens` (0010), `rate_limit_counters` (UNLOGGED), `job_runs`, `legal_documents`, `consent_records`, `account_deletion_requests`, `audit_log` | 0007 |
| Domain functions | rate/policy resolution, fee ledger writes and rules, waitlist promotion, `anonymize_user` | 0008 |
| Security | RLS on every table, `ralo_app` policies and grants | 0009 |

Roles are derived from link tables (`platform_admins`, `club_memberships`, `coach_profiles`), not a column on `users`. The API's legacy `role`/`businessId` is computed on read: platform admin, then owner membership, then staff membership, then player. A user can belong to several clubs.

## 4. Court time

### 4.1 One booking model

Every use of a court (app, panel or lesson reservation; maintenance/event block) owns exactly one `court_bookings` row:

```sql
CONSTRAINT court_bookings_no_overlap
  EXCLUDE USING gist (court_id WITH =, during WITH &&) WHERE (is_active)
  DEFERRABLE INITIALLY IMMEDIATE
```

- A conflicting insert/update fails with `23P01`; the API maps it to the existing Turkish 409 message.
- `during` is `[starts_at, ends_at)`, so back-to-back slots do not conflict.
- Releasing (cancel, block removal) sets `is_active = false, released_at`. A released booking can never be reactivated or moved; rebook instead.
- The constraint is deferrable so a transaction can swap two bookings: `SET CONSTRAINTS app.court_bookings_no_overlap DEFERRED`.
- `(court_id, club_id)` references `courts(id, club_id)`, so a booking cannot point at another club's court. `club_id` and `kind` never change.

### 4.2 Copies on reservations and blocks

`reservations` and `court_blocks` keep `court_id, club_id, starts_at, ends_at` for indexing. The booking owns them:

- `BEFORE INSERT/UPDATE` trigger `booking_copy_sync` fills the copies from the booking and rejects values that differ. A direct `UPDATE reservations SET starts_at` is refused ("update the booking instead").
- `AFTER UPDATE` trigger `court_booking_propagate` pushes a reschedule or court move from the booking to its reservation or block.
- On insert, `reservations.city_id` is taken from the club and `cancellation_deadline` defaults to `starts_at - clubs.cancellation_window_hours`.

**Write path (one transaction):** `INSERT court_bookings` → `INSERT reservations` → organizer participant (app) → `SELECT app.charge_app_reservation(id)` (app). The deferred trigger `trg_reservation_requires_fee` fails the COMMIT if a live app reservation has no charge.

**Cancel:** `UPDATE reservations SET status='cancelled', cancelled_at, cancelled_by_party, cancelled_by_user_id`. Triggers release the booking and void the fee in the same statement. Reactivation raises `23514`.

**Reschedule:** `UPDATE court_bookings SET starts_at, ends_at` (EXCLUDE re-checked). The reservation copy follows, and an accrued fee moves to the new service month.

### 4.3 Participants and waitlist

- The owner of an app reservation is always the organizer participant, so "my upcoming matches" is one query on `reservation_participants(user_id)`.
- Join: lock the reservation `FOR UPDATE`, run the Elo/time/duplicate checks, `UPDATE reservations SET active_participant_count = active_participant_count + 1` (the `CHECK` stops overfilling), insert with the lowest free `slot_index`.
- `pending_approval` rows have no slot and **do not reserve capacity**; capacity is checked when the organizer approves (a late approval can fail with `23514`). This is the schema's current answer to open decision 8.
- Waitlist positions are sparse and never renumbered: a new entry takes `max(position) + 1`, the displayed rank is `row_number() OVER (ORDER BY position)`. Plain `UNIQUE (reservation_id, position)`. `app.promote_reservation_waitlist()` moves the lowest position into the lowest free slot in the transaction that freed a place. Lessons work the same way (`enrolled_count`, `waitlist_position`, `app.cancel_lesson_enrollment()`).

## 5. Lessons

- A lesson belongs to a concrete coach contract: `FOREIGN KEY (contract_id, coach_user_id, club_id) REFERENCES coach_club_contracts(id, coach_user_id, club_id)`. One live contract per coach and club; ended contracts stay as history.
- Each lesson session is a `reservations` row with `source = 'lesson'` (blocks the court through its booking). Session status is read from that reservation, never copied.
- Capacity: private 1-4, group 2-16, `CHECK (enrolled_count BETWEEN 0 AND capacity)`.
- Attendance per (session, enrollment); coach notes per student with `skill_scores` jsonb and `visible_to_student`.
- On insert, trigger `lesson_fee_snapshot` resolves the club's lesson rate in effect **now** and stores `fee_rate_id` and `fee_basis`. With no rate for the club the insert fails (`P0002`, "no lesson fee rate configured"). Both columns are immutable afterwards, so every session of a lesson bills under the terms it was created with.

## 6. Billing and the fee ledger

### 6.1 Configuration tables (append-only, never back-dated)

`platform_fee_rates` (UPDATE/DELETE rejected by trigger; `effective_from` may not be more than 5 minutes in the past):

| fee_type | club_id | lesson_fee_basis | Meaning |
|---|---|---|---|
| `app_reservation` | must be NULL | must be NULL | One platform-wide rate. Launch row: 10000 kurus. |
| `lesson` | must be set | `per_session` / `per_lesson` / `per_enrolled_student_session` | Per-club lesson fee with its own history. |

Resolution: `app.resolve_fee_rate(fee_type, club, at)` returns the latest row with `effective_from <= at`, preferring the club row.

`billing_policies` (append-only, global row with optional per-club override): `charge_no_show` (default true), `statement_due_days` (15), `vat_rate_bps` (2000), `amounts_include_vat` (no default, must be decided). There is intentionally no cancellation setting.

### 6.2 `fee_ledger_entries`

One row per chargeable event, snapshotting `amount_kurus`, `rate_id`, `policy_id`. Rows are never deleted.

Integrity rules:

- `idempotency_key UNIQUE`; every write is `INSERT ... ON CONFLICT DO NOTHING`.
- Partial unique indexes: one charge per reservation, one charge per (lesson session, enrollment) with `NULLS NOT DISTINCT`, one reversal per charge.
- `entry_type = 'charge'` has `amount >= 0` and a `rate_id`; `reversal` has `amount <= 0` and `reverses_entry_id`.
- `billing_period = date_trunc('month', service_date)`.
- Trigger `fee_ledger_validate`: the charge's club matches the reservation, `service_date` equals the reservation's Istanbul `local_date` (catches the UTC off-by-one for 00:00-03:00 slots), app fees only on `source='app'`, a charge is never written for a cancelled reservation, a reversal mirrors its charge.
- Trigger `fee_ledger_guard`: only status columns change. Transitions are `accrued → voided | billed` and `billed → accrued` (statement cancelled); `voided` is terminal. The service period may move only while `accrued`.

### 6.3 Events

| Event | Ledger action | Key |
|---|---|---|
| App reservation created | `charge`, amount = app rate in effect at `reservations.created_at` | `res:<reservation>:charge` |
| Panel reservation created | nothing (free) | |
| Lesson session, basis `per_session` | `charge` for the session at the lesson's snapshotted rate | `ls:<session>:charge` |
| Lesson, basis `per_lesson` | one `charge`, on `session_no = 1` | `lesson:<lesson>:charge` |
| Lesson, basis `per_enrolled_student_session` | one `charge` per enrolled student, written by a job at session start | `ls:<session>:enr:<enrollment>:charge` |
| **Reservation cancelled (any party, before or after the deadline)** | accrued charges → `voided` (`player_cancelled`, `club_cancelled`, `coach_cancelled`, `admin_cancelled`, `system_cancelled`; `lesson_session_cancelled` for lesson sessions) | |
| Cancelled after the charge was billed | `reversal` of `-amount` in the current Istanbul month | `rev:<charge>` |
| Account deletion cancels future bookings | void with `account_deleted` | |
| `no_show` | kept, unless `billing_policies.charge_no_show = false` → `app.settle_no_show_fee()` voids with `no_show_waived` | |
| `completed` | kept | |
| Reschedule | accrued charge moves to the new `service_date`/`billing_period`; billed stays | |
| Admin waiver / duplicate | void with `admin_waiver` / `duplicate` + `audit_log` row | |

The billing period is the service month (Istanbul date of play), so almost every cancellation happens before billing and becomes a void rather than a reversal.

### 6.4 Monthly statement job (1st of month, 03:00 Istanbul)

For each club, in its own transaction:

1. `pg_advisory_xact_lock(hashtext('stmt:' || club_id || ':' || period))`; record `job_runs (job_name='monthly_statements', run_key='YYYY-MM')`.
2. `SELECT ... FROM fee_ledger_entries WHERE club_id=$1 AND billing_period=$2 AND status='accrued' FOR UPDATE`.
3. Compute totals and VAT from the policy. Insert `monthly_statements` (partial unique index on `(club_id, period_start) WHERE status <> 'cancelled'` makes a rerun fail safely), one `statement_lines` row per entry, set entries to `billed`.
4. Notify owners (`statement_issued`), write `audit_log` with scope `system`.

Afterwards: a daily job marks `issued` statements past `due_date` as `overdue`. An admin marks paid (`paid_at`, `paid_amount_kurus`, `payment_reference`, `marked_paid_by`, audit row). Cancelling a wrong statement returns its entries to `accrued` so it can be regenerated.

## 7. Security and multi-tenancy

- The migration role owns every table. The server connects as `ralo_app`: `NOSUPERUSER NOBYPASSRLS`, owns nothing (the test asserts all three). Operators run `ALTER ROLE ralo_app LOGIN PASSWORD '...'` per environment.
- RLS is enabled on every table. `ralo_app` has one permissive policy per table; other roles see nothing.
- **Tenant backstop:** `club_memberships`, `club_staff_invites`, `courts`, `coach_club_contracts`, `club_opening_hours`, `club_amenities`, `court_bookings`, `court_blocks`, `reservations`, `lessons`, `coach_student_notes`, `fee_ledger_entries`, `monthly_statements` and `audit_log` carry a RESTRICTIVE policy `app.club_in_scope(club_id)`. Each API transaction sets the scope:
  - `SET LOCAL app.scope = 'club:<uuid>'` for club panel and coach requests (another club's rows are invisible and cannot be written; `42501`);
  - `SET LOCAL app.scope = 'global'` for player, platform admin and background job requests;
  - unset scope sees no rows on those tables (fails closed).
  `SET LOCAL` is transaction-scoped and therefore safe with the Supavisor transaction pooler.
- Append-only history: `audit_log`, `platform_fee_rates`, `billing_policies` reject UPDATE/DELETE by trigger (for owners too) and `ralo_app` has no UPDATE/DELETE grant on them. `ralo_app` cannot DELETE ledger, statements, venue payments, consent records, legal documents or Elo events.
- `rate_limit_counters` is UNLOGGED; it must only be used through the primary / pooler connection, never a read replica (Supabase does not replicate UNLOGGED data).

## 8. KVKK: anonymization instead of deletion

`app.anonymize_user(user, processed_by)` runs in one transaction (scope `global`):

1. Refuses platform admins, active club owners and coaches with future lesson sessions (`anonymize_refused:<reason>`).
2. Leaves other players' upcoming matches (counter decrement + waitlist promotion); removes waitlist rows and pending join requests.
3. Removes lesson enrollments through the normal cancellation path.
4. Cancels the user's upcoming app/panel reservations; fees are voided with `account_deleted`.
5. Deletes messages, feed posts/replies/likes (recounting), friendships, favorites, notifications, sessions, email link tokens, open staff invites, coach notes about the user; clears the coach profile and ends coach contracts.
6. Leaves conversations; drops direct conversations left with fewer than two people.
7. Revokes staff memberships.
8. Rewrites the user row (`email`, `password_hash`, `phone` set to NULL, `Silinmiş Kullanıcı`, preferences cleared, `status='deleted'`).
9. Keeps past reservations, ledger, statements, venue payments, Elo history, `audit_log`; consent records keep only the email HMAC.
10. Completes the deletion request and writes an audit row.

Hard `DELETE FROM users` is refused by the RESTRICT foreign keys on history rows. `schema.test.ts` introspects every foreign key to `users(id)` and fails when one is neither handled by `anonymize_user` (and named in its body) nor declared retained history, so a new personal-data table cannot be forgotten silently.

## 9. Multi-instance behaviour

- Accounts sign in with a lowercase, unique email and a scrypt password hash (0010); the phone is an optional contact field. Sessions, single-use email link tokens (`auth_tokens`: sha256 of the emailed token, only the newest link per user and purpose), rate limits and job bookkeeping are shared tables; restarts lose nothing.
- Jobs take `pg_try_advisory_xact_lock(hashtext(job_name))` and record `job_runs`; reminders deduplicate through `notifications (user_id, dedupe_key)`.
- Use only transaction-scoped advisory locks in the app (transaction pooler). The migration runner uses a session-level `pg_advisory_lock` and therefore refuses port 6543.
- Retry transactions on `40001`/`40P01`. Map `23P01` to the court conflict 409 and capacity `23514` to "Maç dolu" / "Ders kontenjanı dolu".

## 10. Migration runner

`server/db/migrate.ts`:

- Files `NNNN_snake_case.sql`, applied in order; each file and its `app.schema_migrations` row commit in one transaction. Files must not contain `BEGIN`/`COMMIT`.
- `pg_advisory_lock` serializes instances starting at the same time; the applied list is read after the lock is held.
- A SHA-256 checksum (line endings normalized) detects edits to applied migrations.
- Accepts any client with `query`/`exec` (a `pg.Client` via `fromPgClient`, or PGlite in tests). TLS is verified like the app pool (`DATABASE_SSL_CA`, `DATABASE_SSL_REJECT_UNAUTHORIZED`).

## 11. Import from the jsonb mirror (next round)

1. Users: lowercase emails; rows without an email (panel "ghosts") become `guest_name`/`guest_phone` on their reservations; password hashes come from the `credentials` collection.
2. Businesses → `clubs` + 7 `club_opening_hours` rows (`"24:00"` → 1440, `"01:00"` → 1500); `cancellation_window_hours` 24.
3. Staff → `club_memberships`; courts `pricePerHour × 100`.
4. Reservations: `($ts::timestamp AT TIME ZONE 'Europe/Istanbul')`, booking + reservation with `legacy_id` (exempt from the fee requirement); overlaps fail the EXCLUDE constraint and are resolved by hand.
5. No ledger backfill; fees start at launch through `effective_from`.

## 12. Database review: how each issue was handled

| Severity | Issue | Outcome |
|---|---|---|
| critical | No guarantee an app reservation has a fee charge | Accepted: deferred constraint trigger `trg_reservation_requires_fee` (legacy imports exempt). |
| critical | ON UPDATE CASCADE composite FKs for copies; non-deferrable EXCLUDE | Accepted: copies maintained by triggers from `court_bookings`; EXCLUDE is `DEFERRABLE INITIALLY IMMEDIATE`. |
| high | RLS with no policies and an unclear app role | Accepted: `ralo_app` NOBYPASSRLS/non-owner (tested), permissive policies plus RESTRICTIVE club-scope policies on the high-risk tables. Player-level row isolation (a player seeing only their own rows) stays in the API; see open decisions. |
| high | Lesson fee basis could change mid-series | Accepted: rate and basis snapshotted on `lessons`. |
| high | Anonymization coverage relies on a hand-maintained list | Accepted: introspection test over all FKs to `users(id)`. |
| medium | Deferrable waitlist uniqueness and renumbering | Accepted: sparse positions, never renumbered, plain UNIQUE. |
| medium | Ledger service_date not tied to the Istanbul play date | Accepted: `fee_ledger_validate` trigger + `billing_period` CHECK. |
| medium | Missing indexes | Accepted: `lesson_attendance_enrollment_idx`, `court_blocks_club_active_idx` (plus `reservations_court_idx`, `elo_events_reservation_idx`). |
| medium | pending_approval implicitly does not reserve capacity | Accepted as documentation (4.3, open decision 8). |
| low | avatar_url accepts any https URL | Not changed in SQL: the Storage project host differs per environment, so the allowlist belongs in the upload API. Recorded as an open item. |
| low | UNLOGGED rate limits vs replicas | Documented (section 7). |

## 13. Open decisions

Each is configurable or isolated in the schema; the product answer is still needed.

1. **Elo result confirmation:** implemented (any player submits within 7 days, opposing team confirms or disputes, automatic after 48 h, casual and competitive matches both count, `matches_count` = confirmed rated matches). Still open: moderation of repeated disputes.
2. **Lesson fee amounts and basis per club:** a club has no lessons until a `lesson` rate row is inserted for it (`per_session`, `per_lesson` or `per_enrolled_student_session`).
3. **No-show fee:** `billing_policies.charge_no_show` (default true).
4. **VAT and invoicing:** `amounts_include_vat` (no default), e-Arşiv/e-Fatura provider, whether the statement is the invoice (`invoice_reference`).
5. **Billing basis:** service month (implemented) vs booking month.
6. **Payment terms:** due days (15; a daily job marks overdue statements and notifies owners), overdue consequences (implemented: app bookings are suspended automatically 7 days after the due date and reopen when the statement is paid or cancelled; `clubs.booking_suspended_reason`), partial payments, zero-total statements.
7. **Rescheduling:** allowed (keeps the charge, implemented) or cancel and rebook.
8. **Open matches:** `pending_approval` does not reserve capacity; the organizer approves (lowest free seat, refused when full) or rejects. Still open: auto-promotion vs time-limited waitlist offers.
9. **Coach contracts:** club owners create them in the panel (active immediately, invite email for new accounts) and end them when no sessions are upcoming. Still open: coach verification (`coach_profiles.is_verified`).
10. **Lesson rules:** students may cancel at any time; the waitlist is promoted automatically; optional Elo gates per lesson. Still open: a student cancellation window.
11. **Gender preference:** needs `users.gender` and a purpose in the KVKK disclosure.
12. **Friends:** directed follow (current) vs mutual.
13. **Panel walk-ins:** `guest_name`/`guest_phone` on the reservation (implemented) vs a club customer book.
14. **Retention periods:** consent after deletion, ledger/statements (likely 10 years under VUK), messages, audit log, venue payments.
15. **Reviews and ratings:** implemented (`club_reviews`, one per player who played at the club; triggers keep `rating_avg`/`reviews_count` current). Still open: moderation beyond admin removal.
16. **Multi-club staff UI:** how the active club is chosen (it also sets `app.scope`).
17. **Player-level RLS:** whether to add per-user policies (`app.user_id` GUC) on messages, notifications and participants, beyond the club tenant backstop. The server runs as `ralo_app` with `app.scope` defaulting to `global` per pooled connection; CI runs the full suite that way on Postgres.
18. **Avatar URL allowlist:** avatars are inline data URLs or https URLs validated by the API; club and court photos are stored in `media_assets` (no external storage).
19. **Time zone:** `Europe/Istanbul` is a literal; expanding abroad needs per-club zones.
20. **Slot granularity:** app/panel reservations are 60/90/120 minutes; alignment to :00/:30 and the 14-day block maximum need confirming.
21. **Push notifications:** implemented (`push_subscriptions`, `notifications.pushed_at` outbox, endpoints restricted to browser push services).
