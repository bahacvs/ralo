import { getDb, type Queryable } from '../db/instance.js';
import { sqlState } from '../db/client.js';
import { addMinutesToLocal, nowLocal } from '../time.js';
import {
  RESERVATION_SELECT, PARTICIPANT_SELECT, BLOCK_SELECT, toReservation, toParticipant, toBlock,
  fromLocal, localTs, tlToKurus, blockReasonToDb, paymentStatusToDb, reservationStatusToDb
} from './mappers.js';
import { isUuid, HttpError } from './util.js';
import { addNotification, getNotification } from './notifications.js';
import { getBusiness, getCourt, getBusinessesByIds, getCourtsByIds, listClubCourts } from './clubs.js';
import type {
  User, Reservation, ReservationStatus, OpenMatchParticipant, CourtBlock, Business, Court, Notification
} from '../../src/types/index.js';

export const OVERLAP_MESSAGE = 'Seçilen kort ve saat aralığında başka bir rezervasyon veya blokaj bulunmaktadır.';

export interface Interval {
  start: string;
  end: string;
}

/** Active bookings (reservations and blocks) touching [date, date + days) per court, as local times. */
export async function activeBookings(courtIds: string[], date: string, days = 1): Promise<Map<string, Interval[]>> {
  const map = new Map<string, Interval[]>(courtIds.map(id => [id, []]));
  if (courtIds.length === 0) return map;
  const { rows } = await getDb().query(
    `SELECT court_id, ${localTs('starts_at')} AS start_at, ${localTs('ends_at')} AS end_at
     FROM app.court_bookings
     WHERE is_active AND court_id = ANY(string_to_array($1, ',')::uuid[])
       AND starts_at < (($2::date + $3::int)::timestamp AT TIME ZONE 'Europe/Istanbul')
       AND ends_at > ($2::date::timestamp AT TIME ZONE 'Europe/Istanbul')`,
    [courtIds.join(','), date, days]
  );
  for (const row of rows) map.get(row.court_id)?.push({ start: row.start_at, end: row.end_at });
  return map;
}

/** Local 'YYYY-MM-DDTHH:mm:ss' strings compare correctly as text. */
export const overlaps = (intervals: Interval[], start: string, end: string) =>
  intervals.some(i => start < i.end && end > i.start);

export async function getReservation(id: string, q: Queryable = getDb()): Promise<Reservation | null> {
  if (!isUuid(id)) return null;
  const { rows } = await q.query(`SELECT ${RESERVATION_SELECT} FROM app.reservations r WHERE r.id = $1`, [id]);
  return rows[0] ? toReservation(rows[0]) : null;
}

export async function getParticipants(reservationIds: string[], q: Queryable = getDb()): Promise<OpenMatchParticipant[]> {
  if (reservationIds.length === 0) return [];
  const { rows } = await q.query(
    `SELECT ${PARTICIPANT_SELECT} WHERE p.reservation_id = ANY(string_to_array($1, ',')::uuid[])
     ORDER BY p.reservation_id, p.slot_index NULLS LAST, p.joined_at`,
    [reservationIds.join(',')]
  );
  return rows.map(toParticipant);
}

export type EnrichedReservation = Reservation & {
  court?: Court;
  business?: Business;
  participants: OpenMatchParticipant[];
};

/** Attaches court, business and participants, as the player screens expect. */
export async function enrichReservations(reservations: Reservation[]): Promise<EnrichedReservation[]> {
  const courts = await getCourtsByIds(reservations.map(r => r.courtId));
  const businesses = await getBusinessesByIds(reservations.map(r => r.businessId));
  const participants = await getParticipants(reservations.map(r => r.id));
  return reservations.map(r => ({
    ...r,
    court: courts.get(r.courtId),
    business: businesses.get(r.businessId),
    participants: participants.filter(p => p.reservationId === r.id)
  }));
}

// -------------------------------------------------------------
// Creating reservations
// -------------------------------------------------------------

