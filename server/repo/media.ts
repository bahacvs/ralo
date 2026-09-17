import { getDb, type Queryable } from '../db/instance.js';
import { isUuid, HttpError } from './util.js';

const MAX_BYTES = 700_000;
const MAX_COURT_PHOTOS = 6;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export const MEDIA_URL_PATTERN = /^\/api\/media\/[0-9a-f-]{36}$/;

export interface CourtPhoto {
  id: string;
  url: string;
  isPrimary: boolean;
}

/** Validates a base64 data URL (declared type, magic bytes, size). */
export function decodeImage(value: unknown): { contentType: string; hex: string } {
  const match = typeof value === 'string' ? DATA_URL.exec(value) : null;
  if (!match) throw new HttpError(400, 'Yalnızca JPEG, PNG veya WebP görsel yüklenebilir.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 100) throw new HttpError(400, 'Görsel dosyası okunamadı.');
  if (bytes.length > MAX_BYTES) throw new HttpError(400, 'Görsel çok büyük (en fazla 700 KB). Daha küçük bir fotoğraf seçin.');
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const matches = ({ 'image/jpeg': isJpeg, 'image/png': isPng, 'image/webp': isWebp } as Record<string, boolean>)[match[1]];
  if (!matches) throw new HttpError(400, 'Görsel dosyası geçersiz veya türü uyuşmuyor.');
  return { contentType: match[1], hex: bytes.toString('hex') };
}

async function insertAsset(q: Queryable, clubId: string, purpose: 'club_cover' | 'court_photo', image: unknown, actorId: string) {
  const { contentType, hex } = decodeImage(image);
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO app.media_assets (club_id, purpose, content_type, data, created_by)
     VALUES ($1, $2, $3, decode($4, 'hex'), $5) RETURNING id`,
    [clubId, purpose, contentType, hex, actorId]
  );
  return rows[0].id;
}

export async function getMedia(id: string): Promise<{ contentType: string; data: Buffer } | null> {
  if (!isUuid(id)) return null;
  const { rows } = await getDb().query<{ content_type: string; data: Uint8Array }>(
    `SELECT content_type, data FROM app.media_assets WHERE id = $1`, [id]
  );
  return rows[0] ? { contentType: rows[0].content_type, data: Buffer.from(rows[0].data) } : null;
}

async function deleteUploadedAsset(q: Queryable, url: string | null) {
  if (url && MEDIA_URL_PATTERN.test(url)) {
    await q.query(`DELETE FROM app.media_assets WHERE id = $1`, [url.split('/').pop()]);
  }
}

/** Replaces the club cover with an uploaded image (the previous uploaded cover is deleted). */
export async function setClubCover(clubId: string, actorId: string, image: unknown): Promise<string> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  return getDb().tx(async q => {
    const { rows } = await q.query<{ cover_image_url: string | null }>(
      `SELECT cover_image_url FROM app.clubs WHERE id = $1 FOR UPDATE`, [clubId]
    );
    if (!rows[0]) throw new HttpError(404, 'Kulüp bulunamadı.');
    const assetId = await insertAsset(q, clubId, 'club_cover', image, actorId);
    const url = `/api/media/${assetId}`;
    await q.query(`UPDATE app.clubs SET cover_image_url = $2 WHERE id = $1`, [clubId, url]);
    await deleteUploadedAsset(q, rows[0].cover_image_url);
    return url;
  });
}

export async function removeClubCover(clubId: string): Promise<void> {
  if (!isUuid(clubId)) throw new HttpError(404, 'Kulüp bulunamadı.');
  await getDb().tx(async q => {
    const { rows } = await q.query<{ cover_image_url: string | null }>(
      `SELECT cover_image_url FROM app.clubs WHERE id = $1 FOR UPDATE`, [clubId]
    );
    if (!rows[0]) throw new HttpError(404, 'Kulüp bulunamadı.');
    await q.query(`UPDATE app.clubs SET cover_image_url = NULL WHERE id = $1`, [clubId]);
    await deleteUploadedAsset(q, rows[0].cover_image_url);
  });
}

async function assertCourt(q: Queryable, clubId: string, courtId: string) {
  if (!isUuid(clubId) || !isUuid(courtId)) throw new HttpError(404, 'Kort bulunamadı.');
  const { rows } = await q.query(`SELECT 1 FROM app.courts WHERE id = $1 AND club_id = $2`, [courtId, clubId]);
  if (!rows[0]) throw new HttpError(404, 'Kort bulunamadı.');
}

export async function listCourtPhotos(clubId: string, courtId: string, q: Queryable = getDb()): Promise<CourtPhoto[]> {
  await assertCourt(q, clubId, courtId);
  const { rows } = await q.query<{ id: string; url: string; is_primary: boolean }>(
    `SELECT id, url, is_primary FROM app.court_photos WHERE court_id = $1 ORDER BY is_primary DESC, position, created_at`,
    [courtId]
  );
  return rows.map(r => ({ id: r.id, url: r.url, isPrimary: r.is_primary }));
}

export async function addCourtPhoto(clubId: string, courtId: string, actorId: string, image: unknown): Promise<CourtPhoto[]> {
  return getDb().tx(async q => {
    await assertCourt(q, clubId, courtId);
    await q.query(`SELECT 1 FROM app.courts WHERE id = $1 FOR UPDATE`, [courtId]);
    const { rows } = await q.query<{ n: number; next: number }>(
      `SELECT count(*)::int AS n, (COALESCE(max(position), -1) + 1)::int AS next FROM app.court_photos WHERE court_id = $1`, [courtId]
    );
    if (rows[0].n >= MAX_COURT_PHOTOS) throw new HttpError(400, `Bir korta en fazla ${MAX_COURT_PHOTOS} fotoğraf eklenebilir.`);
    const assetId = await insertAsset(q, clubId, 'court_photo', image, actorId);
    await q.query(
      `INSERT INTO app.court_photos (court_id, url, is_primary, position, asset_id) VALUES ($1, $2, $3, $4, $5)`,
      [courtId, `/api/media/${assetId}`, rows[0].n === 0, rows[0].next, assetId]
    );
    return listCourtPhotos(clubId, courtId, q);
  });
}

/** Deletes a photo; if it was the primary one, the next photo becomes primary. */
export async function deleteCourtPhoto(clubId: string, courtId: string, photoId: string): Promise<CourtPhoto[]> {
  if (!isUuid(photoId)) throw new HttpError(404, 'Fotoğraf bulunamadı.');
  return getDb().tx(async q => {
    await assertCourt(q, clubId, courtId);
    const { rows } = await q.query<{ is_primary: boolean; asset_id: string | null }>(
      `DELETE FROM app.court_photos WHERE id = $1 AND court_id = $2 RETURNING is_primary, asset_id`, [photoId, courtId]
    );
    if (!rows[0]) throw new HttpError(404, 'Fotoğraf bulunamadı.');
    if (rows[0].asset_id) await q.query(`DELETE FROM app.media_assets WHERE id = $1`, [rows[0].asset_id]);
    if (rows[0].is_primary) {
      await q.query(
        `UPDATE app.court_photos SET is_primary = true
         WHERE id = (SELECT id FROM app.court_photos WHERE court_id = $1 ORDER BY position, created_at LIMIT 1)`,
        [courtId]
      );
    }
    return listCourtPhotos(clubId, courtId, q);
  });
}
