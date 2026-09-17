/**
 * RALO integration tests: the real Express app against an in-memory PGlite with every migration and the
 * demo seed applied. Run: npx tsx server/tests.ts (CI runs it with TZ=UTC; the app pins Europe/Istanbul).
 */
process.env.MAIL_PROVIDER = 'console';
process.env.DEMO_MODE = 'false';

import type { AddressInfo } from 'net';
import { addMinutesToLocal, parseClientDateTime, todayLocal } from './time.js';
import { createPgliteDatabase } from './db/client.js';
import { setDatabase } from './db/instance.js';
import { seedDemoData, DEMO_ADMIN_EMAIL } from './db/seed.js';
import { createApp, DEMO_ACCOUNT_EMAILS } from './app.js';
import { normalizeEmail, validatePassword, hashPassword, verifyPassword, createAuthToken, consumeAuthToken } from './auth.js';
import { computeEloChanges, parseSets } from './repo/matchResults.js';
import { runJobs, previousPeriod } from './jobs.js';
import { syncLegalDocuments } from './repo/legal.js';
import { suspendClubsForOverdueStatements } from './repo/admin.js';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'padel2026demo';

let passed = 0;
let failed = 0;

// Console mail output (verification links) is noise here
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[mail]')) return;
  originalLog(...args);
};

