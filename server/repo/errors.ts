import { createHash } from 'crypto';
import { getDb } from '../db/instance.js';

export interface ErrorInput {
  source: 'server' | 'client';
  message: unknown;
  stack?: unknown;
  path?: unknown;
  method?: unknown;
  userAgent?: unknown;
}

export interface ErrorGroup {
  fingerprint: string;
  source: 'server' | 'client';
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  lastPath: string | null;
  lastMethod: string | null;
  lastStack: string | null;
  lastUserAgent: string | null;
}

/**
 * Rows per process per minute, so an error loop cannot flood the database. Separate budgets: anyone can post
 * browser errors, and a flood of those must not crowd out the server's own errors.
 */
const MAX_PER_MINUTE: Record<ErrorInput['source'], number> = { server: 60, client: 30 };
const windows: Record<ErrorInput['source'], { start: number; count: number }> = {
  server: { start: 0, count: 0 },
  client: { start: 0, count: 0 }
};

const text = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s ? s.slice(0, max) : null;
};

/** Removes personal data and secrets that tend to end up in error messages. */
export function scrub(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-posta]')
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [token]')
    .replace(/(token|password|şifre|sifre)=([^&\s]+)/gi, '$1=[gizli]')
    .replace(/postgres(ql)?:\/\/\S+/gi, '[veritabanı-adresi]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[token]')
    .replace(/\b(\+?90|0)?5\d{9}\b/g, '[telefon]');
}

/** Same message (numbers and ids ignored) from the same code location = one group. */
function fingerprintOf(source: string, message: string, stack: string | null): string {
  const normalized = message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '#').replace(/\d+/g, '#').slice(0, 300);
  const frame = (stack ?? '').split('\n').map(l => l.trim()).find(l => l.startsWith('at ') || l.includes('@')) ?? '';
  return createHash('sha256').update(`${source}|${normalized}|${frame.replace(/:\d+:\d+\)?$/, '')}`).digest('hex');
}

/** Stores an error; never throws (error reporting must not cause new errors). */
export async function recordError(input: ErrorInput): Promise<void> {
  try {
    const source = input.source === 'server' ? 'server' : 'client';
    const bucket = windows[source];
    const now = Date.now();
    if (now - bucket.start > 60_000) {
      bucket.start = now;
      bucket.count = 0;
    }
    if (++bucket.count > MAX_PER_MINUTE[source]) return;

    const message = scrub(text(input.message, 1000) ?? 'Bilinmeyen hata');
    const stack = text(input.stack, 8000);
    const scrubbedStack = stack ? scrub(stack) : null;
    // Query strings and URL fragments can carry tokens (#token=...)
    const path = text(input.path, 500)?.split(/[?#]/)[0] ?? null;
    await getDb().query(
      `INSERT INTO app.error_events (source, fingerprint, message, stack, path, method, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [source, fingerprintOf(source, message, scrubbedStack), message, scrubbedStack,
       path ? scrub(path) : null, text(input.method, 10), text(input.userAgent, 300)]
    );
  } catch (err: any) {
    console.error('Could not record error event:', err?.message);
  }
}

export async function listErrorGroups(days = 7): Promise<ErrorGroup[]> {
  const { rows } = await getDb().query(
    `SELECT DISTINCT ON (e.fingerprint) e.fingerprint, e.source, e.message, e.path, e.method, e.stack, e.user_agent,
            g.n, g.first_seen, g.last_seen
     FROM app.error_events e
     JOIN (SELECT fingerprint, count(*)::int AS n, min(created_at) AS first_seen, max(created_at) AS last_seen
           FROM app.error_events WHERE created_at > now() - make_interval(days => $1)
           GROUP BY fingerprint) g ON g.fingerprint = e.fingerprint
     WHERE e.created_at > now() - make_interval(days => $1)
     ORDER BY e.fingerprint, e.created_at DESC`,
    [days]
  );
  return rows
    .map(row => ({
      fingerprint: row.fingerprint,
      source: row.source,
      message: row.message,
      count: row.n,
      firstSeen: new Date(row.first_seen).toISOString(),
      lastSeen: new Date(row.last_seen).toISOString(),
      lastPath: row.path ?? null,
      lastMethod: row.method ?? null,
      lastStack: row.stack ?? null,
      lastUserAgent: row.user_agent ?? null
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function countRecentErrors(hours = 24): Promise<number> {
  const { rows } = await getDb().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM app.error_events WHERE created_at > now() - make_interval(hours => $1)`, [hours]
  );
  return rows[0]?.n ?? 0;
}

export async function purgeOldErrors(days = 30): Promise<number> {
  const { rows } = await getDb().query(
    `DELETE FROM app.error_events WHERE created_at < now() - make_interval(days => $1) RETURNING id`, [days]
  );
  return rows.length;
}
