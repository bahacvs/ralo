// Demo data for local development and demos (DEMO_MODE=true or `bun run db:seed`). Never for production.
// Everything goes through the same repository functions the API uses, so seeded rows obey every rule
// (fees, capacity, no-overlap). Demo accounts sign in with DEMO_PASSWORD (default below) or the
// demo role switcher.
import { setDatabase, type Database } from './instance.js';
import { todayLocal, addMinutesToLocal } from '../time.js';
import { hashPassword } from '../auth.js';
import { DEMO_ACCOUNT_EMAILS } from '../app.js';
import * as users from '../repo/users.js';
import * as clubs from '../repo/clubs.js';
import * as admin from '../repo/admin.js';
import * as reservations from '../repo/reservations.js';
import * as openMatches from '../repo/openMatches.js';
import * as social from '../repo/social.js';

export const DEMO_ADMIN_EMAIL = 'admin@demo.ralo.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'padel2026demo';

const avatar = (id: string) => `https://images.unsplash.com/photo-${id}?w=150&auto=format&fit=crop&q=80`;

const PLAYERS = [
  { key: 'player', email: DEMO_ACCOUNT_EMAILS.OYUNCU, name: 'Baha Çavuşoğlu', elo: 1450, matches: 28, side: 'both', photo: '1534528741775-53994a69daeb' },
  { key: 'zeynep', email: 'zeynep@demo.ralo.app', name: 'Zeynep Kaya', elo: 1520, matches: 42, side: 'left', photo: '1517841905240-472988babdf9' },
  { key: 'mert', email: 'mert@demo.ralo.app', name: 'Mert Yılmaz', elo: 1380, matches: 19, side: 'right', photo: '1500648767791-00dcc994a43e' },
  { key: 'caner', email: 'caner@demo.ralo.app', name: 'Caner Deniz', elo: 1475, matches: 35, side: 'both', photo: '1522075469751-3a6694fb2f61' },
  { key: 'selin', email: 'selin@demo.ralo.app', name: 'Selin Aktaş', elo: 1290, matches: 12, side: 'right', photo: '1544005313-94ddf0286df2' },
  { key: 'baris', email: 'baris@demo.ralo.app', name: 'Barış Tanır', elo: 1740, matches: 88, side: 'left', photo: '1506794778202-cad84cf45f1d' },
  { key: 'ece', email: 'ece@demo.ralo.app', name: 'Ece Güven', elo: 1410, matches: 22, side: 'right', photo: '1573496359142-b8d87734a5a2' },
  { key: 'burak', email: 'burak@demo.ralo.app', name: 'Burak Şahin', elo: 1650, matches: 64, side: 'left', photo: '1492562080023-ab3db95bfbce' },
  { key: 'melis', email: 'melis@demo.ralo.app', name: 'Melis Öztürk', elo: 1330, matches: 15, side: 'both', photo: '1531746020798-e6953c6e8e04' },
  { key: 'kaan', email: 'kaan@demo.ralo.app', name: 'Kaan Erdem', elo: 1560, matches: 47, side: 'right', photo: '1519085360753-af0119f7cbe7' }
] as const;

