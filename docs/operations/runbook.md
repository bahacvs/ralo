# RALO Operations Runbook

Short, practical reference for running RALO in staging and production.
UI copy is Turkish; this document is for the operators.

## 1. Architecture in one paragraph

A single Node process (`dist/server.cjs`, built from `server.ts`) serves the API and the built
React app. All data lives **in memory** and is mirrored to Postgres (one `jsonb` row per record,
one table per collection, see `server/persistence.ts`). Writes are debounced (about 20 ms) and
flushed on `SIGTERM`. Because memory is the source of truth while running, **the service must run
as exactly one instance**. Never scale horizontally and never point two services at the same
database.

## 2. Environments

| | Staging | Production |
|---|---|---|
| App host | Render web service `ralo-staging` (Frankfurt, starter) | Render web service `ralo` (Frankfurt, `numInstances: 1`) |
| Database | Separate Supabase project, Frankfurt (`eu-central-1`) | Separate Supabase project, Frankfurt, Pro plan (backups + PITR) |
| SMS | Netgsm, same account is fine, or `SMS_PROVIDER=console` with `DEMO_MODE=true` for internal testing only | Netgsm, `SMS_PROVIDER=netgsm` |
| Demo mode | May be `true` for internal demos | **Always `false`** |
| Deploys | Auto-deploy from `main` | Manual deploy (or auto-deploy from a release branch) after staging is verified |

`render.yaml` describes the production service. For staging, create a second service from the
same blueprint with a different name and its own env vars and database. Never share a database
between staging and production.

## 3. Environment variables

"Render (plain)" means the value is committed in `render.yaml`. "Render (secret)" means
`sync: false` in `render.yaml`: set it in Render dashboard > service > Environment.

| Variable | Purpose | Where to set | Production value |
|---|---|---|---|
| `NODE_ENV` | `production` serves `dist/`, requires `DATABASE_URL`, makes Netgsm the default SMS provider | Render (plain) | `production` |
| `TZ` | Process timezone. `server/time.ts` also forces `Europe/Istanbul`; set it anyway so logs match | Render (plain) | `Europe/Istanbul` |
| `PORT` | HTTP port (default 3000). Render injects it automatically | Render injects; `.env` locally | leave unset |
| `DATABASE_URL` | Postgres connection string. Empty = JSON file store in `data/` (development only). Server refuses to start in production without it | Render (secret); `.env` locally | Supabase **session pooler** URL (see section 6) |
| `DATABASE_SSL_CA` | PEM of the database CA certificate. Remote connections verify the TLS certificate; Supabase's CA is not in Node's trust store, so without it the connection fails. Newlines may be written as `\n` | Render (secret) | Supabase project CA certificate (section 6) |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` disables certificate verification. Emergency workaround only; logs a warning on boot | Render (plain), normally unset | unset (`true`) |
| `DATABASE_MIGRATION_URL` | Connection used by `bun run db:migrate` for the SQL schema (section 12). Falls back to `DATABASE_URL` | local shell / CI job only | session pooler URL, port `5432` |
| `OTP_GLOBAL_LIMIT_PER_10MIN` | Maximum OTP SMS sends across all clients per 10 minutes, protects the Netgsm bill. Per-IP limit (10/hour) is fixed in code | Render (plain) | `300`, raise only with evidence |
| `APP_URL` | Public URL used in share links | Render (secret) | `https://<production domain>` |
| `DEMO_MODE` | `true` exposes the role switcher API, echoes OTP codes to the client, seeds/refreshes demo data on boot, allows console SMS in production | Render (plain) | `false` |
| `VITE_DEMO_MODE` | **Build-time** flag that shows the demo role switcher in the UI. Baked into the bundle, so changing it needs a rebuild/redeploy. Keep equal to `DEMO_MODE` | Render (plain) | `false` |
| `SMS_PROVIDER` | `netgsm` or `console` (prints codes to the log) | Render (plain) | `netgsm` |
| `NETGSM_USERCODE` | Netgsm API sub-user name | Render (secret) | from Netgsm |
| `NETGSM_PASSWORD` | Netgsm API sub-user password | Render (secret) | from Netgsm |
| `NETGSM_MSGHEADER` | Approved sender name (originator) | Render (secret) | approved header, exact spelling |
| `GEMINI_API_KEY` | Optional. AI captions on match share cards; a local generator is used when empty | Render (secret) | optional |
| `DISABLE_HMR` | Development only (Vite HMR off). Ignored in production | local only | unset |

