import { getDb, type Queryable } from '../db/instance.js';
import { sqlState } from '../db/client.js';
import {
  BUSINESS_SELECT, COURT_SELECT, toBusiness, toCourt, courtTypeToDb, tlToKurus, toStaffMembership, STAFF_PERMISSIONS
} from './mappers.js';
import { isUuid, HttpError } from './util.js';
import type { Business, Court, StaffMembership } from '../../src/types/index.js';

export interface Membership {
  clubId: string;
  role: 'owner' | 'staff';
  permissions: string[];
}

export type CourtWithBusiness = Court & { business: Business };
export type ClubBusiness = Business & { isActive: boolean; appBookingEnabled: boolean };

/** The caller's active club membership (owners first). Club access is always derived from this. */
export async function getMembership(userId: string): Promise<Membership | null> {
  const { rows } = await getDb().query(
    `SELECT club_id, role, permissions FROM app.club_memberships
     WHERE user_id = $1 AND status = 'active'
     ORDER BY (role = 'owner') DESC, created_at LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  return row ? { clubId: row.club_id, role: row.role, permissions: row.permissions ?? [] } : null;
}

export async function getBusiness(clubId: string, q: Queryable = getDb()): Promise<ClubBusiness | null> {
  if (!isUuid(clubId)) return null;
  const { rows } = await q.query(`SELECT ${BUSINESS_SELECT} WHERE c.id = $1`, [clubId]);
  return rows[0] ? { ...toBusiness(rows[0]), isActive: rows[0].is_active, appBookingEnabled: rows[0].app_booking_enabled } : null;
}

export async function getCourt(courtId: string, q: Queryable = getDb()): Promise<Court | null> {
  if (!isUuid(courtId)) return null;
  const { rows } = await q.query(`SELECT ${COURT_SELECT} FROM app.courts co WHERE co.id = $1`, [courtId]);
  return rows[0] ? toCourt(rows[0]) : null;
}

export async function listClubCourts(clubId: string, q: Queryable = getDb()): Promise<Court[]> {
  const { rows } = await q.query(
    `SELECT ${COURT_SELECT} FROM app.courts co WHERE co.club_id = $1 ORDER BY co.sort_order, co.name`,
    [clubId]
  );
  return rows.map(toCourt);
}

/** Businesses by id, for enriching reservation and court lists. */
export async function getBusinessesByIds(ids: string[]): Promise<Map<string, Business>> {
  const unique = [...new Set(ids.filter(isUuid))];
  if (unique.length === 0) return new Map();
  const { rows } = await getDb().query(
    `SELECT ${BUSINESS_SELECT} WHERE c.id = ANY(string_to_array($1, ',')::uuid[])`,
    [unique.join(',')]
  );
  return new Map(rows.map(row => [row.id, toBusiness(row)]));
}

export async function getCourtsByIds(ids: string[]): Promise<Map<string, Court>> {
  const unique = [...new Set(ids.filter(isUuid))];
  if (unique.length === 0) return new Map();
  const { rows } = await getDb().query(
    `SELECT ${COURT_SELECT} FROM app.courts co WHERE co.id = ANY(string_to_array($1, ',')::uuid[])`,
    [unique.join(',')]
  );
  return new Map(rows.map(row => [row.id, toCourt(row)]));
}

/** Active courts of active clubs with their business, for player search. */
export async function listBookableCourts(): Promise<CourtWithBusiness[]> {
  const db = getDb();
  const businessRows = await db.query(`SELECT ${BUSINESS_SELECT} WHERE c.is_active ORDER BY c.name`);
  const courtRows = await db.query(
    `SELECT ${COURT_SELECT} FROM app.courts co JOIN app.clubs cl ON cl.id = co.club_id
     WHERE co.is_active AND cl.is_active ORDER BY cl.name, co.sort_order, co.name`
  );
  const businesses = new Map(businessRows.rows.map(row => [row.id, toBusiness(row)]));
  return courtRows.rows
    .filter(row => businesses.has(row.club_id))
    .map(row => ({ ...toCourt(row), business: businesses.get(row.club_id)! }));
}

export interface CourtInput {
  name?: unknown;
  type?: unknown;
  surface?: unknown;
  pricePerHour?: unknown;
  isActive?: unknown;
  photos?: unknown;
}

function validateCourtInput(input: CourtInput, partial: boolean) {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) {
      throw new HttpError(400, 'Kort adı 1 ile 60 karakter arasında olmalıdır.');
    }
  }
  if (!partial || input.pricePerHour !== undefined) {
    if (!(Number(input.pricePerHour) > 0) || Number(input.pricePerHour) > 100000) {
      throw new HttpError(400, 'Saatlik ücret pozitif bir sayı olmalıdır.');
    }
  }
  if (input.type !== undefined && !courtTypeToDb(input.type)) {
    throw new HttpError(400, 'Geçersiz kort tipi.');
  }
  if (input.surface !== undefined && (typeof input.surface !== 'string' || input.surface.length > 60)) {
    throw new HttpError(400, 'Geçersiz zemin bilgisi.');
  }
  if (input.photos !== undefined
    && (!Array.isArray(input.photos) || input.photos.length > 10
      || input.photos.some(p => typeof p !== 'string' || !/^https:\/\//.test(p) || p.length > 2000))) {
    throw new HttpError(400, 'Geçersiz kort fotoğrafı.');
  }
}

async function replacePhotos(q: Queryable, courtId: string, photos: string[]) {
  await q.query(`DELETE FROM app.court_photos WHERE court_id = $1`, [courtId]);
  for (const [index, url] of photos.entries()) {
    await q.query(
      `INSERT INTO app.court_photos (court_id, url, is_primary, position) VALUES ($1, $2, $3, $4)`,
      [courtId, url, index === 0, index]
    );
  }
}

const DEFAULT_COURT_PHOTO = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80';

export async function createCourt(clubId: string, input: CourtInput, scope = `club:${clubId}`): Promise<Court> {
  validateCourtInput(input, false);
  try {
    return await getDb().tx(async q => {
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO app.courts (club_id, name, court_type, surface, hourly_price_kurus, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(max(sort_order), 0) + 1 FROM app.courts WHERE club_id = $1))
         RETURNING id`,
        [
          clubId,
          String(input.name).trim(),
          courtTypeToDb(input.type) ?? 'outdoor_panoramic',
          typeof input.surface === 'string' && input.surface.trim() ? input.surface.trim() : 'Suni çim',
          tlToKurus(Number(input.pricePerHour)),
          input.isActive === undefined ? true : Boolean(input.isActive)
        ]
      );
      const photos = Array.isArray(input.photos) && input.photos.length > 0 ? input.photos as string[] : [DEFAULT_COURT_PHOTO];
      await replacePhotos(q, rows[0].id, photos);
      return (await getCourt(rows[0].id, q))!;
    }, scope);
  } catch (err) {
    if (sqlState(err) === '23505') throw new HttpError(409, 'Bu kulüpte aynı isimde bir kort zaten var.');
    throw err;
  }
}