interface NewReservation {
  clubId: string;
  courtId: string;
  source: 'app' | 'panel';
  ownerUserId?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  createdBy: string;
  startAt: string;
  endAt: string;
  totalPriceKurus: number;
  paymentStatus?: 'unpaid' | 'paid';
  isOpenMatch?: boolean;
  openMatchNote?: string | null;
  minElo?: number | null;
  maxElo?: number | null;
  matchType?: string | null;
  genderPreference?: string | null;
  approvalRequired?: boolean;
  note?: string | null;
}

async function insertBooking(q: Queryable, clubId: string, courtId: string, kind: 'reservation' | 'block', startAt: string, endAt: string) {
  try {
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO app.court_bookings (club_id, court_id, kind, starts_at, ends_at)
       VALUES ($1, $2, $3, ${fromLocal('$4')}, ${fromLocal('$5')}) RETURNING id`,
      [clubId, courtId, kind, startAt, endAt]
    );
    return rows[0].id;
  } catch (err) {
    if (sqlState(err) === '23P01') throw new HttpError(409, OVERLAP_MESSAGE, 'SLOT_TAKEN');
    throw err;
  }
}

/**
 * Books the court and writes the reservation in the caller's transaction. App reservations get their
 * platform fee charge here (the database refuses to commit an app reservation without one).
 */
async function insertReservation(q: Queryable, r: NewReservation): Promise<string> {
  const bookingId = await insertBooking(q, r.clubId, r.courtId, 'reservation', r.startAt, r.endAt);
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO app.reservations (
       booking_id, club_id, court_id, starts_at, ends_at, source, owner_user_id, guest_name, guest_phone, created_by,
       total_price_kurus, payment_status, is_open_match, open_match_note, active_participant_count, min_elo, max_elo,
       match_type, gender_preference, approval_required, note)
     SELECT b.id, b.club_id, b.court_id, b.starts_at, b.ends_at, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
     FROM app.court_bookings b WHERE b.id = $1
     RETURNING id`,
    [
      bookingId, r.source, r.ownerUserId ?? null, r.guestName ?? null, r.guestPhone ?? null, r.createdBy,
      r.totalPriceKurus, r.paymentStatus ?? 'unpaid', !!r.isOpenMatch, r.openMatchNote ?? null, r.isOpenMatch ? 1 : 0,
      r.minElo ?? null, r.maxElo ?? null,
      r.isOpenMatch ? (r.matchType ?? 'casual') : null,
      r.isOpenMatch ? (r.genderPreference ?? 'mixed') : null,
      !!r.approvalRequired, r.note ?? null
    ]
  );
  const reservationId = rows[0].id;

  if (r.isOpenMatch && r.ownerUserId) {
    await q.query(
      `INSERT INTO app.reservation_participants (reservation_id, user_id, status, slot_index, is_organizer, approved_at)
       VALUES ($1, $2, 'active', 0, true, now())`,
      [reservationId, r.ownerUserId]
    );
  }

  if (r.source === 'app') {
    try {
      await q.query(`SELECT app.charge_app_reservation($1)`, [reservationId]);
    } catch (err) {
      if (sqlState(err) === 'P0002') {
        throw new HttpError(503, 'Uygulama üzerinden rezervasyon şu an alınamıyor. Lütfen daha sonra tekrar deneyin.', 'FEE_NOT_CONFIGURED');
      }
      throw err;
    }
  }
  return reservationId;
}

export interface PlayerBookingInput {
  courtId: string;
  startAt: string;
  durationMinutes: 60 | 90 | 120;
  isOpenMatch: boolean;
  openMatchNote?: string;
  minElo?: number;
  maxElo?: number;
  matchType?: string;
  genderPreference?: string;
  approvalRequired?: boolean;
}

const MATCH_TYPES = ['casual', 'competitive'];
const GENDER_PREFERENCES = ['mixed', 'female', 'male', 'any'];

