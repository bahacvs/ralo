import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import helmet from 'helmet';
import { nowLocal, todayLocal, addMinutesToLocal, parseClientDateTime } from './time.js';
import { getDb } from './db/instance.js';
import { sqlState } from './db/client.js';
import {
  createSession, getSessionUserId, deleteSession, deleteUserSessions, extractToken,
  normalizeEmail, normalizePhone, validatePassword, hashPassword, verifyPassword, burnPasswordCheck,
  createAuthToken, consumeAuthToken, PASSWORD_MAX_LENGTH, VERIFY_EMAIL_TTL_MS, RESET_PASSWORD_TTL_MS, STAFF_INVITE_TTL_MS
} from './auth.js';
import { sendMail, verificationEmail, passwordResetEmail, staffInviteEmail, coachInviteEmail, type MailMessage } from './mailer.js';
import { rateLimit, byIp, byUser } from './rateLimit.js';
import { HttpError } from './repo/util.js';
import { toPublicUser, RESERVATION_STATUSES } from './repo/mappers.js';
import * as users from './repo/users.js';
import * as clubs from './repo/clubs.js';
import * as reservations from './repo/reservations.js';
import * as openMatches from './repo/openMatches.js';
import * as social from './repo/social.js';
import * as notifications from './repo/notifications.js';
import * as panel from './repo/panel.js';
import * as admin from './repo/admin.js';
import * as matchResults from './repo/matchResults.js';
import * as legal from './repo/legal.js';
import * as lessons from './repo/lessons.js';
import type { User, ReservationStatus } from '../src/types/index.js';

// Demo helpers (role switcher, unverified bookings) are only exposed when explicitly enabled
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const DEMO_ACCOUNT_EMAILS = {
  OYUNCU: 'oyuncu@demo.ralo.app',
  ISLETME_SAHIBI: 'isletme@demo.ralo.app',
  PERSONEL: 'personel@demo.ralo.app'
} as const;

const MAX_AVATAR_LENGTH = 900_000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const OWNER_ONLY_PERMISSIONS = ['COURT_MANAGE', 'STAFF_MANAGE', 'REPORTS_VIEW', 'BILLING_VIEW'];

// Abuse and cost controls (password guessing, email flooding, Gemini spend, spam)
const byBodyEmail = (req: Request): string | undefined => normalizeEmail(req.body?.email) ?? undefined;
const registerIpLimit = rateLimit({ name: 'register-ip', limit: 10, windowMs: HOUR, key: byIp, message: 'Bu cihazdan çok fazla hesap oluşturuldu. Lütfen bir saat sonra tekrar deneyin.' });
const loginIpLimit = rateLimit({ name: 'login-ip', limit: 30, windowMs: 15 * MINUTE, key: byIp, message: 'Çok fazla giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' });
const loginEmailLimit = rateLimit({ name: 'login-email', limit: 10, windowMs: 15 * MINUTE, key: byBodyEmail, message: 'Bu hesap için çok fazla giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin veya şifrenizi sıfırlayın.' });
const passwordResetIpLimit = rateLimit({ name: 'password-reset-ip', limit: 10, windowMs: HOUR, key: byIp, message: 'Çok fazla şifre sıfırlama isteği yapıldı. Lütfen bir saat sonra tekrar deneyin.' });
const passwordResetEmailLimit = rateLimit({ name: 'password-reset-email', limit: 3, windowMs: HOUR, key: byBodyEmail, message: 'Bu e-posta adresi için kısa sürede çok fazla bağlantı istendi. Lütfen bir saat sonra tekrar deneyin.' });
const authLinkIpLimit = rateLimit({ name: 'auth-link-ip', limit: 30, windowMs: 15 * MINUTE, key: byIp, message: 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' });
const resendVerificationLimit = rateLimit({ name: 'resend-verification', limit: 3, windowMs: HOUR, key: byUser, message: 'Doğrulama e-postası kısa sürede çok fazla istendi. Lütfen bir saat sonra tekrar deneyin.' });
const shareCardUserLimit = rateLimit({ name: 'share-card', limit: 10, windowMs: HOUR, key: byUser, message: 'Paylaşım kartı için saatlik sınıra ulaştınız. Lütfen daha sonra tekrar deneyin.' });
const feedPostLimit = rateLimit({ name: 'feed-post', limit: 5, windowMs: 10 * MINUTE, key: byUser, message: 'Çok sık paylaşım yapıyorsunuz. Lütfen birkaç dakika bekleyin.' });
const feedReplyLimit = rateLimit({ name: 'feed-reply', limit: 20, windowMs: 10 * MINUTE, key: byUser, message: 'Çok sık yanıt yazıyorsunuz. Lütfen birkaç dakika bekleyin.' });
const feedLikeLimit = rateLimit({ name: 'feed-like', limit: 60, windowMs: MINUTE, key: byUser, message: 'Çok hızlı işlem yapıyorsunuz. Lütfen biraz bekleyin.' });
const messageSendLimit = rateLimit({ name: 'message-send', limit: 30, windowMs: MINUTE, key: byUser, message: 'Çok hızlı mesaj gönderiyorsunuz. Lütfen biraz bekleyin.' });
const conversationStartLimit = rateLimit({ name: 'conversation-start', limit: 15, windowMs: HOUR, key: byUser, message: 'Saatlik yeni sohbet sınırına ulaştınız. Lütfen daha sonra tekrar deneyin.' });
const bookingLimit = rateLimit({ name: 'booking', limit: 20, windowMs: HOUR, key: byUser, message: 'Kısa sürede çok fazla rezervasyon denemesi yapıldı. Lütfen daha sonra tekrar deneyin.' });

const shareCaptionCache = new Map<string, { caption: string; expiresAt: number }>();

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

/** Async route wrapper: thrown HttpErrors become { error } responses, anything else a logged 500. */
const handle = (fn: Handler): RequestHandler => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const currentUser = (req: Request) => (req as any).user as User;
const currentClubId = (req: Request) => (req as any).clubId as string;
const consentMeta = (req: Request): legal.ConsentMeta => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });

/** Sends a transactional email; delivery problems are logged and reported as false. */
async function deliverMail(message: MailMessage): Promise<boolean> {
  try {
    await sendMail(message);
    return true;
  } catch (err: any) {
    console.error(`Email delivery failed (${message.subject}):`, err?.message);
    return false;
  }
}

function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

const clockToMinutes = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};

/** Start times (every 90 minutes) inside the business hours that leave room for the duration. */
function slotStarts(openingHour: string, closingHour: string, durationMinutes: number): number[] {
  const open = clockToMinutes(openingHour);
  let close = clockToMinutes(closingHour);
  if (close <= open) close += 1440;
  const starts: number[] = [];
  for (let minute = open; minute + durationMinutes <= close && minute < 1440; minute += 90) starts.push(minute);
  return starts;
}

const minutesToClock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function occupancy(booked: number, total: number) {
  const occupancyRate = total > 0 ? Math.round((booked / total) * 100) : 0;
  const level = occupancyRate >= 80 ? { status: 'FULL', label: 'Çok Yoğun' }
    : occupancyRate >= 60 ? { status: 'HIGH', label: 'Yoğun Talep' }
    : occupancyRate >= 35 ? { status: 'MODERATE', label: 'Orta Doluluk' }
    : { status: 'LOW', label: 'Sakin' };
  return { occupancyRate, bookedSlotsCount: booked, totalSlotsCount: total, availableSlotsCount: Math.max(0, total - booked), ...level };
}