function assert(condition: unknown, testName: string, detail?: unknown) {
  if (condition) {
    originalLog(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail !== undefined ? ` - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
    failed++;
  }
}

async function runTests() {
  originalLog('\n🎾 ================= RALO Automated Tests ================= 🎾\n');

  const db = await createPgliteDatabase();
  setDatabase(db);
  await db.migrate();
  await syncLegalDocuments();
  await seedDemoData(db);

  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  };
  const login = async (email: string) => (await call('POST', '/api/auth/login', { email, password: DEMO_PASSWORD })).json?.token as string;
  const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
  const dayOffset = (days: number) => addMinutesToLocal(`${todayLocal()}T00:00:00`, days * 24 * 60).slice(0, 10);

  try {
    // TEST 1: Local time helpers (Europe/Istanbul, midnight rollover)
    assert(addMinutesToLocal('2026-03-01T23:00:00', 120) === '2026-03-02T01:00:00', 'Test 1.1: Gece yarısını geçen maçın bitişi ertesi güne taşındı');
    assert(new Date('2026-03-01T18:00:00').toISOString() === '2026-03-01T15:00:00.000Z', 'Test 1.2: Yerel saatler Europe/Istanbul (UTC+3) olarak yorumlanıyor');
    assert(parseClientDateTime('2026-03-01T15:00:00.000Z') === '2026-03-01T18:00:00', 'Test 1.3: UTC gelen istemci saati yerel saate çevrildi');
    assert(parseClientDateTime('dün akşam') === null, 'Test 1.4: Geçersiz tarih metni reddedildi');

    // TEST 2: Password and email link primitives
    assert(normalizeEmail('  Baha@Example.COM ') === 'baha@example.com', 'Test 2.1: E-posta adresi küçük harfe çevrildi');
    assert(validatePassword('kisa1') !== null && validatePassword('sadeceharf') !== null && validatePassword('padel2026') === null, 'Test 2.2: Şifre kuralları uygulandı');
    const hash = await hashPassword('padel2026');
    assert(hash.startsWith('scrypt$') && await verifyPassword('padel2026', hash) && !(await verifyPassword('padel2027', hash)), 'Test 2.3: Şifre scrypt ile özetlendi ve doğrulandı');
    const player = await one<{ id: string; email: string }>(`SELECT id, email FROM app.users WHERE email = $1`, [DEMO_ACCOUNT_EMAILS.OYUNCU]);
    const first = await createAuthToken(player.id, player.email, 'RESET_PASSWORD', 60_000);
    const second = await createAuthToken(player.id, player.email, 'RESET_PASSWORD', 60_000);
    assert(await consumeAuthToken(first, 'RESET_PASSWORD') === null, 'Test 2.4: Yeni bağlantı istenince eski bağlantı geçersiz oldu');
    assert(await consumeAuthToken(second, 'VERIFY_EMAIL') === null, 'Test 2.5: Bağlantı başka amaçla kullanılamadı');
    assert((await consumeAuthToken(second, 'RESET_PASSWORD'))?.userId === player.id, 'Test 2.6: Geçerli bağlantı hesabı döndürdü');
    assert(await consumeAuthToken(second, 'RESET_PASSWORD') === null, 'Test 2.7: Bağlantı ikinci kez kullanılamadı');
    const expired = await createAuthToken(player.id, player.email, 'VERIFY_EMAIL', 60_000);
    await db.query(`UPDATE app.auth_tokens SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE user_id = $1`, [player.id]);
    assert(await consumeAuthToken(expired, 'VERIFY_EMAIL') === null, 'Test 2.8: Süresi dolmuş bağlantı reddedildi');

    // TEST 3: Sign-in and court search
    const playerToken = await login(DEMO_ACCOUNT_EMAILS.OYUNCU);
    const zeynepToken = await login('zeynep@demo.ralo.app');
    assert(!!playerToken && !!zeynepToken, 'Test 3.1: Demo hesaplarla e-posta ve şifre ile giriş yapıldı');
    const me = await call('GET', '/api/auth/me', undefined, playerToken);
    assert(me.status === 200 && me.json.user.emailVerified === true && !me.text.includes('scrypt$'), 'Test 3.2: Oturum bilgisi şifre özeti içermeden döndü');
    const courts = await call('GET', `/api/courts?date=${dayOffset(10)}&city=İzmir`);
    assert(courts.status === 200 && courts.json.total >= 5 && courts.json.courts.every((c: any) => c.business.city === 'İzmir'), 'Test 3.3: İl filtresiyle kortlar listelendi', courts.json?.total);
    const urlaCourt = courts.json.courts.find((c: any) => c.business.name === 'Padel Arena Urla');
    const detail = await call('GET', `/api/courts/${urlaCourt.id}?date=${dayOffset(10)}&duration=90`);
    assert(detail.status === 200 && detail.json.slots.length > 0 && detail.json.slots.every((s: any) => s.isAvailable), 'Test 3.4: Boş bir günde kortun tüm saatleri müsait göründü');

    // TEST 4: Double-booking prevention and the platform fee
    const bookingDate = dayOffset(10);
    const booking = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${bookingDate}T10:00:00`, durationMinutes: 90 }, playerToken);
    assert(booking.status === 201, 'Test 4.1: Uygulama rezervasyonu oluşturuldu', booking.json);
    const fee = await one(`SELECT amount_kurus, status FROM app.fee_ledger_entries WHERE reservation_id = $1`, [booking.json?.reservation?.id]);
    assert(fee?.amount_kurus === 10000 && fee.status === 'accrued', 'Test 4.2: Rezervasyon için 100 TL platform ücreti deftere yazıldı', fee);
    const overlap = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${bookingDate}T10:30:00`, durationMinutes: 90 }, zeynepToken);
    assert(overlap.status === 409, 'Test 4.3: Çakışan ikinci rezervasyon veritabanı tarafından reddedildi', overlap.json);
    const adjacent = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${bookingDate}T11:30:00`, durationMinutes: 60 }, zeynepToken);
    assert(adjacent.status === 201, 'Test 4.4: Hemen ardından başlayan rezervasyon kabul edildi', adjacent.json);

    // TEST 5: Player cancellation voids the fee and frees the slot; the window is enforced
    const cancel = await call('POST', `/api/reservations/${booking.json.reservation.id}/cancel`, {}, playerToken);
    const voided = await one(`SELECT status, void_reason FROM app.fee_ledger_entries WHERE reservation_id = $1`, [booking.json.reservation.id]);
    assert(cancel.status === 200 && voided.status === 'voided' && voided.void_reason === 'player_cancelled', 'Test 5.1: İptal edilen rezervasyonun ücreti iptal edildi', voided);
    const rebook = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${bookingDate}T10:00:00`, durationMinutes: 90 }, zeynepToken);
    assert(rebook.status === 201, 'Test 5.2: İptalden sonra aynı saat yeniden rezerve edildi', rebook.json);
    const notOwner = await call('POST', `/api/reservations/${rebook.json.reservation.id}/cancel`, {}, playerToken);
    assert(notOwner.status === 404, 'Test 5.3: Başkasının rezervasyonu iptal edilemedi');
    const windowBooking = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${dayOffset(20)}T14:00:00`, durationMinutes: 60 }, playerToken);
    await db.query(`UPDATE app.reservations SET cancellation_deadline = now() - interval '1 minute' WHERE id = $1`, [windowBooking.json?.reservation?.id]);
    const late = await call('POST', `/api/reservations/${windowBooking.json?.reservation?.id}/cancel`, {}, playerToken);
    assert(late.status === 409 && /24 saat/.test(late.json?.error ?? ''), 'Test 5.4: İptal süresi dolmuş rezervasyon iptal edilemedi', late.json);

    // TEST 6: Open match capacity, waitlist and promotion
    const match = await call('POST', '/api/reservations', {
      courtId: urlaCourt.id, startAt: `${dayOffset(11)}T18:00:00`, durationMinutes: 90, isOpenMatch: true, minElo: 1200, maxElo: 1800
    }, playerToken);
    assert(match.status === 201 && match.json.reservation.isOpenMatch, 'Test 6.1: Açık maç oluşturuldu', match.json);
    const matchId = match.json.reservation.id;
    const tokens = await Promise.all(['mert', 'caner', 'ece', 'kaan', 'melis'].map(n => login(`${n}@demo.ralo.app`)));
    const joins: number[] = [];
    for (const token of tokens.slice(0, 3)) joins.push((await call('POST', `/api/open-matches/${matchId}/join`, {}, token)).status);
    assert(joins.every(s => s === 200), 'Test 6.2: Üç oyuncu maça katıldı, kadro 4/4 doldu', joins);
    const fifth = await call('POST', `/api/open-matches/${matchId}/join`, {}, tokens[3]);
    assert(fifth.status === 400, 'Test 6.3: Beşinci oyuncunun katılımı engellendi', fifth.json);
    const notJoined = await call('POST', `/api/open-matches/${matchId}/leave`, {}, tokens[4]);
    assert(notJoined.status === 400, 'Test 6.4: Maçta olmayan oyuncu ayrılamadı');
    const waitlist = await call('POST', `/api/open-matches/${matchId}/waitlist`, {}, tokens[3]);
    assert(waitlist.status === 200 && waitlist.json.action === 'JOINED', 'Test 6.5: Beşinci oyuncu bekleme listesine alındı');
    const leave = await call('POST', `/api/open-matches/${matchId}/leave`, {}, tokens[0]);
    const detailAfter = await call('GET', `/api/open-matches/${matchId}`);
    const kaanId = (await one(`SELECT id FROM app.users WHERE email = 'kaan@demo.ralo.app'`)).id;
    assert(leave.status === 200 && detailAfter.json.participants.some((p: any) => p.userId === kaanId && p.status === 'ACTIVE') && detailAfter.json.waitlist.length === 0,
      'Test 6.6: Ayrılan oyuncunun yerine bekleme listesindeki oyuncu alındı', detailAfter.json);
    const organizerLeave = await call('POST', `/api/open-matches/${matchId}/leave`, {}, playerToken);
    assert(organizerLeave.status === 400, 'Test 6.7: Organizatör maçtan ayrılamadı (iptal etmesi gerekir)');
    const approvalMatch = await call('POST', '/api/reservations', {
      courtId: urlaCourt.id, startAt: `${dayOffset(11)}T21:00:00`, durationMinutes: 90, isOpenMatch: true, approvalRequired: true
    }, zeynepToken);
    const approvalId = approvalMatch.json?.reservation?.id;
    const request = await call('POST', `/api/open-matches/${approvalId}/join`, {}, tokens[4]);
    const melisId = (await one(`SELECT id FROM app.users WHERE email = 'melis@demo.ralo.app'`)).id;
    assert(approvalMatch.status === 201 && request.status === 200 && request.json.status === 'PENDING_APPROVAL', 'Test 6.8: Onaylı maça katılım isteği gönderildi', request.json);
    const strangerApprove = await call('POST', `/api/open-matches/${approvalId}/requests/${melisId}`, { decision: 'approve' }, playerToken);
    assert(strangerApprove.status === 403, 'Test 6.9: Organizatör olmayan oyuncu isteği onaylayamadı');
    const approve = await call('POST', `/api/open-matches/${approvalId}/requests/${melisId}`, { decision: 'approve' }, zeynepToken);
    const approved = await one(`SELECT p.status, p.slot_index, r.active_participant_count FROM app.reservation_participants p
                                JOIN app.reservations r ON r.id = p.reservation_id WHERE p.reservation_id = $1 AND p.user_id = $2`, [approvalId, melisId]);
    assert(approve.status === 200 && approved.status === 'active' && approved.slot_index === 1 && approved.active_participant_count === 2,
      'Test 6.10: Organizatör isteği onayladı, oyuncu boş koltuğa yerleşti', approved);
    await call('POST', `/api/open-matches/${approvalId}/join`, {}, tokens[3]);
    const reject = await call('POST', `/api/open-matches/${approvalId}/requests/${kaanId}`, { decision: 'reject' }, zeynepToken);
    const rejected = await one(`SELECT count(*)::int AS n FROM app.reservation_participants WHERE reservation_id = $1 AND user_id = $2`, [approvalId, kaanId]);
    assert(reject.status === 200 && rejected.n === 0, 'Test 6.11: Reddedilen katılım isteği silindi', reject.json);

    // TEST 7: Email verification is required for app bookings
    const register = await call('POST', '/api/auth/register', { displayName: 'Yeni Oyuncu', email: 'yeni@test.ralo', password: 'padel2026', acceptTerms: true, shareCardConsent: true });
    const unverified = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${dayOffset(12)}T09:00:00`, durationMinutes: 60 }, register.json?.token);
    assert(register.status === 201 && unverified.status === 403 && unverified.json.code === 'EMAIL_NOT_VERIFIED', 'Test 7.1: Doğrulanmamış hesap rezervasyon yapamadı', unverified.json);

    const signupConsents = await call('GET', '/api/user/consents', undefined, register.json?.token);
    const consentRows = await one<{ n: number; hmac_len: number }>(
      `SELECT count(*)::int AS n, max(octet_length(subject_hmac))::int AS hmac_len FROM app.consent_records WHERE user_id = $1`, [register.json?.user?.id]);
    assert(signupConsents.status === 200 && signupConsents.json.consents.terms_of_use.granted && signupConsents.json.consents.terms_of_use.currentVersion
      && signupConsents.json.consents.share_card.granted && consentRows.n === 3 && consentRows.hmac_len === 32,
      'Test 7.2: Kayıtta koşullar, aydınlatma ve isteğe bağlı paylaşım rızası sürümüyle kaydedildi', { consents: signupConsents.json, consentRows });
    const legalDoc = await call('GET', '/api/legal/kullanim-kosullari');
    const internalDoc = await call('GET', '/api/legal/ACIK-KONULAR');
    assert(legalDoc.status === 200 && legalDoc.json.document.content.includes('Kullanım Koşulları') && internalDoc.status === 404,
      'Test 7.3: Yasal metin yayımlandı, iç not dosyası yayımlanmadı');
    const withdraw = await call('PUT', '/api/user/consents/share-card', { granted: false }, register.json?.token);
    assert(withdraw.status === 200 && withdraw.json.consents.share_card.granted === false, 'Test 7.4: Paylaşım kartı rızası geri alındı');

    // TEST 8: Club panel permissions and tenant isolation
    const ownerToken = await login(DEMO_ACCOUNT_EMAILS.ISLETME_SAHIBI);
    const staffToken = await login(DEMO_ACCOUNT_EMAILS.PERSONEL);
    const schedule = await call('GET', `/api/panel/schedule?date=${bookingDate}`, undefined, ownerToken);
    assert(schedule.status === 200 && schedule.json.reservations.some((r: any) => r.id === rebook.json.reservation.id), 'Test 8.1: İşletme sahibi kendi takviminde rezervasyonu gördü');
    const istanbulCourts = await call('GET', `/api/courts?city=İstanbul`);
    const etilerBooking = await call('POST', '/api/reservations', { courtId: istanbulCourts.json.courts[0].id, startAt: `${dayOffset(10)}T12:00:00`, durationMinutes: 60 }, zeynepToken);
    const foreign = await call('PATCH', `/api/panel/reservations/${etilerBooking.json?.reservation?.id}/status`, { status: 'CANCELLED' }, ownerToken);
    assert(etilerBooking.status === 201 && foreign.status === 404, 'Test 8.2: Başka kulübün rezervasyonu panelden değiştirilemedi', foreign.json);
    const staffForbidden = await call('GET', '/api/panel/staff', undefined, staffToken);
    assert(staffForbidden.status === 403, 'Test 8.3: Personel, personel yönetimine erişemedi');
    const clubCancel = await call('PATCH', `/api/panel/reservations/${rebook.json.reservation.id}/status`, { status: 'CANCELLED' }, staffToken);
    const clubVoid = await one(`SELECT status, void_reason FROM app.fee_ledger_entries WHERE reservation_id = $1`, [rebook.json.reservation.id]);
    assert(clubCancel.status === 200 && clubVoid.void_reason === 'club_cancelled', 'Test 8.4: Kulübün iptal ettiği rezervasyonda da ücret alınmadı', clubVoid);
    const manual = await call('POST', '/api/panel/reservations/manual', { courtId: urlaCourt.id, customerName: 'Telefon Müşterisi', date: dayOffset(13), startTime: '15:00', durationMinutes: 60 }, staffToken);
    const manualFee = await one(`SELECT count(*)::int AS n FROM app.fee_ledger_entries WHERE reservation_id = $1`, [manual.json?.reservation?.id]);
    assert(manual.status === 201 && manualFee.n === 0, 'Test 8.5: Panelden girilen rezervasyon ücretsiz kaldı', manual.json);
    const panelCourts = await call('GET', `/api/panel/courts?date=${dayOffset(13)}`, undefined, ownerToken);
    assert(panelCourts.status === 200 && panelCourts.json.analytics.totalCourts === 3 && panelCourts.json.analytics.totalBookedHours >= 1, 'Test 8.6: Kort doluluğu gerçek rezervasyonlardan hesaplandı', panelCourts.json?.analytics);

    // TEST 9: Platform admin
    const adminToken = await login(DEMO_ADMIN_EMAIL);
    const denied = await call('GET', '/api/admin/overview', undefined, ownerToken);
    const overview = await call('GET', '/api/admin/overview', undefined, adminToken);
    assert(denied.status === 403 && overview.status === 200 && overview.json.activeClubs === 4, 'Test 9.1: Yönetim paneli yalnızca platform yöneticisine açıldı', overview.json);
    const newClub = await call('POST', '/api/admin/clubs', {
      name: 'Bursa Padel Merkezi', cityId: 16, districtName: 'Nilüfer', address: 'Test Cad. No:1, Nilüfer / Bursa',
      ownerName: 'Ayşe Yılmaz', ownerEmail: 'ayse.bursa@test.ralo', amenities: ['parking', 'cafe']
    }, adminToken);
    assert(newClub.status === 201 && newClub.json.club.isActive === false && newClub.json.ownerInvited === true && newClub.json.inviteEmailSent === true,
      'Test 9.2: Yönetici yeni kulüp açtı, sahibine davet gönderildi, kulüp pasif başladı', newClub.json);
    const hidden = await call('GET', '/api/courts?city=Bursa');
    assert(hidden.json.total === 0, 'Test 9.3: Pasif kulüp oyunculara görünmedi');

    // Move one reservation 45 days back so its fee falls into a finished month
    await db.query(
      `UPDATE app.court_bookings SET starts_at = starts_at - interval '45 days', ends_at = ends_at - interval '45 days'
       WHERE id = (SELECT booking_id FROM app.reservations WHERE id = $1)`,
      [adjacent.json.reservation.id]
    );
    const period = (await one<{ period: string }>(`SELECT to_char(local_date, 'YYYY-MM') AS period FROM app.reservations WHERE id = $1`, [adjacent.json.reservation.id])).period;
    const current = await call('POST', '/api/admin/statements/generate', { period: todayLocal().slice(0, 7) }, adminToken);
    assert(current.status === 400, 'Test 9.4: İçinde bulunulan ay için hesap özeti oluşturulamadı');
    const generated = await call('POST', '/api/admin/statements/generate', { period }, adminToken);
    const statement = generated.json?.statements?.[0];
    assert(generated.status === 200 && generated.json.created === 1 && statement.reservationFeeTotal === 100 && statement.total === 120,
      'Test 9.5: Geçmiş ay için hesap özeti oluşturuldu (100 TL + %20 KDV)', generated.json);
    const again = await call('POST', '/api/admin/statements/generate', { period }, adminToken);
    assert(again.status === 200 && again.json.created === 0, 'Test 9.6: Aynı ay için ikinci hesap özeti oluşmadı');
    const paid = await call('POST', `/api/admin/statements/${statement?.id}/paid`, { paymentReference: 'EFT-123' }, adminToken);
    assert(paid.status === 200 && paid.json.statement.status === 'paid' && paid.json.statement.paidAmount === 120, 'Test 9.7: Hesap özeti havale ile ödendi olarak işaretlendi', paid.json);
    const clubStatements = await call('GET', '/api/panel/statements', undefined, ownerToken);
    assert(clubStatements.status === 200 && clubStatements.json.statements.some((s: any) => s.id === statement?.id), 'Test 9.8: Kulüp sahibi kendi hesap özetini panelde gördü');

    // TEST 10: KVKK account deletion
    const deleteAccount = await call('POST', '/api/auth/delete-account', { confirmationText: 'HESABIMI SIL', confirmationCheck: true }, register.json.token);
    const afterDelete = await call('GET', '/api/auth/me', undefined, register.json.token);
    const anonymized = await one(`SELECT email FROM app.users WHERE status = 'deleted' LIMIT 1`);
    assert(deleteAccount.status === 200 && afterDelete.status === 401 && anonymized && anonymized.email === null, 'Test 10.1: Hesap anonimleştirildi ve oturum kapandı', deleteAccount.json);
    const ownerDelete = await call('POST', '/api/auth/delete-account', { confirmationText: 'HESABIMI SIL', confirmationCheck: true }, ownerToken);
    assert(ownerDelete.status === 409, 'Test 10.2: İşletme sahibi hesabı uygulamadan silinemedi');

    // TEST 11: Match results and Elo
    const even = computeEloChanges(
      [{ userId: 'a1', elo: 1500, matchesCount: 0 }, { userId: 'a2', elo: 1500, matchesCount: 50 }],
      [{ userId: 'b1', elo: 1500, matchesCount: 0 }, { userId: 'b2', elo: 1500, matchesCount: 50 }], 'a');
    assert(even.map(c => c.delta).join(',') === '20,10,-20,-10', 'Test 11.1: Eşit takımlarda Elo değişimi K katsayısına göre hesaplandı (40/20)', even);
    let parseError = '';
    try { parseSets([[6, 4], [4, 6]]); } catch (err: any) { parseError = err.message; }
    assert(/kazananı/.test(parseError), 'Test 11.2: Kazananı olmayan skor reddedildi');

    const early = await call('POST', `/api/matches/${matchId}/result`, { teamA: [], teamB: [], sets: [[6, 4], [6, 4]] }, playerToken);
    assert(early.status === 400, 'Test 11.3: Bitmemiş maç için sonuç girilemedi', early.json);
    await db.query(
      `UPDATE app.court_bookings SET starts_at = now() - interval '3 hours', ends_at = now() - interval '90 minutes'
       WHERE id = (SELECT booking_id FROM app.reservations WHERE id = $1)`,
      [matchId]
    );
    const ids = Object.fromEntries((await db.query<{ email: string; id: string }>(
      `SELECT email, id FROM app.users WHERE email = ANY($1::text[])`,
      [['oyuncu@demo.ralo.app', 'caner@demo.ralo.app', 'ece@demo.ralo.app', 'kaan@demo.ralo.app']]
    )).rows.map(r => [r.email.split('@')[0], r.id]));
    const teams = { teamA: [ids.oyuncu, ids.caner], teamB: [ids.ece, ids.kaan] };
    const outsider = await call('POST', `/api/matches/${matchId}/result`, { ...teams, sets: [[6, 4], [6, 4]] }, zeynepToken);
    assert(outsider.status === 403, 'Test 11.4: Maçta oynamayan oyuncu sonuç giremedi');
    const submitted = await call('POST', `/api/matches/${matchId}/result`, { ...teams, sets: [[6, 4], [3, 6], [6, 2]] }, playerToken);
    assert(submitted.status === 201, 'Test 11.5: Oyuncu maç sonucunu girdi', submitted.json);
    const teammate = await call('POST', `/api/matches/${matchId}/result/confirm`, {}, tokens[1]);
    assert(teammate.status === 403, 'Test 11.6: Sonucu giren takımdan biri onaylayamadı');
    const eceMatches = await call('GET', '/api/my-matches', undefined, tokens[2]);
    const eceView = eceMatches.json?.past?.find((m: any) => m.id === matchId);
    assert(eceView?.result?.status === 'PENDING' && eceView.result.canRespond === true, 'Test 11.7: Rakip oyuncu onay bekleyen sonucu gördü', eceView?.result);
    const dispute = await call('POST', `/api/matches/${matchId}/result/dispute`, { reason: 'Skor yanlış' }, tokens[2]);
    const afterDispute = await call('GET', '/api/my-matches', undefined, tokens[3]);
    assert(dispute.status === 200 && afterDispute.json.past.find((m: any) => m.id === matchId)?.canSubmitResult === true,
      'Test 11.8: İtiraz edilen sonuç için skor yeniden girilebilir oldu');
    const before = await one<{ elo: number; matches_count: number }>(`SELECT elo, matches_count FROM app.users WHERE id = $1`, [ids.kaan]);
    const resubmit = await call('POST', `/api/matches/${matchId}/result`, { ...teams, sets: [[4, 6], [6, 3], [2, 6]] }, tokens[3]);
    const confirm = await call('POST', `/api/matches/${matchId}/result/confirm`, {}, playerToken);
    const after = await one<{ elo: number; matches_count: number }>(`SELECT elo, matches_count FROM app.users WHERE id = $1`, [ids.kaan]);
    const events = await one<{ n: number }>(`SELECT count(*)::int AS n FROM app.elo_events WHERE reservation_id = $1`, [matchId]);
    const completed = await one<{ status: string }>(`SELECT status FROM app.reservations WHERE id = $1`, [matchId]);
    assert(resubmit.status === 201 && confirm.status === 200 && after.elo > before.elo && after.matches_count === before.matches_count + 1
      && events.n === 4 && completed.status === 'completed',
      'Test 11.9: Rakip takım onayladı, kazananların Elo puanı arttı ve maç tamamlandı', { confirm: confirm.json, before, after, events });
    const twice = await call('POST', `/api/matches/${matchId}/result/confirm`, {}, playerToken);
    assert(twice.status === 404, 'Test 11.10: Kesinleşen sonuç ikinci kez onaylanamadı');

    // TEST 12: Background jobs
    const autoIds = [ids.oyuncu, ids.caner, ids.ece, ids.kaan];
    await db.query(
      `INSERT INTO app.match_results (reservation_id, team_a, team_b, sets, winner, submitted_by, confirm_deadline, submitted_at)
       VALUES ($1, $2::uuid[], $3::uuid[], '[[6,1],[6,1]]', 'a', $4, now() - interval '1 minute', now() - interval '49 hours')`,
      [approvalId, [autoIds[0], autoIds[2]], [autoIds[1], autoIds[3]], autoIds[0]]
    );
    await runJobs();
    const auto = await one<{ status: string; confirmed_by: string | null }>(`SELECT status, confirmed_by FROM app.match_results WHERE reservation_id = $1`, [approvalId]);
    const overdueRun = await one<{ status: string }>(`SELECT status FROM app.job_runs WHERE job_name = 'statements_overdue' AND run_key = $1`, [todayLocal()]);
    assert(auto.status === 'confirmed' && auto.confirmed_by === null && overdueRun?.status === 'succeeded',
      'Test 12.1: Süresi dolan sonuç otomatik onaylandı, günlük gecikme işi çalıştı', { auto, overdueRun });
    assert(previousPeriod('2027-01-05') === '2026-12' && previousPeriod('2026-10-01') === '2026-09', 'Test 12.2: Aylık hesap özeti işi bir önceki ayı seçti');
    const karsiyaka = await one<{ id: string }>(`SELECT id FROM app.clubs WHERE name LIKE '%Karşıyaka%'`);
    await db.query(
      `INSERT INTO app.monthly_statements (statement_no, club_id, period_start, period_end, subtotal_kurus, vat_rate_bps, vat_kurus, total_kurus, due_date)
       VALUES ('RALO-TEST-00001', $1, '2026-01-01', '2026-02-01', 0, 2000, 0, 0, app.istanbul_date(now()) - 10)`,
      [karsiyaka.id]
    );
    const suspendedCount = await suspendClubsForOverdueStatements();
    const karsiyakaCourt = courts.json.courts.find((c: any) => c.business.id === karsiyaka.id);
    const blockedBooking = await call('POST', '/api/reservations', { courtId: karsiyakaCourt.id, startAt: `${dayOffset(14)}T10:00:00`, durationMinutes: 60 }, zeynepToken);
    const adminClubList = await call('GET', '/api/admin/clubs', undefined, adminToken);
    assert(suspendedCount === 1 && blockedBooking.status >= 400 && adminClubList.json.clubs.find((c: any) => c.id === karsiyaka.id)?.bookingSuspendedForPayment === true,
      'Test 12.3: Vadesinden 7 gün sonra ödenmeyen kulübün uygulama rezervasyonları durduruldu', { suspendedCount, blocked: blockedBooking.json });
    const testStatement = await one<{ id: string }>(`SELECT id FROM app.monthly_statements WHERE statement_no = 'RALO-TEST-00001'`);
    const settle = await call('POST', `/api/admin/statements/${testStatement.id}/paid`, {}, adminToken);
    const reopened = await one<{ app_booking_enabled: boolean; booking_suspended_reason: string | null }>(
      `SELECT app_booking_enabled, booking_suspended_reason FROM app.clubs WHERE id = $1`, [karsiyaka.id]);
    assert(settle.status === 200 && reopened.app_booking_enabled && reopened.booking_suspended_reason === null,
      'Test 12.4: Ödeme kaydedilince rezervasyonlar otomatik açıldı', reopened);

    // TEST 13: Coaches and lessons
    const staffCoach = await call('POST', '/api/panel/coaches', { name: 'Deniz Hoca', email: 'hoca@test.ralo' }, staffToken);
    assert(staffCoach.status === 403, 'Test 13.1: Personel antrenör ekleyemedi');
    const addCoach = await call('POST', '/api/panel/coaches', { name: 'Deniz Hoca', email: 'hoca@test.ralo' }, ownerToken);
    assert(addCoach.status === 201 && addCoach.json.invited === true && addCoach.json.coaches.length === 1, 'Test 13.2: Kulüp sahibi antrenörü e-postayla ekledi', addCoach.json);
    await db.query(`UPDATE app.users SET password_hash = $1, email_verified_at = now() WHERE email = 'hoca@test.ralo'`, [await hashPassword('padel2026')]);
    const coachToken = (await call('POST', '/api/auth/login', { email: 'hoca@test.ralo', password: 'padel2026' })).json?.token;
    const coachMe = await call('GET', '/api/auth/me', undefined, coachToken);
    const coachOverview = await call('GET', '/api/coach/overview', undefined, coachToken);
    const notCoach = await call('GET', '/api/coach/overview', undefined, playerToken);
    assert(coachMe.json?.user?.isCoach === true && coachOverview.status === 200 && coachOverview.json.contracts[0]?.courts.length === 3 && notCoach.status === 403,
      'Test 13.3: Antrenör paneli yalnızca sözleşmeli antrenöre açıldı', coachOverview.json);

    const lessonInput = {
      clubId: urlaCourt.businessId, courtId: urlaCourt.id, kind: 'GROUP', title: 'Başlangıç Grubu', level: 'BEGINNER',
      capacity: 2, pricePerStudent: 400, firstSessionAt: `${dayOffset(15)}T09:00`, durationMinutes: 60, sessionCount: 3
    };
    const noFee = await call('POST', '/api/coach/lessons', lessonInput, coachToken);
    assert(noFee.status === 409 && noFee.json.code === 'LESSON_FEE_NOT_CONFIGURED', 'Test 13.4: Ders ücreti tanımlı olmayan kulüpte ders açılamadı', noFee.json);
    await call('PUT', `/api/admin/clubs/${urlaCourt.businessId}/lesson-fee`, { amount: 50, basis: 'per_session' }, adminToken);
    const created = await call('POST', '/api/coach/lessons', lessonInput, coachToken);
    const lessonId = created.json?.lessonId;
    const lessonFees = await one<{ n: number; total: number }>(
      `SELECT count(*)::int AS n, sum(f.amount_kurus)::int AS total FROM app.fee_ledger_entries f
       JOIN app.lesson_sessions s ON s.id = f.lesson_session_id WHERE s.lesson_id = $1 AND f.status = 'accrued'`, [lessonId]);
    assert(created.status === 201 && lessonFees.n === 3 && lessonFees.total === 15000, 'Test 13.5: Haftalık 3 oturumlu ders açıldı, oturum başı ders ücreti deftere yazıldı', { created: created.json, lessonFees });
    const clash = await call('POST', '/api/reservations', { courtId: urlaCourt.id, startAt: `${dayOffset(22)}T09:00:00`, durationMinutes: 60 }, zeynepToken);
    assert(clash.status === 409, 'Test 13.6: Ders oturumunun kortu başka rezervasyona kapandı');

    const enrollStatuses = [];
    for (const token of [tokens[1], tokens[2], tokens[3]]) enrollStatuses.push((await call('POST', `/api/lessons/${lessonId}/enroll`, {}, token)).json?.status);
    assert(enrollStatuses.join(',') === 'ENROLLED,ENROLLED,WAITLISTED', 'Test 13.7: Kontenjan dolunca üçüncü öğrenci bekleme listesine alındı', enrollStatuses);
    await call('POST', `/api/lessons/${lessonId}/cancel-enrollment`, {}, tokens[1]);
    const kaanLesson = await call('GET', `/api/lessons/${lessonId}`, undefined, tokens[3]);
    assert(kaanLesson.json?.lesson?.myEnrollment?.status === 'ENROLLED' && kaanLesson.json.lesson.enrolledCount === 2,
      'Test 13.8: Kayıt iptalinde bekleme listesindeki öğrenci derse alındı', kaanLesson.json?.lesson);

    const sessions = kaanLesson.json.lesson.sessions;
    const cancelThird = await call('POST', `/api/coach/sessions/${sessions[2].id}/cancel`, {}, coachToken);
    const thirdFee = await one<{ status: string }>(`SELECT status FROM app.fee_ledger_entries WHERE lesson_session_id = $1`, [sessions[2].id]);
    assert(cancelThird.status === 200 && thirdFee.status === 'voided', 'Test 13.9: İptal edilen ders oturumunun ücreti silindi', thirdFee);
    const earlyAttendance = await call('PUT', `/api/coach/sessions/${sessions[0].id}/attendance`, { entries: [] }, coachToken);
    assert(earlyAttendance.status === 400, 'Test 13.10: Boş veya erken yoklama reddedildi');
    await db.query(
      `UPDATE app.court_bookings SET starts_at = now() - interval '20 minutes', ends_at = now() + interval '40 minutes'
       WHERE id = (SELECT r.booking_id FROM app.lesson_sessions s JOIN app.reservations r ON r.id = s.reservation_id WHERE s.id = $1)`,
      [sessions[0].id]
    );
    const coachView = (await call('GET', '/api/coach/overview', undefined, coachToken)).json.lessons.find((l: any) => l.id === lessonId);
    const attendance = await call('PUT', `/api/coach/sessions/${sessions[0].id}/attendance`, {
      entries: coachView.students.map((s: any, i: number) => ({ enrollmentId: s.enrollmentId, status: i === 0 ? 'PRESENT' : 'ABSENT' }))
    }, coachToken);
    const note = await call('POST', '/api/coach/notes', {
      lessonId, studentUserId: ids.ece, note: 'Voleyde ağırlık aktarımı gelişti.', assessedLevel: 'INTERMEDIATE', visibleToStudent: true
    }, coachToken);
    const eceLessons = await call('GET', '/api/my-lessons', undefined, tokens[2]);
    assert(attendance.status === 200 && note.status === 201 && eceLessons.json.notes.length === 1 && eceLessons.json.lessons.length === 1,
      'Test 13.11: Antrenör yoklama aldı ve öğrenci notunu gördü', { attendance: attendance.json, note: note.json });
    const endContract = await call('POST', `/api/panel/coaches/${addCoach.json.coaches[0].id}/end`, {}, ownerToken);
    assert(endContract.status === 409, 'Test 13.12: Yaklaşan oturumu olan antrenörün sözleşmesi sonlandırılamadı', endContract.json);

    // TEST 14: Club reviews
    const urlaId = urlaCourt.businessId;
    const selinToken = await login('selin@demo.ralo.app');
    const notPlayed = await call('PUT', `/api/clubs/${urlaId}/reviews/me`, { rating: 5 }, selinToken);
    assert(notPlayed.status === 403, 'Test 14.1: Kulüpte oynamamış oyuncu değerlendirme yapamadı', notPlayed.json);
    const firstReview = await call('PUT', `/api/clubs/${urlaId}/reviews/me`, { rating: 4, comment: 'Zemin iyi, soyunma odası küçük.' }, zeynepToken);
    const secondReview = await call('PUT', `/api/clubs/${urlaId}/reviews/me`, { rating: 5 }, playerToken);
    assert(firstReview.status === 200 && secondReview.status === 200 && secondReview.json.summary.count === 2 && secondReview.json.summary.average === 4.5,
      'Test 14.2: Oynamış iki oyuncu değerlendirdi, ortalama 4,5 oldu', secondReview.json?.summary);
    const editReview = await call('PUT', `/api/clubs/${urlaId}/reviews/me`, { rating: 2, comment: 'Işıklar yanmadı.' }, zeynepToken);
    assert(editReview.json?.summary?.count === 2 && editReview.json.summary.average === 3.5 && editReview.json.viewer.myReview.rating === 2,
      'Test 14.3: Oyuncu değerlendirmesini güncelledi (tek değerlendirme)', editReview.json?.summary);
    const zeynepReviewId = editReview.json.viewer.myReview.id;
    const strangerRemove = await call('DELETE', `/api/admin/reviews/${zeynepReviewId}`, undefined, playerToken);
    const adminRemove = await call('DELETE', `/api/admin/reviews/${zeynepReviewId}`, undefined, adminToken);
    const ratedCourts = await call('GET', `/api/courts?date=${dayOffset(10)}&city=İzmir`);
    const urlaRating = ratedCourts.json.courts.find((c: any) => c.businessId === urlaId)?.business;
    assert(strangerRemove.status === 403 && adminRemove.status === 200 && urlaRating?.rating === 5 && urlaRating?.reviewsCount === 1,
      'Test 14.4: Yönetici değerlendirmeyi kaldırdı, kulüp puanı yeniden hesaplandı', urlaRating);
  } catch (err: any) {
    assert(false, 'Beklenmeyen hata', err?.stack ?? String(err));
  } finally {
    server.close();
    await db.close();
  }

  originalLog(`\n🏁 Test Özeti: ${passed} Başarılı, ${failed} Hatalı\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
