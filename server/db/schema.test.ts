// Schema tests: applies every migration to an in-process PGlite (Postgres 17 in WASM) and checks the
// invariants the database itself must enforce. Run: npx tsx server/db/schema.test.ts
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { runMigrations, loadMigrations } from './migrate.js';

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${err instanceof Error ? err.message : String(err)}`);
    await db.exec('ROLLBACK').catch(() => {});
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Runs `fn` and requires it to fail with the given SQLSTATE (and optional message fragment). */
async function expectSqlError(fn: () => Promise<unknown>, code: string, fragment?: string) {
  let error: any;
  try {
    await fn();
  } catch (err) {
    error = err;
  }
  await db.exec('ROLLBACK').catch(() => {});
  assert(error, `expected SQLSTATE ${code}, but the statement succeeded`);
  assertEqual(error.code, code, `unexpected SQLSTATE (${error.message})`);
  if (fragment) assert(String(error.message).includes(fragment), `error "${error.message}" lacks "${fragment}"`);
}

async function one<T = any>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}

async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('BEGIN');
  try {
    const result = await fn();
    await db.exec('COMMIT');
    return result;
  } catch (err) {
    await db.exec('ROLLBACK').catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let phoneSeq = 1000;
async function createUser(name: string): Promise<string> {
  phoneSeq++;
  const row = await one<{ id: string }>(
    `INSERT INTO app.users (phone, display_name, masked_name) VALUES ($1, $2, $3) RETURNING id`,
    [`90532000${phoneSeq}`, name, `${name.slice(0, 1)}.`]
  );
  return row.id;
}

async function createClub(slug: string, adminId: string, districtId: number): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO app.clubs (name, slug, city_id, district_id, address, created_by, approved_by, approved_at, is_active)
     VALUES ($1, $1, 34, $2, 'Test adresi', $3, $3, now(), true) RETURNING id`,
    [slug, districtId, adminId]
  );
  return row.id;
}

async function createCourt(clubId: string, name: string): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO app.courts (club_id, name, court_type, surface, hourly_price_kurus)
     VALUES ($1, $2, 'indoor_panoramic', 'artificial_grass', 120000) RETURNING id`,
    [clubId, name]
  );
  return row.id;
}

async function insertBooking(clubId: string, courtId: string, startsAt: string, endsAt: string, kind = 'reservation') {
  return one<{ id: string }>(
    `INSERT INTO app.court_bookings (club_id, court_id, kind, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [clubId, courtId, kind, startsAt, endsAt]
  );
}

/** The production write path for an app reservation: booking, reservation, organizer, fee charge. */
async function createAppReservation(clubId: string, courtId: string, ownerId: string, startsAt: string, endsAt: string) {
  return tx(async () => {
    const booking = await insertBooking(clubId, courtId, startsAt, endsAt);
    const res = await one<{ id: string }>(
      `INSERT INTO app.reservations (booking_id, source, owner_user_id, total_price_kurus)
       VALUES ($1, 'app', $2, 120000) RETURNING id`,
      [booking.id, ownerId]
    );
    await db.query(
      `UPDATE app.reservations SET active_participant_count = 1 WHERE id = $1`, [res.id]
    );
    await db.query(
      `INSERT INTO app.reservation_participants (reservation_id, user_id, status, slot_index, is_organizer)
       VALUES ($1, $2, 'active', 0, true)`,
      [res.id, ownerId]
    );
    const charge = await one<{ id: string }>(`SELECT app.charge_app_reservation($1) AS id`, [res.id]);
    return { bookingId: booking.id, reservationId: res.id, chargeId: charge.id };
  });
}

async function cancelReservation(reservationId: string, party: string, actorId: string | null = null) {
  await db.query(
    `UPDATE app.reservations SET status = 'cancelled', cancelled_at = now(), cancelled_by_party = $2,
            cancelled_by_user_id = $3 WHERE id = $1`,
    [reservationId, party, actorId]
  );
}

async function charge(reservationId: string) {
  return one<{ id: string; status: string; void_reason: string | null; amount_kurus: number; service_date: string;
               billing_period: string }>(
    `SELECT id, status, void_reason, amount_kurus, service_date::text, billing_period::text
     FROM app.fee_ledger_entries WHERE reservation_id = $1 AND entry_type = 'charge'`,
    [reservationId]
  );
}

