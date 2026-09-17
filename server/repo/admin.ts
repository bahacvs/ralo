import { getDb, type Queryable } from '../db/instance.js';
import { todayLocal } from '../time.js';
import { BUSINESS_SELECT, toBusiness, kurusToTl, tlToKurus, iso } from './mappers.js';
import { isUuid, HttpError } from './util.js';
import { addMembership, listClubCourts } from './clubs.js';
import { createInvitedUser, findCredentialByEmail } from './users.js';
import { addNotification } from './notifications.js';

// Platform (super-admin) operations: clubs, fee settings and monthly statements.

/** actorId null = a background job (actor_scope 'system'). */
async function audit(
  q: Queryable, actorId: string | null, action: string, targetType: string, targetId: string | null,
  clubId: string | null, after: unknown = null
) {
  await q.query(
    `INSERT INTO app.audit_log (actor_user_id, actor_scope, action, target_type, target_id, club_id, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorId, actorId ? 'platform_admin' : 'system', action, targetType, targetId, clubId, after === null ? null : JSON.stringify(after)]
  );
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { rows } = await getDb().query(`SELECT 1 FROM app.platform_admins WHERE user_id = $1`, [userId]);
  return rows.length > 0;
}

/** Bootstrap for the first admin (scripts/admin-grant.ts); the account must already exist. */
export async function grantPlatformAdmin(email: string): Promise<string> {
  const credential = await findCredentialByEmail(email);
  if (!credential) throw new Error(`No account with email ${email}; sign up in the app first.`);
  await getDb().query(
    `INSERT INTO app.platform_admins (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [credential.id]
  );
  return credential.id;
}

// -------------------------------------------------------------
// Overview
// -------------------------------------------------------------

export async function getOverview() {
  const month = `${todayLocal().slice(0, 7)}-01`;
  const { rows } = await getDb().query(
    `SELECT
       (SELECT count(*)::int FROM app.clubs) AS clubs,
       (SELECT count(*)::int FROM app.clubs WHERE is_active) AS active_clubs,
       (SELECT count(*)::int FROM app.users WHERE status = 'active') AS users,
       (SELECT count(*)::int FROM app.users WHERE status = 'active' AND email_verified_at IS NOT NULL) AS verified_users,
       (SELECT count(*)::int FROM app.reservations
          WHERE source = 'app' AND status <> 'cancelled' AND local_date >= $1::date) AS app_reservations_month,
       (SELECT COALESCE(sum(amount_kurus), 0)::int FROM app.fee_ledger_entries
          WHERE billing_period = $1::date AND status IN ('accrued','billed')) AS fees_month_kurus,
       (SELECT COALESCE(sum(total_kurus), 0)::int FROM app.monthly_statements WHERE status IN ('issued','overdue')) AS open_statements_kurus,
       (SELECT count(*)::int FROM app.monthly_statements
          WHERE status IN ('issued','overdue') AND due_date < app.istanbul_date(now())) AS overdue_statements`,
    [month]
  );
  const r = rows[0];
  return {
    clubs: r.clubs,
    activeClubs: r.active_clubs,
    users: r.users,
    verifiedUsers: r.verified_users,
    appReservationsThisMonth: r.app_reservations_month,
    feesThisMonth: kurusToTl(r.fees_month_kurus),
    openStatementsTotal: kurusToTl(r.open_statements_kurus),
    overdueStatements: r.overdue_statements
  };
}

export async function listCities() {
  const { rows } = await getDb().query(`SELECT id, name FROM app.cities ORDER BY name`);
  return rows.map(r => ({ id: r.id, name: r.name }));
}

export async function listAmenities() {
  const { rows } = await getDb().query(`SELECT code, label_tr FROM app.amenities ORDER BY sort_order`);
  return rows.map(r => ({ code: r.code, label: r.label_tr }));
}

// -------------------------------------------------------------
// Clubs
// -------------------------------------------------------------

function slugify(value: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, ch => map[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'kulup';
}

export interface ClubInput {
  name?: unknown;
  cityId?: unknown;
  districtName?: unknown;
  address?: unknown;
  phone?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  cancellationWindowHours?: unknown;
  coverImageUrl?: unknown;
  policies?: unknown;
  amenities?: unknown;
  isActive?: unknown;
  appBookingEnabled?: unknown;
}

interface CleanClub {
  name?: string;
  cityId?: number;
  districtName?: string;
  address?: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cancellationWindowHours?: number;
  coverImageUrl?: string | null;
  policies?: string[];
  amenities?: string[];
  isActive?: boolean;
  appBookingEnabled?: boolean;
}

function cleanClubInput(input: ClubInput, partial: boolean): CleanClub {
  const out: CleanClub = {};
  const text = (value: unknown, min: number, max: number, message: string) => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpError(400, message);
    return value.trim();
  };
  if (!partial || input.name !== undefined) out.name = text(input.name, 2, 120, 'Kulüp adı 2 ile 120 karakter arasında olmalıdır.');
  if (!partial || input.cityId !== undefined) {
    const cityId = Number(input.cityId);
    if (!Number.isInteger(cityId) || cityId < 1 || cityId > 81) throw new HttpError(400, 'Geçerli bir il seçiniz.');
    out.cityId = cityId;
  }
  if (!partial || input.districtName !== undefined) out.districtName = text(input.districtName, 2, 60, 'İlçe adı zorunludur.');
  if (!partial || input.address !== undefined) out.address = text(input.address, 5, 300, 'Adres en az 5 karakter olmalıdır.');
  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === '') {
      out.phone = null;
    } else {
      let digits = String(input.phone).replace(/\D/g, '');
      if (digits.startsWith('0')) digits = `9${digits}`;
      if (!digits.startsWith('90')) digits = `90${digits}`;
      if (!/^90[0-9]{10}$/.test(digits)) throw new HttpError(400, 'Telefon numarası 0 ile başlayan 11 haneli olmalıdır.');
      out.phone = digits;
    }
  }
  for (const [key, min, max] of [['latitude', 35, 43], ['longitude', 25, 45]] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null || value === '') {
      out[key] = null;
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Koordinatlar Türkiye sınırları içinde olmalıdır.');
    out[key] = n;
  }
  if (input.cancellationWindowHours !== undefined) {
    const hours = Number(input.cancellationWindowHours);
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) throw new HttpError(400, 'İptal süresi 0 ile 168 saat arasında olmalıdır.');
    out.cancellationWindowHours = hours;
  }
  if (input.coverImageUrl !== undefined) {
    if (input.coverImageUrl === null || input.coverImageUrl === '') out.coverImageUrl = null;
    else if (typeof input.coverImageUrl === 'string' && input.coverImageUrl.length <= 2000
      && (/^https:\/\//.test(input.coverImageUrl) || /^\/api\/media\/[0-9a-f-]{36}$/.test(input.coverImageUrl))) {
      out.coverImageUrl = input.coverImageUrl;
    } else {
      throw new HttpError(400, 'Kapak görseli https ile başlayan bir bağlantı olmalıdır.');
    }
  }
  if (input.policies !== undefined) {
    if (!Array.isArray(input.policies) || input.policies.length > 20
      || input.policies.some(p => typeof p !== 'string' || p.length > 200)) {
      throw new HttpError(400, 'Kulüp kuralları en fazla 20 madde ve madde başına 200 karakter olabilir.');
    }
    out.policies = (input.policies as string[]).map(p => p.trim()).filter(Boolean);
  }
  if (input.amenities !== undefined) {
    if (!Array.isArray(input.amenities) || input.amenities.some(a => typeof a !== 'string')) {
      throw new HttpError(400, 'Geçersiz olanak listesi.');
    }
    out.amenities = input.amenities as string[];
  }
  if (input.isActive !== undefined) out.isActive = Boolean(input.isActive);
  if (input.appBookingEnabled !== undefined) out.appBookingEnabled = Boolean(input.appBookingEnabled);
  return out;
}