export async function bookCourtForPlayer(user: User, input: PlayerBookingInput): Promise<Reservation> {
  const court = await getCourt(input.courtId);
  const business = court ? await getBusiness(court.businessId) : null;
  if (!court || !business || !business.isActive) {
    throw new HttpError(404, 'Kort bulunamadı.');
  }
  if (!court.isActive || !business.appBookingEnabled) {
    throw new HttpError(409, 'Bu kort şu anda rezervasyona kapalıdır.');
  }
  const matchType = input.matchType?.toLowerCase();
  const genderPreference = input.genderPreference?.toLowerCase();

  const id = await getDb().tx(q => insertReservation(q, {
    clubId: court.businessId,
    courtId: court.id,
    source: 'app',
    ownerUserId: user.id,
    createdBy: user.id,
    startAt: input.startAt,
    endAt: addMinutesToLocal(input.startAt, input.durationMinutes),
    totalPriceKurus: Math.round(tlToKurus(court.pricePerHour) * input.durationMinutes / 60),
    isOpenMatch: input.isOpenMatch,
    openMatchNote: input.openMatchNote,
    minElo: input.minElo,
    maxElo: input.maxElo,
    matchType: matchType && MATCH_TYPES.includes(matchType) ? matchType : undefined,
    genderPreference: genderPreference && GENDER_PREFERENCES.includes(genderPreference) ? genderPreference : undefined,
    approvalRequired: input.approvalRequired
  }));
  return (await getReservation(id))!;
}

export async function createPanelReservation(
  clubId: string,
  actorId: string,
  input: { courtId: string; customerName: string; customerPhone: string | null; startAt: string; durationMinutes: number; paid: boolean; note?: string }
): Promise<Reservation> {
  const court = await getCourt(input.courtId);
  if (!court || court.businessId !== clubId) {
    throw new HttpError(404, 'Kort bulunamadı.');
  }
  const id = await getDb().tx(q => insertReservation(q, {
    clubId,
    courtId: court.id,
    source: 'panel',
    guestName: input.customerName,
    guestPhone: input.customerPhone,
    createdBy: actorId,
    startAt: input.startAt,
    endAt: addMinutesToLocal(input.startAt, input.durationMinutes),
    totalPriceKurus: Math.round(tlToKurus(court.pricePerHour) * input.durationMinutes / 60),
    paymentStatus: input.paid ? 'paid' : 'unpaid',
    note: input.note
  }), `club:${clubId}`);
  return (await getReservation(id))!;
}

// -------------------------------------------------------------
// Cancellation and status changes
// -------------------------------------------------------------

