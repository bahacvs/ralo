import crypto from 'crypto';
import type { Request } from 'express';
import { dbStore, type AuthTokenPurpose } from './store.js';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// -------------------------------------------------------------
// Sessions (persisted with the store; only token hashes are stored)
// -------------------------------------------------------------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  dbStore.getSessions().push({
    id: hashToken(token),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  });
  dbStore.save();
  return token;
}

export function getSessionUserId(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const id = hashToken(token);
  const session = dbStore.getSessions().find(s => s.id === id);
  if (!session) return undefined;
  if (Date.parse(session.expiresAt) < Date.now()) {
    dbStore.removeSessions(s => s.id === id);
    return undefined;
  }
  return session.userId;
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  const id = hashToken(token);
  dbStore.removeSessions(s => s.id === id);
}

export function deleteUserSessions(userId: string): void {
  dbStore.removeSessions(s => s.userId === userId);
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
// Single-use email links (verification, password reset, staff invitation)
// -------------------------------------------------------------

export const VERIFY_EMAIL_TTL_MS = 48 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Issues a link token; any earlier token for the same user and purpose stops working. */
export function createAuthToken(userId: string, email: string, purpose: AuthTokenPurpose, ttlMs: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  dbStore.removeAuthTokens(t => t.userId === userId && t.purpose === purpose);
  dbStore.getAuthTokens().push({
    id: hashToken(token),
    userId,
    email,
    purpose,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  });
  dbStore.save();
  return token;
}

/** Deletes the token and returns its owner when it exists, matches the purpose and has not expired. */
export function consumeAuthToken(token: unknown, purpose: AuthTokenPurpose): { userId: string; email: string } | null {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
  const id = hashToken(token);
  const record = dbStore.getAuthTokens().find(t => t.id === id && t.purpose === purpose);
  if (!record) return null;
  dbStore.removeAuthTokens(t => t.id === id);
  if (Date.parse(record.expiresAt) <= Date.now()) return null;
  return { userId: record.userId, email: record.email };
}
