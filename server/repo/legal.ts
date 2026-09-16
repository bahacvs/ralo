import { createHash, createHmac } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getDb, type Queryable } from '../db/instance.js';
import { HttpError } from './util.js';

export type ConsentPurpose = 'terms_of_use' | 'privacy_notice' | 'share_card' | 'club_service_agreement';
type ConsentChannel = 'signup' | 'in_app_prompt' | 'profile_settings' | 'club_panel' | 'admin_panel';

interface LegalDocumentDef {
  type: 'terms_of_use' | 'kvkk_disclosure' | 'explicit_consent' | 'club_service_agreement';
  slug: string;
  file: string;
  title: string;
  requiresAcceptance: boolean;
}

/** Documents published in the app from docs/legal (ACIK-KONULAR.md is internal and never served). */
export const LEGAL_DOCUMENTS: LegalDocumentDef[] = [
  { type: 'terms_of_use', slug: 'kullanim-kosullari', file: 'kullanim-kosullari.md', title: 'Kullanım Koşulları', requiresAcceptance: true },
  { type: 'kvkk_disclosure', slug: 'kvkk-aydinlatma-metni', file: 'kvkk-aydinlatma-metni.md', title: 'KVKK Aydınlatma Metni', requiresAcceptance: false },
  { type: 'explicit_consent', slug: 'acik-riza-metni', file: 'acik-riza-metni.md', title: 'Açık Rıza Metni', requiresAcceptance: false },
  { type: 'club_service_agreement', slug: 'kulup-hizmet-sozlesmesi', file: 'kulup-hizmet-sozlesmesi.md', title: 'Kulüp Hizmet Sözleşmesi', requiresAcceptance: true }
];

const PURPOSE_DOCUMENT: Record<ConsentPurpose, LegalDocumentDef['type']> = {
  terms_of_use: 'terms_of_use',
  privacy_notice: 'kvkk_disclosure',
  share_card: 'explicit_consent',
  club_service_agreement: 'club_service_agreement'
};

const LEGAL_DIR = path.join(process.cwd(), 'docs', 'legal');
const DEV_HMAC_KEY = 'ralo-development-consent-key';

interface LoadedDocument extends LegalDocumentDef {
  id: string;
  version: string;
  publishedAt: string;
  content: string;
}

let loaded = new Map<string, LoadedDocument>();

/** Consent proof survives anonymization as an HMAC of the email; the key must stay stable per environment. */
export function assertLegalConfigured() {
  if (process.env.NODE_ENV === 'production' && !process.env.CONSENT_HMAC_KEY) {
    throw new Error('CONSENT_HMAC_KEY is required in production (a long random secret; never change it once set).');
  }
}

const subjectHmacHex = (email: string) =>
  createHmac('sha256', process.env.CONSENT_HMAC_KEY || DEV_HMAC_KEY).update(email.trim().toLowerCase()).digest('hex');

/**
 * Registers the current text of every legal document (version = content hash). A changed file becomes a new
 * version; earlier versions stay in legal_documents so old consent records keep pointing at what was accepted.
 */
export async function syncLegalDocuments(): Promise<number> {
  const next = new Map<string, LoadedDocument>();
  for (const doc of LEGAL_DOCUMENTS) {
    let content: string;
    try {
      content = (await fs.readFile(path.join(LEGAL_DIR, doc.file), 'utf8')).replace(/\r\n/g, '\n');
    } catch {
      console.warn(`Legal document missing: docs/legal/${doc.file}`);
      continue;
    }
    const hash = createHash('sha256').update(content).digest('hex');
    const version = hash.slice(0, 12);
    await getDb().query(
      `INSERT INTO app.legal_documents (doc_type, version, title_tr, content_url, content_sha256, requires_acceptance, published_at)
       VALUES ($1, $2, $3, $4, decode($5, 'hex'), $6, now())
       ON CONFLICT (doc_type, version) DO NOTHING`,
      [doc.type, version, doc.title, `/yasal/${doc.slug}`, hash, doc.requiresAcceptance]
    );
    const { rows } = await getDb().query<{ id: string; published_at: string }>(
      `SELECT id, published_at FROM app.legal_documents WHERE doc_type = $1 AND version = $2`,
      [doc.type, version]
    );
    next.set(doc.slug, { ...doc, id: rows[0].id, version, publishedAt: new Date(rows[0].published_at).toISOString(), content });
  }
  loaded = next;
  return next.size;
}

