import { getDb } from '../db/instance.js';
import { isUuid, HttpError } from './util.js';
import { iso } from './mappers.js';
import type { User } from '../../src/types/index.js';
import type { ClubReview, ClubReviewsResponse } from '../../src/types/reviews.js';

/** Played at the club: a finished reservation they owned or joined, or a finished lesson session. $1 club, $2 user. */
const PLAYED_AT_CLUB = `
  EXISTS (SELECT 1 FROM app.reservations r
          WHERE r.club_id = $1 AND r.ends_at < now() AND r.status IN ('confirmed','completed')
            AND (r.owner_user_id = $2 OR EXISTS (SELECT 1 FROM app.reservation_participants p
                                                 WHERE p.reservation_id = r.id AND p.user_id = $2 AND p.status = 'active')))
  OR EXISTS (SELECT 1 FROM app.lesson_enrollments e
             JOIN app.lessons l ON l.id = e.lesson_id
             JOIN app.lesson_sessions s ON s.lesson_id = l.id
             JOIN app.reservations r ON r.id = s.reservation_id
             WHERE l.club_id = $1 AND e.user_id = $2 AND e.status = 'enrolled'
               AND r.ends_at < now() AND r.status IN ('confirmed','completed'))`;

const REVIEW_SELECT = `
  r.id, r.rating, r.comment, r.user_id, r.created_at, r.updated_at, u.masked_name, u.avatar_url
  FROM app.club_reviews r JOIN app.users u ON u.id = r.user_id`;

function toReview(row: any): ClubReview {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment ?? null,
    userId: row.user_id,
    userMaskedName: row.masked_name,
    userAvatar: row.avatar_url ?? '',
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export async function getClubReviews(clubId: string, viewerId: string | null): Promise<ClubReviewsResponse> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  const club = await getDb().query<{ rating_avg: number | null; reviews_count: number }>(
    `SELECT rating_avg, reviews_count FROM app.clubs WHERE id = $1 AND is_active`, [clubId]
  );
  if (!club.rows[0]) throw new HttpError(404, 'Kulüp bulunamadı.');
  const list = await getDb().query(`SELECT ${REVIEW_SELECT} WHERE r.club_id = $1 ORDER BY r.updated_at DESC LIMIT 50`, [clubId]);
  const distribution = await getDb().query<{ rating: number; n: number }>(
    `SELECT rating, count(*)::int AS n FROM app.club_reviews WHERE club_id = $1 GROUP BY rating`, [clubId]
  );

  let viewer: ClubReviewsResponse['viewer'] = null;
  if (viewerId) {
    const { rows } = await getDb().query<{ played: boolean }>(`SELECT (${PLAYED_AT_CLUB}) AS played`, [clubId, viewerId]);
    const mine = await getDb().query(`SELECT ${REVIEW_SELECT} WHERE r.club_id = $1 AND r.user_id = $2`, [clubId, viewerId]);
    viewer = { canReview: !!rows[0]?.played, myReview: mine.rows[0] ? toReview(mine.rows[0]) : null };
  }

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const row of distribution.rows) dist[row.rating as 1 | 2 | 3 | 4 | 5] = row.n;
  return {
    summary: {
      average: club.rows[0].rating_avg === null ? null : Number(club.rows[0].rating_avg),
      count: club.rows[0].reviews_count,
      distribution: dist
    },
    reviews: list.rows.map(toReview),
    viewer
  };
}

export async function upsertReview(clubId: string, user: User, rating: unknown, comment: unknown): Promise<void> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Puan 1 ile 5 arasında olmalıdır.');
  const text = typeof comment === 'string' ? comment.trim() : '';
  if (text.length > 1000) throw new HttpError(400, 'Yorum en fazla 1000 karakter olabilir.');

  await getDb().tx(async q => {
    const { rows } = await q.query<{ active: boolean; played: boolean }>(
      `SELECT c.is_active AS active, (${PLAYED_AT_CLUB}) AS played FROM app.clubs c WHERE c.id = $1`,
      [clubId, user.id]
    );
    if (!rows[0]?.active) throw new HttpError(404, 'Kulüp bulunamadı.');
    if (!rows[0].played) throw new HttpError(403, 'Değerlendirme yapabilmek için bu kulüpte oynamış olmanız gerekir.');
    await q.query(
      `INSERT INTO app.club_reviews (club_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)
       ON CONFLICT (club_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
      [clubId, user.id, stars, text || null]
    );
  });
}

export async function deleteMyReview(clubId: string, userId: string): Promise<void> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  const { rows } = await getDb().query(
    `DELETE FROM app.club_reviews WHERE club_id = $1 AND user_id = $2 RETURNING id`, [clubId, userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Bu kulüp için değerlendirmeniz bulunmuyor.');
}

/** Platform admin removes an abusive review; the audit log keeps what was removed. */
export async function adminDeleteReview(adminId: string, reviewId: string): Promise<void> {
  if (!isUuid(reviewId)) throw new HttpError(404, 'Değerlendirme bulunamadı.');
  await getDb().tx(async q => {
    const { rows } = await q.query<{ club_id: string; user_id: string; rating: number; comment: string | null }>(
      `DELETE FROM app.club_reviews WHERE id = $1 RETURNING club_id, user_id, rating, comment`, [reviewId]
    );
    if (!rows[0]) throw new HttpError(404, 'Değerlendirme bulunamadı.');
    await q.query(
      `INSERT INTO app.audit_log (actor_user_id, actor_scope, action, target_type, target_id, club_id, before_data)
       VALUES ($1, 'platform_admin', 'review.remove', 'club_review', $2, $3, $4)`,
      [adminId, reviewId, rows[0].club_id, JSON.stringify(rows[0])]
    );
  });
}