Rules:
- Secrets never go into `render.yaml`, `.env.example` or git. `.env` is local only.
- After changing any `VITE_*` variable, trigger a full redeploy (build), not just a restart.

## 4. First deploy (per environment)

1. **Supabase**: create the project (section 6), copy the session pooler connection string.
2. **Netgsm**: complete the checklist in section 5.
3. **Render**: New > Blueprint, select the repo, it reads `render.yaml`.
   Confirm region Frankfurt, plan starter or higher, instances = 1.
4. Fill the secret env vars: `DATABASE_URL`, `DATABASE_SSL_CA`, `APP_URL`, `NETGSM_USERCODE`,
   `NETGSM_PASSWORD`, `NETGSM_MSGHEADER`, optionally `GEMINI_API_KEY`.
5. Deploy. Build command: `npm install --include=dev && npm run build`. Start: `npm start`.
6. Tables are created automatically on boot (`CREATE TABLE IF NOT EXISTS`, one per collection).
7. Verify (section 7). On an empty production database the log shows
   `Database is empty. Import data with "bun run db:import <file>" or add businesses before going live.`
   This is expected. Clubs are then added from the super-admin panel, or imported (section 8).
8. Add the custom domain in Render, wait for TLS, then set `APP_URL` to it and redeploy.
9. Log in with a real phone number and confirm the OTP SMS arrives.

## 5. Netgsm checklist

- [ ] Corporate Netgsm account, invoice details complete.
- [ ] **API sub-user** created (Netgsm panel > Abonelik / Alt kullanıcılar) with API access enabled.
      Use the sub-user credentials, not the main panel login.
- [ ] **No IP restriction** on the sub-user. Render has no fixed outbound IP on the starter plan,
      so an IP allowlist causes error code `30`.
- [ ] **Sender name (msgheader) approved** by Netgsm/BTK. `NETGSM_MSGHEADER` must match it exactly
      (error `40`/`41` otherwise).
- [ ] **OTP SMS package** purchased and active (error `60` otherwise). The app uses the OTP endpoint
      `https://api.netgsm.com.tr/sms/send/otp`. OTP messages cannot contain Turkish characters;
      the template in `server/sms.ts` is already ASCII.
- [ ] Rate limit is 100 OTP/minute (error `80`). Low balance alerts configured in the Netgsm panel.
- [ ] Test send from staging to a real number succeeds.

Failures are logged as `OTP SMS delivery failed: Netgsm OTP failed (code NN): <reason>`.

## 6. Supabase settings

- **Region**: Frankfurt (`eu-central-1`), same region as Render, keeps latency low and data in the EU.
- **Connection string for Render**: Project > Connect > **Session pooler** (port `5432`, host like
  `aws-0-eu-central-1.pooler.supabase.com`, user `postgres.<project-ref>`).
  - Do not use the direct connection (`db.<ref>.supabase.co`): it is IPv6-only and Render cannot reach it.
  - Do not use the transaction pooler (port `6543`): the app uses explicit `BEGIN/COMMIT` blocks on
    pooled clients, which want session semantics.
  - TLS is required and the certificate is **verified** for every non-localhost URL. Download the
    project CA certificate (Project settings > Database > SSL configuration > Download certificate)
    and put its PEM content in `DATABASE_SSL_CA`. An `sslmode=...` parameter in the URL is ignored
    (the app removes it so it cannot weaken verification).
  - If boot fails with a certificate error, the CA value is wrong or missing. Fix `DATABASE_SSL_CA`;
    use `DATABASE_SSL_REJECT_UNAUTHORIZED=false` only as a short emergency workaround.
  - URL-encode special characters in the password.