// -------------------------------------------------------------
// App
// -------------------------------------------------------------

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({
    // Vite's dev server injects inline scripts, so the CSP only applies to the production build
    contentSecurityPolicy: IS_PRODUCTION ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
        // The service worker caches fonts and Unsplash images at runtime
        connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://images.unsplash.com'],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    } : false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '1mb' }));

  const requireAuth: RequestHandler = async (req, res, next) => {
    try {
      const userId = await getSessionUserId(extractToken(req));
      const user = userId ? await users.findUserById(userId) : null;
      if (!user) {
        return res.status(401).json({ error: 'Oturum açmanız gerekmektedir. Lütfen giriş yapın.' });
      }
      (req as any).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };

  async function optionalUser(req: Request): Promise<User | null> {
    const userId = await getSessionUserId(extractToken(req));
    return userId ? users.findUserById(userId) : null;
  }

  /**
   * Resolves the caller's club from their membership (never from the request) as req.clubId and
   * rejects a mismatching businessId in the request. Owners hold every permission.
   */
  function requireBusiness(permission?: string): RequestHandler {
    return async (req, res, next) => {
      try {
        const membership = await clubs.getMembership(currentUser(req).id);
        if (!membership) {
          return res.status(403).json({ error: 'Bu işlem için işletme yetkisi gerekmektedir.' });
        }
        const requested = req.query.businessId || req.body?.businessId;
        if (requested && requested !== membership.clubId) {
          return res.status(403).json({ error: 'Bu işletme verilerine erişim izniniz bulunmamaktadır.' });
        }
        const isOwner = membership.role === 'owner';
        if (permission && !isOwner && (OWNER_ONLY_PERMISSIONS.includes(permission) || !membership.permissions.includes(permission))) {
          return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }
        (req as any).clubId = membership.clubId;
        (req as any).membership = membership;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  const requirePlatformAdmin: RequestHandler = (req, res, next) => {
    if (!currentUser(req).isPlatformAdmin) {
      return res.status(403).json({ error: 'Bu sayfa yalnızca RALO platform yöneticilerine açıktır.' });
    }
    next();
  };

  // -------------------------------------------------------------
  // 1. Authentication (email + password)
  // -------------------------------------------------------------

  const INVALID_CREDENTIALS = 'E-posta adresi veya şifre hatalı.';
  const EMAIL_TAKEN = 'Bu e-posta adresiyle kayıtlı bir hesap zaten var. Giriş yapın veya "Şifremi unuttum" ile şifrenizi sıfırlayın.';

  app.post('/api/auth/register', registerIpLimit, handle(async (req, res) => {
    const { displayName, password, acceptTerms } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    const name = typeof displayName === 'string' ? displayName.trim() : '';

    if (!name || name.length > 60) throw new HttpError(400, 'Ad soyad 1 ile 60 karakter arasında olmalıdır.');
    if (!email) throw new HttpError(400, 'Geçerli bir e-posta adresi giriniz.');
    const passwordError = validatePassword(password);
    if (passwordError) throw new HttpError(400, passwordError);
    if (acceptTerms !== true) {
      throw new HttpError(400, "Devam etmek için Kullanım Koşulları'nı ve KVKK Aydınlatma Metni'ni onaylamanız gerekir.");
    }
    if (await users.findCredentialByEmail(email)) throw new HttpError(409, EMAIL_TAKEN);

    const passwordHash = await hashPassword(password);
    let userId: string;
    try {
      userId = await getDb().tx(async q => {
        const id = await users.createPlayer({ email, displayName: name, passwordHash }, q);
        // Terms + privacy notice with the signup; the share-card consent is a separate, optional box
        await legal.recordConsents(q, { id, email },
          req.body?.shareCardConsent === true ? ['terms_of_use', 'privacy_notice', 'share_card'] : ['terms_of_use', 'privacy_notice'],
          'accepted', 'signup', consentMeta(req));
        return id;
      });
    } catch (err) {
      if (sqlState(err) === '23505') throw new HttpError(409, EMAIL_TAKEN);
      throw err;
    }

    const token = await createSession(userId);
    const link = await createAuthToken(userId, email, 'VERIFY_EMAIL', VERIFY_EMAIL_TTL_MS);
    const verificationEmailSent = await deliverMail(verificationEmail(email, name, link));
    return res.status(201).json({ success: true, token, user: await users.getOwnProfile(userId), verificationEmailSent });
  }));

  app.post('/api/auth/login', loginIpLimit, loginEmailLimit, handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || !password) {
      throw new HttpError(400, 'E-posta adresi ve şifre zorunludur.');
    }
    if (password.length > PASSWORD_MAX_LENGTH) throw new HttpError(401, INVALID_CREDENTIALS);

    const credential = await users.findCredentialByEmail(email);
    if (!credential || !credential.passwordHash || credential.status !== 'active') {
      await burnPasswordCheck(password);
      throw new HttpError(401, INVALID_CREDENTIALS);
    }
    if (!(await verifyPassword(password, credential.passwordHash))) {
      throw new HttpError(401, INVALID_CREDENTIALS);
    }
    const token = await createSession(credential.id);
    return res.json({ success: true, token, user: await users.getOwnProfile(credential.id) });
  }));

  app.post('/api/auth/verify-email', authLinkIpLimit, handle(async (req, res) => {
    const link = await consumeAuthToken(req.body?.token, 'VERIFY_EMAIL');
    const user = link ? await users.findUserById(link.userId) : null;
    // A link sent to an address the account no longer uses must not verify the current one
    if (!link || !user || user.email !== link.email) {
      throw new HttpError(400, 'Doğrulama bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Lütfen yeni bağlantı isteyin.');
    }
    await users.markEmailVerified(user.id);
    return res.json({ success: true, message: 'E-posta adresiniz doğrulandı. Artık kort rezervasyonu yapabilirsiniz.' });
  }));

  app.post('/api/auth/resend-verification', requireAuth, resendVerificationLimit, handle(async (req, res) => {
    const user = currentUser(req);
    if (user.emailVerified) {
      return res.json({ success: true, alreadyVerified: true, message: 'E-posta adresiniz zaten doğrulanmış.' });
    }
    if (!user.email) throw new HttpError(400, 'Hesabınızda kayıtlı bir e-posta adresi bulunmuyor.');
    const link = await createAuthToken(user.id, user.email, 'VERIFY_EMAIL', VERIFY_EMAIL_TTL_MS);
    if (!(await deliverMail(verificationEmail(user.email, user.displayName, link)))) {
      throw new HttpError(502, 'E-posta gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
    }
    return res.json({ success: true, message: `Doğrulama bağlantısı ${user.email} adresine gönderildi.` });
  }));

  app.post('/api/auth/forgot-password', passwordResetIpLimit, passwordResetEmailLimit, handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) throw new HttpError(400, 'Geçerli bir e-posta adresi giriniz.');
    // Not awaited: the response time must not reveal whether the account exists
    void (async () => {
      const credential = await users.findCredentialByEmail(email);
      if (!credential || credential.status !== 'active') return;
      const link = await createAuthToken(credential.id, email, 'RESET_PASSWORD', RESET_PASSWORD_TTL_MS);
      await deliverMail(passwordResetEmail(email, credential.displayName, link));
    })().catch(err => console.error('Password reset request failed:', err?.message));
    return res.json({
      success: true,
      message: 'Bu e-posta adresiyle kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu ve spam klasörünü kontrol edin.'
    });
  }));

  app.post('/api/auth/reset-password', authLinkIpLimit, handle(async (req, res) => {
    const { token, password } = req.body || {};
    // Checked before the link is consumed so a rejected password does not burn it
    const passwordError = validatePassword(password);
    if (passwordError) throw new HttpError(400, passwordError);
    const passwordHash = await hashPassword(password);
    const link = await consumeAuthToken(token, 'RESET_PASSWORD');
    const user = link ? await users.findUserById(link.userId) : null;
    if (!link || !user || user.email !== link.email) {
      throw new HttpError(400, 'Şifre bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Lütfen yeni bağlantı isteyin.');
    }
    await getDb().tx(async q => {
      await users.setPasswordHash(user.id, passwordHash, q);
      await users.markEmailVerified(user.id, q); // opening the emailed link proves the address
      await deleteUserSessions(user.id, q);
    });
    const sessionToken = await createSession(user.id);
    return res.json({ success: true, token: sessionToken, user: await users.getOwnProfile(user.id), message: 'Şifreniz kaydedildi.' });
  }));

  app.post('/api/auth/demo-switch', handle(async (req, res) => {
    if (!DEMO_MODE) throw new HttpError(404, 'Bulunamadı.');
    const role = req.body?.targetRole as keyof typeof DEMO_ACCOUNT_EMAILS;
    const email = DEMO_ACCOUNT_EMAILS[role] ?? DEMO_ACCOUNT_EMAILS.OYUNCU;
    const credential = await users.findCredentialByEmail(email);
    if (!credential) throw new HttpError(404, 'Hedef demo hesabı bulunamadı.');
    const token = await createSession(credential.id);
    return res.json({ success: true, token, user: await users.getOwnProfile(credential.id) });
  }));

  app.get('/api/auth/me', handle(async (req, res) => {
    const token = extractToken(req);
    const userId = await getSessionUserId(token);
    const user = userId ? await users.getOwnProfile(userId) : null;
    if (!user) throw new HttpError(401, 'Oturum bulunamadı.');
    return res.json({ user, token });
  }));

  app.post('/api/auth/logout', handle(async (req, res) => {
    await deleteSession(extractToken(req));
    return res.json({ success: true });
  }));

  app.post('/api/auth/delete-account', requireAuth, handle(async (req, res) => {
    const { confirmationText, confirmationCheck } = req.body || {};
    if (confirmationText !== 'HESABIMI SIL' || !confirmationCheck) {
      throw new HttpError(400, 'Lütfen hesap silme onay kutusunu işaretleyip "HESABIMI SIL" yazınız.');
    }
    await users.anonymizeUser(currentUser(req).id);
    return res.json({ success: true, message: 'Hesabınız ve tüm ilişkili veriler başarıyla silinmiştir.' });
  }));

  app.patch('/api/user/profile', requireAuth, handle(async (req, res) => {
    const user = currentUser(req);
    const { avatarUrl, displayName, playSide, dominantHand } = req.body || {};
    if (avatarUrl !== undefined) {
      const isValidAvatar = typeof avatarUrl === 'string'
        && avatarUrl.length <= MAX_AVATAR_LENGTH
        && (/^https:\/\//.test(avatarUrl) || /^data:image\/(jpeg|png|webp);base64,/.test(avatarUrl));
      if (!isValidAvatar) throw new HttpError(400, 'Geçersiz veya çok büyük profil fotoğrafı.');
    }
    if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 60)) {
      throw new HttpError(400, 'İsim 1 ile 60 karakter arasında olmalıdır.');
    }
    if (playSide !== undefined && !['LEFT', 'RIGHT', 'BOTH'].includes(playSide)) throw new HttpError(400, 'Geçersiz kort pozisyonu.');
    if (dominantHand !== undefined && !['LEFT', 'RIGHT'].includes(dominantHand)) throw new HttpError(400, 'Geçersiz baskın el.');

    await users.updateProfile(user.id, {
      avatarUrl,
      displayName: typeof displayName === 'string' ? displayName.trim() : undefined,
      playSide,
      dominantHand
    });
    return res.json({ success: true, user: await users.getOwnProfile(user.id) });
  }));

  // -------------------------------------------------------------
  // 2. Courts and availability
  // -------------------------------------------------------------

  app.get('/api/courts', handle(async (req, res) => {
    const {
      date, duration = '90', city, district, courtType, minPrice, maxPrice, minRating, amenities, sortBy,
      userLat, userLng, maxDistanceKm
    } = req.query;
    const targetDate = typeof date === 'string' && DATE_PATTERN.test(date) ? date : todayLocal();
    const durNum = [60, 90, 120].includes(Number(duration)) ? Number(duration) : 90;

    let courts = await clubs.listBookableCourts();
    const lower = (value: unknown) => String(value).toLocaleLowerCase('tr-TR');
    if (city && city !== 'ALL' && city !== 'Tüm Türkiye') courts = courts.filter(c => lower(c.business.city) === lower(city));
    if (district && district !== 'ALL' && district !== 'Tüm İlçeler') {
      courts = courts.filter(c => lower(c.business.district) === lower(district));
    }
    if (courtType && courtType !== 'ALL') courts = courts.filter(c => c.type === courtType);
    if (minPrice) courts = courts.filter(c => c.pricePerHour >= Number(minPrice));
    if (maxPrice) courts = courts.filter(c => c.pricePerHour <= Number(maxPrice));
    if (minRating) courts = courts.filter(c => c.business.rating >= Number(minRating));
    if (amenities) {
      const required = Array.isArray(amenities) ? amenities.map(String) : [String(amenities)];
      courts = courts.filter(c => required.every(a => c.business.amenities.includes(a)));
    }

    const bookings = await reservations.activeBookings(courts.map(c => c.id), targetDate);
    const now = nowLocal();
    let results = courts.map(court => {
      const starts = slotStarts(court.business.openingHour, court.business.closingHour, durNum);
      let firstAvailableTime: string | null = null;
      let booked = 0;
      for (const minute of starts) {
        const startAt = addMinutesToLocal(`${targetDate}T00:00:00`, minute);
        const endAt = addMinutesToLocal(startAt, durNum);
        if (reservations.overlaps(bookings.get(court.id) ?? [], startAt, endAt)) {
          booked++;
        } else if (!firstAvailableTime && startAt > now) {
          firstAvailableTime = minutesToClock(minute);
        }
      }
      let distanceKm: number | undefined;
      if (userLat && userLng && court.business.latitude !== undefined && court.business.longitude !== undefined) {
        distanceKm = calculateHaversineDistanceKm(Number(userLat), Number(userLng), court.business.latitude, court.business.longitude);
      }
      const totalPrice = Math.round(court.pricePerHour * (durNum / 60));
      return {
        ...court,
        firstAvailableTime: firstAvailableTime ?? '',
        totalPrice,
        pricePerPlayer: Math.round(totalPrice / 4),
        distanceKm,
        occupancy: occupancy(booked, starts.length)
      };
    });

    if (maxDistanceKm && userLat && userLng && Number(maxDistanceKm) > 0) {
      results = results.filter(r => r.distanceKm !== undefined && r.distanceKm <= Number(maxDistanceKm));
    }
    if (sortBy === 'PRICE_ASC') results.sort((a, b) => a.totalPrice - b.totalPrice);
    else if (sortBy === 'PRICE_DESC') results.sort((a, b) => b.totalPrice - a.totalPrice);
    else if (sortBy === 'RATING_DESC') results.sort((a, b) => b.business.rating - a.business.rating);
    else if (sortBy === 'DISTANCE_ASC' || (userLat && userLng)) {
      results.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return res.json({ courts: results, total: results.length });
  }));

  app.get('/api/courts/:courtId', handle(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : todayLocal();
    if (!DATE_PATTERN.test(date)) throw new HttpError(400, 'Geçersiz tarih.');
    const durMinutes = [60, 90, 120].includes(Number(req.query.duration)) ? Number(req.query.duration) : 90;

    const court = await clubs.getCourt(req.params.courtId);
    const business = court ? await clubs.getBusiness(court.businessId) : null;
    if (!court || !business || !business.isActive) throw new HttpError(404, 'Kort bulunamadı.');

    const bookings = (await reservations.activeBookings([court.id], date)).get(court.id) ?? [];
    const now = nowLocal();
    const slots = slotStarts(business.openingHour, business.closingHour, durMinutes).map(minute => {
      const startAt = addMinutesToLocal(`${date}T00:00:00`, minute);
      const endAt = addMinutesToLocal(startAt, durMinutes);
      const isPast = startAt <= now;
      const available = court.isActive && !isPast && !reservations.overlaps(bookings, startAt, endAt);
      return {
        time: minutesToClock(minute),
        endTime: endAt.slice(11, 16),
        isAvailable: available,
        reason: available ? undefined : isPast ? 'Geçmiş saat' : !court.isActive ? 'Kort kapalı' : 'Dolu veya Blokajlı'
      };
    });
    const { isActive, appBookingEnabled, ...publicBusiness } = business;
    return res.json({
      court,
      business: publicBusiness,
      date,
      durationMinutes: durMinutes,
      slots,
      pricePerHour: court.pricePerHour,
      totalPrice: Math.round(court.pricePerHour * (durMinutes / 60)),
      pricePerPlayer: Math.round((court.pricePerHour * (durMinutes / 60)) / 4)
    });
  }));

  app.post('/api/courts/:courtId/toggle-favorite', requireAuth, handle(async (req, res) => {
    const user = currentUser(req);
    const result = await clubs.toggleFavoriteCourt(user.id, req.params.courtId);
    return res.json({ success: true, ...result, user: await users.getOwnProfile(user.id) });
  }));

  app.get('/api/user/favorites/courts', requireAuth, handle(async (req, res) => {
    const courts = await clubs.getFavoriteCourts(currentUser(req).id);
    return res.json({ courts, total: courts.length });
  }));

  // -------------------------------------------------------------
  // 3. Reservations
  // -------------------------------------------------------------

  app.post('/api/reservations', requireAuth, bookingLimit, handle(async (req, res) => {
    const user = currentUser(req);
    // App bookings are billed to the club, so they need an account with a proven email address
    if (!user.emailVerified && !DEMO_MODE) {
      throw new HttpError(403, 'Rezervasyon yapabilmek için önce e-posta adresinizi doğrulayın. Bağlantıyı sayfanın üstündeki uyarıdan tekrar isteyebilirsiniz.', 'EMAIL_NOT_VERIFIED');
    }
    const {
      courtId, startAt: rawStartAt, durationMinutes = 90, isOpenMatch = false, openMatchNote, minElo, maxElo,
      matchType, genderPreference, approvalRequired = false
    } = req.body || {};
    if (!courtId || !rawStartAt) throw new HttpError(400, 'Kort ve başlama tarihi zorunludur.');

    const dur = Number(durationMinutes);
    const startAt = parseClientDateTime(rawStartAt);
    if (![60, 90, 120].includes(dur) || !startAt) throw new HttpError(400, 'Geçersiz başlama saati veya süre.');
    if (startAt <= nowLocal()) throw new HttpError(400, 'Geçmiş bir saat için rezervasyon yapılamaz.');
    if (openMatchNote !== undefined && openMatchNote !== null && (typeof openMatchNote !== 'string' || openMatchNote.length > 300)) {
      throw new HttpError(400, 'Maç notu en fazla 300 karakter olabilir.');
    }
    const eloBound = (value: unknown) => {
      if (value === undefined || value === null || value === '') return undefined;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 4000) throw new HttpError(400, 'Elo sınırları 0 ile 4000 arasında olmalıdır.');
      return n;
    };
    const min = eloBound(minElo);
    const max = eloBound(maxElo);
    if (min !== undefined && max !== undefined && min > max) throw new HttpError(400, 'Minimum Elo, maksimum Elo değerinden büyük olamaz.');

    const reservation = await reservations.bookCourtForPlayer(user, {
      courtId: String(courtId),
      startAt,
      durationMinutes: dur as 60 | 90 | 120,
      isOpenMatch: !!isOpenMatch,
      openMatchNote: openMatchNote || undefined,
      minElo: isOpenMatch ? min : undefined,
      maxElo: isOpenMatch ? max : undefined,
      matchType: typeof matchType === 'string' ? matchType : undefined,
      genderPreference: typeof genderPreference === 'string' ? genderPreference : undefined,
      approvalRequired: !!approvalRequired
    });
    return res.status(201).json({ success: true, message: 'Rezervasyonunuz başarıyla oluşturuldu.', reservation });
  }));

  app.post('/api/reservations/:id/cancel', requireAuth, handle(async (req, res) => {
    const reservation = await reservations.cancelReservationByPlayer(req.params.id, currentUser(req));
    return res.json({ success: true, message: 'Rezervasyonunuz iptal edildi.', reservation });
  }));

  app.get('/api/leaderboard', handle(async (_req, res) => {
    const players = (await users.getLeaderboard(50)).map((u, index) => ({ rank: index + 1, ...toPublicUser(u) }));
    return res.json({ players });
  }));

  // -------------------------------------------------------------
  // 4. Open matches
  // -------------------------------------------------------------

  app.get('/api/open-matches', handle(async (req, res) => {
    const {
      date, timeRange, minAvailableSpots, maxPricePerPlayer, fitForMe, sortBy, search, city, district,
      userLat, userLng, maxDistanceKm
    } = req.query;
    const user = await optionalUser(req);

    let matches = await openMatches.listOpenMatches();
    if (date && date !== 'ALL') matches = matches.filter(m => m.startAt.startsWith(String(date)));
    if (timeRange && timeRange !== 'ALL') {
      matches = matches.filter(m => {
        const hour = Number(m.startAt.slice(11, 13));
        if (timeRange === 'MORNING') return hour < 12;
        if (timeRange === 'AFTERNOON') return hour >= 12 && hour < 17;
        if (timeRange === 'EVENING') return hour >= 17;
        return true;
      });
    }

    let filtered = matches.map(({ waitlist, ...m }) => {
      const active = m.participants.filter(p => p.status === 'ACTIVE');
      let distanceKm: number | undefined;
      if (userLat && userLng && m.business?.latitude !== undefined && m.business?.longitude !== undefined) {
        distanceKm = calculateHaversineDistanceKm(Number(userLat), Number(userLng), m.business.latitude, m.business.longitude);
      }
      return {
        ...m,
        activeParticipantsCount: active.length,
        availableSpots: Math.max(0, m.participantLimit - active.length),
        waitlistCount: waitlist.length,
        pricePerPlayer: Math.round(m.totalPrice / 4),
        isUserJoined: !!user && m.participants.some(p => p.userId === user.id),
        isUserOnWaitlist: !!user && waitlist.some(w => w.userId === user.id),
        // Guests see every match as a fit
        isEloFit: !user || ((!m.minElo || user.elo >= m.minElo) && (!m.maxElo || user.elo <= m.maxElo)),
        distanceKm
      };
    });

    const lower = (value: unknown) => String(value ?? '').toLocaleLowerCase('tr-TR');
    if (city && city !== 'ALL' && city !== 'Tüm Türkiye') filtered = filtered.filter(m => lower(m.business?.city) === lower(city));
    if (district && district !== 'ALL' && district !== 'Tüm İlçeler') {
      filtered = filtered.filter(m => lower(m.business?.district) === lower(district));
    }
    if (maxDistanceKm && userLat && userLng && Number(maxDistanceKm) > 0) {
      filtered = filtered.filter(m => m.distanceKm !== undefined && m.distanceKm <= Number(maxDistanceKm));
    }
    if (minAvailableSpots) filtered = filtered.filter(m => m.availableSpots >= Number(minAvailableSpots));
    if (maxPricePerPlayer) filtered = filtered.filter(m => m.pricePerPlayer <= Number(maxPricePerPlayer));
    if (fitForMe === 'true') filtered = filtered.filter(m => m.isEloFit);

    if (typeof search === 'string' && search.trim()) {
      const q = lower(search.trim());
      filtered = filtered.filter(m => {
        const hour = Number(m.startAt.slice(11, 13));
        const dateObj = new Date(m.startAt);
        const haystack = [
          m.business?.name, m.business?.district, m.business?.city, m.court?.name, m.court?.type,
          m.startAt.slice(11, 16), m.startAt.slice(0, 10),
          dateObj.toLocaleDateString('tr-TR', { weekday: 'long' }),
          dateObj.toLocaleDateString('tr-TR', { weekday: 'short' }),
          dateObj.toLocaleDateString('tr-TR', { month: 'long' })
        ].map(lower);
        return haystack.some(h => h.includes(q))
          || (hour < 12 && (q.includes('sabah') || q.includes('morning')))
          || (hour >= 12 && hour < 17 && (q.includes('öğle') || q.includes('ogle') || q.includes('afternoon')))
          || (hour >= 17 && hour < 21 && (q.includes('akşam') || q.includes('aksam') || q.includes('evening')))
          || (hour >= 21 && (q.includes('gece') || q.includes('night')));
      });
    }

    if (sortBy === 'PRICE_ASC') filtered.sort((a, b) => a.pricePerPlayer - b.pricePerPlayer);
    else if (sortBy === 'SPOTS_DESC') filtered.sort((a, b) => b.availableSpots - a.availableSpots);
    else if (sortBy === 'DISTANCE_ASC') filtered.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    else filtered.sort((a, b) => a.startAt.localeCompare(b.startAt));

    return res.json({ matches: filtered, total: filtered.length });
  }));

  app.get('/api/open-matches/:id', handle(async (req, res) => {
    const match = await openMatches.getOpenMatch(req.params.id);
    if (!match) throw new HttpError(404, 'Açık maç bulunamadı.');
    const { court, business, participants, waitlist, organizerMaskedName, ...reservation } = match;
    const consenting = await legal.shareCardConsentingUsers(participants.map(p => p.userId));
    return res.json({
      match: reservation,
      court,
      business,
      participants: participants.map(p => ({ ...p, shareCardConsent: consenting.has(p.userId) })),
      waitlist,
      organizerMaskedName,
      pricePerPlayer: Math.round(match.totalPrice / 4)
    });
  }));

  app.post('/api/open-matches/:id/join', requireAuth, handle(async (req, res) => {
    const status = await openMatches.joinOpenMatch(req.params.id, currentUser(req));
    return res.json({
      success: true,
      status,
      message: status === 'PENDING_APPROVAL'
        ? 'Katılım isteğiniz organizatöre iletildi. Onay bekleniyor.'
        : 'Açık maça başarıyla katıldınız! Maç koltuğunuz ayrıldı.'
    });
  }));

  app.post('/api/open-matches/:id/leave', requireAuth, handle(async (req, res) => {
    await openMatches.leaveOpenMatch(req.params.id, currentUser(req));
    return res.json({ success: true, message: 'Maçtan ayrıldınız. Koltuğunuz diğer oyuncular için erişilebilir yapıldı.' });
  }));

  app.post('/api/open-matches/:id/requests/:userId', requireAuth, handle(async (req, res) => {
    const decision = req.body?.decision;
    if (decision !== 'approve' && decision !== 'reject') throw new HttpError(400, 'Geçersiz karar. "approve" veya "reject" olmalıdır.');
    await openMatches.respondToJoinRequest(req.params.id, currentUser(req), req.params.userId, decision === 'approve');
    return res.json({
      success: true,
      message: decision === 'approve' ? 'Katılım isteği onaylandı, oyuncu maça eklendi.' : 'Katılım isteği reddedildi.'
    });
  }));

  app.post('/api/open-matches/:id/waitlist', requireAuth, handle(async (req, res) => {
    const action = await openMatches.toggleWaitlist(req.params.id, currentUser(req));
    return res.json({
      success: true,
      action,
      message: action === 'JOINED'
        ? 'Bekleme listesine eklendiniz. Bir oyuncu ayrıldığında yer alacaksınız.'
        : 'Bekleme listesinden çıktınız.'
    });
  }));

  app.post('/api/open-matches/:id/invite', requireAuth, handle(async (req, res) => {
    const { friendUserId } = req.body || {};
    if (!friendUserId) throw new HttpError(400, 'Davet edilecek arkadaş seçilmelidir.');
    await openMatches.inviteFriendToMatch(currentUser(req), String(friendUserId), req.params.id);
    return res.json({ success: true, message: 'Arkadaşınıza maç daveti ve bildirimi başarıyla iletildi!' });
  }));

  app.post('/api/open-matches/:id/generate-share-card', requireAuth, shareCardUserLimit, handle(async (req, res) => {
    const { theme = 'SUNSET', format = 'STORY' } = req.body || {};
    const match = await openMatches.getOpenMatch(req.params.id);
    if (!match) throw new HttpError(404, 'Açık maç bulunamadı.');

    const participants = match.participants.filter(p => p.status === 'ACTIVE');
    const consenting = await legal.shareCardConsentingUsers(participants.map(p => p.userId));
    const availableSpots = Math.max(0, match.participantLimit - participants.length);
    const business = match.business;
    const court = match.court;

    const themeVisuals: Record<string, { name: string; bgUrl: string; overlayColor: string; accentColor: string; moodText: string }> = {
      SUNSET: { name: 'Altın Gün Batımı', bgUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&auto=format&fit=crop&q=80', overlayColor: 'from-amber-950/90 via-slate-950/85 to-black/95', accentColor: '#f59e0b', moodText: 'Gün batımında açık hava cam kortta nefes kesen padel mücadelesi!' },
      NEON_NIGHT: { name: 'Gece & Neon Kort', bgUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&auto=format&fit=crop&q=80', overlayColor: 'from-slate-950/95 via-purple-950/80 to-black/95', accentColor: '#fbbf24', moodText: 'Spot ışıkları altında gece maçı heyecanı ve hızlı ralliler!' },
      CHAMPIONSHIP: { name: 'Şampiyona Panoramik Kort', bgUrl: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=1200&auto=format&fit=crop&q=80', overlayColor: 'from-emerald-950/80 via-slate-950/85 to-black/95', accentColor: '#f59e0b', moodText: 'Tesisin en gözde panoramik kortunda rekabetçi seviye maç.' },
      CYBER_AMBER: { name: 'Dinamik Padel Rallisi', bgUrl: 'https://images.unsplash.com/photo-1519766304817-4f37bda74a29?w=1200&auto=format&fit=crop&q=80', overlayColor: 'from-amber-900/85 via-stone-950/90 to-black/95', accentColor: '#d97706', moodText: 'Enerjik ralli, dengeli oyun ve keyifli bir padel deneyimi.' }
    };
    const selectedTheme = themeVisuals[theme] || themeVisuals.SUNSET;
    const dateStr = new Date(match.startAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = match.startAt.slice(11, 16);

    const aiHeadline = `${business?.name || 'RALO'} • ${availableSpots > 0 ? `${availableSpots} Oyuncu Aranıyor! 🎾` : 'Kadro Dolu! 🔥'}`;
    let aiCaption = `${dateStr} saat ${timeStr}'te ${business?.name || 'Padel Kortu'} (${business?.district || ''}) açık maçımızda ${availableSpots > 0 ? `son ${availableSpots} koltuk boş!` : 'kadro hazır!'} 🎾 Seviye: Elo ${match.minElo || 1200}-${match.maxElo || 1600}. Maça hemen katıl:`;

    // Reuse a recent caption so repeated requests don't call Gemini again
    const captionKey = `${match.id}:${theme}:${format}:${availableSpots}`;
    const cachedCaption = shareCaptionCache.get(captionKey);
    if (cachedCaption && cachedCaption.expiresAt > Date.now()) {
      aiCaption = cachedCaption.caption;
    } else if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `Write an ultra-engaging, short 2-sentence Turkish social media hook for an open Padel tennis match with ${availableSpots} open spots left at ${business?.name} (${business?.district}), on ${new Date(match.startAt).toLocaleDateString('tr-TR')}, start time ${timeStr}, Elo level ${match.minElo || 1200}-${match.maxElo || 1600}. Keep it punchy, friendly, and sports-enthusiastic. Include 2 emojis.`;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        if (response?.text) {
          aiCaption = response.text.trim();
          shareCaptionCache.set(captionKey, { caption: aiCaption, expiresAt: Date.now() + HOUR });
        }
      } catch (geminiErr: any) {
        console.warn('Gemini caption generation fallback:', geminiErr?.message);
      }
    }

    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    return res.json({
      success: true,
      matchId: match.id,
      theme: selectedTheme,
      format,
      match: {
        id: match.id,
        businessName: business?.name || 'Padel Kulübü',
        courtName: court?.name || 'Kort',
        district: business?.district || '',
        city: business?.city || '',
        dateStr,
        timeStr,
        durationMinutes: match.durationMinutes,
        pricePerPlayer: Math.round(match.totalPrice / 4),
        minElo: match.minElo || 1200,
        maxElo: match.maxElo || 1600,
        totalSpots: match.participantLimit,
        filledSpots: participants.length,
        availableSpots,
        // Players appear by name, photo and Elo only with their explicit share-card consent
        participants: participants.map(p => consenting.has(p.userId)
          ? { maskedName: p.userMaskedName || 'Oyuncu', avatarUrl: p.userAvatar || '', elo: p.userElo || 1400 }
          : { maskedName: 'Oyuncu', avatarUrl: '', elo: null })
      },
      aiHeadline,
      aiCaption,
      shareUrl: `${appUrl}/acik-mac/${match.id}`
    });
  }));

  // -------------------------------------------------------------
  // 5. Friends, own matches, messages, feed
  // -------------------------------------------------------------

  app.get('/api/friends', requireAuth, handle(async (req, res) => {
    const user = currentUser(req);
    const [friends, allPlayers] = await Promise.all([users.getFriends(user.id), users.listOtherPlayers(user.id, 100)]);
    return res.json({ friends: friends.map(toPublicUser), allPlayers: allPlayers.map(toPublicUser) });
  }));

  app.post('/api/friends/toggle', requireAuth, handle(async (req, res) => {
    const { targetUserId } = req.body || {};
    if (!targetUserId) throw new HttpError(400, 'Hedef kullanıcı belirtilmelidir.');
    if (targetUserId === currentUser(req).id) throw new HttpError(400, 'Kendinizi arkadaş olarak ekleyemezsiniz.');
    const result = await users.toggleFriend(currentUser(req), String(targetUserId));
    return res.json({
      success: true,
      ...result,
      message: result.isFriend ? 'Arkadaş listenize eklendi.' : 'Arkadaş listenizden çıkarıldı.'
    });
  }));

  app.get('/api/my-matches', requireAuth, handle(async (req, res) => {
    return res.json(await reservations.getMyMatches(currentUser(req).id));
  }));

  app.post('/api/matches/:id/result', requireAuth, handle(async (req, res) => {
    await matchResults.submitResult(req.params.id, currentUser(req), req.body || {});
    return res.status(201).json({ success: true, message: 'Sonuç kaydedildi. Rakip takım onayladığında veya 48 saat içinde itiraz edilmezse Elo puanları güncellenir.' });
  }));

  app.post('/api/matches/:id/result/confirm', requireAuth, handle(async (req, res) => {
    const changes = await matchResults.confirmResult(req.params.id, currentUser(req));
    const mine = changes.find(c => c.userId === currentUser(req).id);
    return res.json({ success: true, eloChange: mine?.delta ?? 0, message: 'Sonucu onayladınız, Elo puanları güncellendi.' });
  }));

  app.post('/api/matches/:id/result/dispute', requireAuth, handle(async (req, res) => {
    await matchResults.disputeResult(req.params.id, currentUser(req), req.body?.reason);
    return res.json({ success: true, message: 'İtirazınız kaydedildi. Doğru skor yeniden girilene kadar Elo değişmez.' });
  }));

  app.get('/api/messages', requireAuth, handle(async (req, res) => {
    return res.json(await social.listConversations(currentUser(req).id));
  }));

  app.post('/api/messages/start-direct', requireAuth, conversationStartLimit, handle(async (req, res) => {
    const { targetUserId } = req.body || {};
    if (!targetUserId) throw new HttpError(400, 'Hedef kullanıcı belirtilmelidir.');
    const conversation = await social.startDirectConversation(currentUser(req), String(targetUserId));
    return res.json({ success: true, conversation });
  }));

  app.post('/api/messages', requireAuth, messageSendLimit, handle(async (req, res) => {
    const { conversationId, text } = req.body || {};
    if (!conversationId || typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Mesaj metni zorunludur.');
    if (text.trim().length > 2000) throw new HttpError(400, 'Mesaj en fazla 2000 karakter olabilir.');
    const message = await social.sendMessage(currentUser(req), String(conversationId), text.trim());
    return res.json({ success: true, message });
  }));

  app.get('/api/feed', handle(async (req, res) => {
    return res.json({ posts: await social.listFeed(req.query.category) });
  }));

  app.post('/api/feed', requireAuth, feedPostLimit, handle(async (req, res) => {
    const { content, category = 'SOHBET', venueName } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) throw new HttpError(400, 'Paylaşım içeriği boş olamaz.');
    if (content.trim().length > 1000 || (venueName !== undefined && venueName !== null && (typeof venueName !== 'string' || venueName.length > 100))) {
      throw new HttpError(400, 'Paylaşım en fazla 1000 karakter olabilir.');
    }
    const post = await social.createPost(currentUser(req), content.trim(), category, venueName?.trim() || undefined);
    return res.status(201).json({ success: true, post });
  }));

  app.post('/api/feed/:id/like', requireAuth, feedLikeLimit, handle(async (req, res) => {
    return res.json({ success: true, ...(await social.togglePostLike(currentUser(req), req.params.id)) });
  }));

  app.post('/api/feed/:id/reply', requireAuth, feedReplyLimit, handle(async (req, res) => {
    const { content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) throw new HttpError(400, 'Yanıt metni boş olamaz.');
    if (content.trim().length > 1000) throw new HttpError(400, 'Yanıt en fazla 1000 karakter olabilir.');
    const reply = await social.replyToPost(currentUser(req), req.params.id, content.trim());
    return res.status(201).json({ success: true, reply });
  }));

  // -------------------------------------------------------------
  // 6. Club panel
  // -------------------------------------------------------------

  app.get('/api/panel/business', requireAuth, requireBusiness(), handle(async (req, res) => {
    const clubId = currentClubId(req);
    const business = await clubs.getBusiness(clubId);
    if (!business) throw new HttpError(404, 'İşletme bulunamadı.');
    const courts = await clubs.listClubCourts(clubId);
    const { isActive, appBookingEnabled, ...rest } = business;
    return res.json({ business: rest, activeCourtCount: courts.filter(c => c.isActive).length, isActive, appBookingEnabled });
  }));

  app.get('/api/panel/schedule', requireAuth, requireBusiness(), handle(async (req, res) => {
    const clubId = currentClubId(req);
    const membership = (req as any).membership as clubs.Membership;
    // Customer phone numbers are only for owners and staff who manage reservations
    const canSeePhones = membership.role === 'owner' || membership.permissions.includes('RESERVATION_MANAGE');
    const date = typeof req.query.date === 'string' && DATE_PATTERN.test(req.query.date) ? req.query.date : todayLocal();
    const days = Math.min(7, Math.max(1, Number(req.query.days) || 1));
    const dates = Array.from({ length: days }, (_, i) => addMinutesToLocal(`${date}T00:00:00`, i * 24 * 60).slice(0, 10));
    const schedule = await reservations.getClubSchedule(clubId, date, days, canSeePhones);
    return res.json({ businessId: clubId, dates, ...schedule });
  }));

  app.post('/api/panel/reservations/manual', requireAuth, requireBusiness('RESERVATION_MANAGE'), handle(async (req, res) => {
    const { courtId, customerName, customerPhone, date, startTime, durationMinutes = 90, paymentStatus = 'PAY_AT_VENUE', note } = req.body || {};
    if (!courtId || !date || !startTime) throw new HttpError(400, 'Kort, tarih ve saat zorunludur.');
    const dur = Number(durationMinutes);
    if (![60, 90, 120].includes(dur) || !DATE_PATTERN.test(String(date)) || !TIME_PATTERN.test(String(startTime))) {
      throw new HttpError(400, 'Geçersiz tarih, saat veya süre.');
    }
    if (!['PAY_AT_VENUE', 'PAID'].includes(paymentStatus)) throw new HttpError(400, 'Geçersiz ödeme durumu.');
    const name = typeof customerName === 'string' && customerName.trim() ? customerName.trim().slice(0, 60) : 'Misafir';
    let phone: string | null = null;
    if (customerPhone) {
      phone = normalizePhone(customerPhone);
      if (!phone) throw new HttpError(400, 'Müşteri telefonu 05XX XXX XX XX biçiminde olmalıdır.');
    }
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 300)) {
      throw new HttpError(400, 'Not en fazla 300 karakter olabilir.');
    }
    const reservation = await reservations.createPanelReservation(currentClubId(req), currentUser(req).id, {
      courtId: String(courtId),
      customerName: name,
      customerPhone: phone,
      startAt: `${date}T${startTime}:00`,
      durationMinutes: dur,
      paid: paymentStatus === 'PAID',
      note: note || undefined
    });
    return res.status(201).json({ success: true, reservation });
  }));

  app.post('/api/panel/blocks', requireAuth, requireBusiness('COURT_BLOCK'), handle(async (req, res) => {
    const { courtId, date, startTime, endTime, reason, reasonNote } = req.body || {};
    if (!courtId || !date || !startTime || !endTime || !reason) {
      throw new HttpError(400, 'Kort, tarih, saat aralığı ve blokaj sebebi zorunludur.');
    }
    if (!DATE_PATTERN.test(String(date)) || !TIME_PATTERN.test(String(startTime)) || !/^([01]\d|2[0-4]):[0-5]\d$/.test(String(endTime)) || endTime <= startTime) {
      throw new HttpError(400, 'Geçersiz tarih veya saat aralığı.');
    }
    const startAt = `${date}T${startTime}:00`;
    const endAt = addMinutesToLocal(`${date}T00:00:00`, clockToMinutes(String(endTime)));
    const block = await reservations.createBlock(currentClubId(req), currentUser(req).id, {
      courtId: String(courtId), startAt, endAt, reason, reasonNote: typeof reasonNote === 'string' ? reasonNote : undefined
    });
    return res.status(201).json({ success: true, block });
  }));

  app.delete('/api/panel/blocks/:id', requireAuth, requireBusiness('COURT_BLOCK'), handle(async (req, res) => {
    if (!(await reservations.removeBlock(currentClubId(req), req.params.id, currentUser(req).id))) {
      throw new HttpError(404, 'Blokaj kaydı bulunamadı.');
    }
    return res.json({ success: true });
  }));

  app.patch('/api/panel/reservations/:id/status', requireAuth, requireBusiness('RESERVATION_MANAGE'), handle(async (req, res) => {
    const { status } = req.body || {};
    if (!RESERVATION_STATUSES.includes(status)) throw new HttpError(400, 'Geçersiz rezervasyon durumu.');
    const reservation = await reservations.updateReservationStatus(currentClubId(req), req.params.id, status as ReservationStatus, currentUser(req).id);
    return res.json({ success: true, reservation });
  }));

  app.patch('/api/panel/reservations/:id/payment', requireAuth, requireBusiness('PAYMENT_COLLECT'), handle(async (req, res) => {
    const reservation = await reservations.updatePaymentStatus(currentClubId(req), req.params.id, req.body?.paymentStatus, currentUser(req).id);
    return res.json({ success: true, reservation });
  }));

  app.get('/api/panel/courts', requireAuth, requireBusiness(), handle(async (req, res) => {
    const date = typeof req.query.date === 'string' && DATE_PATTERN.test(req.query.date) ? req.query.date : todayLocal();
    return res.json(await panel.getPanelCourts(currentClubId(req), date));
  }));

  app.post('/api/panel/courts', requireAuth, requireBusiness('COURT_MANAGE'), handle(async (req, res) => {
    const court = await clubs.createCourt(currentClubId(req), req.body || {});
    return res.status(201).json({ success: true, court });
  }));

  app.patch('/api/panel/courts/:id', requireAuth, requireBusiness('COURT_MANAGE'), handle(async (req, res) => {
    const court = await clubs.updateCourt(currentClubId(req), req.params.id, req.body || {});
    return res.json({ success: true, court });
  }));

  app.get('/api/panel/staff', requireAuth, requireBusiness('STAFF_MANAGE'), handle(async (req, res) => {
    return res.json({ staff: await clubs.listStaff(currentClubId(req)) });
  }));

  app.post('/api/panel/staff', requireAuth, requireBusiness('STAFF_MANAGE'), handle(async (req, res) => {
    const clubId = currentClubId(req);
    const { name, permissions = ['RESERVATION_MANAGE'] } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || !email) {
      throw new HttpError(400, 'Geçerli bir personel adı ve e-posta adresi zorunludur.');
    }
    const staffName = name.trim();
    const granted = Array.isArray(permissions) ? permissions.filter((p: unknown): p is string => typeof p === 'string') : [];

    const existing = await users.findCredentialByEmail(email);
    const { staff, userId } = await getDb().tx(async q => {
      const userId = existing ? existing.id : await users.createInvitedUser(email, staffName, q);
      const staff = await clubs.addMembership(q, { clubId, userId, role: 'staff', permissions: granted, invitedBy: currentUser(req).id });
      return { staff, userId };
    }, `club:${clubId}`);

    // Accounts without a password get a link to choose one; existing users simply sign in
    const invited = !existing?.passwordHash;
    let inviteEmailSent = false;
    if (invited) {
      const business = await clubs.getBusiness(clubId);
      const link = await createAuthToken(userId, email, 'RESET_PASSWORD', STAFF_INVITE_TTL_MS);
      inviteEmailSent = await deliverMail(staffInviteEmail(email, existing?.displayName ?? staffName, business?.name ?? 'RALO işletmesi', link));
    }
    return res.status(201).json({ success: true, staff, invited, inviteEmailSent });
  }));

  app.get('/api/panel/reports', requireAuth, requireBusiness('REPORTS_VIEW'), handle(async (req, res) => {
    return res.json(await panel.getPanelReports(currentClubId(req)));
  }));

  app.get('/api/panel/club-agreement', requireAuth, requireBusiness('BILLING_VIEW'), handle(async (req, res) => {
    const state = await legal.getConsentState(currentUser(req).id);
    const doc = legal.listLegalDocuments().find(d => d.slug === 'kulup-hizmet-sozlesmesi') ?? null;
    return res.json({ document: doc, accepted: state.club_service_agreement.granted && state.club_service_agreement.currentVersion, acceptedAt: state.club_service_agreement.at });
  }));

  app.post('/api/panel/club-agreement/accept', requireAuth, requireBusiness('BILLING_VIEW'), handle(async (req, res) => {
    await legal.recordConsents(getDb(), currentUser(req), ['club_service_agreement'], 'accepted', 'club_panel', consentMeta(req), currentClubId(req));
    return res.json({ success: true, message: 'Kulüp Hizmet Sözleşmesi onayınız kaydedildi.' });
  }));

  app.get('/api/panel/statements', requireAuth, requireBusiness('BILLING_VIEW'), handle(async (req, res) => {
    // Where clubs send the bank transfer (public account details, set per environment)
    const iban = process.env.PAYMENT_IBAN?.trim();
    const paymentInfo = iban ? { iban, accountName: process.env.PAYMENT_ACCOUNT_NAME?.trim() || null } : null;
    const suspended = await getDb().query(
      `SELECT 1 FROM app.clubs WHERE id = $1 AND booking_suspended_reason = 'overdue_statement'`, [currentClubId(req)]
    );
    return res.json({
      statements: await admin.listStatements({ clubId: currentClubId(req) }),
      paymentInfo,
      bookingSuspended: suspended.rows.length > 0,
      suspendAfterDays: admin.OVERDUE_SUSPEND_DAYS
    });
  }));

  app.get('/api/panel/statements/:id', requireAuth, requireBusiness('BILLING_VIEW'), handle(async (req, res) => {
    const statement = await admin.getStatement(req.params.id, currentClubId(req));
    if (!statement) throw new HttpError(404, 'Hesap özeti bulunamadı.');
    return res.json({ statement });
  }));

  // -------------------------------------------------------------
  // 7. Notifications
  // -------------------------------------------------------------

  app.get('/api/notifications', requireAuth, handle(async (req, res) => {
    return res.json({ notifications: await notifications.listNotifications(currentUser(req).id) });
  }));

  app.post('/api/notifications/:id/read', requireAuth, handle(async (req, res) => {
    return res.json({ success: await notifications.markNotificationRead(req.params.id, currentUser(req).id) });
  }));

  app.post('/api/notifications/read-all', requireAuth, handle(async (req, res) => {
    await notifications.markAllNotificationsRead(currentUser(req).id);
    return res.json({ success: true });
  }));

  app.post('/api/notifications/simulate-2h-reminder', requireAuth, handle(async (req, res) => {
    return res.json(await reservations.sendTestReminder(currentUser(req), req.body?.matchId));
  }));

  app.get('/api/notifications/check-reminders', requireAuth, handle(async (req, res) => {
    return res.json(await reservations.checkTwoHourReminder(currentUser(req)));
  }));

  app.patch('/api/user/notification-settings', requireAuth, handle(async (req, res) => {
    const user = currentUser(req);
    await users.updateNotificationSettings(user.id, req.body || {});
    return res.json({ success: true, user: await users.getOwnProfile(user.id) });
  }));

  // -------------------------------------------------------------
  // 8. Platform admin
  // -------------------------------------------------------------

  const adminOnly = [requireAuth, requirePlatformAdmin];

  app.get('/api/admin/overview', ...adminOnly, handle(async (_req, res) => res.json(await admin.getOverview())));

  app.get('/api/admin/reference', ...adminOnly, handle(async (_req, res) => {
    return res.json({ cities: await admin.listCities(), amenities: await admin.listAmenities() });
  }));

  app.get('/api/admin/clubs', ...adminOnly, handle(async (_req, res) => res.json({ clubs: await admin.listAdminClubs() })));

  app.get('/api/admin/clubs/:id', ...adminOnly, handle(async (req, res) => {
    const club = await admin.getAdminClub(req.params.id);
    if (!club) throw new HttpError(404, 'Kulüp bulunamadı.');
    return res.json({ club });
  }));

  async function sendOwnerInvite(userId: string, email: string, name: string, clubName: string) {
    const link = await createAuthToken(userId, email, 'RESET_PASSWORD', STAFF_INVITE_TTL_MS);
    return deliverMail(staffInviteEmail(email, name, clubName, link));
  }

  app.post('/api/admin/clubs', ...adminOnly, handle(async (req, res) => {
    const ownerEmail = normalizeEmail(req.body?.ownerEmail);
    if (!ownerEmail) throw new HttpError(400, 'İşletme sahibinin geçerli e-posta adresi zorunludur.');
    const created = await admin.createClub(currentUser(req).id, req.body || {}, ownerEmail);
    const inviteEmailSent = created.ownerInvited
      ? await sendOwnerInvite(created.ownerUserId, ownerEmail, created.ownerName, created.clubName)
      : false;
    return res.status(201).json({
      success: true,
      club: await admin.getAdminClub(created.clubId),
      ownerInvited: created.ownerInvited,
      inviteEmailSent
    });
  }));

  app.patch('/api/admin/clubs/:id', ...adminOnly, handle(async (req, res) => {
    await admin.updateClub(currentUser(req).id, req.params.id, req.body || {});
    return res.json({ success: true, club: await admin.getAdminClub(req.params.id) });
  }));

  app.put('/api/admin/clubs/:id/opening-hours', ...adminOnly, handle(async (req, res) => {
    await admin.setOpeningHours(currentUser(req).id, req.params.id, req.body?.days);
    return res.json({ success: true, club: await admin.getAdminClub(req.params.id) });
  }));

  app.post('/api/admin/clubs/:id/courts', ...adminOnly, handle(async (req, res) => {
    if (!(await admin.getAdminClub(req.params.id))) throw new HttpError(404, 'Kulüp bulunamadı.');
    const court = await clubs.createCourt(req.params.id, req.body || {}, 'global');
    return res.status(201).json({ success: true, court });
  }));

  app.patch('/api/admin/clubs/:id/courts/:courtId', ...adminOnly, handle(async (req, res) => {
    const court = await clubs.updateCourt(req.params.id, req.params.courtId, req.body || {}, 'global');
    return res.json({ success: true, court });
  }));

  app.put('/api/admin/clubs/:id/lesson-fee', ...adminOnly, handle(async (req, res) => {
    await admin.setLessonFee(currentUser(req).id, req.params.id, req.body?.amount, req.body?.basis);
    return res.json({ success: true, club: await admin.getAdminClub(req.params.id) });
  }));

  app.post('/api/admin/clubs/:id/resend-owner-invite', ...adminOnly, handle(async (req, res) => {
    const owner = await admin.getPendingOwner(req.params.id);
    if (!owner) throw new HttpError(409, 'Bu kulübün şifre belirlememiş bir işletme sahibi yok.');
    const sent = await sendOwnerInvite(owner.userId, owner.email, owner.name, owner.clubName);
    if (!sent) throw new HttpError(502, 'Davet e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.');
    return res.json({ success: true, message: `Davet bağlantısı ${owner.email} adresine gönderildi.` });
  }));

  app.get('/api/admin/fees', ...adminOnly, handle(async (_req, res) => res.json(await admin.getFeeSettings())));

  app.post('/api/admin/fees/app-reservation', ...adminOnly, handle(async (req, res) => {
    await admin.setAppReservationFee(currentUser(req).id, req.body?.amount, req.body?.reason);
    return res.json({ success: true, ...(await admin.getFeeSettings()) });
  }));

  app.post('/api/admin/billing-policy', ...adminOnly, handle(async (req, res) => {
    await admin.setBillingPolicy(currentUser(req).id, req.body || {});
    return res.json({ success: true, ...(await admin.getFeeSettings()) });
  }));

  app.get('/api/admin/statements', ...adminOnly, handle(async (req, res) => {
    return res.json({ statements: await admin.listStatements({ period: req.query.period }) });
  }));

  app.post('/api/admin/statements/generate', ...adminOnly, handle(async (req, res) => {
    return res.json({ success: true, ...(await admin.generateStatements(currentUser(req).id, req.body?.period)) });
  }));

  app.get('/api/admin/statements/:id', ...adminOnly, handle(async (req, res) => {
    const statement = await admin.getStatement(req.params.id);
    if (!statement) throw new HttpError(404, 'Hesap özeti bulunamadı.');
    return res.json({ statement });
  }));

  app.post('/api/admin/statements/:id/paid', ...adminOnly, handle(async (req, res) => {
    await admin.markStatementPaid(currentUser(req).id, req.params.id, req.body || {});
    return res.json({ success: true, statement: await admin.getStatement(req.params.id) });
  }));

  app.post('/api/admin/statements/:id/cancel', ...adminOnly, handle(async (req, res) => {
    await admin.cancelStatement(currentUser(req).id, req.params.id, req.body?.reason);
    return res.json({ success: true, statement: await admin.getStatement(req.params.id) });
  }));

  app.get('/api/admin/users', ...adminOnly, handle(async (req, res) => {
    return res.json({ users: await admin.searchUsers(req.query.search) });
  }));

  // -------------------------------------------------------------
  // Health, unknown API routes, errors
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // Lessons: players, coaches, club coach contracts
  // -------------------------------------------------------------

  const requireCoach: RequestHandler = async (req, res, next) => {
    try {
      if (!(await lessons.isCoach(currentUser(req).id))) {
        return res.status(403).json({ error: 'Bu bölüm yalnızca kulüplerle sözleşmeli antrenörlere açıktır.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  app.get('/api/lessons', handle(async (req, res) => {
    const user = await optionalUser(req);
    const city = typeof req.query.city === 'string' && req.query.city !== 'Tüm Türkiye' && req.query.city !== 'ALL' ? req.query.city : undefined;
    const clubId = typeof req.query.clubId === 'string' ? req.query.clubId : undefined;
    return res.json({ lessons: await lessons.listLessons(user?.id ?? null, { city, clubId }) });
  }));

  app.get('/api/lessons/:id', handle(async (req, res) => {
    const user = await optionalUser(req);
    const lesson = await lessons.getLesson(req.params.id, user?.id ?? null);
    if (!lesson) throw new HttpError(404, 'Ders bulunamadı.');
    return res.json({ lesson });
  }));

  app.post('/api/lessons/:id/enroll', requireAuth, bookingLimit, handle(async (req, res) => {
    const user = currentUser(req);
    if (!user.emailVerified && !DEMO_MODE) {
      throw new HttpError(403, 'Derse kayıt olabilmek için önce e-posta adresinizi doğrulayın.', 'EMAIL_NOT_VERIFIED');
    }
    const status = await lessons.enroll(req.params.id, user);
    return res.json({
      success: true,
      status,
      message: status === 'ENROLLED' ? 'Derse kaydınız alındı. Ücret tesiste ödenir.' : 'Ders kontenjanı dolu; bekleme listesine alındınız.'
    });
  }));

  app.post('/api/lessons/:id/cancel-enrollment', requireAuth, handle(async (req, res) => {
    await lessons.cancelEnrollment(req.params.id, currentUser(req));
    return res.json({ success: true, message: 'Ders kaydınız iptal edildi.' });
  }));

  app.get('/api/my-lessons', requireAuth, handle(async (req, res) => {
    return res.json(await lessons.getMyLessons(currentUser(req).id));
  }));

  app.get('/api/coach/overview', requireAuth, requireCoach, handle(async (req, res) => {
    return res.json(await lessons.getCoachOverview(currentUser(req).id));
  }));

  app.post('/api/coach/lessons', requireAuth, requireCoach, handle(async (req, res) => {
    const lessonId = await lessons.createLesson(currentUser(req), req.body || {});
    return res.status(201).json({ success: true, lessonId, message: 'Ders oluşturuldu ve oturumlar için kort ayrıldı.' });
  }));

  app.post('/api/coach/lessons/:id/cancel', requireAuth, requireCoach, handle(async (req, res) => {
    await lessons.cancelLesson(currentUser(req), req.params.id);
    return res.json({ success: true, message: 'Ders ve kalan oturumları iptal edildi; öğrencilere bildirim gönderildi.' });
  }));

  app.post('/api/coach/sessions/:id/cancel', requireAuth, requireCoach, handle(async (req, res) => {
    await lessons.cancelSession(currentUser(req), req.params.id);
    return res.json({ success: true, message: 'Oturum iptal edildi, kort serbest bırakıldı.' });
  }));

  app.put('/api/coach/sessions/:id/attendance', requireAuth, requireCoach, handle(async (req, res) => {
    await lessons.takeAttendance(currentUser(req), req.params.id, req.body?.entries);
    return res.json({ success: true, message: 'Yoklama kaydedildi.' });
  }));

  app.post('/api/coach/notes', requireAuth, requireCoach, handle(async (req, res) => {
    await lessons.addStudentNote(currentUser(req), req.body || {});
    return res.status(201).json({ success: true, message: 'Not kaydedildi.' });
  }));

  app.get('/api/panel/coaches', requireAuth, requireBusiness('STAFF_MANAGE'), handle(async (req, res) => {
    return res.json({ coaches: await lessons.listCoachContracts(currentClubId(req)) });
  }));

  app.post('/api/panel/coaches', requireAuth, requireBusiness('STAFF_MANAGE'), handle(async (req, res) => {
    const clubId = currentClubId(req);
    const email = normalizeEmail(req.body?.email);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 60 || !email) throw new HttpError(400, 'Geçerli bir antrenör adı ve e-posta adresi zorunludur.');

    const existing = await users.findCredentialByEmail(email);
    if (existing && existing.status !== 'active') throw new HttpError(400, 'Bu e-posta adresine ait hesap kullanılamıyor.');
    const userId = await getDb().tx(async q => {
      const id = existing ? existing.id : await users.createInvitedUser(email, name, q);
      await lessons.createCoachContract(q, clubId, id, currentUser(req).id);
      return id;
    }, `club:${clubId}`);

    const invited = !existing?.passwordHash;
    let inviteEmailSent = false;
    if (invited) {
      const business = await clubs.getBusiness(clubId);
      const link = await createAuthToken(userId, email, 'RESET_PASSWORD', STAFF_INVITE_TTL_MS);
      inviteEmailSent = await deliverMail(coachInviteEmail(email, existing?.displayName ?? name, business?.name ?? 'RALO kulübü', link));
    }
    return res.status(201).json({ success: true, coaches: await lessons.listCoachContracts(clubId), invited, inviteEmailSent });
  }));

  app.post('/api/panel/coaches/:id/end', requireAuth, requireBusiness('STAFF_MANAGE'), handle(async (req, res) => {
    await lessons.endCoachContract(currentClubId(req), req.params.id);
    return res.json({ success: true, coaches: await lessons.listCoachContracts(currentClubId(req)) });
  }));

  // -------------------------------------------------------------
  // Legal documents and consents
  // -------------------------------------------------------------

  app.get('/api/legal', handle(async (_req, res) => {
    return res.json({ documents: legal.listLegalDocuments() });
  }));

  app.get('/api/legal/:slug', handle(async (req, res) => {
    const doc = legal.getLegalDocument(req.params.slug);
    if (!doc) throw new HttpError(404, 'Belge bulunamadı.');
    return res.json({ document: doc });
  }));

  app.get('/api/user/consents', requireAuth, handle(async (req, res) => {
    return res.json({ consents: await legal.getConsentState(currentUser(req).id) });
  }));

  app.put('/api/user/consents/share-card', requireAuth, handle(async (req, res) => {
    const granted = req.body?.granted;
    if (typeof granted !== 'boolean') throw new HttpError(400, 'granted alanı true veya false olmalıdır.');
    await legal.recordConsents(getDb(), currentUser(req), ['share_card'], granted ? 'accepted' : 'withdrawn', 'profile_settings', consentMeta(req));
    return res.json({
      success: true,
      consents: await legal.getConsentState(currentUser(req).id),
      message: granted ? 'Paylaşım kartlarında görünme rızanız kaydedildi.' : 'Rızanız geri alındı; paylaşım kartlarında anonim görüneceksiniz.'
    });
  }));

  app.get('/api/health', handle(async (_req, res) => {
    await getDb().query('SELECT 1');
    return res.json({ ok: true });
  }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Bulunamadı.' });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) {
      return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'İstek çok büyük.' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Geçersiz istek gövdesi.' });
    }
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    return res.status(500).json({ error: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
  });

  return app;
}