async function districtId(q: Queryable, cityId: number, name: string): Promise<number> {
  const { rows } = await q.query<{ id: number }>(
    `INSERT INTO app.districts (city_id, name, slug) VALUES ($1, $2, $3)
     ON CONFLICT (city_id, slug) DO UPDATE SET name = app.districts.name
     RETURNING id`,
    [cityId, name, slugify(name)]
  );
  return rows[0].id;
}

async function replaceAmenities(q: Queryable, clubId: string, codes: string[]) {
  await q.query(`DELETE FROM app.club_amenities WHERE club_id = $1`, [clubId]);
  await q.query(
    `INSERT INTO app.club_amenities (club_id, amenity_code)
     SELECT $1, code FROM app.amenities WHERE code = ANY(string_to_array($2, ','))`,
    [clubId, codes.join(',')]
  );
}

const CLUB_LIST_SELECT = `
  c.id, c.name, c.is_active, c.app_booking_enabled, c.booking_suspended_reason, c.created_at, ci.name AS city_name, d.name AS district_name,
  (SELECT count(*)::int FROM app.courts co WHERE co.club_id = c.id) AS court_count,
  (SELECT count(*)::int FROM app.courts co WHERE co.club_id = c.id AND co.is_active) AS active_court_count,
  o.display_name AS owner_name, o.email AS owner_email, (o.password_hash IS NOT NULL) AS owner_has_password
  FROM app.clubs c
  JOIN app.cities ci ON ci.id = c.city_id
  JOIN app.districts d ON d.id = c.district_id
  LEFT JOIN LATERAL (
    SELECT u.display_name, u.email, u.password_hash FROM app.club_memberships m JOIN app.users u ON u.id = m.user_id
    WHERE m.club_id = c.id AND m.role = 'owner' AND m.status = 'active' ORDER BY m.created_at LIMIT 1
  ) o ON true`;

function toClubListItem(row: any) {
  return {
    id: row.id,
    name: row.name,
    city: row.city_name,
    district: row.district_name,
    isActive: row.is_active,
    appBookingEnabled: row.app_booking_enabled,
    bookingSuspendedForPayment: row.booking_suspended_reason === 'overdue_statement',
    courtCount: row.court_count,
    activeCourtCount: row.active_court_count,
    ownerName: row.owner_name ?? null,
    ownerEmail: row.owner_email ?? null,
    ownerHasPassword: !!row.owner_has_password,
    createdAt: iso(row.created_at)
  };
}

export async function listAdminClubs() {
  const { rows } = await getDb().query(`SELECT ${CLUB_LIST_SELECT} ORDER BY c.created_at DESC`);
  return rows.map(toClubListItem);
}

