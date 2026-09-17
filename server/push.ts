import webpush from 'web-push';
import { getDb } from './db/instance.js';
import { HttpError } from './repo/util.js';

/**
 * Web push. Notifications are written to app.notifications as before; a loop (every minute) sends the new ones
 * to the user's subscribed devices exactly once (notifications.pushed_at) and creates 2-hour match reminders.
 * Without VAPID keys push stays off and the app works as before.
 */

interface StoredSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

type Sender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>;

let publicKey: string | null = null;
let sender: Sender = async (subscription, payload) => {
  await webpush.sendNotification(subscription, payload, { TTL: 3600, urgency: 'normal' });
};

/** Reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. Returns whether push is enabled. */
export function configurePush(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    publicKey = null;
    return false;
  }
  const subject = process.env.VAPID_SUBJECT?.trim() || `mailto:${process.env.SMTP_USER || 'destek@ralo.app'}`;
  webpush.setVapidDetails(subject, pub, priv);
  publicKey = pub;
  return true;
}

/** Tests replace the network call. */
export function usePushSenderForTests(fn: Sender, key = 'BTestPublicKey') {
  sender = fn;
  publicKey = key;
}

export const getPushPublicKey = () => publicKey;

export async function saveSubscription(userId: string, input: unknown, userAgent: string | undefined): Promise<void> {
  if (!publicKey) throw new HttpError(503, 'Telefon bildirimleri şu an kullanılamıyor.');
  const sub = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || p256dh.length < 20 || p256dh.length > 200 || auth.length < 8 || auth.length > 100) {
    throw new HttpError(400, 'Bildirim aboneliği geçersiz.');
  }
  // One device = one endpoint; a different account signing in on the same device takes it over
  await getDb().query(
    `INSERT INTO app.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, failure_count = 0`,
    [userId, endpoint, p256dh, auth, userAgent?.slice(0, 300) ?? null]
  );
}

export async function deleteSubscription(userId: string, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== 'string') throw new HttpError(400, 'Abonelik adresi zorunludur.');
  await getDb().query(`DELETE FROM app.push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
}

/** Where tapping the notification opens the app. */
function urlFor(type: string): string {
  if (type === 'new_message') return '/mesajlar';
  if (type.startsWith('lesson_') || type === 'coach_note') return '/dersler';
  if (type === 'friend_add') return '/profil';
  if (type.startsWith('statement_')) return '/panel';
  return '/maclarim';
}

/** Creates the "2 hours to go" notification for everyone playing (owner + active participants), once per match. */
export async function createDueReminders(): Promise<number> {
  const { rows } = await getDb().query(
    `INSERT INTO app.notifications (user_id, type, title, body, reservation_id, court_id, dedupe_key)
     SELECT DISTINCT ON (x.user_id, r.id) x.user_id, 'match_reminder_2h', '⏰ Maçınıza 2 Saat Kaldı!',
            to_char(r.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY') || ' saat ' ||
            to_char(r.starts_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') || '''te "' || co.name || '" (' || c.name ||
            ') maçınız 2 saat sonra başlıyor. Ekipmanlarınızı hazırlayın!',
            r.id, r.court_id, 'reminder2h:' || r.id
     FROM app.reservations r
     JOIN app.courts co ON co.id = r.court_id
     JOIN app.clubs c ON c.id = r.club_id
     JOIN LATERAL (
       SELECT r.owner_user_id AS user_id WHERE r.owner_user_id IS NOT NULL AND r.source <> 'lesson'
       UNION
       SELECT p.user_id FROM app.reservation_participants p WHERE p.reservation_id = r.id AND p.status = 'active'
     ) x ON true
     JOIN app.users u ON u.id = x.user_id AND u.status = 'active' AND u.reminder_2h_enabled
     WHERE r.status IN ('pending','confirmed') AND r.starts_at > now() AND r.starts_at <= now() + interval '2 hours 15 minutes'
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`
  );
  return rows.length;
}

async function recordFailure(sub: StoredSubscription, err: any) {
  const status = err?.statusCode;
  if (status === 404 || status === 410) {
    // The browser dropped the subscription (app uninstalled, permission revoked)
    await getDb().query(`DELETE FROM app.push_subscriptions WHERE id = $1`, [sub.id]);
    return;
  }
  const { rows } = await getDb().query<{ failure_count: number }>(
    `UPDATE app.push_subscriptions SET failure_count = failure_count + 1 WHERE id = $1 RETURNING failure_count`, [sub.id]
  );
  if ((rows[0]?.failure_count ?? 0) >= 5) {
    await getDb().query(`DELETE FROM app.push_subscriptions WHERE id = $1`, [sub.id]);
  }
  console.error('Push delivery failed:', status ?? err?.message);
}

/** Sends notifications created in the last hour that were not pushed yet. Returns the number of deliveries. */
export async function dispatchPendingPushes(limit = 100): Promise<number> {
  if (!publicKey) return 0;
  const batch = await getDb().tx(async q => {
    const { rows } = await q.query<{ id: string; user_id: string; type: string; title: string; body: string; reservation_id: string | null }>(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.reservation_id
       FROM app.notifications n
       WHERE n.pushed_at IS NULL AND n.created_at > now() - interval '1 hour'
       ORDER BY n.created_at LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    if (rows.length === 0) return { notifications: rows, subscriptions: [] as StoredSubscription[] };
    await q.query(`UPDATE app.notifications SET pushed_at = now() WHERE id = ANY(string_to_array($1, ',')::uuid[])`, [rows.map(r => r.id).join(',')]);
    const subs = await q.query<StoredSubscription>(
      `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth
       FROM app.push_subscriptions s JOIN app.users u ON u.id = s.user_id
       WHERE u.push_notifications_enabled AND u.status = 'active'
         AND s.user_id = ANY(string_to_array($1, ',')::uuid[])`,
      [[...new Set(rows.map(r => r.user_id))].join(',')]
    );
    return { notifications: rows, subscriptions: subs.rows };
  });

  let delivered = 0;
  for (const notification of batch.notifications) {
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: urlFor(notification.type),
      tag: notification.reservation_id ? `${notification.type}:${notification.reservation_id}` : notification.id
    });
    for (const sub of batch.subscriptions.filter(s => s.user_id === notification.user_id)) {
      try {
        await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        delivered++;
        await getDb().query(`UPDATE app.push_subscriptions SET last_used_at = now(), failure_count = 0 WHERE id = $1`, [sub.id]);
      } catch (err) {
        await recordFailure(sub, err);
      }
    }
  }
  return delivered;
}
