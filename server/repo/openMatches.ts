import { getDb, type Queryable } from '../db/instance.js';
import { RESERVATION_SELECT, WAITLIST_SELECT, toReservation, toWaitlistEntry } from './mappers.js';
import { enrichReservations, type EnrichedReservation } from './reservations.js';
import { addNotification } from './notifications.js';
import { findUserById } from './users.js';
import { isUuid, HttpError } from './util.js';
import type { User, OpenMatchWaitlist } from '../../src/types/index.js';

export type OpenMatch = EnrichedReservation & { waitlist: OpenMatchWaitlist[] };

async function getWaitlists(reservationIds: string[], q: Queryable = getDb()): Promise<OpenMatchWaitlist[]> {
  if (reservationIds.length === 0) return [];
  const { rows } = await q.query(
    `SELECT ${WAITLIST_SELECT} WHERE w.reservation_id = ANY(string_to_array($1, ',')::uuid[]) ORDER BY w.reservation_id, w.position`,
    [reservationIds.join(',')]
  );
  return rows.map(toWaitlistEntry);
}

async function withWaitlists(matches: EnrichedReservation[]): Promise<OpenMatch[]> {
  const waitlists = await getWaitlists(matches.map(m => m.id));
  return matches.map(m => ({ ...m, waitlist: waitlists.filter(w => w.reservationId === m.id) }));
}

/** Open matches at active clubs from three hours ago up to `daysAhead` days ahead. */
export async function listOpenMatches(daysAhead = 30): Promise<OpenMatch[]> {
  const { rows } = await getDb().query(
    `SELECT ${RESERVATION_SELECT} FROM app.reservations r JOIN app.clubs c ON c.id = r.club_id
     WHERE r.is_open_match AND r.status IN ('pending','confirmed') AND c.is_active
       AND r.starts_at > now() - interval '3 hours' AND r.starts_at < now() + make_interval(days => $1)
     ORDER BY r.starts_at LIMIT 500`,
    [daysAhead]
  );
  return withWaitlists(await enrichReservations(rows.map(toReservation)));
}

export async function getOpenMatch(id: string): Promise<(OpenMatch & { organizerMaskedName: string }) | null> {
  if (!isUuid(id)) return null;
  const { rows } = await getDb().query(
    `SELECT ${RESERVATION_SELECT}, u.masked_name AS organizer_masked_name
     FROM app.reservations r LEFT JOIN app.users u ON u.id = r.owner_user_id
     WHERE r.id = $1 AND r.is_open_match`,
    [id]
  );
  if (!rows[0]) return null;
  const [match] = await withWaitlists(await enrichReservations([toReservation(rows[0])]));
  return { ...match, organizerMaskedName: rows[0].organizer_masked_name ?? 'Organizatör' };
}

interface LockedMatch {
  status: string;
  closing: boolean;
  min_elo: number | null;
  max_elo: number | null;
  approval_required: boolean;
  participant_limit: number;
  active_participant_count: number;
  owner_user_id: string;
  court_name: string;
  club_name: string;
}

async function lockOpenMatch(q: Queryable, matchId: string): Promise<LockedMatch> {
  if (!isUuid(matchId)) throw new HttpError(404, 'Açık maç bulunamadı.');
  const { rows } = await q.query<LockedMatch>(
    `SELECT r.status, (r.starts_at - now() < interval '30 minutes') AS closing, r.min_elo, r.max_elo,
            r.approval_required, r.participant_limit, r.active_participant_count, r.owner_user_id,
            co.name AS court_name, c.name AS club_name
     FROM app.reservations r
     JOIN app.courts co ON co.id = r.court_id
     JOIN app.clubs c ON c.id = r.club_id
     WHERE r.id = $1 AND r.is_open_match
     FOR UPDATE OF r`,
    [matchId]
  );
  const match = rows[0];
  if (!match) throw new HttpError(404, 'Açık maç bulunamadı.');
  if (match.status === 'cancelled') throw new HttpError(400, 'Bu maç iptal edilmiştir.');
  if (match.status === 'completed' || match.status === 'no_show') throw new HttpError(400, 'Bu maç tamamlanmıştır.');
  return match;
}

