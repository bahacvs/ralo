import { getDb, type Queryable } from '../db/instance.js';
import { USER_SELECT, toUser, toMaskedName } from './mappers.js';
import { isUuid, HttpError } from './util.js';
import { addNotification } from './notifications.js';
import type { User, PlaySide, DominantHand } from '../../src/types/index.js';

export const DEFAULT_AVATAR_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

// A "player" is an active account without an active club membership.
const IS_PLAYER = `NOT EXISTS (SELECT 1 FROM app.club_memberships cm WHERE cm.user_id = u.id AND cm.status = 'active')`;

export async function findUserById(id: string, q: Queryable = getDb()): Promise<User | null> {
  if (!isUuid(id)) return null;
  const { rows } = await q.query(`SELECT ${USER_SELECT} WHERE u.id = $1 AND u.status = 'active'`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

/** The signed-in user's own view: adds friend and favourite court ids. */
export async function getOwnProfile(id: string): Promise<User | null> {
  const user = await findUserById(id);
  if (!user) return null;
  const { rows } = await getDb().query<{ friends: string[]; favorites: string[] }>(
    `SELECT ARRAY(SELECT friend_user_id FROM app.friendships WHERE user_id = $1 ORDER BY created_at) AS friends,
            ARRAY(SELECT court_id FROM app.favorite_courts WHERE user_id = $1 ORDER BY created_at) AS favorites`,
    [id]
  );
  return { ...user, friends: rows[0].friends, favoriteCourtIds: rows[0].favorites };
}

export interface Credential {
  id: string;
  displayName: string;
  passwordHash: string | null;
  status: string;
}

export async function findCredentialByEmail(email: string, q: Queryable = getDb()): Promise<Credential | null> {
  const { rows } = await q.query(
    `SELECT id, display_name, password_hash, status FROM app.users WHERE email = $1`,
    [email]
  );
  const row = rows[0];
  return row ? { id: row.id, displayName: row.display_name, passwordHash: row.password_hash, status: row.status } : null;
}

export async function createPlayer(
  input: { email: string; displayName: string; passwordHash: string },
  q: Queryable = getDb()
): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO app.users (email, display_name, masked_name, avatar_url, password_hash, terms_accepted_at)
     VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
    [input.email, input.displayName, toMaskedName(input.displayName), DEFAULT_AVATAR_URL, input.passwordHash]
  );
  return rows[0].id;
}

/** An account created for someone else (club staff, club owner); they set a password via the emailed link. */
export async function createInvitedUser(email: string, displayName: string, q: Queryable = getDb()): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO app.users (email, display_name, masked_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, displayName, toMaskedName(displayName), DEFAULT_AVATAR_URL]
  );
  return rows[0].id;
}

export async function setPasswordHash(userId: string, passwordHash: string, q: Queryable = getDb()): Promise<void> {
  await q.query(`UPDATE app.users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

export async function markEmailVerified(userId: string, q: Queryable = getDb()): Promise<void> {
  await q.query(`UPDATE app.users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [userId]);
}