- **Pool size**: the app opens at most 5 connections (`max: 5`), well within the pooler limit.
- **Backups**: Pro plan gives daily backups. Enable **Point-in-Time Recovery** add-on for production
  (Project settings > Add-ons) so you can restore to any second within the retention window.
- **Security**: database password stored only in Render and the team password manager. Enable
  2FA for everyone in the Supabase organization. Row Level Security is not used by the app (it
  connects as the owner role); do not expose the Supabase anon key or PostgREST to clients.
- Supabase free projects pause after inactivity; production must be on a paid plan.

## 7. Verifying a deploy

1. Render events show the deploy as **Live** (Render itself polls `healthCheckPath: /api/health`).
2. `curl -fsS https://<domain>/api/health` returns `{"ok":true}`.
3. Render logs for the new instance contain, in order:
   - `Connected to Postgres.`
   - `RALO Server running on http://0.0.0.0:<PORT>`
   If `Connected to Postgres.` is missing, the process is not persisting. Treat as an incident.
   `Failed to start server: Error: DATABASE_URL is required in production` means the secret is missing.
4. Logs of the **previous** instance end with `SIGTERM received, flushing pending data...` and no
   `Final flush failed:` line after it. A `Final flush failed:` line means recent writes may be lost:
   check the last reservations in the DB against what users report.
5. No repeating `Postgres flush failed, retrying:` or `Postgres pool error:` lines.
6. Smoke test: open the app, log in via SMS OTP, view a club's courts, open the club panel.
7. The demo role switcher is **not** visible and the login screen shows no demo OTP box.

## 8. Importing data

`scripts/db-import-json.ts` loads a JSON file in the old file-store format (collections as top-level
arrays) into Postgres.

```sh
# From a local checkout, with the target DATABASE_URL (use the session pooler URL)
DATABASE_URL="postgresql://..." bun run db:import data/ralo_db.json
```

- It runs the migrations first, then refuses to write if the database already has rows.
- `--force` overwrites: rows in the file are upserted and rows not in the file are **deleted**.
  Take a backup first.
- It prints the row count per collection and `Import complete.`
- **The server holds data in memory.** Import while the service is suspended (Render > Suspend),
  or restart it right after importing, otherwise the running instance will overwrite the import on
  its next flush. Resume/redeploy afterwards and verify (section 7).
- Never import demo seed data (`user_player_demo`, `biz_urla`, ...) into production.

## 9. Rollback

Code rollback (bad release, schema unchanged):
1. Render > service > Events > pick the last good deploy > **Rollback**.
   Alternatively `git revert` the bad commit on the deploy branch and let it deploy.
2. Verify (section 7).
3. Tables are created with `IF NOT EXISTS` and records are schemaless `jsonb`, so an older build
   reads newer data. If the bad release wrote malformed records, fix the data (section 10) rather
   than rolling back further.

Data rollback (bad release corrupted data):
1. Suspend the Render service so memory stops flushing.
2. Restore the database with PITR to a timestamp before the release (section 10). Note that
   everything written after that timestamp is lost; export the affected rows first if possible.
3. Roll back the code, resume the service, verify, and inform affected clubs.

## 10. Backup restore drill (do before launch, then quarterly)

Goal: prove we can restore production data and know how long it takes.

1. Note the time `T` and a few recent reservation ids from production.
2. In Supabase, restore production into a **new** project (Database > Backups > Restore to new project,
   or PITR to time `T`). Never restore over production during a drill.
3. Point the **staging** Render service's `DATABASE_URL` to the restored project (session pooler URL),
   set `DEMO_MODE=false`, deploy.
4. Verify section 7 on staging, confirm the noted reservation ids exist, compare row counts:
   ```sql
   SELECT 'users', count(*) FROM users UNION ALL
   SELECT 'businesses', count(*) FROM businesses UNION ALL
   SELECT 'reservations', count(*) FROM reservations;
   ```
