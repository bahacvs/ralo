import { getDb, type Queryable } from '../db/instance.js';
import { addNotification } from './notifications.js';
import { isUuid, HttpError } from './util.js';
import type { User } from '../../src/types/index.js';

/** How long the other team has to confirm or dispute before the result counts automatically. */
export const CONFIRM_WINDOW_HOURS = 48;
/** Results can be submitted up to this many days after the match ends. */
export const SUBMIT_WINDOW_DAYS = 7;
export const ELO_ALGORITHM = 'elo-doubles-v1';

export type TeamSide = 'a' | 'b';

export interface MatchResultView {
  teamA: { userId: string; maskedName: string }[];
  teamB: { userId: string; maskedName: string }[];
  sets: [number, number][];
  winner: TeamSide;
  status: 'PENDING' | 'CONFIRMED' | 'DISPUTED';
  submittedBy: string | null;
  confirmedAutomatically: boolean;
  disputeReason: string | null;
  confirmDeadline: string;
  /** The caller is on the other team of a pending result and may confirm or dispute it. */
  canRespond: boolean;
  /** Elo change per player, once confirmed. */
  eloChanges: Record<string, number>;
}

// -------------------------------------------------------------
// Elo (chess formula, doubles: team average rating)
// -------------------------------------------------------------

/** FIDE-style K: 40 for the first 30 rated matches, 10 from 2400, otherwise 20. */
export function kFactor(elo: number, matchesCount: number): number {
  if (matchesCount < 30) return 40;
  return elo >= 2400 ? 10 : 20;
}

export const expectedScore = (teamRating: number, opponentRating: number) =>
  1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));

export interface RatedPlayer { userId: string; elo: number; matchesCount: number }

export interface EloChange {
  userId: string;
  eloBefore: number;
  eloAfter: number;
  delta: number;
  teamRating: number;
  opponentRating: number;
  expectedScore: number;
  actualScore: 0 | 1;
  k: number;
}

export function computeEloChanges(teamA: RatedPlayer[], teamB: RatedPlayer[], winner: TeamSide): EloChange[] {
  const avg = (team: RatedPlayer[]) => Math.round(team.reduce((sum, p) => sum + p.elo, 0) / team.length);
  const ratingA = avg(teamA);
  const ratingB = avg(teamB);
  const side = (team: RatedPlayer[], own: number, other: number, actual: 0 | 1) => {
    const expected = expectedScore(own, other);
    return team.map(p => {
      const k = kFactor(p.elo, p.matchesCount);
      const eloAfter = Math.min(4000, Math.max(0, p.elo + Math.round(k * (actual - expected))));
      return {
        userId: p.userId, eloBefore: p.elo, eloAfter, delta: eloAfter - p.elo,
        teamRating: own, opponentRating: other, expectedScore: Math.round(expected * 10000) / 10000, actualScore: actual, k
      };
    });
  };
  return [
    ...side(teamA, ratingA, ratingB, winner === 'a' ? 1 : 0),
    ...side(teamB, ratingB, ratingA, winner === 'b' ? 1 : 0)
  ];
}

// -------------------------------------------------------------
// Validation
// -------------------------------------------------------------

/** Set scores like [[6,4],[3,6],[7,5]]; every set needs a winner and the match needs a majority. */
export function parseSets(value: unknown): { sets: [number, number][]; winner: TeamSide } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new HttpError(400, 'Skor 1 ile 3 set arasında olmalıdır.');
  }
  let wonA = 0;
  let wonB = 0;
  const sets = value.map((set, index): [number, number] => {
    if (!Array.isArray(set) || set.length !== 2) throw new HttpError(400, `${index + 1}. set skoru geçersiz.`);
    const [a, b] = set.map(Number);
    if (![a, b].every(n => Number.isInteger(n) && n >= 0 && n <= 99)) {
      throw new HttpError(400, `${index + 1}. set skoru 0 ile 99 arasında tam sayı olmalıdır.`);
    }
    if (a === b) throw new HttpError(400, `${index + 1}. sette bir kazanan olmalıdır.`);
    if (a > b) wonA++; else wonB++;
    return [a, b];
  });
  if (wonA === wonB) throw new HttpError(400, 'Maçın bir kazananı olmalıdır; set sayıları eşit olamaz.');
  return { sets, winner: wonA > wonB ? 'a' : 'b' };
}

interface LockedMatch {
  status: string;
  source: string;
  ended: boolean;
  submit_closed: boolean;
  club_name: string;
  active: string[];
}