export async function getAdminClub(clubId: string) {
  if (!isUuid(clubId)) return null;
  const db = getDb();
  const list = await db.query(`SELECT ${CLUB_LIST_SELECT} WHERE c.id = $1`, [clubId]);
  if (!list.rows[0]) return null;
  const business = await db.query(`SELECT ${BUSINESS_SELECT} WHERE c.id = $1`, [clubId]);
  const extra = await db.query(
    `SELECT c.city_id, c.cancellation_window_hours, c.cover_image_url, c.phone, c.latitude, c.longitude, c.address,
            ARRAY(SELECT amenity_code FROM app.club_amenities WHERE club_id = c.id) AS amenity_codes,
            (SELECT row_to_json(r) FROM (
               SELECT amount_kurus, lesson_fee_basis, effective_from FROM app.platform_fee_rates
               WHERE fee_type = 'lesson' AND club_id = c.id AND effective_from <= now()
               ORDER BY effective_from DESC LIMIT 1) r) AS lesson_rate
     FROM app.clubs c WHERE c.id = $1`,
    [clubId]
  );
  const hours = await db.query(
    `SELECT weekday, is_closed, open_minute, close_minute FROM app.club_opening_hours WHERE club_id = $1 ORDER BY weekday`,
    [clubId]
  );
  const lessonRate = extra.rows[0].lesson_rate;
  return {
    ...toClubListItem(list.rows[0]),
    business: toBusiness(business.rows[0]),
    cityId: extra.rows[0].city_id,
    amenityCodes: extra.rows[0].amenity_codes ?? [],
    lessonFee: lessonRate ? { amount: kurusToTl(lessonRate.amount_kurus), basis: lessonRate.lesson_fee_basis } : null,
    openingHours: hours.rows.map(h => ({
      weekday: h.weekday,
      isClosed: h.is_closed,
      openMinute: h.open_minute,
      closeMinute: h.close_minute
    })),
    courts: await listClubCourts(clubId)
  };
}