5. Record: date, backup used, restore duration, data gap, problems. Restore staging's own
   `DATABASE_URL` and delete the temporary project (it contains personal data, KVKK).

## 11. Incident first response

1. **Acknowledge** in the team channel: what is broken, since when, who is on it.
2. **Health**: `curl https://<domain>/api/health`. Check Render status page and Supabase status page.
3. **Logs** (Render > Logs), search for:
   - `Failed to start server` (boot failure: env var or database unreachable)
   - `Postgres flush failed, retrying` / `Postgres pool error` (database connectivity, writes at risk)
   - `OTP SMS delivery failed` (Netgsm: see the code table in section 5; check balance and package)
   - `Final flush failed` (data possibly lost on the last restart)
4. **Database down**: do not restart the service repeatedly. The running instance keeps data in
   memory and retries flushing every 2 s; a restart while the DB is down loses unflushed writes and
   fails to boot. Wait for Supabase to recover and confirm the retry messages stop.
5. **Bad deploy**: roll back (section 9).
6. **Instance count**: confirm Render shows exactly 1 instance. Two instances corrupt data.
7. **Logins failing**: check Netgsm balance, OTP package, sender name, and that `SMS_PROVIDER=netgsm`.
8. **Security incident / data leak**: rotate `DATABASE_URL` password and Netgsm password, redeploy,
   preserve logs. KVKK requires notifying the Board within 72 hours of learning of a breach; involve
   the legal contact immediately.
9. **Afterwards**: short written post-mortem (timeline, impact on clubs/reservations, fee
   statements affected, fixes).

## 12. Production SQL schema (Phase 2, not yet used by the app)

`server/db/migrations/0001-0009` define the relational schema that replaces the jsonb mirror:
overlap-proof court bookings, the platform fee ledger, monthly statements, lessons, KVKK
anonymization and club-scoped row-level security. **The running app does not read or write these
tables yet**; that switch is the next development round. Until then, the steps below are only for
trying the schema against a real Supabase project (staging).

Design and rules: `docs/architecture/data-model.md`. Tests: `npx tsx server/db/schema.test.ts`
(PGlite, also run in CI).

**Run migrations**

```sh
DATABASE_MIGRATION_URL="postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
DATABASE_SSL_CA="$(cat supabase-ca.crt)" \
bun run db:migrate
```

- Use the session pooler on port `5432` (migrations need session semantics and advisory locks).
- The runner takes a `pg_advisory_lock`, so several instances or CI jobs cannot apply migrations
  at the same time. Each migration runs in its own transaction; a second run applies nothing.
- Run it once on a **staging** Supabase project before any production use. Tests ran on PGlite
  (Postgres 17); Supabase-specific behaviour (extensions in the `extensions` schema, creating the
  `ralo_app` role) has not been verified yet.

**After the first migration (per environment)**

1. Give the application role a password and use it for the app's connection string later:
   ```sql
   ALTER ROLE ralo_app LOGIN PASSWORD '<generated, stored in the password manager>';
   ```
   `ralo_app` is not a superuser, has no `BYPASSRLS` and owns no tables. Every API transaction must
   run `SET LOCAL app.scope = 'club:<uuid>'` (club panel, coaches) or `'global'` (players, admin,
   jobs); without it the club-scoped tables return no rows.
2. Create the first platform admin (from the admin tooling once it exists).
3. Insert the platform-wide app reservation fee (100 TL = `10000` kuruş) and the global billing
   policy. VAT inclusion (`amounts_include_vat`) must be decided with the accountant first.
4. Lesson fees are per club: set them for each club before that club can create lessons.

**Fee rules enforced by the database**

- Only reservations made by players in the app are charged; club panel entries are free.
- A cancelled reservation is never charged, whoever cancels. If the fee was already on a monthly
  statement, a reversal entry is added so the club's net is zero.
- One fee entry per reservation (duplicate inserts fail), and the fee's service date must match the
  reservation's Istanbul local date.