export async function updateCourt(clubId: string, courtId: string, input: CourtInput, scope = `club:${clubId}`): Promise<Court> {
  if (!isUuid(courtId)) throw new HttpError(404, 'Kort bulunamadı.');
  validateCourtInput(input, true);
  try {
    return await getDb().tx(async q => {
      const { rows } = await q.query(
        `UPDATE app.courts SET
           name = COALESCE($3, name),
           court_type = COALESCE($4, court_type),
           surface = COALESCE($5, surface),
           hourly_price_kurus = COALESCE($6, hourly_price_kurus),
           is_active = COALESCE($7, is_active)
         WHERE id = $1 AND club_id = $2 RETURNING id`,
        [
          courtId,
          clubId,
          typeof input.name === 'string' ? input.name.trim() : null,
          input.type !== undefined ? courtTypeToDb(input.type) : null,
          typeof input.surface === 'string' ? input.surface.trim() : null,
          input.pricePerHour !== undefined ? tlToKurus(Number(input.pricePerHour)) : null,
          input.isActive !== undefined ? Boolean(input.isActive) : null
        ]
      );
      if (rows.length === 0) throw new HttpError(404, 'Kort bulunamadı.');
      if (Array.isArray(input.photos)) await replacePhotos(q, courtId, input.photos as string[]);
      return (await getCourt(courtId, q))!;
    }, scope);
  } catch (err) {
    if (sqlState(err) === '23505') throw new HttpError(409, 'Bu kulüpte aynı isimde bir kort zaten var.');
    throw err;
  }
}