export async function createClub(
  adminId: string,
  input: ClubInput & { ownerName?: unknown },
  ownerEmail: string
): Promise<{ clubId: string; clubName: string; ownerUserId: string; ownerInvited: boolean; ownerName: string }> {
  const club = cleanClubInput(input, false);
  const ownerName = typeof input.ownerName === 'string' ? input.ownerName.trim() : '';
  if (ownerName.length < 2 || ownerName.length > 60) {
    throw new HttpError(400, 'İşletme sahibinin adı 2 ile 60 karakter arasında olmalıdır.');
  }

  return getDb().tx(async q => {
    const district = await districtId(q, club.cityId!, club.districtName!);
    let slug = slugify(`${club.name}-${club.districtName}`);
    const taken = await q.query(`SELECT 1 FROM app.clubs WHERE slug = $1`, [slug]);
    if (taken.rows.length > 0) slug = `${slug}-${Date.now().toString(36)}`;

    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO app.clubs (name, slug, city_id, district_id, address, phone, latitude, longitude,
                              cancellation_window_hours, cover_image_url, policies, is_active, app_booking_enabled,
                              created_by, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, now())
       RETURNING id`,
      [
        club.name, slug, club.cityId, district, club.address, club.phone ?? null, club.latitude ?? null, club.longitude ?? null,
        club.cancellationWindowHours ?? 24, club.coverImageUrl ?? null, club.policies ?? [],
        club.isActive ?? false, club.appBookingEnabled ?? true, adminId
      ]
    );
    const clubId = rows[0].id;

    if (club.amenities) await replaceAmenities(q, clubId, club.amenities);
    // Default opening hours 08:00-23:00 every day; editable afterwards
    await q.query(
      `INSERT INTO app.club_opening_hours (club_id, weekday, open_minute, close_minute)
       SELECT $1, d, 480, 1380 FROM generate_series(1, 7) AS d`,
      [clubId]
    );

    const existing = await findCredentialByEmail(ownerEmail, q);
    const ownerUserId = existing ? existing.id : await createInvitedUser(ownerEmail, ownerName, q);
    await addMembership(q, { clubId, userId: ownerUserId, role: 'owner', permissions: [], invitedBy: adminId });
    await audit(q, adminId, 'club.create', 'club', clubId, clubId, { name: club.name, cityId: club.cityId });

    return { clubId, clubName: club.name!, ownerUserId, ownerInvited: !existing || !existing.passwordHash, ownerName };
  });
}

export async function updateClub(adminId: string, clubId: string, input: ClubInput): Promise<void> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  const club = cleanClubInput(input, true);
  await getDb().tx(async q => {
    const current = await q.query<{ city_id: number }>(`SELECT city_id FROM app.clubs WHERE id = $1 FOR UPDATE`, [clubId]);
    if (!current.rows[0]) throw new HttpError(404, 'Kulüp bulunamadı.');
    const cityId = club.cityId ?? current.rows[0].city_id;
    const district = club.districtName ? await districtId(q, cityId, club.districtName) : null;
    if (club.cityId !== undefined && !district) {
      throw new HttpError(400, 'İl değiştirilirken ilçe de belirtilmelidir.');
    }
    const has = (key: keyof CleanClub) => club[key] !== undefined;
    await q.query(
      `UPDATE app.clubs SET
         name = COALESCE($2, name),
         city_id = COALESCE($3, city_id),
         district_id = COALESCE($4, district_id),
         address = COALESCE($5, address),
         phone = CASE WHEN $6 THEN $7 ELSE phone END,
         latitude = CASE WHEN $8 THEN $9::float8 ELSE latitude END,
         longitude = CASE WHEN $10 THEN $11::float8 ELSE longitude END,
         cancellation_window_hours = COALESCE($12, cancellation_window_hours),
         cover_image_url = CASE WHEN $13 THEN $14 ELSE cover_image_url END,
         policies = COALESCE($15, policies),
         is_active = COALESCE($16, is_active),
         app_booking_enabled = COALESCE($17, app_booking_enabled),
         -- a manual on/off decision by an admin replaces an automatic debt suspension
         booking_suspended_reason = CASE WHEN $17::boolean IS NULL THEN booking_suspended_reason END,
         booking_suspended_at = CASE WHEN $17::boolean IS NULL THEN booking_suspended_at END
       WHERE id = $1`,
      [
        clubId, club.name ?? null, club.cityId ?? null, district, club.address ?? null,
        has('phone'), club.phone ?? null, has('latitude'), club.latitude ?? null, has('longitude'), club.longitude ?? null,
        club.cancellationWindowHours ?? null, has('coverImageUrl'), club.coverImageUrl ?? null,
        club.policies ?? null, club.isActive ?? null, club.appBookingEnabled ?? null
      ]
    );
    if (club.amenities) await replaceAmenities(q, clubId, club.amenities);
    await audit(q, adminId, 'club.update', 'club', clubId, clubId, club);
  });
}

/** Owner of a club who has not set a password yet (for re-sending the invitation). */
export async function getPendingOwner(clubId: string): Promise<{ userId: string; email: string; name: string; clubName: string } | null> {
  if (!isUuid(clubId)) return null;
  const { rows } = await getDb().query(
    `SELECT u.id, u.email, u.display_name, c.name AS club_name
     FROM app.club_memberships m JOIN app.users u ON u.id = m.user_id JOIN app.clubs c ON c.id = m.club_id
     WHERE m.club_id = $1 AND m.role = 'owner' AND m.status = 'active' AND u.password_hash IS NULL
     ORDER BY m.created_at LIMIT 1`,
    [clubId]
  );
  const row = rows[0];
  return row ? { userId: row.id, email: row.email, name: row.display_name, clubName: row.club_name } : null;
}

const CLOCK_PATTERN = /^([01]\d|2[0-4]):([0-5]\d)$/;

export async function setOpeningHours(adminId: string, clubId: string, days: unknown): Promise<void> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  if (!Array.isArray(days) || days.length !== 7) throw new HttpError(400, 'Haftanın 7 günü için çalışma saati gönderilmelidir.');
  const rows = days.map((day: any, index: number) => {
    const weekday = index + 1;
    if (day?.isClosed) return { weekday, isClosed: true, open: null, close: null };
    const open = CLOCK_PATTERN.exec(String(day?.open ?? ''));
    const close = CLOCK_PATTERN.exec(String(day?.close ?? ''));
    if (!open || !close) throw new HttpError(400, 'Saatler SS:DD biçiminde olmalıdır.');
    const openMinute = Number(open[1]) * 60 + Number(open[2]);
    let closeMinute = Number(close[1]) * 60 + Number(close[2]);
    if (openMinute >= 1440) throw new HttpError(400, 'Açılış saati 24:00 olamaz.');
    if (closeMinute <= openMinute) closeMinute += 1440; // closes after midnight
    return { weekday, isClosed: false, open: openMinute, close: closeMinute };
  });
  await getDb().tx(async q => {
    const club = await q.query(`SELECT 1 FROM app.clubs WHERE id = $1`, [clubId]);
    if (club.rows.length === 0) throw new HttpError(404, 'Kulüp bulunamadı.');
    for (const row of rows) {
      await q.query(
        `INSERT INTO app.club_opening_hours (club_id, weekday, is_closed, open_minute, close_minute)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (club_id, weekday) DO UPDATE
           SET is_closed = EXCLUDED.is_closed, open_minute = EXCLUDED.open_minute, close_minute = EXCLUDED.close_minute`,
        [clubId, row.weekday, row.isClosed, row.open, row.close]
      );
    }
    await audit(q, adminId, 'club.opening_hours', 'club', clubId, clubId, rows);
  });
}

// -------------------------------------------------------------
// Fees and billing policy
// -------------------------------------------------------------

const LESSON_FEE_BASES = ['per_session', 'per_lesson', 'per_enrolled_student_session'];

export async function getFeeSettings() {
  const db = getDb();
  const appRates = await db.query(
    `SELECT r.amount_kurus, r.effective_from, r.reason, r.created_at, u.display_name AS created_by_name
     FROM app.platform_fee_rates r JOIN app.users u ON u.id = r.created_by
     WHERE r.fee_type = 'app_reservation' ORDER BY r.effective_from DESC LIMIT 20`
  );
  const policies = await db.query(
    `SELECT charge_no_show, statement_due_days, vat_rate_bps, amounts_include_vat, effective_from
     FROM app.billing_policies WHERE club_id IS NULL ORDER BY effective_from DESC LIMIT 1`
  );
  const lessonRates = await db.query(
    `SELECT DISTINCT ON (r.club_id) r.club_id, c.name AS club_name, r.amount_kurus, r.lesson_fee_basis, r.effective_from
     FROM app.platform_fee_rates r JOIN app.clubs c ON c.id = r.club_id
     WHERE r.fee_type = 'lesson' AND r.effective_from <= now()
     ORDER BY r.club_id, r.effective_from DESC`
  );
  const toRate = (row: any) => ({
    amount: kurusToTl(row.amount_kurus),
    effectiveFrom: iso(row.effective_from),
    reason: row.reason ?? null,
    createdByName: row.created_by_name
  });
  const policy = policies.rows[0];
  return {
    appReservationFee: appRates.rows[0] ? toRate(appRates.rows[0]) : null,
    appReservationFeeHistory: appRates.rows.map(toRate),
    billingPolicy: policy ? {
      chargeNoShow: policy.charge_no_show,
      statementDueDays: policy.statement_due_days,
      vatRatePercent: policy.vat_rate_bps / 100,
      amountsIncludeVat: policy.amounts_include_vat,
      effectiveFrom: iso(policy.effective_from)
    } : null,
    lessonFees: lessonRates.rows.map(row => ({
      clubId: row.club_id,
      clubName: row.club_name,
      amount: kurusToTl(row.amount_kurus),
      basis: row.lesson_fee_basis,
      effectiveFrom: iso(row.effective_from)
    }))
  };
}

function parseAmount(value: unknown): number {
  const amount = Number(value);
  if (value === null || value === '' || !Number.isFinite(amount) || amount < 0 || amount > 100000) {
    throw new HttpError(400, 'Tutar 0 ile 100.000 TL arasında olmalıdır.');
  }
  return tlToKurus(amount);
}

export async function setAppReservationFee(adminId: string, amount: unknown, reason: unknown): Promise<void> {
  const kurus = parseAmount(amount);
  await getDb().tx(async q => {
    await q.query(
      `INSERT INTO app.platform_fee_rates (fee_type, amount_kurus, effective_from, reason, created_by)
       VALUES ('app_reservation', $1, now(), $2, $3)`,
      [kurus, typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : null, adminId]
    );
    await audit(q, adminId, 'fee.app_reservation', 'platform_fee_rate', null, null, { amountKurus: kurus });
  });
}

export async function setLessonFee(adminId: string, clubId: string, amount: unknown, basis: unknown): Promise<void> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  const kurus = parseAmount(amount);
  if (typeof basis !== 'string' || !LESSON_FEE_BASES.includes(basis)) {
    throw new HttpError(400, 'Geçersiz ders ücreti hesaplama yöntemi.');
  }
  await getDb().tx(async q => {
    const club = await q.query(`SELECT 1 FROM app.clubs WHERE id = $1`, [clubId]);
    if (club.rows.length === 0) throw new HttpError(404, 'Kulüp bulunamadı.');
    await q.query(
      `INSERT INTO app.platform_fee_rates (fee_type, club_id, amount_kurus, lesson_fee_basis, effective_from, created_by)
       VALUES ('lesson', $1, $2, $3, now(), $4)`,
      [clubId, kurus, basis, adminId]
    );
    await audit(q, adminId, 'fee.lesson', 'platform_fee_rate', null, clubId, { amountKurus: kurus, basis });
  });
}

export async function setBillingPolicy(adminId: string, input: {
  amountsIncludeVat?: unknown; vatRatePercent?: unknown; statementDueDays?: unknown; chargeNoShow?: unknown;
}): Promise<void> {
  if (typeof input.amountsIncludeVat !== 'boolean') {
    throw new HttpError(400, 'Ücretlerin KDV dahil olup olmadığı seçilmelidir.');
  }
  const vat = Number(input.vatRatePercent);
  const due = Number(input.statementDueDays);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100) throw new HttpError(400, 'KDV oranı 0 ile 100 arasında olmalıdır.');
  if (!Number.isInteger(due) || due < 1 || due > 90) throw new HttpError(400, 'Ödeme vadesi 1 ile 90 gün arasında olmalıdır.');
  await getDb().tx(async q => {
    await q.query(
      `INSERT INTO app.billing_policies (club_id, effective_from, charge_no_show, statement_due_days, vat_rate_bps,
                                         amounts_include_vat, created_by)
       VALUES (NULL, now(), $1, $2, $3, $4, $5)`,
      [input.chargeNoShow !== false, due, Math.round(vat * 100), input.amountsIncludeVat, adminId]
    );
    await audit(q, adminId, 'billing.policy', 'billing_policy', null, null, input);
  });
}

// -------------------------------------------------------------
// Monthly statements
// -------------------------------------------------------------

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function toStatement(row: any) {
  const overdue = row.status === 'issued' && row.is_past_due;
  return {
    id: row.id,
    statementNo: row.statement_no,
    clubId: row.club_id,
    clubName: row.club_name,
    period: String(row.period_start_text).slice(0, 7),
    reservationFeeCount: row.reservation_fee_count,
    reservationFeeTotal: kurusToTl(row.reservation_fee_kurus),
    lessonFeeCount: row.lesson_fee_count,
    lessonFeeTotal: kurusToTl(row.lesson_fee_kurus),
    adjustmentsTotal: kurusToTl(row.adjustments_kurus),
    subtotal: kurusToTl(row.subtotal_kurus),
    vatRatePercent: row.vat_rate_bps / 100,
    vatTotal: kurusToTl(row.vat_kurus),
    total: kurusToTl(row.total_kurus),
    status: overdue ? 'overdue' : row.status,
    issuedAt: iso(row.issued_at),
    dueDate: row.due_date_text,
    paidAt: row.paid_at ? iso(row.paid_at) : null,
    paidAmount: row.paid_amount_kurus === null ? null : kurusToTl(row.paid_amount_kurus),
    paymentReference: row.payment_reference ?? null,
    cancelledReason: row.cancelled_reason ?? null
  };
}

const STATEMENT_SELECT = `
  s.*, to_char(s.period_start, 'YYYY-MM-DD') AS period_start_text, to_char(s.due_date, 'YYYY-MM-DD') AS due_date_text,
  (s.due_date < app.istanbul_date(now())) AS is_past_due, c.name AS club_name
  FROM app.monthly_statements s JOIN app.clubs c ON c.id = s.club_id`;

/** Creates one statement per club with accrued fees in a finished month; clubs that already have one are skipped. */
/** Marks issued statements past their due date as overdue and tells the club owners (once per statement). */
export async function markOverdueStatements(): Promise<number> {
  return getDb().tx(async q => {
    const { rows } = await q.query<{ id: string; club_id: string; statement_no: string; total_kurus: number; due_date: string }>(
      `UPDATE app.monthly_statements SET status = 'overdue'
       WHERE status = 'issued' AND due_date < app.istanbul_date(now())
       RETURNING id, club_id, statement_no, total_kurus, to_char(due_date, 'DD.MM.YYYY') AS due_date`
    );
    for (const statement of rows) {
      const owners = await q.query<{ user_id: string }>(
        `SELECT user_id FROM app.club_memberships WHERE club_id = $1 AND role = 'owner' AND status = 'active'`,
        [statement.club_id]
      );
      for (const owner of owners.rows) {
        await addNotification(q, {
          userId: owner.user_id,
          type: 'statement_overdue',
          title: 'Hesap Özeti Ödemesi Gecikti',
          body: `${statement.statement_no} numaralı hesap özetinin son ödeme tarihi (${statement.due_date}) geçti. Tutar: ${kurusToTl(statement.total_kurus).toLocaleString('tr-TR')} TL. Havale açıklamasına hesap özeti numarasını yazmayı unutmayın.`,
          dedupeKey: `overdue:${statement.id}`
        });
      }
      await audit(q, null, 'statement.overdue', 'monthly_statement', statement.id, statement.club_id, { statementNo: statement.statement_no });
    }
    return rows.length;
  });
}

/** App bookings are suspended when a statement is still unpaid this many days after its due date. */
export const OVERDUE_SUSPEND_DAYS = 7;

async function notifyOwners(q: Queryable, clubId: string, type: string, title: string, body: string, dedupeKey?: string) {
  const owners = await q.query<{ user_id: string }>(
    `SELECT user_id FROM app.club_memberships WHERE club_id = $1 AND role = 'owner' AND status = 'active'`, [clubId]
  );
  for (const owner of owners.rows) {
    await addNotification(q, { userId: owner.user_id, type, title, body, dedupeKey });
  }
}

/** Background job: turns off app bookings for clubs with a statement unpaid OVERDUE_SUSPEND_DAYS past due. */
export async function suspendClubsForOverdueStatements(): Promise<number> {
  return getDb().tx(async q => {
    const { rows } = await q.query<{ id: string; name: string }>(
      `UPDATE app.clubs c
       SET app_booking_enabled = false, booking_suspended_reason = 'overdue_statement', booking_suspended_at = now()
       WHERE c.app_booking_enabled AND c.booking_suspended_reason IS NULL
         AND EXISTS (SELECT 1 FROM app.monthly_statements s
                     WHERE s.club_id = c.id AND s.status IN ('issued','overdue')
                       AND s.due_date < app.istanbul_date(now()) - $1::int)
       RETURNING c.id, c.name`,
      [OVERDUE_SUSPEND_DAYS]
    );
    for (const club of rows) {
      await notifyOwners(q, club.id, 'statement_overdue', 'Uygulama Rezervasyonları Durduruldu',
        `Son ödeme tarihinden ${OVERDUE_SUSPEND_DAYS} gün sonra hâlâ ödenmemiş bir hesap özetiniz olduğu için oyuncular kulübünüzde uygulamadan rezervasyon yapamıyor. Ödeme kaydedildiğinde rezervasyonlar otomatik olarak yeniden açılır.`,
        `suspend:${club.id}:${new Date().toISOString().slice(0, 10)}`);
      await audit(q, null, 'club.booking_suspended', 'club', club.id, club.id, { reason: 'overdue_statement' });
    }
    return rows.length;
  });
}

/** Re-opens app bookings suspended for debt once no statement is unpaid past the grace period. */
async function releaseBookingSuspension(q: Queryable, clubId: string, actorId: string | null): Promise<void> {
  const { rows } = await q.query<{ id: string }>(
    `UPDATE app.clubs c
     SET app_booking_enabled = true, booking_suspended_reason = NULL, booking_suspended_at = NULL
     WHERE c.id = $1 AND c.booking_suspended_reason = 'overdue_statement'
       AND NOT EXISTS (SELECT 1 FROM app.monthly_statements s
                       WHERE s.club_id = c.id AND s.status IN ('issued','overdue')
                         AND s.due_date < app.istanbul_date(now()) - $2::int)
     RETURNING c.id`,
    [clubId, OVERDUE_SUSPEND_DAYS]
  );
  if (!rows[0]) return;
  await notifyOwners(q, clubId, 'statement_issued', 'Uygulama Rezervasyonları Yeniden Açıldı',
    'Ödemeniz kaydedildi; oyuncular kulübünüzde yeniden uygulamadan rezervasyon yapabilir.');
  await audit(q, actorId, 'club.booking_resumed', 'club', clubId, clubId, { reason: 'overdue_statement_settled' });
}

/** adminId null = the monthly background job. */
export async function generateStatements(adminId: string | null, period: unknown) {
  const match = typeof period === 'string' ? PERIOD_PATTERN.exec(period) : null;
  if (!match) throw new HttpError(400, 'Dönem YYYY-AA biçiminde olmalıdır.');
  const periodText = period as string;
  if (periodText >= todayLocal().slice(0, 7)) {
    throw new HttpError(400, 'Hesap özeti yalnızca tamamlanmış aylar için oluşturulabilir.');
  }
  const periodStart = `${periodText}-01`;

  return getDb().tx(async q => {
    const clubs = await q.query<{ club_id: string; club_name: string }>(
      `SELECT DISTINCT e.club_id, c.name AS club_name
       FROM app.fee_ledger_entries e JOIN app.clubs c ON c.id = e.club_id
       WHERE e.billing_period = $1::date AND e.status = 'accrued'
         AND NOT EXISTS (SELECT 1 FROM app.monthly_statements s
                         WHERE s.club_id = e.club_id AND s.period_start = $1::date AND s.status <> 'cancelled')
       ORDER BY c.name`,
      [periodStart]
    );

    const created: string[] = [];
    for (const club of clubs.rows) {
      const policyResult = await q.query(
        `SELECT (p).id, (p).vat_rate_bps, (p).amounts_include_vat, (p).statement_due_days
         FROM (SELECT app.resolve_billing_policy($1, now()) AS p) x`,
        [club.club_id]
      );
      const policy = policyResult.rows[0];
      if (!policy?.id) {
        throw new HttpError(409, 'Önce Ücretler sayfasından fatura politikasını (KDV ve ödeme vadesi) kaydedin.');
      }

      const entries = await q.query<{ id: string; fee_type: string; entry_type: string; amount_kurus: number }>(
        `SELECT id, fee_type, entry_type, amount_kurus FROM app.fee_ledger_entries
         WHERE club_id = $1 AND billing_period = $2::date AND status = 'accrued'
         ORDER BY service_date, created_at FOR UPDATE`,
        [club.club_id, periodStart]
      );
      if (entries.rows.length === 0) continue;

      const charges = entries.rows.filter(e => e.entry_type === 'charge');
      const sum = (rows: { amount_kurus: number }[]) => rows.reduce((total, e) => total + e.amount_kurus, 0);
      const reservationGross = sum(charges.filter(e => e.fee_type === 'app_reservation'));
      const lessonGross = sum(charges.filter(e => e.fee_type === 'lesson'));
      const adjustmentsGross = sum(entries.rows.filter(e => e.entry_type === 'reversal'));
      const rate = policy.vat_rate_bps;

      let reservationNet = reservationGross;
      let lessonNet = lessonGross;
      let adjustmentsNet = adjustmentsGross;
      let vat: number;
      if (policy.amounts_include_vat) {
        const net = (gross: number) => Math.round((gross * 10000) / (10000 + rate));
        reservationNet = net(reservationGross);
        lessonNet = net(lessonGross);
        adjustmentsNet = Math.min(0, net(adjustmentsGross));
        vat = reservationGross + lessonGross + adjustmentsGross - (reservationNet + lessonNet + adjustmentsNet);
      } else {
        vat = Math.round(((reservationGross + lessonGross + adjustmentsGross) * rate) / 10000);
      }
      const subtotal = reservationNet + lessonNet + adjustmentsNet;

      const sequence = await q.query<{ n: number }>(
        `SELECT count(*)::int + 1 AS n FROM app.monthly_statements WHERE period_start = $1::date`,
        [periodStart]
      );
      const statementNo = `RALO-${periodText.replace('-', '')}-${String(sequence.rows[0].n).padStart(5, '0')}`;
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO app.monthly_statements (
           statement_no, club_id, period_start, period_end, reservation_fee_count, reservation_fee_kurus,
           lesson_fee_count, lesson_fee_kurus, adjustments_kurus, subtotal_kurus, vat_rate_bps, vat_kurus, total_kurus,
           due_date)
         VALUES ($1, $2, $3::date, ($3::date + interval '1 month')::date, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 app.istanbul_date(now()) + $13::int)
         RETURNING id`,
        [
          statementNo, club.club_id, periodStart,
          charges.filter(e => e.fee_type === 'app_reservation').length, reservationNet,
          charges.filter(e => e.fee_type === 'lesson').length, lessonNet,
          adjustmentsNet, subtotal, rate, vat, subtotal + vat, policy.statement_due_days
        ]
      );
      const statementId = rows[0].id;
      const ids = entries.rows.map(e => e.id).join(',');

      await q.query(
        `INSERT INTO app.statement_lines (statement_id, ledger_entry_id, line_type, description, service_date, amount_kurus)
         SELECT $1, e.id,
                CASE WHEN e.entry_type = 'reversal' THEN 'adjustment' ELSE e.fee_type END,
                CASE
                  WHEN e.entry_type = 'reversal' THEN 'İptal düzeltmesi'
                  WHEN e.fee_type = 'app_reservation' THEN
                    'Uygulama rezervasyonu: ' || co.name || ' ' ||
                    to_char(r.starts_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
                  ELSE 'Ders oturumu'
                END,
                e.service_date, e.amount_kurus
         FROM app.fee_ledger_entries e
         LEFT JOIN app.reservations r ON r.id = e.reservation_id
         LEFT JOIN app.courts co ON co.id = r.court_id
         WHERE e.id = ANY(string_to_array($2, ',')::uuid[])`,
        [statementId, ids]
      );
      await q.query(
        `UPDATE app.fee_ledger_entries SET status = 'billed', statement_id = $1
         WHERE id = ANY(string_to_array($2, ',')::uuid[])`,
        [statementId, ids]
      );

      const owners = await q.query<{ user_id: string }>(
        `SELECT user_id FROM app.club_memberships WHERE club_id = $1 AND role = 'owner' AND status = 'active'`,
        [club.club_id]
      );
      for (const owner of owners.rows) {
        await addNotification(q, {
          userId: owner.user_id,
          type: 'statement_issued',
          title: 'Aylık Hesap Özeti Hazır',
          body: `${periodText} dönemi RALO hesap özetiniz oluşturuldu. Toplam: ${kurusToTl(subtotal + vat).toLocaleString('tr-TR')} TL.`
        });
      }
      await audit(q, adminId, 'statement.issue', 'monthly_statement', statementId, club.club_id, { statementNo, total: subtotal + vat });
      created.push(statementId);
    }

    const result = created.length === 0
      ? []
      : (await q.query(`SELECT ${STATEMENT_SELECT} WHERE s.id = ANY(string_to_array($1, ',')::uuid[]) ORDER BY c.name`,
          [created.join(',')])).rows.map(toStatement);
    return { created: result.length, statements: result };
  });
}