async function lockMatch(q: Queryable, reservationId: string): Promise<LockedMatch> {
  if (!isUuid(reservationId)) throw new HttpError(404, 'Maç bulunamadı.');
  const { rows } = await q.query<LockedMatch>(
    `SELECT r.status, r.source, (r.ends_at <= now()) AS ended,
            (r.ends_at < now() - make_interval(days => $2)) AS submit_closed, c.name AS club_name,
            ARRAY(SELECT p.user_id::text FROM app.reservation_participants p
                  WHERE p.reservation_id = r.id AND p.status = 'active' ORDER BY p.slot_index) AS active
     FROM app.reservations r JOIN app.clubs c ON c.id = r.club_id
     WHERE r.id = $1
     FOR UPDATE OF r`,
    [reservationId, SUBMIT_WINDOW_DAYS]
  );
  if (!rows[0]) throw new HttpError(404, 'Maç bulunamadı.');
  return rows[0];
}

const sideOf = (row: { team_a: string[]; team_b: string[] }, userId: string): TeamSide | null =>
  row.team_a.includes(userId) ? 'a' : row.team_b.includes(userId) ? 'b' : null;

async function notifyUsers(q: Queryable, userIds: string[], reservationId: string, title: string, body: string, actorUserId?: string) {
  for (const userId of userIds) {
    await addNotification(q, { userId, type: 'match_result', title, body, reservationId, actorUserId });
  }
}

// -------------------------------------------------------------
// Submit, confirm, dispute
// -------------------------------------------------------------

export async function submitResult(
  reservationId: string, user: User, input: { teamA?: unknown; teamB?: unknown; sets?: unknown }
): Promise<void> {
  const { sets, winner } = parseSets(input.sets);
  await getDb().tx(async q => {
    const match = await lockMatch(q, reservationId);
    if (match.source !== 'app') throw new HttpError(400, 'Yalnızca uygulamadan oluşturulan maçlar için sonuç girilebilir.');
    if (match.status === 'cancelled' || match.status === 'no_show') throw new HttpError(400, 'İptal edilen veya oynanmayan maç için sonuç girilemez.');
    if (!match.ended) throw new HttpError(400, 'Sonuç, maç bittikten sonra girilebilir.');
    if (match.submit_closed) throw new HttpError(400, `Sonuç, maçtan sonraki ${SUBMIT_WINDOW_DAYS} gün içinde girilebilir.`);
    if (!match.active.includes(user.id)) throw new HttpError(403, 'Yalnızca maçta oynayan oyuncular sonuç girebilir.');
    if (match.active.length !== 4) throw new HttpError(400, 'Elo için sonuç girebilmek adına maçta 4 oyuncu kayıtlı olmalıdır.');

    const teamA = Array.isArray(input.teamA) ? input.teamA.map(String) : [];
    const teamB = Array.isArray(input.teamB) ? input.teamB.map(String) : [];
    const all = [...teamA, ...teamB];
    if (teamA.length !== 2 || teamB.length !== 2 || new Set(all).size !== 4 || !all.every(id => match.active.includes(id))) {
      throw new HttpError(400, 'Takımlar, maçtaki 4 oyuncudan ikişer kişi olarak seçilmelidir.');
    }

    const existing = await q.query<{ status: string }>(
      `SELECT status FROM app.match_results WHERE reservation_id = $1 FOR UPDATE`, [reservationId]
    );
    if (existing.rows[0]?.status === 'confirmed') throw new HttpError(409, 'Bu maçın sonucu onaylanmış ve değiştirilemez.');
    if (existing.rows[0]?.status === 'pending') throw new HttpError(409, 'Bu maç için onay bekleyen bir sonuç zaten var.');

    await q.query(
      `INSERT INTO app.match_results (reservation_id, team_a, team_b, sets, winner, status, submitted_by, confirm_deadline)
       VALUES ($1, string_to_array($2, ',')::uuid[], string_to_array($3, ',')::uuid[], $4::jsonb, $5, 'pending', $6,
               now() + make_interval(hours => $7))
       ON CONFLICT (reservation_id) DO UPDATE
         SET team_a = EXCLUDED.team_a, team_b = EXCLUDED.team_b, sets = EXCLUDED.sets, winner = EXCLUDED.winner,
             status = 'pending', submitted_by = EXCLUDED.submitted_by, confirmed_by = NULL, disputed_by = NULL,
             dispute_reason = NULL, confirm_deadline = EXCLUDED.confirm_deadline, submitted_at = now(), resolved_at = NULL`,
      [reservationId, teamA.join(','), teamB.join(','), JSON.stringify(sets), winner, user.id, CONFIRM_WINDOW_HOURS]
    );
    const opponents = teamA.includes(user.id) ? teamB : teamA;
    const score = sets.map(([a, b]) => `${a}-${b}`).join(', ');
    await notifyUsers(q, opponents, reservationId, 'Maç Sonucu Onayınızı Bekliyor',
      `${user.displayName}, ${match.club_name} maçının sonucunu girdi (${score}). ${CONFIRM_WINDOW_HOURS} saat içinde onaylayın veya itiraz edin; yanıt verilmezse sonuç kesinleşir.`,
      user.id);
  });
}