const CLUBS = [
  {
    key: 'urla', name: 'Padel Arena Urla', cityId: 35, district: 'Urla', address: 'İskele Mah. Mithatpaşa Cad. No:142, Urla / İzmir',
    phone: '02327541020', lat: 38.3228, lng: 26.764, owner: { email: DEMO_ACCOUNT_EMAILS.ISLETME_SAHIBI, name: 'Kemal Demirbağ' },
    cover: '1554068865-24cecd4e34b8', amenities: ['parking', 'cafe', 'locker_room', 'shower', 'equipment_rental', 'night_lighting', 'wifi'],
    policies: ['Maça 24 saat kala ücretsiz iptal', 'Temiz kort ayakkabısı zorunludur', 'Tesiste nakit veya kartla ödeme'],
    courts: [
      { name: 'Panoramik Kort 1', type: 'OUTDOOR_PANORAMIC', price: 1200 },
      { name: 'Panoramik Kort 2', type: 'OUTDOOR_PANORAMIC', price: 1200 },
      { name: 'Kapalı Kort', type: 'INDOOR_STANDARD', price: 1500 }
    ]
  },
  {
    key: 'karsiyaka', name: 'Mavi Padel Point Karşıyaka', cityId: 35, district: 'Karşıyaka', address: 'Mavişehir Mah. Caher Dudayev Blv. No:52, Karşıyaka / İzmir',
    phone: '02323245560', lat: 38.4682, lng: 27.0859, owner: { email: 'karsiyaka@demo.ralo.app', name: 'Deniz Aydın' },
    cover: '1595435934249-5df7ed86e1c0', amenities: ['parking', 'locker_room', 'shower', 'night_lighting'],
    policies: ['Maça 12 saat kala ücretsiz iptal'],
    courts: [
      { name: 'Kort A', type: 'OUTDOOR_STANDARD', price: 900 },
      { name: 'Kort B', type: 'INDOOR_PANORAMIC', price: 1300 }
    ]
  },
  {
    key: 'etiler', name: 'Etiler Padel Club', cityId: 34, district: 'Beşiktaş', address: 'Etiler Mah. Nispetiye Cad. No:88, Beşiktaş / İstanbul',
    phone: '02122854010', lat: 41.0811, lng: 29.0335, owner: { email: 'etiler@demo.ralo.app', name: 'Selim Arslan' },
    cover: '1622163642998-1ea32b0bbc67', amenities: ['cafe', 'locker_room', 'shower', 'equipment_rental', 'pro_shop', 'wifi'],
    policies: ['Maça 24 saat kala ücretsiz iptal', 'Raket kiralama resepsiyondan'],
    courts: [
      { name: 'Centre Court', type: 'INDOOR_PANORAMIC', price: 2200 },
      { name: 'Kort 2', type: 'INDOOR_PANORAMIC', price: 2000 }
    ]
  },
  {
    key: 'cankaya', name: 'Ankara Padel Park', cityId: 6, district: 'Çankaya', address: 'Oran Mah. Turan Güneş Blv. No:31, Çankaya / Ankara',
    phone: '03124479010', lat: 39.8683, lng: 32.8384, owner: { email: 'ankara@demo.ralo.app', name: 'Emre Koç' },
    cover: '1519766304817-4f37bda74a29', amenities: ['parking', 'cafe', 'shower', 'night_lighting'],
    policies: ['Maça 24 saat kala ücretsiz iptal'],
    courts: [
      { name: 'Kort 1', type: 'OUTDOOR_PANORAMIC', price: 1000 },
      { name: 'Kort 2', type: 'OUTDOOR_STANDARD', price: 850 }
    ]
  }
];

const dayOffset = (days: number) => addMinutesToLocal(`${todayLocal()}T00:00:00`, days * 24 * 60).slice(0, 10);