export async function listStatements(filter: { period?: unknown; clubId?: string } = {}) {
  const period = typeof filter.period === 'string' && PERIOD_PATTERN.test(filter.period) ? `${filter.period}-01` : null;
  const { rows } = await getDb().query(
    `SELECT ${STATEMENT_SELECT}
     WHERE ($1::date IS NULL OR s.period_start = $1::date) AND ($2::uuid IS NULL OR s.club_id = $2::uuid)
     ORDER BY s.period_start DESC, c.name LIMIT 500`,
    [period, filter.clubId ?? null]
  );
  return rows.map(toStatement);
}

export async function getStatement(id: string, clubId?: string) {
  if (!isUuid(id)) return null;
  const db = getDb();
  const statement = await db.query(
    `SELECT ${STATEMENT_SELECT} WHERE s.id = $1 AND ($2::uuid IS NULL OR s.club_id = $2::uuid)`,
    [id, clubId ?? null]
  );
  if (!statement.rows[0]) return null;
  const lines = await db.query(
    `SELECT line_type, description, to_char(service_date, 'YYYY-MM-DD') AS service_date, amount_kurus
     FROM app.statement_lines WHERE statement_id = $1 ORDER BY service_date, id`,
    [id]
  );
  return {
    ...toStatement(statement.rows[0]),
    lines: lines.rows.map(l => ({
      type: l.line_type,
      description: l.description,
      serviceDate: l.service_date,
      amount: kurusToTl(l.amount_kurus)
    }))
  };
}

