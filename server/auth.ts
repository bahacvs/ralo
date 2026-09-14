import crypto from 'crypto';
import type { Request } from 'express';
import { dbStore } from './store.js';

// -------------------------------------------------------------
// Sessions (persisted with the store; only token hashes are stored)
// -------------------------------------------------------------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
// OTP codes
// -------------------------------------------------------------

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 3;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

interface OtpRecord {
  codeHash: string;
  expiresAt: number;
  verifyAttempts: number;
  sendCount: number;
  windowStart: number;
}

const otpStore = new Map<string, OtpRecord>();

function hashCode(phone: string, code: string): string {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
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

export type IssueOtpResult =
  | { ok: true; code: string }
  | { ok: false; retryAfterSeconds: number };

export function issueOtp(phone: string): IssueOtpResult {
  const now = Date.now();
  const existing = otpStore.get(phone);
  const inWindow = existing && now - existing.windowStart < OTP_SEND_WINDOW_MS;

  if (existing && inWindow && existing.sendCount >= OTP_MAX_SENDS_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.windowStart + OTP_SEND_WINDOW_MS - now) / 1000) };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  otpStore.set(phone, {
    codeHash: hashCode(phone, code),
    expiresAt: now + OTP_TTL_MS,
    verifyAttempts: 0,
    sendCount: inWindow ? existing!.sendCount + 1 : 1,
    windowStart: inWindow ? existing!.windowStart : now
  });
  return { ok: true, code };
}

export type VerifyOtpResult = 'OK' | 'EXPIRED' | 'INVALID' | 'TOO_MANY_ATTEMPTS';

export function verifyOtp(phone: string, code: unknown): VerifyOtpResult {
  const record = otpStore.get(phone);
  if (!record || record.expiresAt < Date.now()) return 'EXPIRED';
  if (record.verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS) return 'TOO_MANY_ATTEMPTS';

  record.verifyAttempts++;
  const candidate = typeof code === 'string' ? code.trim() : '';
  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(phone, candidate), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) return 'INVALID';

  // Keep the send window counters but invalidate the code
  record.expiresAt = 0;
  return 'OK';
}