async function notifyActiveParticipants(
  q: Queryable, matchId: string, exceptUserId: string,
  notification: { type: string; title: string; body: string; actorUserId?: string }
) {
  const { rows } = await q.query<{ user_id: string }>(
    `SELECT user_id FROM app.reservation_participants WHERE reservation_id = $1 AND status = 'active' AND user_id <> $2`,
    [matchId, exceptUserId]
  );
  for (const row of rows) {
    await addNotification(q, { ...notification, userId: row.user_id, reservationId: matchId });
  }
}

export async function joinOpenMatch(matchId: string, user: User): Promise<'ACTIVE' | 'PENDING_APPROVAL'> {
  return getDb().tx(async q => {
    const match = await lockOpenMatch(q, matchId);
    if (match.closing) {
      throw new HttpError(400, 'Maç başlama saatine 30 dakikadan az süre kaldığı için yeni katılım kapatılmıştır.');
    }
    const existing = await q.query(
      `SELECT 1 FROM app.reservation_participants WHERE reservation_id = $1 AND user_id = $2`,
      [matchId, user.id]
    );
    if (existing.rows.length > 0) throw new HttpError(400, 'Bu maça zaten katılmış durumdasınız.');
    if (match.min_elo && user.elo < match.min_elo) {
      throw new HttpError(400, `Bu maç için minimum Elo sınırı ${match.min_elo}'dir. Sizin Elo puanınız: ${user.elo}.`);
    }
    if (match.max_elo && user.elo > match.max_elo) {
      throw new HttpError(400, `Bu maç için maksimum Elo sınırı ${match.max_elo}'dir. Sizin Elo puanınız: ${user.elo}.`);
    }

    if (match.approval_required) {
      await q.query(
        `INSERT INTO app.reservation_participants (reservation_id, user_id, status) VALUES ($1, $2, 'pending_approval')`,
        [matchId, user.id]
      );
      await addNotification(q, {
        userId: match.owner_user_id,
        type: 'match_join',
        title: 'Katılım İsteği 🎾',
        body: `${user.displayName} (${user.elo} Elo), ${match.club_name} - ${match.court_name} maçınıza katılmak istiyor.`,
        reservationId: matchId,
        actorUserId: user.id
      });
      return 'PENDING_APPROVAL';
    }

    if (match.active_participant_count >= match.participant_limit) {
      throw new HttpError(400, 'Maçın tüm koltukları doludur. Bekleme listesine katılabilirsiniz.');
    }
    await q.query(
      `INSERT INTO app.reservation_participants (reservation_id, user_id, status, slot_index, approved_at)
       SELECT $1, $2, 'active', min(s)::smallint, now()
       FROM generate_series(0, $3::int - 1) AS s
       WHERE NOT EXISTS (SELECT 1 FROM app.reservation_participants p
                         WHERE p.reservation_id = $1 AND p.status = 'active' AND p.slot_index = s)`,
      [matchId, user.id, match.participant_limit]
    );
    await q.query(
      `UPDATE app.reservations SET active_participant_count = active_participant_count + 1 WHERE id = $1`,
      [matchId]
    );
    await q.query(`DELETE FROM app.reservation_waitlist WHERE reservation_id = $1 AND user_id = $2`, [matchId, user.id]);
    await notifyActiveParticipants(q, matchId, user.id, {
      type: 'match_join',
      title: 'Maça Katılım 🎾',
      body: `${user.displayName} (${user.elo} Elo), ${match.club_name} - ${match.court_name} maç oturumuna katıldı!`,
      actorUserId: user.id
    });
    return 'ACTIVE';
  });
}