// -------------------------------------------------------------
// Staff
// -------------------------------------------------------------

export async function listStaff(clubId: string): Promise<StaffMembership[]> {
  const { rows } = await getDb().tx(q => q.query(
    `SELECT m.id, m.club_id, m.user_id, m.role, m.permissions, m.created_at, u.display_name, u.email
     FROM app.club_memberships m JOIN app.users u ON u.id = m.user_id
     WHERE m.club_id = $1 AND m.status = 'active'
     ORDER BY (m.role = 'owner') DESC, m.created_at`,
    [clubId]
  ), `club:${clubId}`);
  return rows.map(toStaffMembership);
}

/** Adds (or re-activates) a club membership. A user belongs to at most one club at a time. */
export async function addMembership(
  q: Queryable,
  input: { clubId: string; userId: string; role: 'owner' | 'staff'; permissions: string[]; invitedBy: string }
): Promise<StaffMembership> {
  const existing = await q.query(
    `SELECT club_id FROM app.club_memberships WHERE user_id = $1 AND status = 'active'`,
    [input.userId]
  );
  if (existing.rows.length > 0) {
    throw new HttpError(409, 'Bu e-posta adresi zaten bir işletmede kayıtlı.');
  }
  const permissions = input.role === 'owner' ? [] : input.permissions.filter(p => STAFF_PERMISSIONS.includes(p));
  const { rows } = await q.query(
    `INSERT INTO app.club_memberships (club_id, user_id, role, permissions, invited_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (club_id, user_id) DO UPDATE
       SET status = 'active', revoked_at = NULL, role = EXCLUDED.role, permissions = EXCLUDED.permissions,
           invited_by = EXCLUDED.invited_by
     RETURNING id, club_id, user_id, role, permissions, created_at`,
    [input.clubId, input.userId, input.role, permissions, input.invitedBy]
  );
  const user = await q.query(`SELECT display_name, email FROM app.users WHERE id = $1`, [input.userId]);
  return toStaffMembership({ ...rows[0], ...user.rows[0] });
}

// -------------------------------------------------------------
// Favourite courts
// -------------------------------------------------------------

export async function getFavoriteCourts(userId: string): Promise<CourtWithBusiness[]> {
  const { rows } = await getDb().query<{ court_id: string }>(
    `SELECT court_id FROM app.favorite_courts WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  const courts = await getCourtsByIds(rows.map(r => r.court_id));
  const businesses = await getBusinessesByIds([...courts.values()].map(c => c.businessId));
  return rows
    .map(r => courts.get(r.court_id))
    .filter((court): court is Court => !!court && businesses.has(court.businessId))
    .map(court => ({ ...court, business: businesses.get(court.businessId)! }));
}

export async function toggleFavoriteCourt(userId: string, courtId: string): Promise<{ isFavorite: boolean; favoriteCourtIds: string[] }> {
  if (!(await getCourt(courtId))) throw new HttpError(404, 'Kort bulunamadı.');
  return getDb().tx(async q => {
    const removed = await q.query(
      `DELETE FROM app.favorite_courts WHERE user_id = $1 AND court_id = $2 RETURNING court_id`,
      [userId, courtId]
    );
    const isFavorite = removed.rows.length === 0;
    if (isFavorite) {
      await q.query(`INSERT INTO app.favorite_courts (user_id, court_id) VALUES ($1, $2)`, [userId, courtId]);
    }
    const { rows } = await q.query<{ court_id: string }>(
      `SELECT court_id FROM app.favorite_courts WHERE user_id = $1 ORDER BY created_at`,
      [userId]
    );
    return { isFavorite, favoriteCourtIds: rows.map(r => r.court_id) };
  });
}