export function listLegalDocuments() {
  return [...loaded.values()].map(({ slug, title, version, publishedAt, requiresAcceptance }) => ({
    slug, title, version, publishedAt, requiresAcceptance
  }));
}

export function getLegalDocument(slug: string) {
  const doc = loaded.get(slug);
  if (!doc) return null;
  const { slug: s, title, version, publishedAt, content } = doc;
  return { slug: s, title, version, publishedAt, content };
}

const documentFor = (purpose: ConsentPurpose) => [...loaded.values()].find(d => d.type === PURPOSE_DOCUMENT[purpose]);

export interface ConsentMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Appends accepted/withdrawn records (never updates), one per purpose, against the current document version. */
export async function recordConsents(
  q: Queryable, user: { id: string; email?: string | null }, purposes: ConsentPurpose[], action: 'accepted' | 'withdrawn',
  channel: ConsentChannel, meta: ConsentMeta = {}, clubId: string | null = null
): Promise<void> {
  if (!user.email) throw new HttpError(400, 'Onay kaydı için hesabın e-posta adresi gereklidir.');
  for (const purpose of purposes) {
    const doc = documentFor(purpose);
    if (!doc) {
      console.warn(`Consent not recorded, document not loaded: ${purpose}`);
      continue;
    }
    await q.query(
      `INSERT INTO app.consent_records (user_id, subject_hmac, document_id, action, channel, club_id, ip, user_agent, purpose)
       VALUES ($1, decode($2, 'hex'), $3, $4, $5, $6, $7::inet, $8, $9)`,
      [user.id, subjectHmacHex(user.email), doc.id, action, channel, clubId, meta.ip || null,
       meta.userAgent ? meta.userAgent.slice(0, 400) : null, purpose]
    );
  }
}

/** Latest decision per purpose, with whether it was given for the document version now published. */
export async function getConsentState(userId: string): Promise<Record<ConsentPurpose, { granted: boolean; currentVersion: boolean; at: string | null }>> {
  const { rows } = await getDb().query<{ purpose: ConsentPurpose; action: string; document_id: string; accepted_at: string }>(
    `SELECT DISTINCT ON (purpose) purpose, action, document_id, accepted_at
     FROM app.consent_records WHERE user_id = $1 AND purpose IS NOT NULL
     ORDER BY purpose, accepted_at DESC, id DESC`,
    [userId]
  );
  const state = {} as Record<ConsentPurpose, { granted: boolean; currentVersion: boolean; at: string | null }>;
  for (const purpose of Object.keys(PURPOSE_DOCUMENT) as ConsentPurpose[]) {
    const row = rows.find(r => r.purpose === purpose);
    state[purpose] = {
      granted: row?.action === 'accepted',
      currentVersion: !!row && row.document_id === documentFor(purpose)?.id,
      at: row ? new Date(row.accepted_at).toISOString() : null
    };
  }
  return state;
}

/** Users (of the given ids) whose latest share-card decision is a grant. */
export async function shareCardConsentingUsers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { rows } = await getDb().query<{ user_id: string }>(
    `SELECT user_id FROM (
       SELECT DISTINCT ON (user_id) user_id, action FROM app.consent_records
       WHERE purpose = 'share_card' AND user_id = ANY(string_to_array($1, ',')::uuid[])
       ORDER BY user_id, accepted_at DESC, id DESC) latest
     WHERE action = 'accepted'`,
    [userIds.join(',')]
  );
  return new Set(rows.map(r => r.user_id));
}
