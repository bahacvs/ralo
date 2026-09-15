import crypto from 'crypto';
import type { Request } from 'express';
import { getDb, type Queryable } from './db/instance.js';

/** sha256 hex; the database stores decode(hex) in bytea columns. Tokens themselves are never stored. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// -------------------------------------------------------------
// Sessions (app.sessions)
// -------------------------------------------------------------

const SESSION_TTL_DAYS = 30;

export async function createSession(userId: string, q: Queryable = getDb()): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await q.query(
    `INSERT INTO app.sessions (token_hash, user_id, expires_at)
     VALUES (decode($1, 'hex'), $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_TTL_DAYS]
  );
  await q.query(`UPDATE app.users SET last_login_at = now() WHERE id = $1`, [userId]);
  return token;
}

export async function getSessionUserId(token: string | undefined): Promise<string | undefined> {
  if (!token || token.length > 128) return undefined;
  const { rows } = await getDb().query<{ user_id: string }>(
    `SELECT user_id FROM app.sessions
     WHERE token_hash = decode($1, 'hex') AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0]?.user_id;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token || token.length > 128) return;
  await getDb().query(`DELETE FROM app.sessions WHERE token_hash = decode($1, 'hex')`, [hashToken(token)]);
}

export async function deleteUserSessions(userId: string, q: Queryable = getDb()): Promise<void> {
  await q.query(`DELETE FROM app.sessions WHERE user_id = $1`, [userId]);
}

/** Removes expired sessions and email links; run periodically. */
export async function purgeExpiredAuthRows(): Promise<void> {
  await getDb().query(`DELETE FROM app.sessions WHERE expires_at < now()`);
  await getDb().query(`DELETE FROM app.auth_tokens WHERE expires_at < now()`);
}

export function extractToken(req: Request): string | undefined {
  const header = req.headers['authorization'] || req.headers['x-session-token'];
  if (typeof header !== 'string') return undefined;
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token || undefined;
}

// -------------------------------------------------------------
// Contact details
// -------------------------------------------------------------

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lowercases and trims; returns null when the address is not plausible. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** Normalizes Turkish mobile numbers to 905XXXXXXXXX; returns null when invalid. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{9}$/.test(digits)) return null;
  return `90${digits}`;
}

// -------------------------------------------------------------
// Passwords (scrypt; parameters are stored with each hash so they can be raised later)
// -------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keyLength: number, options: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returns a Turkish error message, or null when the password is acceptable. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`;
  }
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return 'Şifre en az bir harf ve bir rakam içermelidir.';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (scheme !== 'scrypt' || !saltB64 || !keyB64 || !Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) {
    return false;
  }
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N, r: R, p: P, maxmem: SCRYPT_MAX_MEMORY });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/** Compares against a throwaway hash so unknown emails take as long as wrong passwords. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
}

// -------------------------------------------------------------
// Single-use email links (app.auth_tokens)
// -------------------------------------------------------------

export type AuthTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export const VERIFY_EMAIL_TTL_MS = 48 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const purposeToDb = (purpose: AuthTokenPurpose) => (purpose === 'VERIFY_EMAIL' ? 'verify_email' : 'reset_password');

/** Issues a link token; any earlier token for the same user and purpose stops working. */
export async function createAuthToken(
  userId: string, email: string, purpose: AuthTokenPurpose, ttlMs: number, q: Queryable = getDb()
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await q.query(`DELETE FROM app.auth_tokens WHERE user_id = $1 AND purpose = $2`, [userId, purposeToDb(purpose)]);
  await q.query(
    `INSERT INTO app.auth_tokens (token_hash, user_id, purpose, email, expires_at)
     VALUES (decode($1, 'hex'), $2, $3, $4, now() + make_interval(secs => $5))`,
    [hashToken(token), userId, purposeToDb(purpose), email, ttlMs / 1000]
  );
  return token;
}

/** Deletes the token and returns its owner when it matches the purpose and has not expired. */
export async function consumeAuthToken(
  token: unknown, purpose: AuthTokenPurpose, q: Queryable = getDb()
): Promise<{ userId: string; email: string } | null> {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
  const { rows } = await q.query<{ user_id: string; email: string; valid: boolean }>(
    `DELETE FROM app.auth_tokens WHERE token_hash = decode($1, 'hex') AND purpose = $2
     RETURNING user_id, email, expires_at > now() AS valid`,
    [hashToken(token), purposeToDb(purpose)]
  );
  const row = rows[0];
  return row && row.valid ? { userId: row.user_id, email: row.email } : null;
}