/** Seeds an empty database; returns false (and changes nothing) when clubs already exist. */
export async function seedDemoData(db: Database): Promise<boolean> {
  setDatabase(db);
  const existing = await db.query(`SELECT 1 FROM app.clubs LIMIT 1`);
  if (existing.rows.length > 0) return false;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const createVerified = async (email: string, displayName: string) => {
    const id = await users.createPlayer({ email, displayName, passwordHash });
    await users.markEmailVerified(id);
    return id;
  };

  // Platform admin, fee rate and billing policy (app reservations need a fee rate in effect)
  const adminId = await createVerified(DEMO_ADMIN_EMAIL, 'RALO Yönetici');
  await db.query(`INSERT INTO app.platform_admins (user_id) VALUES ($1)`, [adminId]);
  await admin.setAppReservationFee(adminId, 100, 'Demo başlangıç ücreti');
  await admin.setBillingPolicy(adminId, { amountsIncludeVat: false, vatRatePercent: 20, statementDueDays: 15, chargeNoShow: true });

  const players = new Map<string, string>();
  for (const p of PLAYERS) {
    const id = await createVerified(p.email, p.name);
    await db.query(
      `UPDATE app.users SET elo = $2, matches_count = $3, play_side = $4, avatar_url = $5 WHERE id = $1`,
      [id, p.elo, p.matches, p.side, avatar(p.photo)]
    );
    players.set(p.key, id);
  }

  const courtIds = new Map<string, string[]>();
  for (const club of CLUBS) {
    const ownerExists = await users.findCredentialByEmail(club.owner.email);
    if (!ownerExists) await createVerified(club.owner.email, club.owner.name);
    const created = await admin.createClub(adminId, {
      name: club.name,
      cityId: club.cityId,
      districtName: club.district,
      address: club.address,
      phone: club.phone,
      latitude: club.lat,
      longitude: club.lng,
      coverImageUrl: `https://images.unsplash.com/photo-${club.cover}?w=800&auto=format&fit=crop&q=80`,
      policies: club.policies,
      amenities: club.amenities,
      isActive: true,
      ownerName: club.owner.name
    }, club.owner.email);
    const ids: string[] = [];
    for (const court of club.courts) {
      const createdCourt = await clubs.createCourt(created.clubId, {
        name: court.name, type: court.type, surface: 'Suni çim', pricePerHour: court.price
      }, 'global');
      ids.push(createdCourt.id);
    }
    courtIds.set(club.key, ids);

    if (club.key === 'urla') {
      const staffId = await createVerified(DEMO_ACCOUNT_EMAILS.PERSONEL, 'Gözde Yılmaz');
      await db.tx(q => clubs.addMembership(q, {
        clubId: created.clubId, userId: staffId, role: 'staff',
        permissions: ['RESERVATION_MANAGE', 'PAYMENT_COLLECT', 'COURT_BLOCK'], invitedBy: adminId
      }));
    }
  }

  const player = async (key: string) => (await users.findUserById(players.get(key)!))!;
  const openMatch = async (
    organizer: string, club: string, court: number, days: number, time: string,
    joiners: string[], options: { minElo?: number; maxElo?: number; note?: string } = {}
  ) => {
    const match = await reservations.bookCourtForPlayer(await player(organizer), {
      courtId: courtIds.get(club)![court],
      startAt: `${dayOffset(days)}T${time}:00`,
      durationMinutes: 90,
      isOpenMatch: true,
      openMatchNote: options.note,
      minElo: options.minElo,
      maxElo: options.maxElo,
      matchType: 'casual'
    });
    for (const joiner of joiners) {
      await openMatches.joinOpenMatch(match.id, await player(joiner));
    }
  };

  await openMatch('zeynep', 'urla', 0, 1, '19:30', ['mert'], { minElo: 1300, maxElo: 1700, note: 'Keyifli bir akşam maçı, herkes davetli!' });
  await openMatch('baris', 'urla', 1, 2, '18:00', ['burak', 'kaan'], { minElo: 1500, maxElo: 1900, note: 'Rekabetçi seviye, 1 kişi aranıyor.' });
  await openMatch('caner', 'karsiyaka', 1, 1, '20:00', [], { note: 'Yeni başlayanlar da gelebilir.' });
  await openMatch('ece', 'etiler', 0, 3, '21:00', ['selin', 'melis'], { maxElo: 1600 });
  await openMatch('kaan', 'cankaya', 0, 2, '17:00', ['caner']);

  // A regular booking for the demo player
  await reservations.bookCourtForPlayer(await player('player'), {
    courtId: courtIds.get('urla')![2],
    startAt: `${dayOffset(4)}T20:00:00`,
    durationMinutes: 90,
    isOpenMatch: false
  });

  await social.createPost(await player('zeynep'), 'Hafta sonu Urla\'da sabah maçı için 2 kişi arıyoruz, seviye 1400-1600 🎾', 'OYUNCU_ARIYORUM', 'Padel Arena Urla');
  await social.createPost(await player('baris'), 'Yeni raketimi denedim, kontrol çok iyi. Tavsiye isteyen yazsın!', 'EKIPMAN');
  await social.createPost(await player('melis'), 'Etiler\'deki kapalı kortlar yağışlı havada harika, herkese öneririm.', 'SOHBET', 'Etiler Padel Club');

  return true;
}