export async function confirmResult(reservationId: string, user: User): Promise<EloChange[]> {
  return getDb().tx(async q => {
    await lockMatch(q, reservationId);
    const result = await lockPendingResult(q, reservationId, user);
    return applyElo(q, reservationId, result, user.id);
  });
}

export async function disputeResult(reservationId: string, user: User, reason: unknown): Promise<void> {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > 300) throw new HttpError(400, 'İtiraz açıklaması en fazla 300 karakter olabilir.');
  await getDb().tx(async q => {
    const match = await lockMatch(q, reservationId);
    const result = await lockPendingResult(q, reservationId, user);
    await q.query(
      `UPDATE app.match_results SET status = 'disputed', disputed_by = $2, dispute_reason = $3, resolved_at = now()
       WHERE reservation_id = $1`,
      [reservationId, user.id, text || null]
    );
    const submitterTeam = sideOf(result, user.id) === 'a' ? result.team_b : result.team_a;
    await notifyUsers(q, submitterTeam, reservationId, 'Maç Sonucuna İtiraz Edildi',
      `${user.displayName}, ${match.club_name} maçı için girilen sonuca itiraz etti${text ? `: "${text}"` : ''}. Doğru skoru yeniden girebilirsiniz.`,
      user.id);
  });
}

interface ResultRow {
  team_a: string[];
  team_b: string[];
  winner: TeamSide;
  status: string;
  submitted_by: string | null;
}

async function lockPendingResult(q: Queryable, reservationId: string, user: User): Promise<ResultRow> {
  const { rows } = await q.query<ResultRow>(
    `SELECT team_a::text[] AS team_a, team_b::text[] AS team_b, winner, status, submitted_by
     FROM app.match_results WHERE reservation_id = $1 FOR UPDATE`,
    [reservationId]
  );
  const result = rows[0];
  if (!result || result.status !== 'pending') throw new HttpError(404, 'Onay bekleyen bir maç sonucu bulunamadı.');
  const mySide = sideOf(result, user.id);
  const submitterSide = result.submitted_by ? sideOf(result, result.submitted_by) : null;
  if (!mySide || mySide === submitterSide) {
    throw new HttpError(403, 'Sonucu yalnızca rakip takımdaki oyuncular onaylayabilir veya itiraz edebilir.');
  }
  return result;
}

/** Confirms the result and writes one elo_events row per player (idempotent per reservation). */
async function applyElo(q: Queryable, reservationId: string, result: ResultRow, confirmedBy: string | null): Promise<EloChange[]> {
  const ids = [...result.team_a, ...result.team_b];
  const { rows } = await q.query<{ id: string; elo: number; matches_count: number }>(
    `SELECT id::text AS id, elo, matches_count FROM app.users
     WHERE id = ANY(string_to_array($1, ',')::uuid[]) ORDER BY id FOR UPDATE`,
    [ids.join(',')]
  );
  const byId = new Map(rows.map(r => [r.id, { userId: r.id, elo: r.elo, matchesCount: r.matches_count }]));
  const team = (members: string[]) => members.map(id => byId.get(id)).filter((p): p is RatedPlayer => !!p);
  const changes = computeEloChanges(team(result.team_a), team(result.team_b), result.winner);

  await q.query(
    `UPDATE app.match_results SET status = 'confirmed', confirmed_by = $2, resolved_at = now() WHERE reservation_id = $1`,
    [reservationId, confirmedBy]
  );
  for (const c of changes) {
    const inserted = await q.query(
      `INSERT INTO app.elo_events (user_id, reservation_id, delta, elo_before, elo_after, reason, team_rating, opponent_rating,
                                   expected_score, actual_score, k_factor, algorithm_ver, created_by)
       VALUES ($1, $2, $3, $4, $5, 'match_result', $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id, reservation_id, reason) DO NOTHING
       RETURNING id`,
      [c.userId, reservationId, c.delta, c.eloBefore, c.eloAfter, c.teamRating, c.opponentRating,
       c.expectedScore, c.actualScore, c.k, ELO_ALGORITHM, confirmedBy]
    );
    if (inserted.rows.length > 0) {
      await q.query(`UPDATE app.users SET elo = $2, matches_count = matches_count + 1 WHERE id = $1`, [c.userId, c.eloAfter]);
    }
  }
  await q.query(`UPDATE app.reservations SET status = 'completed' WHERE id = $1 AND status IN ('pending','confirmed')`, [reservationId]);

  for (const c of changes) {
    await addNotification(q, {
      userId: c.userId,
      type: 'match_result',
      title: c.delta >= 0 ? `Maç Sonucu Kesinleşti: +${c.delta} Elo 📈` : `Maç Sonucu Kesinleşti: ${c.delta} Elo`,
      body: `Yeni Elo puanınız ${c.eloAfter} (önceki ${c.eloBefore}).`,
      reservationId,
      dedupeKey: `elo:${reservationId}`
    });
  }
  return changes;
}

