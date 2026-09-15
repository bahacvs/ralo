# RALO Go-Live Checklist

There is no pilot: RALO launches directly to production, Turkey-wide, for many clubs.
Every box must be ticked (or explicitly waived by the owner, with a note) before the domain is
announced. Details for each item are in [runbook.md](runbook.md).

## 1. Legal and compliance

- [ ] KVKK Aydınlatma Metni approved by legal and published in the app.
- [ ] Açık Rıza Metni (explicit consent, where needed) approved and shown at signup.
- [ ] Kullanıcı Sözleşmesi / Kullanım Koşulları approved and published.
- [ ] Gizlilik ve Çerez Politikası approved and published.
- [ ] Club agreement (kulüp sözleşmesi) approved: 100 TL fee per app reservation, monthly statement,
      payment by bank transfer, the club-cancellation fee rule, the player cancellation window.
- [ ] Coach agreement / lesson fee terms approved (per-lesson platform fee).
- [ ] Commercial electronic message (İYS) position decided; verification and password emails are transactional only.
- [ ] VERBİS registration obligation checked with legal.
- [ ] Account deletion (KVKK) tested end to end on staging.
- [ ] Data breach contact and 72-hour KVKK notification process known to the team.

## 2. Product and fee settings (super-admin panel)

- [ ] Platform owner super-admin account exists and uses a real email address and a strong password.
- [ ] App reservation fee set to **100 TL** per reservation made through the app.
- [ ] Manually entered club-panel reservations confirmed to incur **no** fee.
- [ ] Decision recorded and configured: does a **club-cancelled** app reservation still incur the fee?
- [ ] Default player cancellation window configured (default 24h) and per-club overrides reviewed.
- [ ] Lesson platform fee amount configured (decision recorded; not hardcoded).
- [ ] Elo change rules decided and configured.
- [ ] Bank account (IBAN) and statement text shown on monthly club statements verified.
- [ ] First monthly statement generation tested on staging; "mark as paid" flow tested.
- [ ] Clubs onboarded via super-admin panel: name, city, courts, prices, hours, owner and staff
      accounts with correct roles.
- [ ] Coaches linked to their clubs; lesson creation blocks the court slot (tested on staging).

## 3. Production configuration

- [ ] Render service in Frankfurt, **exactly 1 instance**, plan starter or higher.
- [ ] `NODE_ENV=production`, `TZ=Europe/Istanbul`.
- [ ] **`DEMO_MODE=false`**.
- [ ] **`VITE_DEMO_MODE=false`** and the production build was made with it (redeploy after any change).
- [ ] `MAIL_PROVIDER=smtp`; `SMTP_USER`, `SMTP_PASS` (Gmail app password) and `MAIL_FROM` set as secrets.
- [ ] `DATABASE_URL` is the Supabase **session pooler** URL of the **production** project.
- [ ] `APP_URL` is the final production domain (https); links in emails point there.
- [ ] `GEMINI_API_KEY` set or intentionally left empty.
- [ ] No secrets in git, `render.yaml` or `.env.example`.
- [ ] Custom domain active with TLS; `www`/apex redirect decided.

## 4. Data

- [ ] Production database contains **no seeded demo data**. Both queries return 0:
      ```sql
      SELECT count(*) FROM users      WHERE id LIKE '%_demo';
      -- every seeded demo club id starts with biz_; real clubs added through the admin panel do not
      SELECT count(*) FROM businesses WHERE id LIKE 'biz\_%';
      ```
- [ ] Boot log did **not** contain `seeding demo data` or `Seed data successfully generated`.
- [ ] Test accounts and test reservations created during verification removed (through the app, so
      the in-memory state stays consistent).
- [ ] Any imported data went through `bun run db:import` with the service suspended (runbook 8).

## 5. Infrastructure and operations

- [ ] Supabase production project in Frankfurt, paid plan, daily backups on, **PITR enabled**.
- [ ] Backup restore drill completed and recorded (runbook 10).
- [ ] Email checklist complete: dedicated RALO Gmail, 2-Step Verification, app password, daily
      sending limit understood (runbook 5).
- [ ] 2FA enabled on Render, Supabase, the RALO Gmail account, GitHub and domain registrar accounts.
- [ ] CI (`.github/workflows/ci.yml`) green on the commit being deployed.
- [ ] Rollback procedure rehearsed once on staging (runbook 9).
- [ ] Uptime monitor on `https://<domain>/api/health` alerting the on-call person.
- [ ] Incident owner and escalation contacts written down (runbook 11).

## 6. Launch-day verification

- [ ] Deploy is Live; `/api/health` returns `{"ok":true}`.
- [ ] Log shows `Connected to Postgres.` and `RALO Server running on ...`.
- [ ] Previous instance logged `SIGTERM received, flushing pending data...` without `Final flush failed`.
- [ ] Real sign-up works: verification email arrives, the link verifies, password reset works; no demo role switcher.
- [ ] One real app reservation at a live club appears in that club's panel and in the fee ledger;
      then cancel it and confirm the fee behaviour matches the configured rule.
- [ ] One manual panel reservation confirmed to create no fee.
- [ ] PWA installs on iOS and Android; times shown in Turkey local time.
- [ ] Logs watched for the first hour: no `Postgres flush failed`, `Email delivery failed` spikes.