export async function markStatementPaid(adminId: string, id: string, input: { paidAmount?: unknown; paymentReference?: unknown }) {
  if (!isUuid(id)) throw new HttpError(404, 'Hesap özeti bulunamadı.');
  const amount = input.paidAmount === undefined || input.paidAmount === '' || input.paidAmount === null
    ? null
    : parseAmount(input.paidAmount);
  const reference = typeof input.paymentReference === 'string' ? input.paymentReference.trim().slice(0, 120) || null : null;
  await getDb().tx(async q => {
    const { rows } = await q.query<{ club_id: string }>(
      `UPDATE app.monthly_statements
       SET status = 'paid', paid_at = now(), marked_paid_by = $2,
           paid_amount_kurus = COALESCE($3::int, total_kurus), payment_reference = $4
       WHERE id = $1 AND status IN ('issued','overdue')
       RETURNING club_id`,
      [id, adminId, amount, reference]
    );
    if (!rows[0]) throw new HttpError(409, 'Yalnızca ödenmemiş hesap özetleri ödendi olarak işaretlenebilir.');
    await audit(q, adminId, 'statement.paid', 'monthly_statement', id, rows[0].club_id, { amount, reference });
    await releaseBookingSuspension(q, rows[0].club_id, adminId);
  });
}

export async function cancelStatement(adminId: string, id: string, reason: unknown) {
  if (!isUuid(id)) throw new HttpError(404, 'Hesap özeti bulunamadı.');
  if (typeof reason !== 'string' || reason.trim().length < 3) throw new HttpError(400, 'İptal nedeni yazılmalıdır.');
  await getDb().tx(async q => {
    const { rows } = await q.query<{ club_id: string }>(
      `UPDATE app.monthly_statements SET status = 'cancelled', cancelled_reason = $2
       WHERE id = $1 AND status IN ('issued','overdue') RETURNING club_id`,
      [id, reason.trim().slice(0, 300)]
    );
    if (!rows[0]) throw new HttpError(409, 'Yalnızca ödenmemiş hesap özetleri iptal edilebilir.');
    // Entries go back to accrued so a corrected statement can be issued for the same month
    await q.query(
      `UPDATE app.fee_ledger_entries SET status = 'accrued', statement_id = NULL WHERE statement_id = $1`,
      [id]
    );
    await audit(q, adminId, 'statement.cancel', 'monthly_statement', id, rows[0].club_id, { reason });
    await releaseBookingSuspension(q, rows[0].club_id, adminId);
  });
}