export async function leaveOpenMatch(matchId: string, user: User): Promise<{ promotedUserId?: string }> {
  return getDb().tx(async q => {
    const match = await lockOpenMatch(q, matchId);
    const { rows } = await q.query<{ id: string; status: string; is_organizer: boolean }>(
      `SELECT id, status, is_organizer FROM app.reservation_participants WHERE reservation_id = $1 AND user_id = $2`,
      [matchId, user.id]
    );
    const participant = rows[0];
    if (!participant) throw new HttpError(400, 'Bu maçta kaydınız bulunmamaktadır.');
    if (participant.is_organizer) {
      throw new HttpError(400, 'Organizatör maçtan ayrılamaz. Maçı kapatmak için rezervasyonunuzu iptal edin.');
    }

    await q.query(`DELETE FROM app.reservation_participants WHERE id = $1`, [participant.id]);
    let promotedUserId: string | undefined;
    if (participant.status === 'active') {
      await q.query(
        `UPDATE app.reservations SET active_participant_count = active_participant_count - 1 WHERE id = $1`,
        [matchId]
      );
      const promoted = await q.query<{ user_id: string | null }>(
        `SELECT app.promote_reservation_waitlist($1) AS user_id`,
        [matchId]
      );
      promotedUserId = promoted.rows[0]?.user_id ?? undefined;
      await notifyActiveParticipants(q, matchId, user.id, {
        type: 'match_leave',
        title: 'Maçtan Oyuncu Ayrıldı ⚠️',
        body: `${user.displayName} ${match.court_name} maç oturumundan ayrıldı.`,
        actorUserId: user.id
      });
      if (promotedUserId) {
        await addNotification(q, {
          userId: promotedUserId,
          type: 'slot_available',
          title: 'Maça Alındınız 🎉',
          body: `${match.club_name} - ${match.court_name} maçında yer açıldı ve bekleme listesinden maça alındınız.`,
          reservationId: matchId
        });
      }
    }
    return { promotedUserId };
  });
}

export async function toggleWaitlist(matchId: string, user: User): Promise<'JOINED' | 'LEFT'> {
  return getDb().tx(async q => {
    await lockOpenMatch(q, matchId);
    const removed = await q.query(
      `DELETE FROM app.reservation_waitlist WHERE reservation_id = $1 AND user_id = $2 RETURNING id`,
      [matchId, user.id]
    );
    if (removed.rows.length > 0) return 'LEFT';

    const participant = await q.query(
      `SELECT 1 FROM app.reservation_participants WHERE reservation_id = $1 AND user_id = $2`,
      [matchId, user.id]
    );
    if (participant.rows.length > 0) throw new HttpError(400, 'Bu maça zaten katılmış durumdasınız.');
    await q.query(
      `INSERT INTO app.reservation_waitlist (reservation_id, user_id, position)
       SELECT $1, $2, COALESCE(max(position), 0) + 1 FROM app.reservation_waitlist WHERE reservation_id = $1`,
      [matchId, user.id]
    );
    return 'JOINED';
  });
}

export async function inviteFriendToMatch(sender: User, friendUserId: string, matchId: string): Promise<void> {
  const [friend, match] = await Promise.all([findUserById(friendUserId), getOpenMatch(matchId)]);
  if (!friend || friend.id === sender.id) throw new HttpError(404, 'Davet edilecek kullanıcı bulunamadı.');
  if (!match || match.status === 'CANCELLED') throw new HttpError(404, 'Açık maç bulunamadı.');
  await addNotification(getDb(), {
    userId: friend.id,
    type: 'match_invite',
    title: 'Maç Daveti Geldi! 🎾',
    body: `${sender.displayName} sizi "${match.business?.name ?? 'Padel Tesisi'} - ${match.court?.name ?? 'Padel Kortu'}" maçına davet etti!`,
    reservationId: match.id,
    actorUserId: sender.id
  });
}
