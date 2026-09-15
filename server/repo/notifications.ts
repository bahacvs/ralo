import { getDb, type Queryable } from '../db/instance.js';
import { NOTIFICATION_SELECT, toNotification } from './mappers.js';
import { isUuid } from './util.js';
import type { Notification } from '../../src/types/index.js';

export interface NewNotification {
  userId: string;
  /** app.notifications.type, e.g. 'match_join' */
  type: string;
  title: string;
  body: string;
  reservationId?: string;
  courtId?: string;
  actorUserId?: string;
  /** At most one notification per user and key (e.g. 'reminder2h:<reservation id>'). */
  dedupeKey?: string;
}

/** Inserts a notification; returns its id, or null when the dedupe key already exists. */
export async function addNotification(q: Queryable, n: NewNotification): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO app.notifications (user_id, type, title, body, reservation_id, court_id, actor_user_id, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [n.userId, n.type, n.title, n.body, n.reservationId ?? null, n.courtId ?? null, n.actorUserId ?? null, n.dedupeKey ?? null]
  );
  return rows[0]?.id ?? null;
}

export async function getNotification(id: string, q: Queryable = getDb()): Promise<Notification | null> {
  const { rows } = await q.query(`SELECT ${NOTIFICATION_SELECT} WHERE n.id = $1`, [id]);
  return rows[0] ? toNotification(rows[0]) : null;
}

export async function listNotifications(userId: string, limit = 100): Promise<Notification[]> {
  const { rows } = await getDb().query(
    `SELECT ${NOTIFICATION_SELECT} WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(toNotification);
}

export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { rows } = await getDb().query(
    `UPDATE app.notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await getDb().query(`UPDATE app.notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
}