// -------------------------------------------------------------
// Users
// -------------------------------------------------------------

export async function searchUsers(search: unknown) {
  const term = typeof search === 'string' ? search.trim().toLocaleLowerCase('tr-TR').slice(0, 80) : '';
  const { rows } = await getDb().query(
    `SELECT u.id, u.email, u.display_name, u.status, u.email_verified_at, u.created_at, u.last_login_at,
            c.name AS club_name, m.role AS club_role,
            EXISTS (SELECT 1 FROM app.platform_admins pa WHERE pa.user_id = u.id) AS is_admin
     FROM app.users u
     LEFT JOIN app.club_memberships m ON m.user_id = u.id AND m.status = 'active'
     LEFT JOIN app.clubs c ON c.id = m.club_id
     WHERE u.status <> 'deleted'
       AND ($1 = '' OR lower(u.email) LIKE '%' || $1 || '%' OR lower(u.display_name) LIKE '%' || $1 || '%')
     ORDER BY u.created_at DESC LIMIT 50`,
    [term]
  );
  return rows.map(r => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    status: r.status,
    emailVerified: !!r.email_verified_at,
    createdAt: iso(r.created_at),
    lastLoginAt: r.last_login_at ? iso(r.last_login_at) : null,
    clubName: r.club_name ?? null,
    clubRole: r.club_role ?? null,
    isPlatformAdmin: r.is_admin
  }));
}