/** Player cancels their own booking while the club's cancellation window is still open. */
export async function cancelReservationByPlayer(reservationId: string, user: User): Promise<Reservation> {
  if (!isUuid(reservationId)) throw new HttpError(404, 'Rezervasyon bulunamadı.');
  return getDb().tx(async q => {
    const { rows } = await q.query(
      `SELECT r.status, r.is_open_match, r.court_id, (r.cancellation_deadline > now()) AS within_window,
              c.cancellation_window_hours, co.name AS court_name, ${localTs('r.starts_at')} AS start_at
       FROM app.reservations r
       JOIN app.clubs c ON c.id = r.club_id
       JOIN app.courts co ON co.id = r.court_id
       WHERE r.id = $1 AND r.owner_user_id = $2
       FOR UPDATE OF r`,
      [reservationId, user.id]
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Rezervasyon bulunamadı.');
    if (row.status === 'cancelled') throw new HttpError(409, 'Bu rezervasyon zaten iptal edilmiş.');
    if (row.status === 'completed' || row.status === 'no_show') {
      throw new HttpError(409, 'Tamamlanmış bir rezervasyon iptal edilemez.');
    }
    if (!row.within_window) {
      throw new HttpError(409, `İptal süresi doldu. Bu kulüpte rezervasyonlar başlama saatinden en geç ${row.cancellation_window_hours} saat önce iptal edilebilir. Lütfen kulüple iletişime geçin.`);
    }

    // Cancelling voids the platform fee in the database (trigger), whoever cancels.
    await q.query(
      `UPDATE app.reservations
       SET status = 'cancelled', cancelled_at = now(), cancelled_by_party = 'player', cancelled_by_user_id = $2
       WHERE id = $1`,
      [reservationId, user.id]
    );

    if (row.is_open_match) {
      const others = await q.query<{ user_id: string }>(
        `SELECT user_id FROM app.reservation_participants WHERE reservation_id = $1 AND user_id <> $2`,
        [reservationId, user.id]
      );
      for (const other of others.rows) {
        await addNotification(q, {
          userId: other.user_id,
          type: 'reservation_update',
          title: 'Maç İptal Edildi',
          body: `${user.displayName}, ${row.court_name} için ${row.start_at.replace('T', ' ').slice(0, 16)} açık maçını iptal etti.`,
          reservationId,
          actorUserId: user.id
        });
      }
      await q.query(`DELETE FROM app.reservation_waitlist WHERE reservation_id = $1`, [reservationId]);
    }
    return (await getReservation(reservationId, q))!;
  });
}

export async function updateReservationStatus(
  clubId: string, reservationId: string, status: ReservationStatus, actorId: string
): Promise<Reservation> {
  if (!isUuid(reservationId)) throw new HttpError(404, 'Rezervasyon bulunamadı.');
  return getDb().tx(async q => {
    const { rows } = await q.query<{ status: string }>(
      `SELECT status FROM app.reservations WHERE id = $1 AND club_id = $2 FOR UPDATE`,
      [reservationId, clubId]
    );
    if (!rows[0]) throw new HttpError(404, 'Rezervasyon bulunamadı.');
    const next = reservationStatusToDb(status);
    if (rows[0].status === next) return (await getReservation(reservationId, q))!;
    if (rows[0].status === 'cancelled') {
      throw new HttpError(409, 'İptal edilmiş bir rezervasyon yeniden etkinleştirilemez. Yeni rezervasyon oluşturun.');
    }

    if (next === 'cancelled') {
      await q.query(
        `UPDATE app.reservations
         SET status = 'cancelled', cancelled_at = now(), cancelled_by_party = 'club', cancelled_by_user_id = $2
         WHERE id = $1`,
        [reservationId, actorId]
      );
    } else {
      await q.query(`UPDATE app.reservations SET status = $2 WHERE id = $1`, [reservationId, next]);
    }

    if (next === 'no_show') {
      // The billing policy decides whether a no-show keeps the fee; without a policy the fee stays.
      await q.query('SAVEPOINT no_show_fee');
      try {
        await q.query(`SELECT app.settle_no_show_fee($1, $2)`, [reservationId, actorId]);
        await q.query('RELEASE SAVEPOINT no_show_fee');
      } catch (err) {
        if (sqlState(err) !== 'P0002') throw err;
        await q.query('ROLLBACK TO SAVEPOINT no_show_fee');
      }
    }
    return (await getReservation(reservationId, q))!;
  }, `club:${clubId}`);
}

export async function updatePaymentStatus(
  clubId: string, reservationId: string, paymentStatus: unknown, actorId: string
): Promise<Reservation> {
  const next = paymentStatusToDb(paymentStatus);
  if (!next) throw new HttpError(400, 'Geçersiz ödeme durumu.');
  if (!isUuid(reservationId)) throw new HttpError(404, 'Rezervasyon bulunamadı.');
  return getDb().tx(async q => {
    const { rows } = await q.query<{ payment_status: string; total_price_kurus: number }>(
      `SELECT payment_status, total_price_kurus FROM app.reservations WHERE id = $1 AND club_id = $2 FOR UPDATE`,
      [reservationId, clubId]
    );
    if (!rows[0]) throw new HttpError(404, 'Rezervasyon bulunamadı.');
    if (rows[0].payment_status !== next) {
      await q.query(`UPDATE app.reservations SET payment_status = $2 WHERE id = $1`, [reservationId, next]);
      const amount = next === 'paid' ? rows[0].total_price_kurus : next === 'refunded' ? -rows[0].total_price_kurus : 0;
      await q.query(
        `INSERT INTO app.venue_payments (reservation_id, amount_kurus, method, resulting_status, recorded_by)
         VALUES ($1, $2, 'cash', $3, $4)`,
        [reservationId, amount, next, actorId]
      );
    }
    return (await getReservation(reservationId, q))!;
  }, `club:${clubId}`);
}

// -------------------------------------------------------------
// Club panel: schedule and blocks
// -------------------------------------------------------------

export async function getClubSchedule(clubId: string, date: string, days: number, canSeePhones: boolean) {
  return getDb().tx(async q => {
    const courts = await listClubCourts(clubId, q);
    const reservations = await q.query(
      `SELECT ${RESERVATION_SELECT}, u.masked_name AS owner_masked_name, u.phone AS owner_phone,
              (SELECT count(*)::int FROM app.reservation_participants p WHERE p.reservation_id = r.id) AS participants_count
       FROM app.reservations r LEFT JOIN app.users u ON u.id = r.owner_user_id
       WHERE r.club_id = $1 AND r.local_date >= $2::date AND r.local_date < $2::date + $3::int
       ORDER BY r.starts_at`,
      [clubId, date, days]
    );
    const blocks = await q.query(
      `SELECT ${BLOCK_SELECT} FROM app.court_blocks b
       WHERE b.club_id = $1 AND b.removed_at IS NULL
         AND b.starts_at < (($2::date + $3::int)::timestamp AT TIME ZONE 'Europe/Istanbul')
         AND b.ends_at > ($2::date::timestamp AT TIME ZONE 'Europe/Istanbul')
       ORDER BY b.starts_at`,
      [clubId, date, days]
    );
    const phoneOf = (row: any) => {
      const phone = row.owner_phone || row.guest_phone;
      return canSeePhones && phone ? `+${phone}` : '';
    };
    return {
      courts,
      reservations: reservations.rows.map(row => ({
        ...toReservation(row),
        ownerMaskedName: row.owner_masked_name ?? row.guest_name ?? 'Misafir',
        ownerPhone: phoneOf(row),
        participantsCount: row.participants_count
      })),
      blocks: blocks.rows.map(toBlock)
    };
  }, `club:${clubId}`);
}

export async function createBlock(
  clubId: string,
  actorId: string,
  input: { courtId: string; startAt: string; endAt: string; reason: unknown; reasonNote?: string }
): Promise<CourtBlock> {
  const reason = blockReasonToDb(input.reason);
  if (!reason) throw new HttpError(400, 'Geçersiz blokaj sebebi.');
  const court = await getCourt(input.courtId);
  if (!court || court.businessId !== clubId) throw new HttpError(404, 'Kort bulunamadı.');

  return getDb().tx(async q => {
    let bookingId: string;
    try {
      bookingId = await insertBooking(q, clubId, court.id, 'block', input.startAt, input.endAt);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'SLOT_TAKEN') {
        throw new HttpError(409, 'Seçilen zaman diliminde aktif bir rezervasyon veya blokaj bulunmaktadır.');
      }
      throw err;
    }
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO app.court_blocks (booking_id, club_id, court_id, starts_at, ends_at, reason, reason_note, created_by)
       SELECT b.id, b.club_id, b.court_id, b.starts_at, b.ends_at, $2, $3, $4 FROM app.court_bookings b WHERE b.id = $1
       RETURNING id`,
      [bookingId, reason, input.reasonNote?.slice(0, 300) || null, actorId]
    );
    const block = await q.query(`SELECT ${BLOCK_SELECT} FROM app.court_blocks b WHERE b.id = $1`, [rows[0].id]);
    return toBlock(block.rows[0]);
  }, `club:${clubId}`);
}

/** Soft-deletes a block; the database releases its court time. */
export async function removeBlock(clubId: string, blockId: string, actorId: string): Promise<boolean> {
  if (!isUuid(blockId)) return false;
  const { rows } = await getDb().tx(q => q.query(
    `UPDATE app.court_blocks SET removed_at = now(), removed_by = $3
     WHERE id = $1 AND club_id = $2 AND removed_at IS NULL RETURNING id`,
    [blockId, clubId, actorId]
  ), `club:${clubId}`);
  return rows.length > 0;
}

// -------------------------------------------------------------
// Player: own matches and reminders
// -------------------------------------------------------------

const INVOLVES_USER = `(r.owner_user_id = $1 OR EXISTS (
  SELECT 1 FROM app.reservation_participants p WHERE p.reservation_id = r.id AND p.user_id = $1))`;

export async function getMyMatches(userId: string) {
  const { rows } = await getDb().query(
    `SELECT ${RESERVATION_SELECT} FROM app.reservations r WHERE ${INVOLVES_USER} ORDER BY r.starts_at DESC LIMIT 200`,
    [userId]
  );
  const now = nowLocal();
  const enriched = (await enrichReservations(rows.map(toReservation))).map(r => ({
    ...r,
    isUpcoming: r.startAt >= now && r.status !== 'CANCELLED'
  }));
  return {
    upcoming: enriched.filter(r => r.isUpcoming).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    past: enriched.filter(r => !r.isUpcoming)
  };
}

function describeMatchTime(startAt: string) {
  return {
    time: startAt.slice(11, 16),
    date: new Date(startAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  };
}

/** Sends the "2 hours to go" notification once per match (dedupe key), if the user wants reminders. */
export async function checkTwoHourReminder(user: User): Promise<{ sent: boolean; notification?: Notification; match?: unknown }> {
  if (user.pushNotificationsEnabled === false || user.reminder2HoursBefore === false) {
    return { sent: false };
  }
  const { rows } = await getDb().query(
    `SELECT ${RESERVATION_SELECT} FROM app.reservations r
     WHERE r.status IN ('pending','confirmed')
       AND r.starts_at > now() AND r.starts_at <= now() + interval '2 hours 15 minutes'
       AND ${INVOLVES_USER}
     ORDER BY r.starts_at`,
    [user.id]
  );
  for (const row of rows) {
    const [match] = await enrichReservations([toReservation(row)]);
    const { time, date } = describeMatchTime(match.startAt);
    const id = await addNotification(getDb(), {
      userId: user.id,
      type: 'match_reminder_2h',
      title: '⏰ Maçınıza 2 Saat Kaldı!',
      body: `${date} saat ${time}'te "${match.court?.name ?? 'Kort'}" (${match.business?.name ?? 'Padel Kulübü'}) maçınız 2 saat sonra başlıyor. Ekipmanlarınızı hazırlayın ve yola çıkmayı planlayın!`,
      reservationId: match.id,
      courtId: match.courtId,
      dedupeKey: `reminder2h:${match.id}`
    });
    if (id) {
      return { sent: true, notification: (await getNotification(id))!, match: { ...match, matchTime: time, matchDate: date } };
    }
  }
  return { sent: false };
}