export async function updateProfile(
  userId: string,
  fields: { avatarUrl?: string; displayName?: string; playSide?: PlaySide; dominantHand?: DominantHand }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  const add = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.avatarUrl !== undefined) add('avatar_url', fields.avatarUrl);
  if (fields.displayName !== undefined) {
    add('display_name', fields.displayName);
    add('masked_name', toMaskedName(fields.displayName));
  }
  if (fields.playSide !== undefined) add('play_side', fields.playSide.toLowerCase());
  if (fields.dominantHand !== undefined) add('dominant_hand', fields.dominantHand.toLowerCase());
  if (sets.length === 0) return;
  await getDb().query(`UPDATE app.users SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function updateNotificationSettings(
  userId: string,
  settings: { pushNotificationsEnabled?: boolean; reminder2HoursBefore?: boolean; notificationSoundEnabled?: boolean }
): Promise<void> {
  await getDb().query(
    `UPDATE app.users SET
       push_notifications_enabled = COALESCE($2, push_notifications_enabled),
       reminder_2h_enabled        = COALESCE($3, reminder_2h_enabled),
       notification_sound_enabled = COALESCE($4, notification_sound_enabled)
     WHERE id = $1`,
    [
      userId,
      typeof settings.pushNotificationsEnabled === 'boolean' ? settings.pushNotificationsEnabled : null,
      typeof settings.reminder2HoursBefore === 'boolean' ? settings.reminder2HoursBefore : null,
      typeof settings.notificationSoundEnabled === 'boolean' ? settings.notificationSoundEnabled : null
    ]
  );
}

/** Players ranked by Elo (desc), ties broken by match count. */
export async function getLeaderboard(limit = 50): Promise<User[]> {
  const { rows } = await getDb().query(
    `SELECT ${USER_SELECT} WHERE u.status = 'active' AND ${IS_PLAYER}
     ORDER BY u.elo DESC, u.matches_count DESC, u.created_at LIMIT $1`,
    [limit]
  );
  return rows.map(toUser);
}

/** Capped so a single account cannot enumerate the whole user base. */
export async function listOtherPlayers(userId: string, limit = 100): Promise<User[]> {
  const { rows } = await getDb().query(
    `SELECT ${USER_SELECT} WHERE u.status = 'active' AND u.id <> $1 AND ${IS_PLAYER}
     ORDER BY u.elo DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(toUser);
}

export async function getFriends(userId: string): Promise<User[]> {
  const { rows } = await getDb().query(
    `SELECT ${USER_SELECT} JOIN app.friendships f ON f.friend_user_id = u.id
     WHERE f.user_id = $1 AND u.status = 'active' ORDER BY f.created_at`,
    [userId]
  );
  return rows.map(toUser);
}

export async function toggleFriend(user: User, targetUserId: string): Promise<{ isFriend: boolean; friends: string[] }> {
  if (!isUuid(targetUserId) || targetUserId === user.id || !(await findUserById(targetUserId))) {
    throw new HttpError(404, 'Kullanıcı bulunamadı.');
  }
  return getDb().tx(async q => {
    const removed = await q.query(
      `DELETE FROM app.friendships WHERE user_id = $1 AND friend_user_id = $2 RETURNING user_id`,
      [user.id, targetUserId]
    );
    const isFriend = removed.rows.length === 0;
    if (isFriend) {
      await q.query(`INSERT INTO app.friendships (user_id, friend_user_id) VALUES ($1, $2)`, [user.id, targetUserId]);
      await addNotification(q, {
        userId: targetUserId,
        type: 'friend_add',
        title: 'Yeni Arkadaşlık 👋',
        body: `${user.displayName} sizi arkadaş olarak ekledi.`,
        actorUserId: user.id
      });
    }
    const { rows } = await q.query<{ friend_user_id: string }>(
      `SELECT friend_user_id FROM app.friendships WHERE user_id = $1 ORDER BY created_at`,
      [user.id]
    );
    return { isFriend, friends: rows.map(r => r.friend_user_id) };
  });
}

const ANONYMIZE_REFUSALS: Record<string, string> = {
  active_club_owner: 'İşletme sahibi hesapları uygulama içinden silinemez. Lütfen destek ekibiyle iletişime geçin.',
  platform_admin: 'Platform yöneticisi hesapları uygulama içinden silinemez.',
  active_coach_contract: 'Gelecek tarihli ders oturumlarınız olduğu için hesabınız şu an silinemez.'
};

/** KVKK deletion: anonymizes the account in the database (app.anonymize_user) and ends its sessions. */
export async function anonymizeUser(userId: string): Promise<void> {
  try {
    await getDb().tx(async q => {
      await q.query(`SELECT app.anonymize_user($1) AS summary`, [userId]);
    });
  } catch (err) {
    const refusal = /anonymize_refused:(\w+)/.exec(err instanceof Error ? err.message : '');
    if (refusal) {
      throw new HttpError(409, ANONYMIZE_REFUSALS[refusal[1]] ?? 'Hesabınız şu an silinemiyor. Lütfen destek ekibiyle iletişime geçin.');
    }
    throw err;
  }
}