/** Background job: confirms pending results whose confirmation window has passed. */
export async function autoConfirmDueResults(limit = 100): Promise<number> {
  const { rows } = await getDb().query<{ reservation_id: string }>(
    `SELECT reservation_id FROM app.match_results WHERE status = 'pending' AND confirm_deadline <= now()
     ORDER BY confirm_deadline LIMIT $1`,
    [limit]
  );
  let confirmed = 0;
  for (const row of rows) {
    const done = await getDb().tx(async q => {
      const locked = await q.query<ResultRow>(
        `SELECT team_a::text[] AS team_a, team_b::text[] AS team_b, winner, status, submitted_by
         FROM app.match_results WHERE reservation_id = $1 AND status = 'pending' AND confirm_deadline <= now() FOR UPDATE`,
        [row.reservation_id]
      );
      if (!locked.rows[0]) return false;
      await applyElo(q, row.reservation_id, locked.rows[0], null);
      return true;
    });
    if (done) confirmed++;
  }
  return confirmed;
}

// -------------------------------------------------------------
// Reading
// -------------------------------------------------------------

/** Results (with Elo changes) for the given reservations, as seen by `viewerId`. */
export async function getResults(reservationIds: string[], viewerId: string): Promise<Map<string, MatchResultView>> {
  const map = new Map<string, MatchResultView>();
  if (reservationIds.length === 0) return map;
  const { rows } = await getDb().query(
    `SELECT mr.reservation_id, mr.team_a::text[] AS team_a, mr.team_b::text[] AS team_b, mr.sets, mr.winner, mr.status,
            mr.submitted_by, mr.confirmed_by, mr.dispute_reason, mr.confirm_deadline,
            (SELECT jsonb_object_agg(u.id, u.masked_name) FROM app.users u
             WHERE u.id = ANY(mr.team_a || mr.team_b)) AS names,
            (SELECT jsonb_object_agg(e.user_id, e.delta) FROM app.elo_events e
             WHERE e.reservation_id = mr.reservation_id AND e.reason = 'match_result') AS elo
     FROM app.match_results mr
     WHERE mr.reservation_id = ANY(string_to_array($1, ',')::uuid[])`,
    [reservationIds.join(',')]
  );
  for (const row of rows) {
    const names = row.names ?? {};
    const people = (ids: string[]) => ids.map(id => ({ userId: id, maskedName: names[id] ?? 'Oyuncu' }));
    const viewerSide = sideOf(row, viewerId);
    const submitterSide = row.submitted_by ? sideOf(row, row.submitted_by) : null;
    map.set(row.reservation_id, {
      teamA: people(row.team_a),
      teamB: people(row.team_b),
      sets: row.sets,
      winner: row.winner,
      status: String(row.status).toUpperCase() as MatchResultView['status'],
      submittedBy: row.submitted_by,
      confirmedAutomatically: row.status === 'confirmed' && !row.confirmed_by,
      disputeReason: row.dispute_reason ?? null,
      confirmDeadline: new Date(row.confirm_deadline).toISOString(),
      canRespond: row.status === 'pending' && !!viewerSide && viewerSide !== submitterSide,
      eloChanges: row.elo ?? {}
    });
  }
  return map;
}
