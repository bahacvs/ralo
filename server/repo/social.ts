import { getDb } from '../db/instance.js';
import { feedCategoryToApi, feedCategoryToDb, iso } from './mappers.js';
import { addNotification } from './notifications.js';
import { findUserById } from './users.js';
import { isUuid, HttpError } from './util.js';
import type { User, FeedPost, FeedReply, Conversation, Message, PlaySide } from '../../src/types/index.js';

// -------------------------------------------------------------
// Community feed
// -------------------------------------------------------------

function toReply(row: any): FeedReply {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.author_id,
    authorName: row.display_name,
    authorAvatar: row.avatar_url ?? '',
    authorElo: row.elo,
    content: row.content,
    createdAt: iso(row.created_at)
  };
}

function toPost(row: any, replies: FeedReply[]): FeedPost {
  return {
    id: row.id,
    userId: row.author_id,
    authorName: row.display_name,
    authorAvatar: row.avatar_url ?? '',
    authorElo: row.elo,
    authorPlaySide: String(row.play_side ?? 'both').toUpperCase() as PlaySide,
    content: row.content,
    category: feedCategoryToApi(row.category),
    venueName: row.venue_name ?? undefined,
    likes: row.likes ?? [],
    replies,
    createdAt: iso(row.created_at)
  };
}

const POST_SELECT = `
  p.id, p.author_id, p.category, p.content, p.venue_name, p.created_at,
  u.display_name, u.avatar_url, u.elo, u.play_side,
  ARRAY(SELECT l.user_id FROM app.feed_post_likes l WHERE l.post_id = p.id ORDER BY l.created_at) AS likes
  FROM app.feed_posts p JOIN app.users u ON u.id = p.author_id`;

const REPLY_SELECT = `
  r.id, r.post_id, r.author_id, r.content, r.created_at, u.display_name, u.avatar_url, u.elo
  FROM app.feed_replies r JOIN app.users u ON u.id = r.author_id`;

export async function listFeed(category?: unknown): Promise<FeedPost[]> {
  const dbCategory = category && category !== 'ALL' ? feedCategoryToDb(category) : null;
  const posts = await getDb().query(
    `SELECT ${POST_SELECT} WHERE p.hidden_at IS NULL AND ($1::text IS NULL OR p.category = $1)
     ORDER BY p.created_at DESC LIMIT 100`,
    [dbCategory]
  );
  if (posts.rows.length === 0) return [];
  const replies = await getDb().query(
    `SELECT ${REPLY_SELECT} WHERE r.post_id = ANY(string_to_array($1, ',')::uuid[]) AND r.hidden_at IS NULL
     ORDER BY r.created_at`,
    [posts.rows.map(p => p.id).join(',')]
  );
  const allReplies = replies.rows.map(toReply);
  return posts.rows.map(row => toPost(row, allReplies.filter(r => r.postId === row.id)));
}

export async function createPost(user: User, content: string, category: unknown, venueName?: string): Promise<FeedPost> {
  const dbCategory = feedCategoryToDb(category ?? 'SOHBET');
  if (!dbCategory) throw new HttpError(400, 'Geçersiz paylaşım kategorisi.');
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO app.feed_posts (author_id, category, content, venue_name) VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, dbCategory, content, venueName || null]
  );
  const post = await getDb().query(`SELECT ${POST_SELECT} WHERE p.id = $1`, [rows[0].id]);
  return toPost(post.rows[0], []);
}

export async function togglePostLike(user: User, postId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  if (!isUuid(postId)) throw new HttpError(404, 'Paylaşım bulunamadı.');
  return getDb().tx(async q => {
    const post = await q.query(`SELECT id FROM app.feed_posts WHERE id = $1 AND hidden_at IS NULL FOR UPDATE`, [postId]);
    if (post.rows.length === 0) throw new HttpError(404, 'Paylaşım bulunamadı.');
    const removed = await q.query(
      `DELETE FROM app.feed_post_likes WHERE post_id = $1 AND user_id = $2 RETURNING post_id`,
      [postId, user.id]
    );
    const isLiked = removed.rows.length === 0;
    if (isLiked) {
      await q.query(`INSERT INTO app.feed_post_likes (post_id, user_id) VALUES ($1, $2)`, [postId, user.id]);
    }
    const { rows } = await q.query<{ like_count: number }>(
      `UPDATE app.feed_posts SET like_count = (SELECT count(*) FROM app.feed_post_likes WHERE post_id = $1)
       WHERE id = $1 RETURNING like_count`,
      [postId]
    );
    return { isLiked, likesCount: rows[0].like_count };
  });
}