async function main() {
  await db.waitReady;
  console.log('Applying migrations to PGlite...');
  const first = await runMigrations(db);
  assertEqual(first.applied.length, loadMigrations().length, 'every migration applies on an empty database');

  const admin = await createUser('Admin');
  await db.query(`INSERT INTO app.platform_admins (user_id) VALUES ($1)`, [admin]);
  const player = await createUser('Oyuncu');
  const player2 = await createUser('Rakip');
  const coach = await createUser('Antrenor');
  const district = await one<{ id: number }>(
    `INSERT INTO app.districts (city_id, name, slug) VALUES (34, 'Kadıköy', 'kadikoy') RETURNING id`
  );
  const clubA = await createClub('club-a', admin, district.id);
  const clubB = await createClub('club-b', admin, district.id);
  const courtA1 = await createCourt(clubA, 'Kort 1');
  const courtA2 = await createCourt(clubA, 'Kort 2');
  const courtB1 = await createCourt(clubB, 'Kort 1');
  const appRate = await one<{ id: string }>(
    `INSERT INTO app.platform_fee_rates (fee_type, club_id, amount_kurus, effective_from, created_by)
     VALUES ('app_reservation', NULL, 10000, now(), $1) RETURNING id`,
    [admin]
  );
  await db.query(
    `INSERT INTO app.billing_policies (club_id, effective_from, amounts_include_vat, created_by)
     VALUES (NULL, now(), false, $1)`,
    [admin]
  );

  console.log('Running schema tests...');

  await test('migrations are recorded and a rerun applies nothing', async () => {
    const again = await runMigrations(db);
    assertEqual(again.applied.length, 0, 'rerun applied count');
    const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM app.schema_migrations`);
    assertEqual(count.n, loadMigrations().length, 'schema_migrations rows');
  });

  // --- Court time -----------------------------------------------------------

  const slotStart = '2030-10-10T19:00:00+03:00';
  const slotEnd = '2030-10-10T20:30:00+03:00';
  const first1 = await createAppReservation(clubA, courtA1, player, slotStart, slotEnd);

  await test('overlapping active bookings on the same court are rejected (23P01)', async () => {
    await expectSqlError(
      () => insertBooking(clubA, courtA1, '2030-10-10T20:00:00+03:00', '2030-10-10T21:00:00+03:00'),
      '23P01'
    );
    await expectSqlError(
      () => createAppReservation(clubA, courtA1, player2, '2030-10-10T18:30:00+03:00', '2030-10-10T19:30:00+03:00'),
      '23P01'
    );
  });

  await test('adjacent slots and other courts at the same time are allowed', async () => {
    const adjacent = await insertBooking(clubA, courtA1, slotEnd, '2030-10-10T21:30:00+03:00', 'block');
    const otherCourt = await insertBooking(clubA, courtA2, slotStart, slotEnd, 'block');
    assert(adjacent.id && otherCourt.id, 'bookings created');
    await db.query(
      `UPDATE app.court_bookings SET is_active = false, released_at = now() WHERE id IN ($1, $2)`,
      [adjacent.id, otherCourt.id]
    );
  });

  await test('a booking cannot point at a court of another club', async () => {
    await expectSqlError(() => insertBooking(clubA, courtB1, slotStart, slotEnd), '23503');
  });

  await test('reservation copies are filled from its booking (city, court, time, deadline)', async () => {
    const r = await one(
      `SELECT r.club_id, r.court_id, r.city_id, r.local_date::text AS local_date, r.duration_minutes,
              r.cancellation_deadline = r.starts_at - interval '24 hours' AS deadline_ok
       FROM app.reservations r WHERE r.id = $1`,
      [first1.reservationId]
    );
    assertEqual(r.club_id, clubA, 'club');
    assertEqual(r.court_id, courtA1, 'court');
    assertEqual(r.city_id, 34, 'city');
    assertEqual(r.local_date, '2030-10-10', 'Istanbul local date');
    assertEqual(r.duration_minutes, 90, 'duration');
    assertEqual(r.deadline_ok, true, 'default 24h cancellation deadline');
  });

  await test('a cancelled booking frees the slot and cannot be reactivated', async () => {
    await cancelReservation(first1.reservationId, 'player', player);
    const booking = await one(`SELECT is_active FROM app.court_bookings WHERE id = $1`, [first1.bookingId]);
    assertEqual(booking.is_active, false, 'booking released');
    const again = await createAppReservation(clubA, courtA1, player2, slotStart, slotEnd);
    assert(again.reservationId, 'same slot can be booked again');
    await expectSqlError(
      () => db.query(`UPDATE app.reservations SET status = 'confirmed', cancelled_at = NULL WHERE id = $1`, [first1.reservationId]),
      '23514',
      'cannot be reactivated'
    );
    await cancelReservation(again.reservationId, 'club', admin);
  });

  await test('swapping two bookings works only with the no-overlap constraint deferred', async () => {
    const b1 = await insertBooking(clubA, courtA2, '2030-12-01T10:00:00+03:00', '2030-12-01T11:00:00+03:00', 'block');
    const b2 = await insertBooking(clubA, courtA2, '2030-12-01T11:00:00+03:00', '2030-12-01T12:00:00+03:00', 'block');
    await expectSqlError(
      () => db.query(`UPDATE app.court_bookings SET starts_at = '2030-12-01T11:00:00+03:00', ends_at = '2030-12-01T12:00:00+03:00' WHERE id = $1`, [b1.id]),
      '23P01'
    );
    await tx(async () => {
      await db.exec('SET CONSTRAINTS app.court_bookings_no_overlap DEFERRED');
      await db.query(`UPDATE app.court_bookings SET starts_at = '2030-12-01T11:00:00+03:00', ends_at = '2030-12-01T12:00:00+03:00' WHERE id = $1`, [b1.id]);
      await db.query(`UPDATE app.court_bookings SET starts_at = '2030-12-01T10:00:00+03:00', ends_at = '2030-12-01T11:00:00+03:00' WHERE id = $1`, [b2.id]);
    });
  });

  await test('rescheduling a booking moves the reservation copy and the accrued fee period', async () => {
    const r = await createAppReservation(clubA, courtA2, player, '2030-10-31T22:30:00+03:00', '2030-10-31T23:30:00+03:00');
    await expectSqlError(
      () => db.query(`UPDATE app.reservations SET starts_at = starts_at + interval '1 day' WHERE id = $1`, [r.reservationId]),
      '23514',
      'update the booking instead'
    );
    await db.query(
      `UPDATE app.court_bookings SET starts_at = '2030-11-01T01:00:00+03:00', ends_at = '2030-11-01T02:00:00+03:00' WHERE id = $1`,
      [r.bookingId]
    );
    const res = await one(`SELECT local_date::text AS d FROM app.reservations WHERE id = $1`, [r.reservationId]);
    assertEqual(res.d, '2030-11-01', 'reservation local date follows the booking');
    const c = await charge(r.reservationId);
    assertEqual(c.service_date, '2030-11-01', 'fee service date');
    assertEqual(c.billing_period, '2030-11-01', 'fee billing period');
  });

  await test('open match capacity is enforced by the database', async () => {
    const r = await createAppReservation(clubA, courtA2, player, '2030-10-12T19:00:00+03:00', '2030-10-12T20:00:00+03:00');
    await expectSqlError(
      () => db.query(`UPDATE app.reservations SET active_participant_count = 5 WHERE id = $1`, [r.reservationId]),
      '23514'
    );
  });

  // --- Fee ledger ------------------------------------------------------------

  await test('an app reservation gets exactly one 10000 kurus charge; charging is idempotent', async () => {
    const r = await createAppReservation(clubA, courtA1, player, '2030-10-15T19:00:00+03:00', '2030-10-15T20:00:00+03:00');
    const c = await charge(r.reservationId);
    assertEqual(c.amount_kurus, 10000, 'flat app reservation fee');
    assertEqual(c.status, 'accrued', 'status');
    const again = await one<{ id: string }>(`SELECT app.charge_app_reservation($1) AS id`, [r.reservationId]);
    assertEqual(again.id, r.chargeId, 'retry returns the same charge');
  });

  await test('a second fee ledger charge for the same reservation is rejected (23505)', async () => {
    const r = await createAppReservation(clubA, courtA1, player, '2030-10-16T19:00:00+03:00', '2030-10-16T20:00:00+03:00');
    await expectSqlError(
      () => db.query(
        `INSERT INTO app.fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, reservation_id, rate_id,
                                             amount_kurus, service_date, billing_period)
         VALUES ('manual-duplicate', $1, 'app_reservation', 'charge', $2, $3, 10000, '2030-10-16', '2030-10-01')`,
        [clubA, r.reservationId, appRate.id]
      ),
      '23505',
      'fee_ledger_one_charge_per_reservation'
    );
  });

  await test('an app reservation without a fee charge cannot commit', async () => {
    await expectSqlError(
      () => tx(async () => {
        const booking = await insertBooking(clubA, courtA1, '2030-10-17T19:00:00+03:00', '2030-10-17T20:00:00+03:00');
        await db.query(
          `INSERT INTO app.reservations (booking_id, source, owner_user_id, total_price_kurus) VALUES ($1, 'app', $2, 0)`,
          [booking.id, player]
        );
      }),
      '23000',
      'no platform fee charge'
    );
    const panel = await tx(async () => {
      const booking = await insertBooking(clubA, courtA1, '2030-10-17T19:00:00+03:00', '2030-10-17T20:00:00+03:00');
      return one<{ id: string }>(
        `INSERT INTO app.reservations (booking_id, source, guest_name, total_price_kurus)
         VALUES ($1, 'panel', 'Misafir', 120000) RETURNING id`,
        [booking.id]
      );
    });
    const panelFees = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.fee_ledger_entries WHERE reservation_id = $1`, [panel.id]
    );
    assertEqual(panelFees.n, 0, 'panel reservations are free');
  });

  await test('fee service_date must equal the Istanbul play date', async () => {
    const r = await tx(async () => {
      const booking = await insertBooking(clubA, courtA1, '2030-10-18T00:30:00+03:00', '2030-10-18T01:30:00+03:00');
      return one<{ id: string }>(
        `INSERT INTO app.reservations (booking_id, source, owner_user_id, total_price_kurus, legacy_id)
         VALUES ($1, 'app', $2, 0, 'legacy-1') RETURNING id`,
        [booking.id, player]
      );
    });
    // 00:30 Istanbul is still the previous day in UTC: the classic off-by-one the trigger catches.
    await expectSqlError(
      () => db.query(
        `INSERT INTO app.fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, reservation_id, rate_id,
                                             amount_kurus, service_date, billing_period)
         VALUES ('utc-date', $1, 'app_reservation', 'charge', $2, $3, 10000, '2030-10-17', '2030-10-01')`,
        [clubA, r.id, appRate.id]
      ),
      '23514',
      'Istanbul play date'
    );
  });

  // Product decision (a): a cancelled reservation never incurs the platform fee.
  await test('(a) cancelling voids the charge whoever cancels', async () => {
    const c1 = await charge(first1.reservationId);
    assertEqual(c1.status, 'voided', 'player cancellation voids');
    assertEqual(c1.void_reason, 'player_cancelled', 'player void reason');

    const parties = ['club', 'admin', 'system'];
    for (const [i, party] of parties.entries()) {
      const r = await createAppReservation(clubA, courtA1, player, `2030-10-2${i}T19:00:00+03:00`, `2030-10-2${i}T20:00:00+03:00`);
      await cancelReservation(r.reservationId, party);
      const c = await charge(r.reservationId);
      assertEqual(c.status, 'voided', `${party} cancellation voids`);
      assertEqual(c.void_reason, `${party}_cancelled`, `${party} void reason`);
    }

    // Late cancellation (after the 24h deadline) is also free.
    const late = await createAppReservation(clubA, courtA2, player, '2030-10-25T19:00:00+03:00', '2030-10-25T20:00:00+03:00');
    await db.query(`UPDATE app.reservations SET status = 'cancelled', cancelled_at = starts_at - interval '1 hour',
                           cancelled_by_party = 'player' WHERE id = $1`, [late.reservationId]);
    assertEqual((await charge(late.reservationId)).status, 'voided', 'late player cancellation voids');

    const policyColumns = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name = 'billing_policies' AND column_name LIKE '%cancel%'`
    );
    assertEqual(policyColumns.n, 0, 'no configurable charge-on-cancel setting exists');
  });

  await test('(a) a cancelled reservation cannot be charged afterwards', async () => {
    await expectSqlError(
      () => db.query(
        `INSERT INTO app.fee_ledger_entries (idempotency_key, club_id, fee_type, entry_type, reservation_id, rate_id,
                                             amount_kurus, service_date, billing_period)
         VALUES ('after-cancel', $1, 'app_reservation', 'charge', $2, $3, 10000, '2030-10-10', '2030-10-01')`,
        [clubA, first1.reservationId, appRate.id]
      ),
      '23514',
      'never incurs'
    );
    // A cancelled reservation that never had a charge (imported legacy row) cannot be charged either.
    const legacy = await tx(async () => {
      const booking = await insertBooking(clubA, courtA1, '2030-10-27T19:00:00+03:00', '2030-10-27T20:00:00+03:00');
      const res = await one<{ id: string }>(
        `INSERT INTO app.reservations (booking_id, source, owner_user_id, total_price_kurus, legacy_id)
         VALUES ($1, 'app', $2, 0, 'legacy-2') RETURNING id`,
        [booking.id, player]
      );
      await cancelReservation(res.id, 'player');
      return res;
    });
    await expectSqlError(() => db.query(`SELECT app.charge_app_reservation($1)`, [legacy.id]), '23514', 'never incurs');
  });

  await test('(a) cancelling after the charge was billed issues a reversal netting to zero', async () => {
    const r = await createAppReservation(clubA, courtA1, player, '2030-09-20T19:00:00+03:00', '2030-09-20T20:00:00+03:00');
    const stmt = await one<{ id: string }>(
      `INSERT INTO app.monthly_statements (statement_no, club_id, period_start, period_end, reservation_fee_count,
         reservation_fee_kurus, subtotal_kurus, vat_rate_bps, vat_kurus, total_kurus, due_date)
       VALUES ('RALO-203009-000001', $1, '2030-09-01', '2030-10-01', 1, 10000, 10000, 2000, 2000, 12000, '2030-10-16')
       RETURNING id`,
      [clubA]
    );
    await db.query(`UPDATE app.fee_ledger_entries SET status = 'billed', statement_id = $2 WHERE id = $1`, [r.chargeId, stmt.id]);
    await cancelReservation(r.reservationId, 'club');
    const rows = await db.query<{ entry_type: string; status: string; amount_kurus: number }>(
      `SELECT entry_type, status, amount_kurus FROM app.fee_ledger_entries WHERE reservation_id = $1 ORDER BY entry_type`,
      [r.reservationId]
    );
    assertEqual(rows.rows.length, 2, 'charge + reversal');
    assertEqual(rows.rows[0].status, 'billed', 'billed charge stays on its statement');
    assertEqual(rows.rows[1].entry_type, 'reversal', 'reversal written');
    assertEqual(rows.rows[0].amount_kurus + rows.rows[1].amount_kurus, 0, 'net fee is zero');
    await expectSqlError(
      () => db.query(`UPDATE app.fee_ledger_entries SET amount_kurus = 0 WHERE id = $1`, [r.chargeId]),
      '23001'
    );
  });

  // Product decision (b): the lesson platform fee is a per-club setting with effective-from history.
  const contract = await one<{ id: string }>(
    `WITH p AS (INSERT INTO app.coach_profiles (user_id) VALUES ($1))
     INSERT INTO app.coach_club_contracts (coach_user_id, club_id, status, starts_on, created_by)
     VALUES ($1, $2, 'active', '2026-01-01', $3) RETURNING id`,
    [coach, clubA, admin]
  );

  await test('(b) lesson creation is blocked until the club has a lesson fee', async () => {
    await expectSqlError(
      () => db.query(
        `INSERT INTO app.lessons (club_id, coach_user_id, contract_id, kind, title, capacity) VALUES ($1, $2, $3, 'group', 'Başlangıç', 8)`,
        [clubA, coach, contract.id]
      ),
      'P0002',
      'no lesson fee rate'
    );
  });

  await test('(b) lesson fee rates are per club with effective-from history; the app fee stays platform-wide', async () => {
    await db.query(
      `INSERT INTO app.platform_fee_rates (fee_type, club_id, amount_kurus, lesson_fee_basis, effective_from, created_by) VALUES
         ('lesson', $1, 5000, 'per_session', now(), $3),
         ('lesson', $1, 7000, 'per_session', now() + interval '10 days', $3),
         ('lesson', $2, 3000, 'per_session', now(), $3)`,
      [clubA, clubB, admin]
    );
    const rate = async (club: string, at: string) =>
      (await one<{ amount: number }>(
        `SELECT (app.resolve_fee_rate('lesson', $1, now() + $2::interval)).amount_kurus AS amount`, [club, at]
      )).amount;
    assertEqual(await rate(clubA, '1 minute'), 5000, 'club A today');
    assertEqual(await rate(clubA, '11 days'), 7000, 'club A after its change');
    assertEqual(await rate(clubB, '11 days'), 3000, 'club B has its own rate');
    const appFee = await one<{ amount: number }>(
      `SELECT (app.resolve_fee_rate('app_reservation', $1, now())).amount_kurus AS amount`, [clubB]
    );
    assertEqual(appFee.amount, 10000, 'app reservation fee is the same flat rate for every club');

    await expectSqlError(
      () => db.query(
        `INSERT INTO app.platform_fee_rates (fee_type, club_id, amount_kurus, effective_from, created_by)
         VALUES ('app_reservation', $1, 5000, now() + interval '1 day', $2)`, [clubA, admin]),
      '23514', 'platform_fee_rates_scope_chk'
    );
    await expectSqlError(
      () => db.query(
        `INSERT INTO app.platform_fee_rates (fee_type, club_id, amount_kurus, lesson_fee_basis, effective_from, created_by)
         VALUES ('lesson', NULL, 5000, 'per_session', now() + interval '1 day', $1)`, [admin]),
      '23514', 'platform_fee_rates_scope_chk'
    );
    await expectSqlError(
      () => db.query(`UPDATE app.platform_fee_rates SET amount_kurus = 1 WHERE club_id = $1`, [clubA]),
      '23001'
    );
    await expectSqlError(
      () => db.query(
        `INSERT INTO app.platform_fee_rates (fee_type, club_id, amount_kurus, lesson_fee_basis, effective_from, created_by)
         VALUES ('lesson', $1, 1, 'per_session', now() - interval '1 day', $2)`, [clubA, admin]),
      '23514', 'cannot be in the past'
    );
  });

  await test('(b) a lesson snapshots its club fee; sessions bill it and cancellation voids it', async () => {
    const lesson = await one<{ id: string; amount: number; fee_basis: string }>(
      `WITH l AS (
         INSERT INTO app.lessons (club_id, coach_user_id, contract_id, kind, title, capacity)
         VALUES ($1, $2, $3, 'group', 'Başlangıç', 8) RETURNING id, fee_rate_id, fee_basis)
       SELECT l.id, r.amount_kurus AS amount, l.fee_basis FROM l JOIN app.platform_fee_rates r ON r.id = l.fee_rate_id`,
      [clubA, coach, contract.id]
    );
    assertEqual(lesson.amount, 5000, 'snapshot of the club A rate in effect at creation');
    assertEqual(lesson.fee_basis, 'per_session', 'basis snapshot');

    const session = await tx(async () => {
      const booking = await insertBooking(clubA, courtA2, '2030-11-05T10:00:00+03:00', '2030-11-05T11:30:00+03:00');
      const res = await one<{ id: string }>(
        `INSERT INTO app.reservations (booking_id, source, owner_user_id, total_price_kurus) VALUES ($1, 'lesson', $2, 0) RETURNING id`,
        [booking.id, coach]
      );
      const s = await one<{ id: string }>(
        `INSERT INTO app.lesson_sessions (lesson_id, reservation_id, session_no) VALUES ($1, $2, 1) RETURNING id`,
        [lesson.id, res.id]
      );
      const n = await one<{ n: number }>(`SELECT app.charge_lesson_session($1) AS n`, [s.id]);
      assertEqual(n.n, 1, 'one per-session charge');
      const retry = await one<{ n: number }>(`SELECT app.charge_lesson_session($1) AS n`, [s.id]);
      assertEqual(retry.n, 0, 'idempotent');
      return { sessionId: s.id, reservationId: res.id };
    });
    const fee = await one(
      `SELECT amount_kurus, status FROM app.fee_ledger_entries WHERE lesson_session_id = $1`, [session.sessionId]
    );
    assertEqual(fee.amount_kurus, 5000, 'lesson fee amount');
    await expectSqlError(
      () => db.query(`UPDATE app.lessons SET fee_basis = 'per_lesson' WHERE id = $1`, [lesson.id]),
      '23514'
    );
    await cancelReservation(session.reservationId, 'coach', coach);
    const voided = await one(
      `SELECT status, void_reason FROM app.fee_ledger_entries WHERE lesson_session_id = $1`, [session.sessionId]
    );
    assertEqual(voided.status, 'voided', 'cancelled lesson session fee voided');
    assertEqual(voided.void_reason, 'lesson_session_cancelled', 'void reason');
  });

  // --- KVKK --------------------------------------------------------------------

  await test('anonymizing a user keeps ledger history intact; hard delete is refused', async () => {
    const past = await createAppReservation(clubA, courtA1, player2, '2020-05-05T19:00:00+03:00', '2020-05-05T20:00:00+03:00');
    await db.query(`UPDATE app.reservations SET status = 'completed' WHERE id = $1`, [past.reservationId]);
    const future = await createAppReservation(clubA, courtA1, player2, '2030-11-20T19:00:00+03:00', '2030-11-20T20:00:00+03:00');
    await db.query(
      `INSERT INTO app.venue_payments (reservation_id, amount_kurus, method, resulting_status, recorded_by)
       VALUES ($1, 120000, 'cash', 'paid', $2)`, [past.reservationId, admin]
    );
    const ledgerBefore = await one<{ n: number; total: number }>(
      `SELECT count(*)::int AS n, sum(amount_kurus)::int AS total FROM app.fee_ledger_entries`
    );

    // ON DELETE RESTRICT on history rows reports restrict_violation (23001).
    await expectSqlError(() => db.query(`DELETE FROM app.users WHERE id = $1`, [player2]), '23001');

    const summary = await tx(async () => {
      await db.exec(`SET LOCAL app.scope = 'global'`);
      return one<{ s: any }>(`SELECT app.anonymize_user($1) AS s`, [player2]);
    });
    assertEqual(summary.s.status, 'anonymized', 'anonymize result');

    const user = await one(`SELECT phone, display_name, status FROM app.users WHERE id = $1`, [player2]);
    assertEqual(user.phone, null, 'phone removed');
    assertEqual(user.status, 'deleted', 'status');
    assertEqual(user.display_name, 'Silinmiş Kullanıcı', 'display name');

    const ledgerAfter = await one<{ n: number; total: number }>(
      `SELECT count(*)::int AS n, sum(amount_kurus)::int AS total FROM app.fee_ledger_entries`
    );
    assertEqual(ledgerAfter.n, ledgerBefore.n, 'no ledger row removed');
    assertEqual(ledgerAfter.total, ledgerBefore.total, 'no ledger amount changed');
    const pastRow = await one(
      `SELECT r.owner_user_id, e.status FROM app.reservations r
       JOIN app.fee_ledger_entries e ON e.reservation_id = r.id AND e.entry_type = 'charge' WHERE r.id = $1`,
      [past.reservationId]
    );
    assertEqual(pastRow.owner_user_id, player2, 'past reservation still references the anonymous user');
    assertEqual(pastRow.status, 'accrued', 'past charge untouched');
    const futureFee = await charge(future.reservationId);
    assertEqual(futureFee.status, 'voided', 'future reservation cancelled and its fee voided');
    assertEqual(futureFee.void_reason, 'account_deleted', 'void reason');
    const audit = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'user.anonymize' AND target_id = $1`, [player2]
    );
    assertEqual(audit.n, 1, 'audit entry');
  });

  await test('every users(id) reference is handled by anonymize_user or declared retained history', async () => {
    // Personal rows removed, cancelled or rewritten by app.anonymize_user().
    const handled = new Set([
      'platform_admins.user_id', 'club_memberships.user_id', 'coach_profiles.user_id',
      'reservations.owner_user_id', 'reservation_participants.user_id', 'reservation_waitlist.user_id',
      'lesson_enrollments.user_id', 'coach_student_notes.student_user_id', 'conversation_participants.user_id',
      'messages.sender_user_id', 'notifications.user_id', 'notifications.actor_user_id', 'feed_posts.author_id',
      'feed_replies.author_id', 'feed_post_likes.user_id', 'friendships.user_id', 'friendships.friend_user_id',
      'favorite_courts.user_id', 'sessions.user_id', 'consent_records.user_id', 'account_deletion_requests.user_id'
    ]);
    // Actor references and financial/history rows that legitimately keep pointing at the anonymous row.
    const retained = new Set([
      'platform_admins.granted_by', 'clubs.created_by', 'clubs.approved_by', 'club_memberships.invited_by',
      'club_staff_invites.invited_by', 'coach_profiles.verified_by', 'coach_club_contracts.created_by',
      'court_blocks.created_by', 'court_blocks.removed_by', 'reservations.created_by',
      'reservations.cancelled_by_user_id', 'venue_payments.recorded_by', 'elo_events.user_id', 'elo_events.created_by',
      'lesson_attendance.marked_by', 'platform_fee_rates.created_by', 'billing_policies.created_by',
      'monthly_statements.marked_paid_by', 'fee_ledger_entries.voided_by', 'account_deletion_requests.processed_by',
      'audit_log.actor_user_id'
    ]);
    const { rows } = await db.query<{ ref: string; tbl: string }>(
      `SELECT cl.relname || '.' || a.attname AS ref, cl.relname AS tbl
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'app.users'::regclass AND n.nspname = 'app'
       ORDER BY 1`
    );
    const source = (await one<{ src: string }>(
      `SELECT pg_get_functiondef('app.anonymize_user(uuid,uuid)'::regprocedure) AS src`
    )).src;
    const undecided = rows.filter(r => !handled.has(r.ref) && !retained.has(r.ref)).map(r => r.ref);
    assert(undecided.length === 0, `new users(id) references need a KVKK decision: ${undecided.join(', ')}`);
    const unhandled = rows.filter(r => handled.has(r.ref) && !source.includes(r.tbl)).map(r => r.ref);
    assert(unhandled.length === 0, `anonymize_user does not touch: ${unhandled.join(', ')}`);
  });

  // --- Security ----------------------------------------------------------------

  await test('ralo_app is not superuser, has no BYPASSRLS and owns no table; every table has RLS', async () => {
    const role = await one(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'ralo_app'`);
    assertEqual(role.rolsuper, false, 'rolsuper');
    assertEqual(role.rolbypassrls, false, 'rolbypassrls');
    const owned = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app' AND pg_get_userbyid(c.relowner) = 'ralo_app'`
    );
    assertEqual(owned.n, 0, 'tables owned by ralo_app');
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
         AND (NOT c.relrowsecurity OR NOT EXISTS (
           SELECT 1 FROM pg_policies p WHERE p.schemaname = 'app' AND p.tablename = c.relname AND p.policyname = 'ralo_app_access'))`
    );
    assert(rows.length === 0, `tables without RLS or ralo_app policy: ${rows.map(r => r.relname).join(', ')}`);
  });

  await test('RLS tenant backstop: club scope hides and blocks other clubs, unset scope fails closed', async () => {
    const b = await createAppReservation(clubB, courtB1, player, '2030-10-11T19:00:00+03:00', '2030-10-11T20:00:00+03:00');
    const asApp = async <T>(scope: string | null, fn: () => Promise<T>) => {
      await db.exec('BEGIN');
      try {
        await db.exec('SET LOCAL ROLE ralo_app');
        if (scope) await db.query(`SELECT set_config('app.scope', $1, true)`, [scope]);
        return await fn();
      } finally {
        await db.exec('ROLLBACK').catch(() => {});
      }
    };
    const count = (sql: string) => one<{ n: number }>(sql).then(r => r.n);

    const clubAView = await asApp(`club:${clubA}`, async () => ({
      reservationsOfB: await count(`SELECT count(*)::int AS n FROM app.reservations WHERE club_id = '${clubB}'`),
      allClubs: await count(`SELECT count(DISTINCT club_id)::int AS n FROM app.reservations`),
      ledgerOfB: await count(`SELECT count(*)::int AS n FROM app.fee_ledger_entries WHERE club_id = '${clubB}'`)
    }));
    assertEqual(clubAView.reservationsOfB, 0, 'club B reservations hidden from club A scope');
    assertEqual(clubAView.allClubs, 1, 'only club A visible');
    assertEqual(clubAView.ledgerOfB, 0, 'club B ledger hidden');

    const globalCount = await asApp('global', () =>
      count(`SELECT count(*)::int AS n FROM app.reservations WHERE id = '${b.reservationId}'`));
    assertEqual(globalCount, 1, 'global scope sees every club');

    const unscoped = await asApp(null, () => count(`SELECT count(*)::int AS n FROM app.reservations`));
    assertEqual(unscoped, 0, 'unset scope sees nothing');

    let blocked: any;
    await asApp(`club:${clubA}`, async () => {
      try {
        await insertBooking(clubB, courtB1, '2030-10-11T08:00:00+03:00', '2030-10-11T09:00:00+03:00', 'block');
      } catch (err) {
        blocked = err;
      }
    });
    assertEqual(blocked?.code, '42501', 'writing another club row is refused');

    const anon = await asApp(`club:${clubA}`, () => count(`SELECT count(*)::int AS n FROM app.users`));
    assert(anon > 0, 'non-tenant tables stay readable for ralo_app');
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
  await db.close();
}

main().catch(async err => {
  console.error(err);
  process.exitCode = 1;
  await db.close().catch(() => {});
});