/** Previews the reminder for the user's next match (the notification settings screen offers a test). */
export async function sendTestReminder(user: User, matchId?: string) {
  const params: unknown[] = [user.id];
  let filter = `r.status IN ('pending','confirmed') AND r.starts_at > now()`;
  if (matchId && isUuid(matchId)) {
    params.push(matchId);
    filter = `r.id = $2`;
  }
  const { rows } = await getDb().query(
    `SELECT ${RESERVATION_SELECT} FROM app.reservations r WHERE ${filter} AND ${INVOLVES_USER} ORDER BY r.starts_at LIMIT 1`,
    params
  );
  if (!rows[0]) throw new HttpError(404, 'Yaklaşan bir maçınız bulunmuyor.');
  const [match] = await enrichReservations([toReservation(rows[0])]);
  const { time, date } = describeMatchTime(match.startAt);
  const id = await addNotification(getDb(), {
    userId: user.id,
    type: 'match_reminder_2h',
    title: '⏰ Maç Hatırlatması (Deneme)',
    body: `${date} saat ${time}'te "${match.court?.name ?? 'Kort'}" (${match.business?.name ?? 'Padel Kulübü'}) maçınız var. Maçtan 2 saat önce bu şekilde hatırlatılacaksınız.`,
    reservationId: match.id,
    courtId: match.courtId
  });
  return { success: true, notification: (await getNotification(id!))!, match: { ...match, matchTime: time, matchDate: date } };
}
