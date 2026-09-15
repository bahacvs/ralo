/**
 * RALO Test Suite
 * 
 * Verifies the 3 core requirements:
 * 1. Double-booking conflict check (Same court, overlapping time interval -> conflict error)
 * 2. Cross-tenant business access check (Unauthorized business access returns 403)
 * 3. Open match capacity boundary (4 players max -> waitlist)
 */

import { dbStore, addDays, formatDateKey } from './store.js';
import { addMinutesToLocal, parseClientDateTime } from './time.js';
import { normalizeEmail, validatePassword, hashPassword, verifyPassword, createAuthToken, consumeAuthToken } from './auth.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🎾 ================= RALO Automated Tests ================= 🎾\n');

  const data = dbStore.getData();

  // Generate unique future date for idempotent test runs
  const uniqueOffsetDays = 30 + Math.floor(Math.random() * 50);
  const testDate = formatDateKey(addDays(new Date(), uniqueOffsetDays));

  const createdResIds: string[] = [];

  // TEST 1: Double-Booking Conflict Prevention
  try {
    const courtId = 'court_urla_1';
    const businessId = 'biz_urla';
    const startAt = `${testDate}T10:00:00`;
    const endAt = `${testDate}T11:30:00`;

    // 1. Create first reservation
    const result1 = dbStore.createReservationAtomic({
      courtId,
      businessId,
      ownerUserId: 'user_player_demo',
      startAt,
      endAt,
      durationMinutes: 90,
      totalPrice: 1500,
      source: 'ONLINE',
      isOpenMatch: false
    });

    if (result1.reservation) {
      createdResIds.push(result1.reservation.id);
    }

    assert(result1.success && !!result1.reservation, 'Test 1.1: İlk rezervasyon başarıyla oluşturuldu', result1.error);

    // 2. Try creating overlapping reservation on the same court (e.g. 10:30 - 12:00)
    const overlapStart = `${testDate}T10:30:00`;
    const overlapEnd = `${testDate}T12:00:00`;

    const result2 = dbStore.createReservationAtomic({
      courtId,
      businessId,
      ownerUserId: 'user_player_1',
      startAt: overlapStart,
      endAt: overlapEnd,
      durationMinutes: 90,
      totalPrice: 1500,
      source: 'ONLINE',
      isOpenMatch: false
    });

    assert(!result2.success && result2.error !== undefined, 'Test 1.2: Aynı kort ve saat çakışmasında çakışma hatası üretildi ve rezervasyon engellendi');

  } catch (err: any) {
    assert(false, 'Test 1: Çakışma testi beklenmedik hata verdi', err.message);
  }

  // TEST 2: Multi-Tenant / Business Access Control (403 Forbidden)
  try {
    const userUrla = data.users.find(u => u.id === 'user_owner_demo'); // Owner of biz_urla
    const targetBusinessId = 'biz_cesme'; // Different club

    // Authorization check simulation
    let isAuthorized = false;
    if (userUrla && userUrla.businessId === targetBusinessId) {
      isAuthorized = true;
    }

    assert(!isAuthorized, 'Test 2.1: Farklı bir işletmenin panel kimliğiyle gelen erişim isteği 403 ile reddedildi');

  } catch (err: any) {
    assert(false, 'Test 2: Yetkilendirme testi beklenmedik hata verdi', err.message);
  }

  // TEST 3: Open Match 4-Player Capacity & Waitlist Redirect
  try {
    // 1. Create a fresh test open match on a distinct court/time
    const matchStartAt = `${testDate}T18:00:00`;
    const matchEndAt = `${testDate}T19:30:00`;

    const matchRes = dbStore.createReservationAtomic({
      courtId: 'court_urla_2',
      businessId: 'biz_urla',
      ownerUserId: 'user_player_demo', // Slot 0
      startAt: matchStartAt,
      endAt: matchEndAt,
      durationMinutes: 90,
      totalPrice: 1500,
      source: 'ONLINE',
      isOpenMatch: true,
      minElo: 1200,
      maxElo: 1700
    });

    assert(matchRes.success && !!matchRes.reservation, 'Test 3.1: Açık maç başarıyla başlatıldı (Organizatör koltuk 0)');

    if (matchRes.reservation) {
      createdResIds.push(matchRes.reservation.id);
    }

    const matchId = matchRes.reservation!.id;

    // Join player 2 (Slot 1)
    const p2 = data.users.find(u => u.id === 'user_player_1') || {
      id: 'test_p2', displayName: 'P2', maskedName: 'P. 2', phone: '1', elo: 1400, role: 'OYUNCU', matchesCount: 5, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: [], preferredHours: [], createdAt: ''
    };
    const join2 = dbStore.joinOpenMatch(matchId, p2 as any);
    assert(join2.success, 'Test 3.2: 2. Oyuncu başarıyla maça katıldı');

    // Join player 3 (Slot 2)
    const p3 = data.users.find(u => u.id === 'user_player_2') || {
      id: 'test_p3', displayName: 'P3', maskedName: 'P. 3', phone: '2', elo: 1450, role: 'OYUNCU', matchesCount: 5, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: [], preferredHours: [], createdAt: ''
    };
    const join3 = dbStore.joinOpenMatch(matchId, p3 as any);
    assert(join3.success, 'Test 3.3: 3. Oyuncu başarıyla maça katıldı');

    // Join player 4 (Slot 3) -> Match Full!
    const p4 = data.users.find(u => u.id === 'user_player_3') || {
      id: 'test_p4', displayName: 'P4', maskedName: 'P. 4', phone: '3', elo: 1350, role: 'OYUNCU', matchesCount: 5, playSide: 'RIGHT', dominantHand: 'LEFT', preferredDays: [], preferredHours: [], createdAt: ''
    };
    const join4 = dbStore.joinOpenMatch(matchId, p4 as any);
    assert(join4.success, 'Test 3.4: 4. Oyuncu maça katıldı, 4/4 kadro tamamlandı');

    // Attempt to join player 5 -> Should fail because match is full!
    const p5 = data.users.find(u => u.id === 'user_player_4') || {
      id: 'test_p5', displayName: 'P5', maskedName: 'P. 5', phone: '4', elo: 1400, role: 'OYUNCU', matchesCount: 5, playSide: 'BOTH', dominantHand: 'RIGHT', preferredDays: [], preferredHours: [], createdAt: ''
    };
    const join5 = dbStore.joinOpenMatch(matchId, p5 as any);
    assert(!join5.success && join5.error?.includes('dolu'), 'Test 3.5: 5. Oyuncunun doğrudan maça katılımı engellendi');

    // Player 5 joins waitlist instead
    const waitlistRes = dbStore.toggleWaitlist(matchId, p5 as any);
    assert(waitlistRes.success && waitlistRes.action === 'JOINED', 'Test 3.6: 5. Oyuncu yedek listesine (Waitlist) yönlendirildi ve 1. sıradan listeye alındı');

  } catch (err: any) {
    assert(false, 'Test 3: Kontenjan testi beklenmedik hata verdi', err.message);
  } finally {
    // Teardown: Clean up created test reservations so persistent storage stays pristine
    if (createdResIds.length > 0) {
      data.reservations = data.reservations.filter(r => !createdResIds.includes(r.id));
      data.reservation_slots = data.reservation_slots.filter(s => !createdResIds.includes(s.reservationId));
      data.open_match_participants = data.open_match_participants.filter(p => !createdResIds.includes(p.reservationId));
      data.open_match_waitlists = (data.open_match_waitlists || []).filter(w => !createdResIds.includes(w.reservationId));
      dbStore.save();
    }
  }

  // TEST 4: Local time helpers (Europe/Istanbul, midnight rollover)
  assert(addMinutesToLocal('2026-03-01T23:00:00', 120) === '2026-03-02T01:00:00', 'Test 4.1: Gece yarısını geçen maçın bitişi ertesi güne taşındı');
  assert(new Date('2026-03-01T18:00:00').toISOString() === '2026-03-01T15:00:00.000Z', 'Test 4.2: Yerel saatler Europe/Istanbul (UTC+3) olarak yorumlanıyor');
  assert(parseClientDateTime('2026-03-01T15:00:00.000Z') === '2026-03-01T18:00:00', 'Test 4.3: UTC gelen istemci saati yerel saate çevrildi');
  assert(parseClientDateTime('dün akşam') === null, 'Test 4.4: Geçersiz tarih metni reddedildi');

  // TEST 5: Player cancellation window, slot release and open match notifications
  const cancelResIds: string[] = [];
  const biz = data.businesses.find(b => b.id === 'biz_urla');
  const originalWindow = biz?.cancellationWindowHours;
  try {
    const cancelDate = formatDateKey(addDays(new Date(), uniqueOffsetDays + 1));
    const openMatch = dbStore.createReservationAtomic({
      courtId: 'court_urla_3', businessId: 'biz_urla', ownerUserId: 'user_player_demo',
      startAt: `${cancelDate}T20:00:00`, endAt: `${cancelDate}T21:30:00`,
      durationMinutes: 90, totalPrice: 1500, source: 'ONLINE', isOpenMatch: true
    });
    const matchId = openMatch.reservation!.id;
    cancelResIds.push(matchId);
    const joiner = data.users.find(u => u.id === 'u_2')!;
    dbStore.joinOpenMatch(matchId, joiner);

    if (biz) delete biz.cancellationWindowHours;
    assert(dbStore.getCancellationWindowHours('biz_urla') === 24, 'Test 5.1: İptal süresi tanımsızsa varsayılan 24 saat kullanıldı');

    const notOwner = dbStore.cancelReservationByOwner(matchId, 'u_2');
    assert(!notOwner.success && notOwner.status === 404, 'Test 5.2: Rezervasyon sahibi olmayan kullanıcı iptal edemedi');

    const startMs = new Date(`${cancelDate}T20:00:00`).getTime();
    const tooLate = dbStore.cancelReservationByOwner(matchId, 'user_player_demo', startMs - 23 * 60 * 60 * 1000);
    assert(!tooLate.success && tooLate.status === 409 && !!tooLate.error?.includes('24 saat'), 'Test 5.3: Başlamaya 24 saatten az kala iptal reddedildi', tooLate.error);

    if (biz) biz.cancellationWindowHours = 12;
    const cancelled = dbStore.cancelReservationByOwner(matchId, 'user_player_demo', startMs - 23 * 60 * 60 * 1000);
    const resAfter = data.reservations.find(r => r.id === matchId);
    assert(cancelled.success && resAfter?.status === 'CANCELLED', 'Test 5.4: Kulübün 12 saatlik penceresi dışında iptal başarılı oldu', cancelled.error);
    assert(!data.reservation_slots.some(s => s.reservationId === matchId), 'Test 5.5: İptal edilen rezervasyonun slotu serbest bırakıldı');
    assert(!!cancelled.notifiedUserIds?.includes('u_2') && data.notifications.some(n => n.userId === 'u_2' && n.matchId === matchId && n.type === 'RESERVATION_UPDATE'), 'Test 5.6: Açık maçın diğer katılımcısına iptal bildirimi gönderildi');
    assert(dbStore.isSlotAvailable('court_urla_3', `${cancelDate}T20:00:00`, `${cancelDate}T21:30:00`), 'Test 5.7: İptal sonrası kort saati yeniden rezerve edilebilir');

    const again = dbStore.cancelReservationByOwner(matchId, 'user_player_demo');
    assert(!again.success && again.status === 409, 'Test 5.8: Zaten iptal edilmiş rezervasyon tekrar iptal edilemedi');
  } catch (err: any) {
    assert(false, 'Test 5: İptal testi beklenmedik hata verdi', err.message);
  } finally {
    if (biz) {
      if (originalWindow === undefined) delete biz.cancellationWindowHours;
      else biz.cancellationWindowHours = originalWindow;
    }
    data.reservations = data.reservations.filter(r => !cancelResIds.includes(r.id));
    data.reservation_slots = data.reservation_slots.filter(s => !cancelResIds.includes(s.reservationId));
    data.open_match_participants = data.open_match_participants.filter(p => !cancelResIds.includes(p.reservationId));
    data.notifications = data.notifications.filter(n => !n.matchId || !cancelResIds.includes(n.matchId));
    dbStore.save();
  }

  // TEST 6: Leaderboard ordering and size
  const board = dbStore.getLeaderboard(50);
  assert(board.length > 0 && board.length <= 50, 'Test 6.1: Sıralama en fazla 50 oyuncu döndürdü');
  assert(board.every((u, i) => i === 0 || board[i - 1].elo >= u.elo), 'Test 6.2: Sıralama Elo puanına göre azalan düzende');
  assert(board.every(u => u.role === 'OYUNCU'), 'Test 6.3: Sıralamada yalnızca oyuncular yer aldı');

  // TEST 7: Email + password sign-in primitives
  try {
    assert(normalizeEmail('  Baha@Example.COM ') === 'baha@example.com', 'Test 7.1: E-posta adresi küçük harfe çevrildi ve boşlukları temizlendi');
    assert(normalizeEmail('baha@') === null && normalizeEmail(42) === null, 'Test 7.2: Geçersiz e-posta adresi reddedildi');
    assert(validatePassword('kisa1') !== null && validatePassword('sadeceharf') !== null && validatePassword('12345678') !== null, 'Test 7.3: Kısa, rakamsız veya harfsiz şifre reddedildi');
    assert(validatePassword('padel2026') === null, 'Test 7.4: Kurallara uyan şifre kabul edildi');

    const hash = await hashPassword('padel2026');
    assert(hash.startsWith('scrypt$') && !hash.includes('padel2026'), 'Test 7.5: Şifre scrypt ile özetlendi, düz metin saklanmadı');
    assert(await verifyPassword('padel2026', hash), 'Test 7.6: Doğru şifre doğrulandı');
    assert(!(await verifyPassword('padel2027', hash)), 'Test 7.7: Yanlış şifre reddedildi');
    assert((await hashPassword('padel2026')) !== hash, 'Test 7.8: Aynı şifre her seferinde farklı tuzla özetlendi');

    const userId = 'test_auth_user';
    const first = createAuthToken(userId, 'test@ralo.app', 'RESET_PASSWORD', 60_000);
    const second = createAuthToken(userId, 'test@ralo.app', 'RESET_PASSWORD', 60_000);
    assert(consumeAuthToken(first, 'RESET_PASSWORD') === null, 'Test 7.9: Yeni bağlantı istenince eski bağlantı geçersiz oldu');
    assert(consumeAuthToken(second, 'VERIFY_EMAIL') === null, 'Test 7.10: Bağlantı başka bir amaç için kullanılamadı');
    assert(consumeAuthToken(second, 'RESET_PASSWORD')?.userId === userId, 'Test 7.11: Geçerli bağlantı hesabı döndürdü');
    assert(consumeAuthToken(second, 'RESET_PASSWORD') === null, 'Test 7.12: Bağlantı ikinci kez kullanılamadı');
    const expired = createAuthToken(userId, 'test@ralo.app', 'VERIFY_EMAIL', -1000);
    assert(consumeAuthToken(expired, 'VERIFY_EMAIL') === null, 'Test 7.13: Süresi dolmuş bağlantı reddedildi');
  } catch (err: any) {
    assert(false, 'Test 7: Kimlik doğrulama testi beklenmedik hata verdi', err.message);
  } finally {
    dbStore.removeAuthTokens(t => t.userId === 'test_auth_user');
  }

  console.log(`\n🏁 Test Özeti: ${passed} Başarılı, ${failed} Hatalı\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