export async function replyToPost(user: User, postId: string, content: string): Promise<FeedReply> {
  if (!isUuid(postId)) throw new HttpError(404, 'Paylaşım bulunamadı.');
  return getDb().tx(async q => {
    const post = await q.query(`SELECT id FROM app.feed_posts WHERE id = $1 AND hidden_at IS NULL FOR UPDATE`, [postId]);
    if (post.rows.length === 0) throw new HttpError(404, 'Paylaşım bulunamadı.');
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO app.feed_replies (post_id, author_id, content) VALUES ($1, $2, $3) RETURNING id`,
      [postId, user.id, content]
    );
    await q.query(`UPDATE app.feed_posts SET reply_count = reply_count + 1 WHERE id = $1`, [postId]);
    const reply = await q.query(`SELECT ${REPLY_SELECT} WHERE r.id = $1`, [rows[0].id]);
    return toReply(reply.rows[0]);
  });
}

// -------------------------------------------------------------
// Conversations
// -------------------------------------------------------------

function toConversation(row: any): Conversation {
  return {
    id: row.id,
    matchId: row.reservation_id ?? '',
    title: row.title ?? row.other_name ?? 'Sohbet',
    lastMessage: row.last_message_preview ?? 'Sohbet başlatıldı',
    updatedAt: iso(row.updated_at),
    participantIds: row.participant_ids ?? []
  };
}

/** $1 = viewing user; the title of a direct conversation is the other person's name. */
const CONVERSATION_SELECT = `
  c.id, c.reservation_id, c.title, c.last_message_preview, COALESCE(c.last_message_at, c.created_at) AS updated_at,
  ARRAY(SELECT cp2.user_id FROM app.conversation_participants cp2
        WHERE cp2.conversation_id = c.id AND cp2.left_at IS NULL ORDER BY cp2.joined_at) AS participant_ids,
  (SELECT u.display_name FROM app.conversation_participants cp3 JOIN app.users u ON u.id = cp3.user_id
   WHERE cp3.conversation_id = c.id AND cp3.user_id <> $1 ORDER BY cp3.joined_at LIMIT 1) AS other_name
  FROM app.conversations c`;

export async function listConversations(userId: string): Promise<{ conversations: Conversation[]; messages: Message[] }> {
  const conversations = await getDb().query(
    `SELECT ${CONVERSATION_SELECT}
     JOIN app.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1 AND cp.left_at IS NULL
     ORDER BY updated_at DESC LIMIT 200`,
    [userId]
  );
  if (conversations.rows.length === 0) return { conversations: [], messages: [] };
  const messages = await getDb().query(
    `SELECT m.id, m.conversation_id, m.sender_user_id, u.display_name AS sender_name, m.body, m.created_at
     FROM app.messages m LEFT JOIN app.users u ON u.id = m.sender_user_id
     WHERE m.conversation_id = ANY(string_to_array($1, ',')::uuid[]) AND m.deleted_at IS NULL
     ORDER BY m.created_at LIMIT 2000`,
    [conversations.rows.map(c => c.id).join(',')]
  );
  return {
    conversations: conversations.rows.map(toConversation),
    messages: messages.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderUserId: row.sender_user_id ?? '',
      senderName: row.sender_name ?? 'Silinmiş Kullanıcı',
      text: row.body,
      createdAt: iso(row.created_at)
    }))
  };
}

export async function startDirectConversation(user: User, targetUserId: string): Promise<Conversation> {
  if (targetUserId === user.id) throw new HttpError(400, 'Kendinizle sohbet başlatamazsınız.');
  if (!(await findUserById(targetUserId))) throw new HttpError(404, 'Kullanıcı bulunamadı.');
  const directKey = [user.id, targetUserId].sort().join(':');
  return getDb().tx(async q => {
    await q.query(
      `INSERT INTO app.conversations (kind, direct_key) VALUES ('direct', $1) ON CONFLICT (direct_key) DO NOTHING`,
      [directKey]
    );
    const { rows } = await q.query<{ id: string }>(`SELECT id FROM app.conversations WHERE direct_key = $1`, [directKey]);
    const conversationId = rows[0].id;
    await q.query(
      `INSERT INTO app.conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL`,
      [conversationId, user.id, targetUserId]
    );
    const conversation = await q.query(`SELECT ${CONVERSATION_SELECT} WHERE c.id = $2`, [user.id, conversationId]);
    return toConversation(conversation.rows[0]);
  });
}

export async function sendMessage(user: User, conversationId: string, text: string): Promise<Message> {
  if (!isUuid(conversationId)) throw new HttpError(404, 'Sohbet bulunamadı.');
  return getDb().tx(async q => {
    const members = await q.query<{ user_id: string }>(
      `SELECT user_id FROM app.conversation_participants WHERE conversation_id = $1 AND left_at IS NULL`,
      [conversationId]
    );
    if (!members.rows.some(m => m.user_id === user.id)) throw new HttpError(404, 'Sohbet bulunamadı.');

    const { rows } = await q.query<{ id: string; created_at: Date }>(
      `INSERT INTO app.messages (conversation_id, sender_user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [conversationId, user.id, text]
    );
    const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    await q.query(
      `UPDATE app.conversations SET last_message_at = now(), last_message_preview = $2 WHERE id = $1`,
      [conversationId, preview]
    );
    const snippet = text.length > 60 ? `${text.slice(0, 60)}...` : text;
    for (const member of members.rows.filter(m => m.user_id !== user.id)) {
      await addNotification(q, {
        userId: member.user_id,
        type: 'new_message',
        title: 'Yeni Özel Mesaj 💬',
        body: `${user.displayName}: ${snippet}`,
        actorUserId: user.id
      });
    }
    return {
      id: rows[0].id,
      conversationId,
      senderUserId: user.id,
      senderName: user.displayName,
      text,
      createdAt: iso(rows[0].created_at)
    };
  });
}
