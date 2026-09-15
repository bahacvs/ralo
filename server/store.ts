import { formatLocalDate, nowLocal } from './time.js';
import type { Persistence } from './persistence.js';
import fs from 'fs';
import path from 'path';
import { 
  User, Business, Court, Reservation, ReservationSlot, 
  OpenMatchParticipant, OpenMatchWaitlist, CourtBlock, 
  StaffMembership, Message, Conversation, Notification,
  FeedPost, FeedReply, FeedCategory
} from '../src/types/index.js';

interface DatabaseSchema {
  users: User[];
  businesses: Business[];
  courts: Court[];
  reservations: Reservation[];
  reservation_slots: ReservationSlot[];
  open_match_participants: OpenMatchParticipant[];
  open_match_waitlists: OpenMatchWaitlist[];
  court_blocks: CourtBlock[];
  staff_memberships: StaffMembership[];
  messages: Message[];
  conversations: Conversation[];
  notifications: Notification[];
  feed_posts: FeedPost[];
  sessions: StoredSession[];
  credentials: StoredCredential[];
  auth_tokens: StoredAuthToken[];
}

export interface StoredSession {
  id: string; // sha256 of the bearer token
  userId: string;
  createdAt: string;
  expiresAt: string;
}

/** Password hash, kept apart from User so it can never leak through a user response. */
export interface StoredCredential {
  id: string; // user id
  passwordHash: string;
  updatedAt: string;
}

export type AuthTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

/** Single-use emailed link (verification, password reset, staff invitation). */
export interface StoredAuthToken {
  id: string; // sha256 of the emailed token
  userId: string;
  email: string; // address the link was sent to
  purpose: AuthTokenPurpose;
  createdAt: string;
  expiresAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'ralo_db.json');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'arenamate_db.json');

export const DEFAULT_CANCELLATION_WINDOW_HOURS = 24;

// Local (Europe/Istanbul) YYYY-MM-DD
export const formatDateKey = formatLocalDate;

export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

export class ArenaStore {
  private data: DatabaseSchema = {
    users: [],
    businesses: [],
    courts: [],
    reservations: [],
    reservation_slots: [],
    open_match_participants: [],
    open_match_waitlists: [],
    court_blocks: [],
    staff_memberships: [],
    messages: [],
    conversations: [],
    notifications: [],
    feed_posts: [],
    sessions: [],
    credentials: [],
    auth_tokens: []
  };

  private persistence: Persistence | null = null;

  private isLoaded = false;
  private sent2HourReminders = new Set<string>();

  public getData(): DatabaseSchema {
    return this.data;
  }

  constructor() {
    // With DATABASE_URL the data is loaded asynchronously by connectDatabase()
    if (!process.env.DATABASE_URL) {
      this.init();
    }
  }

  private init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const targetFile = fs.existsSync(DB_FILE) ? DB_FILE : fs.existsSync(LEGACY_DB_FILE) ? LEGACY_DB_FILE : null;
    if (targetFile) {
      try {
        const raw = fs.readFileSync(targetFile, 'utf-8');
        this.data = { ...this.data, ...JSON.parse(raw) };
        this.isLoaded = true;
        // Verify if seeds are current (relative to today). If not, reseed relative to today
        this.ensureFreshSeedData();
        return;
      } catch (err) {
        console.error('Error loading DB, will re-seed:', err);
      }
    }

    this.seedInitialData();
    this.save();
    this.isLoaded = true;
  }

  /** Loads data from Postgres and mirrors every later save() there instead of the JSON file. */
  public async connectDatabase(persistence: Persistence): Promise<void> {
    const loaded = await persistence.loadAll();
    if (loaded) {
      this.data = { ...this.data, ...(loaded as unknown as Partial<DatabaseSchema>) };
    } else if (process.env.DEMO_MODE === 'true') {
      console.log('Database is empty, seeding demo data (DEMO_MODE=true).');
      this.seedInitialData();
    } else {
      console.warn('Database is empty. Import data with "bun run db:import <file>" or add businesses before going live.');
    }

    const now = new Date().toISOString();
    this.data.sessions = this.data.sessions.filter(s => s.expiresAt > now);
    this.data.auth_tokens = this.data.auth_tokens.filter(t => t.expiresAt > now);

    this.persistence = persistence;
    this.isLoaded = true;
    await persistence.flush(this.data);
  }

  public save() {
    if (this.persistence) {
      this.persistence.scheduleFlush(this.data);
      return;
    }
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save DB file:', err);
    }
  }

  public getSessions(): StoredSession[] {
    return this.data.sessions;
  }

  public removeSessions(predicate: (session: StoredSession) => boolean): void {
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(s => !predicate(s));
    if (this.data.sessions.length !== before) {
      this.save();
    }
  }

  /** Emails are stored normalized (lowercase), see normalizeEmail() in server/auth.ts. */
  public findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email === email);
  }

  public getCredential(userId: string): StoredCredential | undefined {
    return this.data.credentials.find(c => c.id === userId);
  }

  public setPassword(userId: string, passwordHash: string): void {
    const updatedAt = new Date().toISOString();
    const existing = this.getCredential(userId);
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.updatedAt = updatedAt;
    } else {
      this.data.credentials.push({ id: userId, passwordHash, updatedAt });
    }
    this.save();
  }

  public getAuthTokens(): StoredAuthToken[] {
    return this.data.auth_tokens;
  }

  public removeAuthTokens(predicate: (token: StoredAuthToken) => boolean): void {
    const before = this.data.auth_tokens.length;
    this.data.auth_tokens = this.data.auth_tokens.filter(t => !predicate(t));
    if (this.data.auth_tokens.length !== before) {
      this.save();
    }
  }

  private ensureFreshSeedData() {
    // Refreshing wipes users and reservations, so it only runs in explicit demo mode
    if (process.env.DEMO_MODE !== 'true') {
      if (!this.data.feed_posts) this.data.feed_posts = [];
      if (!this.data.open_match_waitlists) this.data.open_match_waitlists = [];
      return;
    }

    // If no reservations or no future open matches or missing expanded Istanbul courts, reseed
    const nowIso = nowLocal();
    const futureMatches = this.data.reservations.filter(r => r.isOpenMatch && r.startAt > nowIso);
    const hasExpandedIstanbul = this.data.courts.some(c => c.id === 'court_etiler_1');
    if (futureMatches.length < 10 || !hasExpandedIstanbul) {
      this.seedInitialData();
      this.save();
    } else if (!this.data.feed_posts || this.data.feed_posts.length === 0) {
      this.data.feed_posts = this.generateInitialFeedPosts();
      this.save();
    }
  }

  public seedInitialData() {
    const today = new Date();
    const d0 = formatDateKey(today);
    const d1 = formatDateKey(addDays(today, 1));
    const d2 = formatDateKey(addDays(today, 2));
    const d3 = formatDateKey(addDays(today, 3));
    const d4 = formatDateKey(addDays(today, 4));
    const d5 = formatDateKey(addDays(today, 5));

    // 1. Users (30+ players, 1 owner, 1 staff)
    const demoPlayer: User = {
      id: 'user_player_demo',
      role: 'OYUNCU',
      email: 'oyuncu@demo.ralo.app',
      emailVerified: true,
      phone: '+90 532 100 2030',
      displayName: 'Baha Çavuşoğlu',
      maskedName: 'Baha Ç.',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      elo: 1450,
      matchesCount: 28,
      playSide: 'BOTH',
      dominantHand: 'RIGHT',
      preferredDays: ['Pazartesi', 'Çarşamba', 'Cumartesi'],
      preferredHours: ['18:00 - 20:00', '20:00 - 22:00'],
      friends: ['u_1', 'u_3', 'u_17', 'u_16', 'u_2'],
      favoriteCourtIds: ['court_urla_1', 'court_maslak_1'],
      createdAt: new Date().toISOString()
    };

    const demoOwner: User = {
      id: 'user_owner_demo',
      role: 'ISLETME_SAHIBI',
      email: 'isletme@demo.ralo.app',
      emailVerified: true,
      phone: '+90 532 200 4050',
      displayName: 'Kemal Demirbağ',
      maskedName: 'Kemal D.',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      elo: 1620,
      matchesCount: 54,
      playSide: 'LEFT',
      dominantHand: 'RIGHT',
      preferredDays: ['Hafta İçi'],
      preferredHours: ['10:00 - 12:00'],
      businessId: 'biz_urla',
      createdAt: new Date().toISOString()
    };

    const demoStaff: User = {
      id: 'user_staff_demo',
      role: 'PERSONEL',
      email: 'personel@demo.ralo.app',
      emailVerified: true,
      phone: '+90 532 300 6070',
      displayName: 'Gözde Yılmaz',
      maskedName: 'Gözde Y.',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      elo: 1310,
      matchesCount: 16,
      playSide: 'RIGHT',
      dominantHand: 'RIGHT',
      preferredDays: ['Salı', 'Perşembe'],
      preferredHours: ['16:00 - 18:00'],
      businessId: 'biz_urla',
      createdAt: new Date().toISOString()
    };

    const otherPlayers: User[] = [
      { id: 'u_1', role: 'OYUNCU', phone: '+90 530 000 0001', displayName: 'Zeynep Kaya', maskedName: 'Zeynep K.', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', elo: 1520, matchesCount: 42, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Salı'], preferredHours: ['19:00'], createdAt: new Date().toISOString() },
      { id: 'u_2', role: 'OYUNCU', phone: '+90 530 000 0002', displayName: 'Mert Yılmaz', maskedName: 'Mert Y.', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', elo: 1380, matchesCount: 19, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Çarşamba'], preferredHours: ['20:00'], createdAt: new Date().toISOString() },
      { id: 'u_3', role: 'OYUNCU', phone: '+90 530 000 0003', displayName: 'Caner Deniz', maskedName: 'Caner D.', avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80', elo: 1475, matchesCount: 35, playSide: 'BOTH', dominantHand: 'LEFT', preferredDays: ['Pazar'], preferredHours: ['10:00'], createdAt: new Date().toISOString() },
      { id: 'u_4', role: 'OYUNCU', phone: '+90 530 000 0004', displayName: 'Selin Aktaş', maskedName: 'Selin A.', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', elo: 1290, matchesCount: 12, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Cuma'], preferredHours: ['18:00'], createdAt: new Date().toISOString() },
      { id: 'u_5', role: 'OYUNCU', phone: '+90 530 000 0005', displayName: 'Barış Tanır', maskedName: 'Barış T.', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80', elo: 1740, matchesCount: 88, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Cumartesi'], preferredHours: ['16:00'], createdAt: new Date().toISOString() },
      { id: 'u_6', role: 'OYUNCU', phone: '+90 530 000 0006', displayName: 'Ece Güven', maskedName: 'Ece G.', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80', elo: 1410, matchesCount: 22, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Pazartesi'], preferredHours: ['21:00'], createdAt: new Date().toISOString() },
      { id: 'u_7', role: 'OYUNCU', phone: '+90 530 000 0007', displayName: 'Burak Şahin', maskedName: 'Burak Ş.', avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80', elo: 1650, matchesCount: 64, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Perşembe'], preferredHours: ['19:00'], createdAt: new Date().toISOString() },
      { id: 'u_8', role: 'OYUNCU', phone: '+90 530 000 0008', displayName: 'Melis Öztürk', maskedName: 'Melis Ö.', avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80', elo: 1330, matchesCount: 15, playSide: 'BOTH', dominantHand: 'LEFT', preferredDays: ['Hafta Sonu'], preferredHours: ['11:00'], createdAt: new Date().toISOString() },
      { id: 'u_9', role: 'OYUNCU', phone: '+90 530 000 0009', displayName: 'Kaan Erdem', maskedName: 'Kaan E.', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80', elo: 1560, matchesCount: 47, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Salı'], preferredHours: ['20:00'], createdAt: new Date().toISOString() },
      { id: 'u_10', role: 'OYUNCU', phone: '+90 530 000 0010', displayName: 'Derya Arslan', maskedName: 'Derya A.', avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80', elo: 1490, matchesCount: 38, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Çarşamba'], preferredHours: ['18:30'], createdAt: new Date().toISOString() },
      { id: 'u_11', role: 'OYUNCU', phone: '+90 530 000 0011', displayName: 'Emre Çetinkaya', maskedName: 'Emre Ç.', avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&auto=format&fit=crop&q=80', elo: 1820, matchesCount: 95, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Hafta İçi'], preferredHours: ['20:00'], createdAt: new Date().toISOString() },
      { id: 'u_12', role: 'OYUNCU', phone: '+90 530 000 0012', displayName: 'Elif Sönmez', maskedName: 'Elif S.', avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80', elo: 1250, matchesCount: 8, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Cumartesi'], preferredHours: ['14:00'], createdAt: new Date().toISOString() },
      { id: 'u_13', role: 'OYUNCU', phone: '+90 530 000 0013', displayName: 'Onur Varol', maskedName: 'Onur V.', avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80', elo: 1390, matchesCount: 24, playSide: 'BOTH', dominantHand: 'RIGHT', preferredDays: ['Pazar'], preferredHours: ['17:00'], createdAt: new Date().toISOString() },
      { id: 'u_14', role: 'OYUNCU', phone: '+90 530 000 0014', displayName: 'Gamze Uçar', maskedName: 'Gamze U.', avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80', elo: 1460, matchesCount: 31, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Cuma'], preferredHours: ['19:30'], createdAt: new Date().toISOString() },
      { id: 'u_15', role: 'OYUNCU', phone: '+90 530 000 0015', displayName: 'Tolga Koç', maskedName: 'Tolga K.', avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80', elo: 1610, matchesCount: 52, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Salı'], preferredHours: ['21:00'], createdAt: new Date().toISOString() },
      { id: 'u_16', role: 'OYUNCU', phone: '+90 530 000 0016', displayName: 'İrem Aydın', maskedName: 'İrem A.', avatarUrl: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=150&auto=format&fit=crop&q=80', elo: 1340, matchesCount: 14, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Perşembe'], preferredHours: ['18:00'], createdAt: new Date().toISOString() },
      { id: 'u_17', role: 'OYUNCU', phone: '+90 530 000 0017', displayName: 'Alp Tuncer', maskedName: 'Alp T.', avatarUrl: 'https://images.unsplash.com/photo-1528892952291-009c663ce843?w=150&auto=format&fit=crop&q=80', elo: 1530, matchesCount: 40, playSide: 'BOTH', dominantHand: 'LEFT', preferredDays: ['Cumartesi'], preferredHours: ['12:00'], createdAt: new Date().toISOString() },
      { id: 'u_18', role: 'OYUNCU', phone: '+90 530 000 0018', displayName: 'Hazal Keskin', maskedName: 'Hazal K.', avatarUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150&auto=format&fit=crop&q=80', elo: 1425, matchesCount: 26, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Pazartesi'], preferredHours: ['19:00'], createdAt: new Date().toISOString() },
      { id: 'u_19', role: 'OYUNCU', phone: '+90 530 000 0019', displayName: 'Okan Polat', maskedName: 'Okan P.', avatarUrl: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=150&auto=format&fit=crop&q=80', elo: 1680, matchesCount: 71, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Çarşamba'], preferredHours: ['20:30'], createdAt: new Date().toISOString() },
      { id: 'u_20', role: 'OYUNCU', phone: '+90 530 000 0020', displayName: 'Buse Karaca', maskedName: 'Buse K.', avatarUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80', elo: 1295, matchesCount: 11, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Hafta Sonu'], preferredHours: ['16:00'], createdAt: new Date().toISOString() },
      { id: 'u_21', role: 'OYUNCU', phone: '+90 530 000 0021', displayName: 'Cem Bozkurt', maskedName: 'Cem B.', avatarUrl: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=150&auto=format&fit=crop&q=80', elo: 1770, matchesCount: 84, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Cuma'], preferredHours: ['20:00'], createdAt: new Date().toISOString() },
      { id: 'u_22', role: 'OYUNCU', phone: '+90 530 000 0022', displayName: 'Yasemin Yıldız', maskedName: 'Yasemin Y.', avatarUrl: 'https://images.unsplash.com/photo-1534751516642-a171ed2c2188?w=150&auto=format&fit=crop&q=80', elo: 1375, matchesCount: 18, playSide: 'BOTH', dominantHand: 'RIGHT', preferredDays: ['Salı'], preferredHours: ['18:30'], createdAt: new Date().toISOString() },
      { id: 'u_23', role: 'OYUNCU', phone: '+90 530 000 0023', displayName: 'Serdar Güler', maskedName: 'Serdar G.', avatarUrl: 'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=150&auto=format&fit=crop&q=80', elo: 1485, matchesCount: 34, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Perşembe'], preferredHours: ['20:00'], createdAt: new Date().toISOString() },
      { id: 'u_24', role: 'OYUNCU', phone: '+90 530 000 0024', displayName: 'Aslıhan Kurt', maskedName: 'Aslıhan K.', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', elo: 1440, matchesCount: 29, playSide: 'RIGHT', dominantHand: 'LEFT', preferredDays: ['Cumartesi'], preferredHours: ['18:00'], createdAt: new Date().toISOString() },
      { id: 'u_25', role: 'OYUNCU', phone: '+90 530 000 0025', displayName: 'Yiğit Akın', maskedName: 'Yiğit A.', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', elo: 1590, matchesCount: 49, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Pazartesi'], preferredHours: ['20:30'], createdAt: new Date().toISOString() },
      { id: 'u_26', role: 'OYUNCU', phone: '+90 530 000 0026', displayName: 'Damla Özcan', maskedName: 'Damla Ö.', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', elo: 1315, matchesCount: 13, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Çarşamba'], preferredHours: ['19:00'], createdAt: new Date().toISOString() },
      { id: 'u_27', role: 'OYUNCU', phone: '+90 530 000 0027', displayName: 'Murat Başar', maskedName: 'Murat B.', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80', elo: 1665, matchesCount: 68, playSide: 'BOTH', dominantHand: 'RIGHT', preferredDays: ['Pazar'], preferredHours: ['18:00'], createdAt: new Date().toISOString() },
      { id: 'u_28', role: 'OYUNCU', phone: '+90 530 000 0028', displayName: 'Simge Tekin', maskedName: 'Simge T.', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80', elo: 1405, matchesCount: 21, playSide: 'LEFT', dominantHand: 'RIGHT', preferredDays: ['Cuma'], preferredHours: ['18:00'], createdAt: new Date().toISOString() },
      { id: 'u_29', role: 'OYUNCU', phone: '+90 530 000 0029', displayName: 'Kerem Bilgin', maskedName: 'Kerem B.', avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80', elo: 1720, matchesCount: 79, playSide: 'RIGHT', dominantHand: 'RIGHT', preferredDays: ['Salı'], preferredHours: ['20:00'], createdAt: new Date().toISOString() },
      { id: 'u_30', role: 'OYUNCU', phone: '+90 530 000 0030', displayName: 'Tuğçe Yanık', maskedName: 'Tuğçe Y.', avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80', elo: 1360, matchesCount: 17, playSide: 'BOTH', dominantHand: 'LEFT', preferredDays: ['Perşembe'], preferredHours: ['19:30'], createdAt: new Date().toISOString() }
    ];

    this.data.users = [demoPlayer, demoOwner, demoStaff, ...otherPlayers];

    // 2. Businesses across Turkey with exact coordinates
    this.data.businesses = [
      // İzmir
      {
        id: 'biz_urla',
        name: 'Padel Arena Urla',
        city: 'İzmir',
        district: 'Urla',
        address: 'İskele Mah. Mithatpaşa Cad. No:142, Urla / İzmir',
        phone: '+90 232 754 1020',
        rating: 4.9,
        reviewsCount: 148,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Pro Shop', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '24:00',
        policies: ['Maça 4 saat kala ücretsiz iptal', 'Temiz kort ayakkabısı zorunludur', 'Tesiste nakit veya kredi kartı ile ödeme'],
        coverImage: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80',
        latitude: 38.3228,
        longitude: 26.7640
      },
      {
        id: 'biz_cesme',
        name: 'İzmir Padel Club Çeşme',
        city: 'İzmir',
        district: 'Çeşme',
        address: 'Alaçatı Mah. 12050 Sok. No:8, Çeşme / İzmir',
        phone: '+90 232 716 3040',
        rating: 4.8,
        reviewsCount: 215,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '01:00',
        policies: ['Maça 6 saat kala ücretsiz iptal', 'Turnuva standartlarında WPT kortlar'],
        coverImage: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80',
        latitude: 38.2831,
        longitude: 26.3768
      },
      {
        id: 'biz_karsiyaka',
        name: 'Mavi Padel Point Karşıyaka',
        city: 'İzmir',
        district: 'Karşıyaka',
        address: 'Mavişehir Mah. Caher Dudayev Blv. No:52, Karşıyaka / İzmir',
        phone: '+90 232 324 5560',
        rating: 4.7,
        reviewsCount: 182,
        amenities: ['Otopark', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '07:30',
        closingHour: '23:30',
        policies: ['2 saat kala iptal hakkı', 'İkram su ve havlu desteği'],
        coverImage: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80',
        latitude: 38.4682,
        longitude: 27.0854
      },
      {
        id: 'biz_bornova',
        name: 'Bornova Smash Park',
        city: 'İzmir',
        district: 'Bornova',
        address: 'Kazımdirik Mah. Sanayi Cad. No:33, Bornova / İzmir',
        phone: '+90 232 461 8890',
        rating: 4.6,
        reviewsCount: 96,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '23:00',
        policies: ['Grup rezervasyonlarında indirim', 'Raket kiralama 100 TRY'],
        coverImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
        latitude: 38.4632,
        longitude: 27.2185
      },
      {
        id: 'biz_alsancak',
        name: 'Alsancak Rooftop Padel',
        city: 'İzmir',
        district: 'Alsancak',
        address: 'Kültür Mah. Şair Eşref Blv. No:78 Teras, Konak / İzmir',
        phone: '+90 232 421 7080',
        rating: 4.9,
        reviewsCount: 164,
        amenities: ['Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '09:00',
        closingHour: '24:00',
        policies: ['Şehir manzaralı panoramik teras', 'Girişte spor ayakkabı kontrolü'],
        coverImage: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
        latitude: 38.4371,
        longitude: 27.1428
      },
      {
        id: 'biz_guzelbahce',
        name: 'Güzelbahçe Padel Garden',
        city: 'İzmir',
        district: 'Güzelbahçe',
        address: 'Yalı Mah. 68. Sok. No:15, Güzelbahçe / İzmir',
        phone: '+90 232 234 9010',
        rating: 4.8,
        reviewsCount: 110,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması'],
        openingHour: '08:00',
        closingHour: '23:00',
        policies: ['Doğa içinde açık hava kortları', 'Ücretsiz otopark'],
        coverImage: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80',
        latitude: 38.3695,
        longitude: 26.8906
      },

      // İstanbul
      {
        id: 'biz_ist_maslak',
        name: 'Padel Club Maslak',
        city: 'İstanbul',
        district: 'Sarıyer',
        address: 'Maslak Mah. Büyükdere Cad. No:245, Sarıyer / İstanbul',
        phone: '+90 212 285 4010',
        rating: 4.9,
        reviewsCount: 312,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Pro Shop', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '07:00',
        closingHour: '01:00',
        policies: ['İptal süresi 4 saattir', 'Özel WPT zemin kortlar', 'Vale otopark hizmeti'],
        coverImage: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80',
        latitude: 41.1118,
        longitude: 29.0225
      },
      {
        id: 'biz_ist_kadikoy',
        name: 'Moda Padel Arena Kadıköy',
        city: 'İstanbul',
        district: 'Kadıköy',
        address: 'Caferağa Mah. Moda Cad. No:88, Kadıköy / İstanbul',
        phone: '+90 216 345 7780',
        rating: 4.8,
        reviewsCount: 265,
        amenities: ['Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '24:00',
        policies: ['Maça 3 saat kala iptal imkanı', 'Deniz esintili panoramik kort'],
        coverImage: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80',
        latitude: 40.9856,
        longitude: 29.0298
      },
      {
        id: 'biz_ist_gokturk',
        name: 'Göktürk Country Padel',
        city: 'İstanbul',
        district: 'Eyüpsultan',
        address: 'Göktürk Merkez Mah. İstanbul Cad. No:114, Eyüpsultan / İstanbul',
        phone: '+90 212 322 8990',
        rating: 4.9,
        reviewsCount: 198,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Pro Shop', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '23:30',
        policies: ['Orman kenarı açık & kapalı panoramik kortlar', 'Ücretsiz sporcu içeceği'],
        coverImage: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80',
        latitude: 41.1782,
        longitude: 28.8912
      },
      {
        id: 'biz_ist_atasehir',
        name: 'Ataşehir Smash Padel Park',
        city: 'İstanbul',
        district: 'Ataşehir',
        address: 'Barbaros Mah. Mor Sümbül Sok. No:12, Ataşehir / İstanbul',
        phone: '+90 216 577 6040',
        rating: 4.7,
        reviewsCount: 142,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması'],
        openingHour: '08:00',
        closingHour: '24:00',
        policies: ['Metropol İstanbul yanı kapalı ve açık kortlar', 'Online güvenli ödeme'],
        coverImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
        latitude: 40.9924,
        longitude: 29.1173
      },
      {
        id: 'biz_ist_etiler',
        name: 'Etiler Levent Padel Club',
        city: 'İstanbul',
        district: 'Beşiktaş',
        address: 'Etiler Mah. Nisbetiye Cad. No:52, Beşiktaş / İstanbul',
        phone: '+90 212 263 8090',
        rating: 4.9,
        reviewsCount: 295,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Pro Shop', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '07:30',
        closingHour: '00:30',
        policies: ['Akmerkez & Nisbetiye lokasyonu', 'WPT standart panoramik cam kortlar', 'Vale hizmeti'],
        coverImage: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80',
        latitude: 41.0825,
        longitude: 29.0345
      },
      {
        id: 'biz_ist_acarkent',
        name: 'Acarkent Racquet & Padel Club',
        city: 'İstanbul',
        district: 'Beykoz',
        address: 'Acarlar Mah. Acarkent Coliseum Yanı No:14, Beykoz / İstanbul',
        phone: '+90 216 485 7000',
        rating: 4.9,
        reviewsCount: 340,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Pro Shop', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '07:00',
        closingHour: '23:30',
        policies: ['Beykoz doğa içinde lüks tesis', 'Kapalı ve açık panoramik kortlar', 'Ücretsiz sporcu otoparkı'],
        coverImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
        latitude: 41.1156,
        longitude: 29.1124
      },
      {
        id: 'biz_ist_florya',
        name: 'Florya Sahil Padel Arena',
        city: 'İstanbul',
        district: 'Bakırköy',
        address: 'Şenlikköy Mah. Yeşilköy Cad. Sahil Yolu No:78, Florya / İstanbul',
        phone: '+90 212 663 1240',
        rating: 4.8,
        reviewsCount: 210,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '24:00',
        policies: ['Marmara denizi kıyısında günbatımı maçları', 'Restoran & dinlenme lounge'],
        coverImage: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80',
        latitude: 40.9789,
        longitude: 28.7985
      },
      {
        id: 'biz_ist_kemerburgaz',
        name: 'Kemerburgaz Forest Padel Hub',
        city: 'İstanbul',
        district: 'Eyüpsultan',
        address: 'Mithatpaşa Mah. Selanik Blv. No:160, Kemerburgaz / Eyüpsultan / İstanbul',
        phone: '+90 212 360 4455',
        rating: 4.9,
        reviewsCount: 225,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '23:00',
        policies: ['Belgrad ormanı eteğinde temiz hava ve profesyonel WPT kortlar', 'Geniş kafe alanı'],
        coverImage: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
        latitude: 41.1610,
        longitude: 28.9180
      },
      {
        id: 'biz_ist_cekmekoy',
        name: 'Çekmeköy Green Padel Park',
        city: 'İstanbul',
        district: 'Çekmeköy',
        address: 'Merkez Mah. Çavuşbaşı Cad. Doğa Parkı İçi No:92, Çekmeköy / İstanbul',
        phone: '+90 216 640 1880',
        rating: 4.7,
        reviewsCount: 165,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması'],
        openingHour: '08:30',
        closingHour: '23:30',
        policies: ['Anadolu yakasının yeşil doğasında padel', 'Isıtmalı kapalı salon seçeneği'],
        coverImage: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80',
        latitude: 41.0345,
        longitude: 29.1789
      },
      {
        id: 'biz_ist_suadiye',
        name: 'Suadiye Sahil Padel Point',
        city: 'İstanbul',
        district: 'Kadıköy',
        address: 'Suadiye Mah. Sahil Yolu Plaj Yolu Sok. No:14, Kadıköy / İstanbul',
        phone: '+90 216 384 9020',
        rating: 4.8,
        reviewsCount: 250,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '07:30',
        closingHour: '24:00',
        policies: ['Bağdat Caddesi ve sahil yürüyüş yolu bağlantılı', 'Adalar manzaralı açık kort'],
        coverImage: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80',
        latitude: 40.9578,
        longitude: 29.0834
      },
      {
        id: 'biz_ist_beylikduzu',
        name: 'West Istanbul Marina Padel Club',
        city: 'İstanbul',
        district: 'Beylikdüzü',
        address: 'Yakuplu Mah. Marmara Cad. Marina İçi No:1, Beylikdüzü / İstanbul',
        phone: '+90 212 850 2000',
        rating: 4.8,
        reviewsCount: 180,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '00:00',
        policies: ['Marina atmosferi, yat limanı manzaralı kortlar', 'Ücretsiz marina otoparkı'],
        coverImage: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80',
        latitude: 40.9634,
        longitude: 28.6650
      },

      // Ankara
      {
        id: 'biz_ank_cankaya',
        name: 'Çankaya Panoramik Padel Club',
        city: 'Ankara',
        district: 'Çankaya',
        address: 'Gaziosmanpaşa Mah. Arjantin Cad. No:44, Çankaya / Ankara',
        phone: '+90 312 447 9010',
        rating: 4.9,
        reviewsCount: 220,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '24:00',
        policies: ['Başkentin merkezinde ısıtmalı kapalı ve açık WPT kortlar', 'Ücretsiz otopark'],
        coverImage: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
        latitude: 39.8854,
        longitude: 32.8597
      },
      {
        id: 'biz_ank_cayyolu',
        name: 'Çayyolu Padel Point',
        city: 'Ankara',
        district: 'Çankaya',
        address: 'Alacaatlı Mah. Park Cad. No:76, Çayyolu / Ankara',
        phone: '+90 312 240 5560',
        rating: 4.8,
        reviewsCount: 175,
        amenities: ['Otopark', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması'],
        openingHour: '08:30',
        closingHour: '23:30',
        policies: ['Kışın tam kapalı iklimlendirmeli kortlar', 'Turnuva ligleri'],
        coverImage: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80',
        latitude: 39.8821,
        longitude: 32.6845
      },

      // Antalya
      {
        id: 'biz_ant_lara',
        name: 'Lara Riviera Padel Club',
        city: 'Antalya',
        district: 'Muratpaşa',
        address: 'Şirinyalı Mah. Lara Cad. No:190, Muratpaşa / Antalya',
        phone: '+90 242 316 2030',
        rating: 4.9,
        reviewsCount: 280,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '07:30',
        closingHour: '01:00',
        policies: ['Akdeniz manzaralı WPT standart kortlar', 'Havuz ve dinlenme alanı kullanımı'],
        coverImage: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80',
        latitude: 36.8524,
        longitude: 30.7712
      },
      {
        id: 'biz_ant_konyaalti',
        name: 'Konyaaltı Beach Padel',
        city: 'Antalya',
        district: 'Konyaaltı',
        address: 'Arapsuyu Mah. Akdeniz Blv. No:82, Konyaaltı / Antalya',
        phone: '+90 242 228 1140',
        rating: 4.8,
        reviewsCount: 190,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması'],
        openingHour: '08:00',
        closingHour: '24:00',
        policies: ['Sahile 50 metre mesafede', 'Gece LED aydınlatma'],
        coverImage: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80',
        latitude: 36.8789,
        longitude: 30.6384
      },

      // Muğla (Bodrum & Fethiye)
      {
        id: 'biz_mug_bodrum',
        name: 'Bodrum Sunset Padel Club',
        city: 'Muğla',
        district: 'Bodrum',
        address: 'Yalıkavak Mah. Çökertme Cad. No:24, Bodrum / Muğla',
        phone: '+90 252 385 4520',
        rating: 4.9,
        reviewsCount: 245,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması', 'Wi-Fi'],
        openingHour: '08:00',
        closingHour: '01:00',
        policies: ['Yalıkavak günbatımı manzaralı lüks kortlar', 'Kokteyl bar ve lounge'],
        coverImage: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80',
        latitude: 37.1042,
        longitude: 27.2954
      },

      // Bursa
      {
        id: 'biz_bur_nilufer',
        name: 'Nilüfer Padel Park',
        city: 'Bursa',
        district: 'Nilüfer',
        address: 'Özlüce Mah. Ahmet Taner Kışlalı Blv. No:50, Nilüfer / Bursa',
        phone: '+90 224 413 8090',
        rating: 4.7,
        reviewsCount: 130,
        amenities: ['Otopark', 'Kafeterya', 'Soyunma Odası', 'Duş', 'Ekipman Kiralama', 'Gece Aydınlatması'],
        openingHour: '08:30',
        closingHour: '23:30',
        policies: ['Özlüce merkezinde kapalı ve açık seçenekler', 'Geniş otopark'],
        coverImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
        latitude: 40.2145,
        longitude: 28.9812
      }
    ];

    // 3. Courts across these nationwide businesses
    this.data.courts = [
      // Urla (İzmir)
      { id: 'court_urla_1', businessId: 'biz_urla', name: 'Merkez Kort (Panoramik)', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Süper Mavi Suni Çim', pricePerHour: 1400, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_urla_2', businessId: 'biz_urla', name: 'Kort 2 - Kapalı Klimalı', type: 'INDOOR_PANORAMIC', surface: 'Mondo Supercourt XN', pricePerHour: 1600, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_urla_3', businessId: 'biz_urla', name: 'Kort 3 - Açık Standart', type: 'OUTDOOR_STANDARD', surface: 'Suni Çim', pricePerHour: 1200, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_urla_4', businessId: 'biz_urla', name: 'Kort 4 - Teras Kort', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Pro Akrilik', pricePerHour: 1500, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },

      // Çeşme (İzmir)
      { id: 'court_cesme_1', businessId: 'biz_cesme', name: 'Alaçatı Rüzgar Kortu', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Süper Mavi Çim', pricePerHour: 1800, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_cesme_2', businessId: 'biz_cesme', name: 'Kort 2 - Sunset Panoramik', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 1800, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_cesme_3', businessId: 'biz_cesme', name: 'Kort 3 - Kapalı Salon', type: 'INDOOR_STANDARD', surface: 'Pro Çim', pricePerHour: 1600, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },

      // Karşıyaka (İzmir)
      { id: 'court_karsiyaka_1', businessId: 'biz_karsiyaka', name: 'Kort 1 - Körfez Manzaralı', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Çim', pricePerHour: 1400, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_karsiyaka_2', businessId: 'biz_karsiyaka', name: 'Kort 2 - Kapalı Kort', type: 'INDOOR_PANORAMIC', surface: 'Akrilik Zemin', pricePerHour: 1500, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_karsiyaka_3', businessId: 'biz_karsiyaka', name: 'Kort 3 - Standart Açık', type: 'OUTDOOR_STANDARD', surface: 'Suni Çim', pricePerHour: 1200, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },

      // Bornova (İzmir)
      { id: 'court_bornova_1', businessId: 'biz_bornova', name: 'Kort 1 - Üniversite Kortu', type: 'OUTDOOR_PANORAMIC', surface: 'Mavi Çim', pricePerHour: 1100, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_bornova_2', businessId: 'biz_bornova', name: 'Kort 2 - Kapalı Antrenman', type: 'INDOOR_STANDARD', surface: 'Standart Çim', pricePerHour: 1300, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },

      // Alsancak (İzmir)
      { id: 'court_alsancak_1', businessId: 'biz_alsancak', name: 'Teras Panoramik Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Supercourt XN', pricePerHour: 1700, isActive: true, photos: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_alsancak_2', businessId: 'biz_alsancak', name: 'Teras Panoramik Kort 2', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Supercourt XN', pricePerHour: 1700, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },

      // Güzelbahçe (İzmir)
      { id: 'court_guzelbahce_1', businessId: 'biz_guzelbahce', name: 'Garden Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'Suni Çim', pricePerHour: 1300, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_guzelbahce_2', businessId: 'biz_guzelbahce', name: 'Garden Kort 2', type: 'OUTDOOR_STANDARD', surface: 'Suni Çim', pricePerHour: 1150, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },

      // Maslak (İstanbul)
      { id: 'court_maslak_1', businessId: 'biz_ist_maslak', name: 'Maslak Merkez Panoramik', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2200, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_maslak_2', businessId: 'biz_ist_maslak', name: 'Maslak Kort 2 - Kapalı İklimlendirmeli', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2400, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_maslak_3', businessId: 'biz_ist_maslak', name: 'Maslak Teras Panoramik Kort 3', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 2300, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_maslak_4', businessId: 'biz_ist_maslak', name: 'Maslak Center Court WPT Pro', type: 'INDOOR_PANORAMIC', surface: 'WPT Mavi Çim', pricePerHour: 2500, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },

      // Kadıköy Moda (İstanbul)
      { id: 'court_kadikoy_1', businessId: 'biz_ist_kadikoy', name: 'Moda Panoramik Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Çim', pricePerHour: 2000, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_kadikoy_2', businessId: 'biz_ist_kadikoy', name: 'Moda Kapalı Salon Kortu', type: 'INDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 2200, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_kadikoy_3', businessId: 'biz_ist_kadikoy', name: 'Kalamış Sahil Panoramik Kort', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Supercourt XN', pricePerHour: 2100, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },

      // Göktürk (İstanbul)
      { id: 'court_gokturk_1', businessId: 'biz_ist_gokturk', name: 'Göktürk Orman Panoramik', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2100, isActive: true, photos: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_gokturk_2', businessId: 'biz_ist_gokturk', name: 'Göktürk Kapalı Isıtmalı Kort', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2300, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_gokturk_3', businessId: 'biz_ist_gokturk', name: 'Göktürk Vadi Kortu', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Zemin', pricePerHour: 2000, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },

      // Ataşehir (İstanbul)
      { id: 'court_atasehir_1', businessId: 'biz_ist_atasehir', name: 'Ataşehir Smash Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Pro Zemin', pricePerHour: 1900, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_atasehir_2', businessId: 'biz_ist_atasehir', name: 'Ataşehir Kapalı Pro Kort', type: 'INDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 2100, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_atasehir_3', businessId: 'biz_ist_atasehir', name: 'Ataşehir Finans Panoramik', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Supercourt', pricePerHour: 2000, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },

      // Etiler (İstanbul)
      { id: 'court_etiler_1', businessId: 'biz_ist_etiler', name: 'Etiler Panoramik Center Court', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2600, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_etiler_2', businessId: 'biz_ist_etiler', name: 'Nisbetiye Kapalı WPT Kort', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2800, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_etiler_3', businessId: 'biz_ist_etiler', name: 'Akmerkez Teras Kort 3', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Süper Mavi', pricePerHour: 2500, isActive: true, photos: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80'] },

      // Acarkent Beykoz (İstanbul)
      { id: 'court_acarkent_1', businessId: 'biz_ist_acarkent', name: 'Coliseum Panoramik Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2500, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_acarkent_2', businessId: 'biz_ist_acarkent', name: 'Coliseum Kapalı Premium Kort', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2700, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_acarkent_3', businessId: 'biz_ist_acarkent', name: 'Beykoz Orman Manzaralı Kort 3', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Zemin', pricePerHour: 2400, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },

      // Florya Bakırköy (İstanbul)
      { id: 'court_florya_1', businessId: 'biz_ist_florya', name: 'Florya Sunset Panoramik Kort', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 2200, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_florya_2', businessId: 'biz_ist_florya', name: 'Marmara Sahil Kapalı Kort', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2400, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },

      // Kemerburgaz (İstanbul)
      { id: 'court_kemer_1', businessId: 'biz_ist_kemerburgaz', name: 'Kemer Orman Panoramik Kort', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2200, isActive: true, photos: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_kemer_2', businessId: 'biz_ist_kemerburgaz', name: 'Kemerburgaz Kapalı All-Weather', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2300, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },

      // Çekmeköy (İstanbul)
      { id: 'court_cekmekoy_1', businessId: 'biz_ist_cekmekoy', name: 'Çekmeköy Doğa Panoramik Kort', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Süper Mavi', pricePerHour: 1800, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_cekmekoy_2', businessId: 'biz_ist_cekmekoy', name: 'Çekmeköy Kapalı Salon Kortu', type: 'INDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 2000, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },

      // Suadiye Kadıköy (İstanbul)
      { id: 'court_suadiye_1', businessId: 'biz_ist_suadiye', name: 'Suadiye Sahil Panoramik 1', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2200, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_suadiye_2', businessId: 'biz_ist_suadiye', name: 'Adalar Manzaralı Teras Kort', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Zemin', pricePerHour: 2300, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },

      // Beylikdüzü Marina (İstanbul)
      { id: 'court_beylikduzu_1', businessId: 'biz_ist_beylikduzu', name: 'Marina Panoramik Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Zemin', pricePerHour: 1800, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_beylikduzu_2', businessId: 'biz_ist_beylikduzu', name: 'Yat Limanı Kort 2', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt', pricePerHour: 1900, isActive: true, photos: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80'] },

      // Çankaya (Ankara)
      { id: 'court_cankaya_1', businessId: 'biz_ank_cankaya', name: 'Arjantin Panoramik Kort', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 1800, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_cankaya_2', businessId: 'biz_ank_cankaya', name: 'Çankaya Kapalı Isıtmalı Kort', type: 'INDOOR_PANORAMIC', surface: 'Supercourt XN', pricePerHour: 2000, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },

      // Çayyolu (Ankara)
      { id: 'court_cayyolu_1', businessId: 'biz_ank_cayyolu', name: 'Park Cadde Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Zemin', pricePerHour: 1600, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] },

      // Lara (Antalya)
      { id: 'court_lara_1', businessId: 'biz_ant_lara', name: 'Riviera Sunset Kort', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 1700, isActive: true, photos: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_lara_2', businessId: 'biz_ant_lara', name: 'Riviera Kort 2 (Işıklandırmalı)', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Zemin', pricePerHour: 1700, isActive: true, photos: ['https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80'] },

      // Konyaaltı (Antalya)
      { id: 'court_konyaalti_1', businessId: 'biz_ant_konyaalti', name: 'Beach Padel Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'Suni Çim', pricePerHour: 1500, isActive: true, photos: ['https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80'] },

      // Bodrum (Muğla)
      { id: 'court_bodrum_1', businessId: 'biz_mug_bodrum', name: 'Yalıkavak Sunset Kort', type: 'OUTDOOR_PANORAMIC', surface: 'Mondo Supercourt WPT', pricePerHour: 2500, isActive: true, photos: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'] },
      { id: 'court_bodrum_2', businessId: 'biz_mug_bodrum', name: 'Bodrum Marina Kort 2', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Süper Mavi', pricePerHour: 2300, isActive: true, photos: ['https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&auto=format&fit=crop&q=80'] },

      // Nilüfer (Bursa)
      { id: 'court_nilufer_1', businessId: 'biz_bur_nilufer', name: 'Özlüce Park Kort 1', type: 'OUTDOOR_PANORAMIC', surface: 'WPT Mavi Suni Çim', pricePerHour: 1400, isActive: true, photos: ['https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80'] }
    ];

    // 4. Staff Memberships
    this.data.staff_memberships = [
      { id: 'staff_1', businessId: 'biz_urla', userId: 'user_owner_demo', role: 'ISLETME_SAHIBI', permissions: ['ALL'], createdAt: new Date().toISOString() },
      { id: 'staff_2', businessId: 'biz_urla', userId: 'user_staff_demo', role: 'PERSONEL', permissions: ['RESERVATION_MANAGE', 'PAYMENT_COLLECT', 'COURT_BLOCK'], createdAt: new Date().toISOString() }
    ];

    // 5. Open Matches & Reservations (14+ relative future matches with various occupancies)
    // Clear existing
    this.data.reservations = [];
    this.data.reservation_slots = [];
    this.data.open_match_participants = [];
    this.data.open_match_waitlists = [];
    this.data.court_blocks = [];

    // Helper to add match and participant slots
    const createMatchRecord = (
      id: string,
      courtId: string,
      businessId: string,
      ownerUserId: string,
      dateStr: string,
      startTimeStr: string,
      durationMinutes: 60 | 90 | 120,
      totalPrice: number,
      activePlayerIds: string[],
      options: {
        minElo?: number;
        maxElo?: number;
        approvalRequired?: boolean;
        matchType?: 'CASUAL' | 'COMPETITIVE';
        genderPreference?: 'MIXED' | 'FEMALE' | 'MALE' | 'ANY';
        note?: string;
        waitlistPlayerIds?: string[];
      } = {}
    ) => {
      const [sh, sm] = startTimeStr.split(':').map(Number);
      const startD = new Date(`${dateStr}T${startTimeStr}:00`);
      const endD = new Date(startD.getTime() + durationMinutes * 60000);
      const endHours = String(endD.getHours()).padStart(2, '0');
      const endMins = String(endD.getMinutes()).padStart(2, '0');
      const endTimeStr = `${endHours}:${endMins}`;

      const res: Reservation = {
        id,
        courtId,
        businessId,
        ownerUserId,
        startAt: `${dateStr}T${startTimeStr}:00`,
        endAt: `${dateStr}T${endTimeStr}:00`,
        durationMinutes,
        totalPrice,
        source: 'ONLINE',
        status: 'CONFIRMED',
        paymentStatus: 'PAY_AT_VENUE',
        isOpenMatch: true,
        openMatchNote: options.note || 'Keyifli ve saygılı bir padel maçı!',
        participantLimit: 4,
        minElo: options.minElo,
        maxElo: options.maxElo,
        matchType: options.matchType || 'CASUAL',
        genderPreference: options.genderPreference || 'MIXED',
        approvalRequired: options.approvalRequired || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.data.reservations.push(res);

      // Register slot for conflict prevention
      this.data.reservation_slots.push({
        id: `${courtId}_${dateStr}_${startTimeStr}`,
        courtId,
        date: dateStr,
        startTime: startTimeStr,
        durationMinutes,
        reservationId: id
      });

      // Add active participants
      activePlayerIds.forEach((uid, index) => {
        const u = this.data.users.find(x => x.id === uid);
        this.data.open_match_participants.push({
          id: `omp_${id}_${uid}`,
          reservationId: id,
          userId: uid,
          slotIndex: index,
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
          userMaskedName: u ? u.maskedName : 'Oyuncu',
          userElo: u ? u.elo : 1400,
          userAvatar: u ? u.avatarUrl : '',
          userPlaySide: u ? u.playSide : 'BOTH',
          userDominantHand: u ? u.dominantHand : 'RIGHT'
        });
      });

      // Add waitlist if any
      if (options.waitlistPlayerIds) {
        options.waitlistPlayerIds.forEach((uid, wIndex) => {
          const u = this.data.users.find(x => x.id === uid);
          this.data.open_match_waitlists.push({
            id: `omw_${id}_${uid}`,
            reservationId: id,
            userId: uid,
            position: wIndex + 1,
            requestedAt: new Date().toISOString(),
            userMaskedName: u ? u.maskedName : 'Sıradaki Oyuncu',
            userElo: u ? u.elo : 1400
          });
        });
      }
    };

    // 1. TODAY Matches
    // Match 1: 1/4 doluluk (1 player - 3 open spots)
    createMatchRecord('m_today_1', 'court_urla_1', 'biz_urla', 'u_1', d0, '18:00', 90, 2100, ['u_1'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'İş çıkışı keyifli 90 dakika padel. Her seviyeye açık!'
    });

    // Match 2: 2/4 doluluk (2 players - 2 open spots)
    createMatchRecord('m_today_2', 'court_cesme_1', 'biz_cesme', 'u_2', d0, '19:30', 90, 2700, ['u_2', 'u_3'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MIXED',
      minElo: 1350,
      maxElo: 1650,
      note: 'Orta-ileri seviye tempolu maç. Spin ve bandeja bilenler gelsin!'
    });

    // Match 3: 3/4 doluluk (3 players - 1 open spot!)
    createMatchRecord('m_today_3', 'court_karsiyaka_1', 'biz_karsiyaka', 'u_4', d0, '20:00', 90, 2100, ['u_4', 'u_5', 'u_6'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Son 1 kişi aranıyor! Sağ kanat tercih edilir.'
    });

    // Match 4: DOLU ve BEKLEME LİSTELİ MAÇ (4 players full + 2 on waitlist)
    createMatchRecord('m_today_4', 'court_alsancak_1', 'biz_alsancak', 'u_7', d0, '21:00', 90, 2550, ['u_7', 'u_8', 'u_9', 'u_10'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MIXED',
      note: 'Alsancak teras maçı. Dolu, ancak iptal olursa ilk yedek çağrılır.',
      waitlistPlayerIds: ['u_11', 'u_12']
    });

    // Match 5: ORGANİZATÖR ONAYI GEREKTİREN MAÇ (approvalRequired: true)
    createMatchRecord('m_today_5', 'court_bornova_1', 'biz_bornova', 'u_13', d0, '17:30', 90, 1650, ['u_13', 'u_14'], {
      approvalRequired: true,
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Organizatör onaylı maçtır. İstek gönderdikten sonra kısa sürede teyit edilecektir.'
    });

    // Match 6: ELO SINIRI NEDENİYLE KULLANICININ KATILAMADIĞI MAÇ (Demo user Elo: 1450, Match requires 1600-2000)
    createMatchRecord('m_today_6', 'court_urla_2', 'biz_urla', 'u_5', d0, '21:30', 90, 2400, ['u_5', 'u_11', 'u_15'], {
      minElo: 1600,
      maxElo: 2000,
      matchType: 'COMPETITIVE',
      genderPreference: 'ANY',
      note: 'Yüksek Elo lig hazırlık maçı. Yalnızca 1600+ oyuncular kabul edilir.'
    });

    // Match 7: KULLANICININ ZATEN KATILDIĞI BİR MAÇ (Includes demo player 'user_player_demo')
    createMatchRecord('m_today_7', 'court_urla_1', 'biz_urla', 'user_player_demo', d0, '16:00', 90, 2100, ['user_player_demo', 'u_16', 'u_17'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Baha Çavuşoğlu tarafından açılan dostluk maçı. Son 1 kişi!'
    });

    // 2. TOMORROW Matches (d1)
    createMatchRecord('m_tom_1', 'court_guzelbahce_1', 'biz_guzelbahce', 'u_18', d1, '10:00', 90, 1950, ['u_18', 'u_19'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Sabah kahvesi öncesi Güzelbahçe sabah maçı.'
    });

    createMatchRecord('m_tom_2', 'court_cesme_2', 'biz_cesme', 'u_20', d1, '18:00', 90, 2700, ['u_20'], {
      matchType: 'CASUAL',
      genderPreference: 'FEMALE',
      note: 'Kadınlar padel buluşması. 3 yer boş!'
    });

    createMatchRecord('m_tom_3', 'court_karsiyaka_2', 'biz_karsiyaka', 'u_21', d1, '19:30', 90, 2250, ['u_21', 'u_22', 'u_23'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MALE',
      minElo: 1400,
      maxElo: 1750,
      note: 'Erkekler rekabetçi maç. Son 1 kişi!'
    });

    createMatchRecord('m_tom_4', 'court_urla_4', 'biz_urla', 'u_24', d1, '20:00', 90, 2250, ['u_24', 'u_25'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Teras kortta akşam maçı.'
    });

    // 3. DAY 2 & DAY 3 Matches (d2, d3)
    createMatchRecord('m_d2_1', 'court_alsancak_2', 'biz_alsancak', 'u_26', d2, '18:30', 90, 2550, ['u_26'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Alsancak teras maçı, hafta ortası enerjisi.'
    });

    createMatchRecord('m_d2_2', 'court_bornova_2', 'biz_bornova', 'u_27', d2, '20:00', 90, 1950, ['u_27', 'u_28', 'u_29'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MIXED',
      minElo: 1400,
      maxElo: 1700
    });

    createMatchRecord('m_d3_1', 'court_urla_1', 'biz_urla', 'u_30', d3, '19:00', 90, 2100, ['u_30', 'u_1'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED'
    });

    // 3. Nationwide Matches (İstanbul, Ankara, Antalya, Muğla, Bursa)
    // İstanbul Matches
    createMatchRecord('m_ist_1', 'court_maslak_1', 'biz_ist_maslak', 'u_2', d0, '19:00', 90, 3300, ['u_2', 'u_3'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MIXED',
      minElo: 1400,
      maxElo: 1750,
      note: 'Maslak iş çıkışı tempolu padel maçı. 2 yer boş!'
    });

    createMatchRecord('m_ist_2', 'court_kadikoy_1', 'biz_ist_kadikoy', 'u_6', d0, '20:30', 90, 3000, ['u_6', 'u_7', 'u_8'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Moda sahilde akşam maçı, son 1 oyuncu aranıyor!'
    });

    createMatchRecord('m_ist_3', 'court_maslak_2', 'biz_ist_maslak', 'u_12', d1, '18:30', 90, 3600, ['u_12'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Kapalı klimalı kortta keyifli padel. Yeni başlayanlar ve orta seviye buyursun.'
    });

    createMatchRecord('m_ist_4', 'court_gokturk_1', 'biz_ist_gokturk', 'u_14', d1, '11:00', 90, 3150, ['u_14', 'u_15'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Göktürk doğa içinde hafta sonu sabah maçı.'
    });

    createMatchRecord('m_ist_5', 'court_etiler_1', 'biz_ist_etiler', 'u_16', d0, '19:30', 90, 3900, ['u_16', 'u_17'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MIXED',
      minElo: 1400,
      maxElo: 1800,
      note: 'Etiler Center Court akşam maçı. 2 yer boş!'
    });

    createMatchRecord('m_ist_6', 'court_acarkent_1', 'biz_ist_acarkent', 'u_18', d0, '20:00', 90, 3750, ['u_18', 'u_19', 'u_20'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Acarkent Coliseum kortunda son 1 oyuncu aranıyor!'
    });

    createMatchRecord('m_ist_7', 'court_florya_1', 'biz_ist_florya', 'u_21', d1, '18:00', 90, 3300, ['u_21', 'u_22'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Florya sahil günbatımı maçı, keyifli padel.'
    });

    createMatchRecord('m_ist_8', 'court_suadiye_1', 'biz_ist_suadiye', 'u_23', d0, '18:30', 90, 3300, ['u_23', 'u_24'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Bağdat Caddesi & Suadiye sahil padel buluşması.'
    });

    createMatchRecord('m_ist_9', 'court_kemer_1', 'biz_ist_kemerburgaz', 'u_25', d1, '10:30', 90, 3300, ['u_25'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Kemerburgaz orman havasında sabah padeli.'
    });

    createMatchRecord('m_ist_10', 'court_cekmekoy_1', 'biz_ist_cekmekoy', 'u_26', d1, '19:00', 90, 2700, ['u_26', 'u_27'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MIXED',
      minElo: 1300,
      note: 'Çekmeköy yeşil doğa içinde rekabetçi maç.'
    });

    createMatchRecord('m_ist_11', 'court_beylikduzu_1', 'biz_ist_beylikduzu', 'u_28', d1, '18:30', 90, 2700, ['u_28', 'u_29'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'West Istanbul Marina kortunda deniz esintili maç.'
    });

    createMatchRecord('m_ist_12', 'court_atasehir_2', 'biz_ist_atasehir', 'u_1', d2, '20:00', 90, 3150, ['u_1', 'u_5'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Ataşehir kapalı pro kortta hafta içi akşam maçı.'
    });

    // Ankara Matches
    createMatchRecord('m_ank_1', 'court_cankaya_1', 'biz_ank_cankaya', 'u_4', d0, '18:30', 90, 2700, ['u_4', 'u_5'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Çankaya Arjantin caddesi padel buluşması. 2 kişi aranıyor!'
    });

    createMatchRecord('m_ank_2', 'court_cayyolu_1', 'biz_ank_cayyolu', 'u_9', d1, '20:00', 90, 2400, ['u_9', 'u_10', 'u_11'], {
      matchType: 'COMPETITIVE',
      genderPreference: 'MALE',
      minElo: 1350,
      note: 'Çayyolu akşam serinliğinde tempolu maç. Son 1 kişi!'
    });

    // Antalya Matches
    createMatchRecord('m_ant_1', 'court_lara_1', 'biz_ant_lara', 'u_8', d0, '20:00', 90, 2550, ['u_8', 'u_16'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Lara falezlerde günbatımı maçı. Sonrasında dinlenme alanında sohbet!'
    });

    createMatchRecord('m_ant_2', 'court_konyaalti_1', 'biz_ant_konyaalti', 'u_17', d1, '18:00', 90, 2250, ['u_17', 'u_18', 'u_19'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Konyaaltı sahil padel maçı. Son 1 kişi!'
    });

    // Muğla Bodrum Matches
    createMatchRecord('m_bod_1', 'court_bodrum_1', 'biz_mug_bodrum', 'u_21', d0, '19:00', 90, 3750, ['u_21', 'u_22'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Yalıkavak günbatımı manzaralı padel. 2 yer açık!'
    });

    // Bursa Matches
    createMatchRecord('m_bur_1', 'court_nilufer_1', 'biz_bur_nilufer', 'u_23', d0, '19:30', 90, 2100, ['u_23', 'u_24'], {
      matchType: 'CASUAL',
      genderPreference: 'MIXED',
      note: 'Özlüce Nilüfer padel maçı. 2 kişi aranıyor!'
    });

    // 6. Regular Closed Court Reservations for Panel & Schedule View
    // (Including PENDING, CONFIRMED, CANCELLED, NO_SHOW and PAID / PAY_AT_VENUE examples)
    const addRegularReservation = (
      id: string,
      courtId: string,
      businessId: string,
      ownerUserId: string,
      dateStr: string,
      startTimeStr: string,
      durationMinutes: 60 | 90 | 120,
      totalPrice: number,
      source: 'ONLINE' | 'PANEL',
      status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW',
      paymentStatus: 'PAY_AT_VENUE' | 'PAID' | 'REFUNDED'
    ) => {
      const [sh, sm] = startTimeStr.split(':').map(Number);
      const startD = new Date(`${dateStr}T${startTimeStr}:00`);
      const endD = new Date(startD.getTime() + durationMinutes * 60000);
      const endTimeStr = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`;

      this.data.reservations.push({
        id,
        courtId,
        businessId,
        ownerUserId,
        startAt: `${dateStr}T${startTimeStr}:00`,
        endAt: `${dateStr}T${endTimeStr}:00`,
        durationMinutes,
        totalPrice,
        source,
        status,
        paymentStatus,
        isOpenMatch: false,
        participantLimit: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (status !== 'CANCELLED') {
        this.data.reservation_slots.push({
          id: `${courtId}_${dateStr}_${startTimeStr}`,
          courtId,
          date: dateStr,
          startTime: startTimeStr,
          durationMinutes,
          reservationId: id
        });
      }
    };

    // Today regular reservations on Padel Arena Urla (for business owner/staff schedule)
    // 09:00 - CONFIRMED & PAID
    addRegularReservation('res_urla_1', 'court_urla_1', 'biz_urla', 'u_2', d0, '09:00', 90, 2100, 'PANEL', 'CONFIRMED', 'PAID');
    // 11:00 - PENDING (Bekliyor)
    addRegularReservation('res_urla_2', 'court_urla_2', 'biz_urla', 'u_3', d0, '11:00', 90, 2400, 'ONLINE', 'PENDING', 'PAY_AT_VENUE');
    // 13:00 - NO_SHOW (Gelmedi)
    addRegularReservation('res_urla_3', 'court_urla_3', 'biz_urla', 'u_4', d0, '13:00', 60, 1200, 'ONLINE', 'NO_SHOW', 'PAY_AT_VENUE');
    // 14:30 - CANCELLED (İptal)
    addRegularReservation('res_urla_4', 'court_urla_1', 'biz_urla', 'u_6', d0, '14:30', 90, 2100, 'ONLINE', 'CANCELLED', 'REFUNDED');
    // 19:30 - CONFIRMED & PAY_AT_VENUE (Tesiste Ödenecek)
    addRegularReservation('res_urla_5', 'court_urla_3', 'biz_urla', 'u_8', d0, '19:30', 90, 1800, 'ONLINE', 'CONFIRMED', 'PAY_AT_VENUE');

    // 7. Court Blocks (Maintenance or Special Tournament on Kort 2)
    this.data.court_blocks.push({
      id: 'block_urla_1',
      courtId: 'court_urla_2',
      businessId: 'biz_urla',
      startAt: `${d0}T14:00:00`,
      endAt: `${d0}T16:30:00`,
      reason: 'BAKIM',
      reasonNote: 'Cam paneller ve file gergi bakımı',
      createdByUserId: 'user_owner_demo',
      createdAt: new Date().toISOString()
    });

    // 8. Sample Conversations & Messages
    this.data.conversations = [
      {
        id: 'conv_1',
        matchId: 'm_today_7',
        title: 'Padel Arena Urla - Dostluk Maçı',
        lastMessage: 'Raketleri getirmeyen varsa tesisten kiralayabiliriz.',
        updatedAt: new Date().toISOString(),
        participantIds: ['user_player_demo', 'u_16', 'u_17']
      }
    ];

    this.data.messages = [
      {
        id: 'msg_1',
        conversationId: 'conv_1',
        senderUserId: 'user_player_demo',
        senderName: 'Baha Ç.',
        text: 'Selamlar herkese, bugün 16:00 maçında görüşmek üzere!',
        createdAt: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'msg_2',
        conversationId: 'conv_1',
        senderUserId: 'u_16',
        senderName: 'İrem A.',
        text: 'Selam Baha! Ben biraz erken gelip ısınacağım.',
        createdAt: new Date(Date.now() - 1800000).toISOString()
      },
      {
        id: 'msg_3',
        conversationId: 'conv_1',
        senderUserId: 'u_17',
        senderName: 'Alp T.',
        text: 'Raketleri getirmeyen varsa tesisten kiralayabiliriz.',
        createdAt: new Date(Date.now() - 600000).toISOString()
      }
    ];

    // 9. Notifications
    this.data.notifications = [
      {
        id: 'notif_1',
        userId: 'user_player_demo',
        title: 'Maçınız Onaylandı',
        message: 'Bugün 16:00 Padel Arena Urla maçınız onaylandı.',
        read: false,
        type: 'MATCH_APPROVED',
        createdAt: new Date(Date.now() - 7200000).toISOString()
      },
      {
        id: 'notif_2',
        userId: 'user_player_demo',
        title: 'Yeni Oyuncu Katıldı',
        message: 'Alp T. maçınıza 3. oyuncu olarak katıldı.',
        read: true,
        type: 'MATCH_JOIN',
        createdAt: new Date(Date.now() - 3600000).toISOString()
      }
    ];

    // 10. Community Feed Posts
    this.data.feed_posts = this.generateInitialFeedPosts();

    console.log('Seed data successfully generated with Izmir padel businesses, courts, and relative matches.');
  }

  public generateInitialFeedPosts(): FeedPost[] {
    const now = Date.now();
    return [
      {
        id: 'post_1',
        userId: 'u_17',
        authorName: 'Alp Turgut',
        authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        authorElo: 1520,
        authorPlaySide: 'BOTH',
        category: 'OYUNCU_ARIYORUM',
        content: 'Urla Padel Arena\'da bu akşam 19:30 maçı için 4. oyuncu arıyoruz! 1350-1550 Elo arası seviyesi denk keyifli bir dostluk maçı olacak. Katılmak isteyen varsa açık maçlar listesinden veya buradan yazabilir 🎾',
        venueName: 'Padel Arena Urla',
        likes: ['user_player_demo', 'u_14', 'u_12'],
        replies: [
          {
            id: 'rep_1',
            postId: 'post_1',
            userId: 'u_14',
            authorName: 'Caner S.',
            authorAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
            authorElo: 1420,
            content: 'Ben sol kanatta oynuyorum, kadroda yer varsa katıldım!',
            createdAt: new Date(now - 1800000).toISOString()
          },
          {
            id: 'rep_2',
            postId: 'post_1',
            userId: 'u_17',
            authorName: 'Alp Turgut',
            authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
            authorElo: 1520,
            content: 'Süper Caner, açık maç sayfasında koltuğun açık, oradan rezervasyona dahil olabilirsin!',
            createdAt: new Date(now - 1200000).toISOString()
          }
        ],
        createdAt: new Date(now - 7200000).toISOString()
      },
      {
        id: 'post_2',
        userId: 'u_11',
        authorName: 'Deniz Vural',
        authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
        authorElo: 1380,
        authorPlaySide: 'RIGHT',
        category: 'SOHBET',
        content: 'İzmir\'de rüzgarlı günlerde açık panoramik kortta lob atmak gerçekten cesaret istiyor 😄 Rüzgar arkadayken lob yerine ayak ucuna alçak vuruş (chiquita) taktiğini deneyen var mı?',
        venueName: 'Alaçatı Padel Club',
        likes: ['user_player_demo', 'u_10', 'u_15'],
        replies: [
          {
            id: 'rep_3',
            postId: 'post_2',
            userId: 'user_player_demo',
            authorName: 'Baha Çavuşoğlu',
            authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            authorElo: 1450,
            content: 'Kesinlikle! Rüzgara karşı oynarken yüksek top intihar gibi, hızlı bandeja veya alçak dilim vuruşlar camdan çok daha zor dönüyor.',
            createdAt: new Date(now - 3600000).toISOString()
          }
        ],
        createdAt: new Date(now - 14400000).toISOString()
      },
      {
        id: 'post_3',
        userId: 'user_owner_demo',
        authorName: 'Kemal Demir (Padel Arena Urla)',
        authorAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        authorElo: 1620,
        authorPlaySide: 'BOTH',
        category: 'MAC_DUYURUSU',
        content: 'Bu Cumartesi Padel Arena Urla\'da 16 çiftlik dostluk turnuvası düzenliyoruz! İkramlar, müzik ve kort başı özel ödüllerimiz olacak. Katılmak isteyen çiftler kayıt yaptırabilir 🏆🎾',
        venueName: 'Padel Arena Urla',
        likes: ['user_player_demo', 'u_12', 'u_13', 'u_16', 'u_17'],
        replies: [],
        createdAt: new Date(now - 21600000).toISOString()
      },
      {
        id: 'post_4',
        userId: 'u_10',
        authorName: 'Selin Kaya',
        authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        authorElo: 1290,
        authorPlaySide: 'LEFT',
        category: 'EKIPMAN',
        content: 'Nox ML10 Pro Cup ile Bullpadel Vertex arasında kaldım. Orta seviye kontrol odaklı oynayan biri için hangi raket daha affedici olur? Tavsiyelerinize açığım.',
        likes: ['u_14', 'u_11'],
        replies: [
          {
            id: 'rep_4',
            postId: 'post_4',
            userId: 'u_12',
            authorName: 'Murat Berk',
            authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
            authorElo: 1480,
            content: 'ML10 yuvarlak kafa yapısı ve geniş tatlı noktası ile kesinlikle daha kontrollü ve dirseği yormayan bir raket Selin.',
            createdAt: new Date(now - 18000000).toISOString()
          }
        ],
        createdAt: new Date(now - 28800000).toISOString()
      }
    ];
  }

  // Database Accessors
  public getUsers(): User[] { return this.data.users; }
  public getBusinesses(): Business[] { return this.data.businesses; }
  public getCourts(): Court[] { return this.data.courts; }
  public getReservations(): Reservation[] { return this.data.reservations; }
  public getReservationSlots(): ReservationSlot[] { return this.data.reservation_slots; }
  public getOpenMatchParticipants(): OpenMatchParticipant[] { return this.data.open_match_participants; }
  public getOpenMatchWaitlists(): OpenMatchWaitlist[] { return this.data.open_match_waitlists; }
  public getCourtBlocks(): CourtBlock[] { return this.data.court_blocks; }
  public getStaffMemberships(): StaffMembership[] { return this.data.staff_memberships; }
  public getMessages(): Message[] { return this.data.messages; }
  public getConversations(): Conversation[] { return this.data.conversations; }
  public getNotifications(userId: string): Notification[] { 
    return this.data.notifications.filter(n => n.userId === userId); 
  }
  public getFeedPosts(): FeedPost[] {
    if (!this.data.feed_posts) {
      this.data.feed_posts = [];
    }
    return this.data.feed_posts;
  }

  public addNotification(notif: Omit<Notification, 'id' | 'createdAt' | 'read'>): Notification {
    const newNotif: Notification = {
      ...notif,
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      read: false,
      createdAt: new Date().toISOString()
    };
    this.data.notifications.unshift(newNotif);
    this.save();
    return newNotif;
  }

  public markNotificationRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find(n => n.id === id && n.userId === userId);
    if (notif) {
      notif.read = true;
      this.save();
      return true;
    }
    return false;
  }

  public markAllNotificationsRead(userId: string): boolean {
    this.data.notifications.forEach(n => {
      if (n.userId === userId) {
        n.read = true;
      }
    });
    this.save();
    return true;
  }

  public checkAndTrigger2HourReminders(userId: string): { sent: boolean; notification?: Notification; match?: any } {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { sent: false };

    // Default true if not explicitly set to false
    if (user.pushNotificationsEnabled === false || user.reminder2HoursBefore === false) {
      return { sent: false };
    }

    const reservations = this.data.reservations;
    const participants = this.data.open_match_participants;
    const courts = this.data.courts;
    const businesses = this.data.businesses;

    const userMatchIds = new Set(participants.filter(p => p.userId === userId).map(p => p.reservationId));
    const userReservations = reservations.filter(r => 
      (r.ownerUserId === userId || userMatchIds.has(r.id)) && 
      (r.status === 'CONFIRMED' || r.status === 'PENDING')
    );

    const now = Date.now();
    for (const res of userReservations) {
      const matchTimeMs = new Date(res.startAt).getTime();
      const diffMs = matchTimeMs - now;
      
      // Window: between now and 2 hours + 15 min tolerance
      if (diffMs > 0 && diffMs <= (2 * 3600 * 1000 + 15 * 60 * 1000)) {
        const reminderKey = `${userId}_${res.id}_2h`;
        if (!this.sent2HourReminders.has(reminderKey)) {
          this.sent2HourReminders.add(reminderKey);

          const court = courts.find(c => c.id === res.courtId) || courts[0];
          const business = court ? businesses.find(b => b.id === court.businessId) : businesses[0];
          const timeStr = res.startAt.split('T')[1]?.slice(0, 5) || '18:00';
          const dateStr = new Date(res.startAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

          const notif = this.addNotification({
            userId,
            title: '⏰ Maçınıza 2 Saat Kaldı!',
            message: `${dateStr} saat ${timeStr}'te "${court?.name || 'Kort'}" (${business?.name || 'Padel Kulübü'}) maçınız 2 saat sonra başlıyor. Ekipmanlarınızı hazırlayın ve yola çıkmayı planlayın!`,
            type: 'MATCH_REMINDER_2H',
            matchId: res.id,
            courtId: court?.id
          });

          return {
            sent: true,
            notification: notif,
            match: {
              ...res,
              court,
              business,
              matchTime: timeStr,
              matchDate: dateStr
            }
          };
        }
      }
    }

    return { sent: false };
  }

  public simulate2HourReminder(userId: string, matchId?: string): { success: boolean; notification: Notification; match: any } {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    const reservations = this.data.reservations;
    const participants = this.data.open_match_participants;
    const courts = this.data.courts;
    const businesses = this.data.businesses;

    let targetRes = matchId ? reservations.find(r => r.id === matchId) : undefined;

    if (!targetRes) {
      // Find user's upcoming match
      const userMatchIds = new Set(participants.filter(p => p.userId === userId).map(p => p.reservationId));
      const nowIso = nowLocal();
      const userUpcoming = reservations
        .filter(r => (r.ownerUserId === userId || userMatchIds.has(r.id)) && r.status !== 'CANCELLED' && r.startAt >= nowIso)
        .sort((a, b) => a.startAt.localeCompare(b.startAt));

      if (userUpcoming.length > 0) {
        targetRes = userUpcoming[0];
      } else {
        // Fallback to any confirmed match or the first seed reservation
        targetRes = reservations.find(r => r.status === 'CONFIRMED' && r.startAt >= nowIso) || reservations[0];
      }
    }

    const court = courts.find(c => c.id === targetRes?.courtId) || courts[0];
    const business = court ? businesses.find(b => b.id === court.businessId) : businesses[0];

    // Compute simulation timing (display as 2 hours from now if the actual match start is further or past)
    const twoHoursFromNow = new Date(Date.now() + 2 * 3600 * 1000);
    const simTime = twoHoursFromNow.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const simDate = twoHoursFromNow.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

    const newNotif = this.addNotification({
      userId,
      title: '⏰ Maçınıza 2 Saat Kaldı!',
      message: `Bugün saat ${simTime}'te "${court?.name || 'Kort'}" (${business?.name || 'Padel Kulübü'}) maçınız 2 saat sonra başlıyor. Raketinizi hazırlayın ve yola çıkmayı planlayın!`,
      type: 'MATCH_REMINDER_2H',
      matchId: targetRes?.id,
      courtId: court?.id
    });

    return {
      success: true,
      notification: newNotif,
      match: {
        ...(targetRes || {}),
        court,
        business,
        matchTime: simTime,
        matchDate: simDate
      }
    };
  }

  public updateUserNotificationSettings(userId: string, settings: {
    pushNotificationsEnabled?: boolean;
    reminder2HoursBefore?: boolean;
    notificationSoundEnabled?: boolean;
  }): User {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    if (settings.pushNotificationsEnabled !== undefined) {
      user.pushNotificationsEnabled = settings.pushNotificationsEnabled;
    }
    if (settings.reminder2HoursBefore !== undefined) {
      user.reminder2HoursBefore = settings.reminder2HoursBefore;
    }
    if (settings.notificationSoundEnabled !== undefined) {
      user.notificationSoundEnabled = settings.notificationSoundEnabled;
    }

    this.save();
    return user;
  }

  public toggleFriend(userId: string, targetUserId: string): { isFriend: boolean; friends: string[] } {
    const user = this.data.users.find(u => u.id === userId);
    const targetUser = this.data.users.find(u => u.id === targetUserId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    if (!user.friends) user.friends = [];
    const idx = user.friends.indexOf(targetUserId);
    let isFriend = false;
    if (idx >= 0) {
      user.friends.splice(idx, 1);
      isFriend = false;
    } else {
      user.friends.push(targetUserId);
      isFriend = true;
      // Send notification to target user
      if (targetUser) {
        this.addNotification({
          userId: targetUserId,
          title: 'Yeni Arkadaşlık 👋',
          message: `${user.displayName || user.maskedName} sizi arkadaş olarak ekledi.`,
          type: 'FRIEND_ADD',
          senderId: user.id,
          senderName: user.displayName || user.maskedName
        });
      }
    }
    this.save();
    return { isFriend, friends: user.friends };
  }

  public getFriends(userId: string): User[] {
    const user = this.data.users.find(u => u.id === userId);
    if (!user || !user.friends) return [];
    return this.data.users.filter(u => user.friends!.includes(u.id));
  }

  public inviteFriendToMatch(sender: User, friendUserId: string, matchId: string): { success: boolean; error?: string } {
    const match = this.data.reservations.find(r => r.id === matchId);
    if (!match) return { success: false, error: 'Açık maç bulunamadı.' };

    const court = this.data.courts.find(c => c.id === match.courtId);
    const biz = this.data.businesses.find(b => b.id === match.businessId);
    const courtName = court ? court.name : 'Padel Kortu';
    const bizName = biz ? biz.name : 'Padel Tesisi';

    this.addNotification({
      userId: friendUserId,
      title: 'Maç Daveti Geldi! 🎾',
      message: `${sender.displayName || sender.maskedName} sizi "${bizName} - ${courtName}" maçına davet etti!`,
      type: 'MATCH_INVITE',
      matchId: matchId,
      senderId: sender.id,
      senderName: sender.displayName || sender.maskedName
    });

    return { success: true };
  }

  // ATOMIC RESERVATION CONFLICT CHECK
  public isSlotAvailable(courtId: string, startAt: string, endAt: string, excludeReservationId?: string): boolean {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();

    // 1. Check existing reservations
    const conflictRes = this.data.reservations.find(r => {
      if (r.courtId !== courtId) return false;
      if (r.status === 'CANCELLED') return false;
      if (excludeReservationId && r.id === excludeReservationId) return false;
      const rStart = new Date(r.startAt).getTime();
      const rEnd = new Date(r.endAt).getTime();
      // Overlap condition: start < rEnd && end > rStart
      return startMs < rEnd && endMs > rStart;
    });

    if (conflictRes) return false;

    // 2. Check court blocks
    const conflictBlock = this.data.court_blocks.find(b => {
      if (b.courtId !== courtId) return false;
      const bStart = new Date(b.startAt).getTime();
      const bEnd = new Date(b.endAt).getTime();
      return startMs < bEnd && endMs > bStart;
    });

    if (conflictBlock) return false;

    return true;
  }

  // Atomic Create Reservation
  public createReservationAtomic(params: {
    courtId: string;
    businessId: string;
    ownerUserId: string;
    startAt: string;
    endAt: string;
    durationMinutes: 60 | 90 | 120;
    totalPrice: number;
    source: 'ONLINE' | 'PANEL';
    isOpenMatch: boolean;
    openMatchNote?: string;
    participantLimit?: number;
    minElo?: number;
    maxElo?: number;
    matchType?: 'CASUAL' | 'COMPETITIVE';
    genderPreference?: 'MIXED' | 'FEMALE' | 'MALE' | 'ANY';
    approvalRequired?: boolean;
    paymentStatus?: 'PAY_AT_VENUE' | 'PAID';
  }): { success: boolean; reservation?: Reservation; error?: string } {
    const { courtId, businessId, ownerUserId, startAt, endAt, durationMinutes, totalPrice, source, isOpenMatch } = params;

    // Verify availability
    if (!this.isSlotAvailable(courtId, startAt, endAt)) {
      return { 
        success: false, 
        error: 'Seçilen kort ve saat aralığında başka bir rezervasyon veya blokaj bulunmaktadır.' 
      };
    }

    const reservationId = `res_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newReservation: Reservation = {
      id: reservationId,
      courtId,
      businessId,
      ownerUserId,
      startAt,
      endAt,
      durationMinutes,
      totalPrice,
      source,
      status: 'CONFIRMED',
      paymentStatus: params.paymentStatus || 'PAY_AT_VENUE',
      isOpenMatch: !!isOpenMatch,
      openMatchNote: params.openMatchNote || (isOpenMatch ? 'ArenaMate açık maçı' : ''),
      participantLimit: params.participantLimit || 4,
      minElo: params.minElo,
      maxElo: params.maxElo,
      matchType: params.matchType || 'CASUAL',
      genderPreference: params.genderPreference || 'MIXED',
      approvalRequired: params.approvalRequired || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.reservations.push(newReservation);

    // Lock slot
    const dateStr = startAt.split('T')[0];
    const timeStr = startAt.split('T')[1].substring(0, 5);
    this.data.reservation_slots.push({
      id: `${courtId}_${dateStr}_${timeStr}`,
      courtId,
      date: dateStr,
      startTime: timeStr,
      durationMinutes,
      reservationId
    });

    // If open match, add owner as slotIndex 0
    if (isOpenMatch) {
      const ownerUser = this.data.users.find(u => u.id === ownerUserId);
      this.data.open_match_participants.push({
        id: `omp_${reservationId}_${ownerUserId}`,
        reservationId,
        userId: ownerUserId,
        slotIndex: 0,
        status: 'ACTIVE',
        joinedAt: new Date().toISOString(),
        userMaskedName: ownerUser ? ownerUser.maskedName : 'Organizatör',
        userElo: ownerUser ? ownerUser.elo : 1400,
        userAvatar: ownerUser ? ownerUser.avatarUrl : '',
        userPlaySide: ownerUser ? ownerUser.playSide : 'BOTH',
        userDominantHand: ownerUser ? ownerUser.dominantHand : 'RIGHT'
      });
    }

    this.save();
    return { success: true, reservation: newReservation };
  }

  // Open Match Join
  public joinOpenMatch(matchId: string, user: User): { success: boolean; error?: string; status?: string } {
    const match = this.data.reservations.find(r => r.id === matchId && r.isOpenMatch);
    if (!match) {
      return { success: false, error: 'Açık maç bulunamadı.' };
    }

    if (match.status === 'CANCELLED') {
      return { success: false, error: 'Bu maç iptal edilmiştir.' };
    }

    // Check time restriction (< 30 mins)
    const matchStart = new Date(match.startAt).getTime();
    if (matchStart - Date.now() < 30 * 60 * 1000) {
      return { success: false, error: 'Maç başlama saatine 30 dakikadan az süre kaldığı için yeni katılım kapatılmıştır.' };
    }

    // Check duplicate participation
    const alreadyJoined = this.data.open_match_participants.some(p => p.reservationId === matchId && p.userId === user.id);
    if (alreadyJoined) {
      return { success: false, error: 'Bu maça zaten katılmış durumdasınız.' };
    }

    // Check Elo bounds
    if (match.minElo && user.elo < match.minElo) {
      return { 
        success: false, 
        error: `Bu maç için minimum Elo sınırı ${match.minElo}'dir. Sizin Elo puanınız: ${user.elo}.` 
      };
    }
    if (match.maxElo && user.elo > match.maxElo) {
      return { 
        success: false, 
        error: `Bu maç için maksimum Elo sınırı ${match.maxElo}'dir. Sizin Elo puanınız: ${user.elo}.` 
      };
    }

    // Active participants count
    const activeParticipants = this.data.open_match_participants.filter(p => p.reservationId === matchId && p.status === 'ACTIVE');
    if (activeParticipants.length >= 4) {
      return { success: false, error: 'Maçın 4 koltuğu da doludur. Bekleme listesine katılabilirsiniz.' };
    }

    // Determine slot index
    const usedSlots = new Set(activeParticipants.map(p => p.slotIndex));
    let nextSlot = 0;
    for (let i = 0; i < 4; i++) {
      if (!usedSlots.has(i)) {
        nextSlot = i;
        break;
      }
    }

    const initialStatus = match.approvalRequired ? 'PENDING_APPROVAL' : 'ACTIVE';

    this.data.open_match_participants.push({
      id: `omp_${matchId}_${user.id}`,
      reservationId: matchId,
      userId: user.id,
      slotIndex: nextSlot,
      status: initialStatus,
      joinedAt: new Date().toISOString(),
      userMaskedName: user.maskedName,
      userElo: user.elo,
      userAvatar: user.avatarUrl,
      userPlaySide: user.playSide,
      userDominantHand: user.dominantHand
    });

    // Notify other active session participants
    const court = this.data.courts.find(c => c.id === match.courtId);
    const courtName = court ? court.name : 'Padel Kortu';
    const biz = this.data.businesses.find(b => b.id === match.businessId);
    const venueName = biz ? biz.name : 'Kort';

    activeParticipants.forEach(p => {
      if (p.userId !== user.id) {
        this.addNotification({
          userId: p.userId,
          title: 'Maça Katılım 🎾',
          message: `${user.displayName || user.maskedName} (${user.elo} Elo), ${venueName} - ${courtName} maç oturumuna katıldı!`,
          type: 'MATCH_JOIN',
          matchId: matchId,
          senderId: user.id,
          senderName: user.displayName || user.maskedName
        });
      }
    });

    this.save();
    return { success: true, status: initialStatus };
  }

  // Leave Open Match
  public leaveOpenMatch(matchId: string, userId: string): { success: boolean; promotedUserId?: string; error?: string } {
    const partIndex = this.data.open_match_participants.findIndex(p => p.reservationId === matchId && p.userId === userId);
    if (partIndex === -1) {
      return { success: false, error: 'Bu maçta kaydınız bulunmamaktadır.' };
    }

    const removed = this.data.open_match_participants.splice(partIndex, 1)[0];

    // Notify all remaining participants in the session
    const remaining = this.data.open_match_participants.filter(p => p.reservationId === matchId && p.userId !== userId && p.status === 'ACTIVE');
    const leavingUser = this.data.users.find(u => u.id === userId);
    const leaverName = leavingUser ? (leavingUser.displayName || leavingUser.maskedName) : 'Bir oyuncu';
    const match = this.data.reservations.find(r => r.id === matchId);
    const court = this.data.courts.find(c => c.id === match?.courtId);
    const courtName = court ? court.name : 'Padel Kortu';

    remaining.forEach(p => {
      this.addNotification({
        userId: p.userId,
        title: 'Maçtan Oyuncu Ayrıldı ⚠️',
        message: `${leaverName} ${courtName} maç oturumundan ayrıldı. Koltuk yeniden boşa çıktı.`,
        type: 'MATCH_LEAVE',
        matchId: matchId,
        senderId: userId,
        senderName: leaverName
      });
    });

    // Check if there is a waitlist to promote
    const waitlist = this.data.open_match_waitlists
      .filter(w => w.reservationId === matchId)
      .sort((a, b) => a.position - b.position);

    let promotedUserId: string | undefined;

    if (waitlist.length > 0) {
      const topWaitlist = waitlist[0];
      // remove from waitlist
      this.data.open_match_waitlists = this.data.open_match_waitlists.filter(w => w.id !== topWaitlist.id);
      
      const promotedUser = this.data.users.find(u => u.id === topWaitlist.userId);
      if (promotedUser) {
        this.data.open_match_participants.push({
          id: `omp_${matchId}_${promotedUser.id}`,
          reservationId: matchId,
          userId: promotedUser.id,
          slotIndex: removed.slotIndex,
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
          userMaskedName: promotedUser.maskedName,
          userElo: promotedUser.elo,
          userAvatar: promotedUser.avatarUrl,
          userPlaySide: promotedUser.playSide,
          userDominantHand: promotedUser.dominantHand
        });
        promotedUserId = promotedUser.id;
      }
    }

    this.save();
    return { success: true, promotedUserId };
  }

  /** Players ranked by Elo (desc), ties broken by match count. */
  public getLeaderboard(limit: number = 50): User[] {
    return this.data.users
      .filter(u => u.role === 'OYUNCU' && typeof u.elo === 'number')
      .sort((a, b) => b.elo - a.elo || b.matchesCount - a.matchesCount)
      .slice(0, limit);
  }

  public getCancellationWindowHours(businessId: string): number {
    const hours = this.data.businesses.find(b => b.id === businessId)?.cancellationWindowHours;
    return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_CANCELLATION_WINDOW_HOURS;
  }

  /** Player cancels their own booking; allowed only while start is more than the club's window away. */
  public cancelReservationByOwner(reservationId: string, userId: string, nowMs: number = Date.now()): {
    success: boolean; status?: number; error?: string; reservation?: Reservation; notifiedUserIds?: string[]
  } {
    const reservation = this.data.reservations.find(r => r.id === reservationId);
    if (!reservation || reservation.ownerUserId !== userId) {
      return { success: false, status: 404, error: 'Rezervasyon bulunamadı.' };
    }
    if (reservation.status === 'CANCELLED') {
      return { success: false, status: 409, error: 'Bu rezervasyon zaten iptal edilmiş.' };
    }

    const windowHours = this.getCancellationWindowHours(reservation.businessId);
    const msUntilStart = new Date(reservation.startAt).getTime() - nowMs;
    if (msUntilStart <= windowHours * 60 * 60 * 1000) {
      return {
        success: false,
        status: 409,
        error: `İptal süresi doldu. Bu kulüpte rezervasyonlar başlama saatinden en geç ${windowHours} saat önce iptal edilebilir. Lütfen kulüple iletişime geçin.`
      };
    }

    reservation.status = 'CANCELLED';
    reservation.updatedAt = new Date().toISOString();
    this.data.reservation_slots = this.data.reservation_slots.filter(s => s.reservationId !== reservationId);

    const notifiedUserIds: string[] = [];
    if (reservation.isOpenMatch) {
      const owner = this.data.users.find(u => u.id === userId);
      const ownerName = owner ? (owner.displayName || owner.maskedName) : 'Organizatör';
      const court = this.data.courts.find(c => c.id === reservation.courtId);
      const courtName = court ? court.name : 'Padel Kortu';
      this.data.open_match_participants
        .filter(p => p.reservationId === reservationId && p.userId !== userId)
        .forEach(p => {
          notifiedUserIds.push(p.userId);
          this.addNotification({
            userId: p.userId,
            title: 'Maç İptal Edildi',
            message: `${ownerName}, ${courtName} için ${reservation.startAt.replace('T', ' ').slice(0, 16)} açık maçını iptal etti.`,
            type: 'RESERVATION_UPDATE',
            matchId: reservationId,
            senderId: userId,
            senderName: ownerName
          });
        });
      this.data.open_match_waitlists = this.data.open_match_waitlists.filter(w => w.reservationId !== reservationId);
    }

    this.save();
    return { success: true, reservation, notifiedUserIds };
  }

  // Waitlist Join / Leave
  public toggleWaitlist(matchId: string, user: User): { success: boolean; action: 'JOINED' | 'LEFT'; error?: string } {
    const existingIndex = this.data.open_match_waitlists.findIndex(w => w.reservationId === matchId && w.userId === user.id);
    if (existingIndex >= 0) {
      this.data.open_match_waitlists.splice(existingIndex, 1);
      this.save();
      return { success: true, action: 'LEFT' };
    }

    const currentWaitlist = this.data.open_match_waitlists.filter(w => w.reservationId === matchId);
    this.data.open_match_waitlists.push({
      id: `omw_${matchId}_${user.id}`,
      reservationId: matchId,
      userId: user.id,
      position: currentWaitlist.length + 1,
      requestedAt: new Date().toISOString(),
      userMaskedName: user.maskedName,
      userElo: user.elo
    });

    this.save();
    return { success: true, action: 'JOINED' };
  }

  // Create Court Block
  public createCourtBlock(courtId: string, businessId: string, startAt: string, endAt: string, reason: any, reasonNote?: string, createdByUserId: string = 'user_owner_demo'): { success: boolean; block?: CourtBlock; error?: string } {
    // Check conflicts
    if (!this.isSlotAvailable(courtId, startAt, endAt)) {
      return { success: false, error: 'Seçilen zaman diliminde aktif bir rezervasyon veya blokaj bulunmaktadır.' };
    }

    const block: CourtBlock = {
      id: `block_${Date.now()}`,
      courtId,
      businessId,
      startAt,
      endAt,
      reason,
      reasonNote,
      createdByUserId,
      createdAt: new Date().toISOString()
    };

    this.data.court_blocks.push(block);
    this.save();
    return { success: true, block };
  }

  /** KVKK account deletion: removes the user's personal data and releases their bookings. */
  public deleteUserAccount(userId: string): { success: boolean; error?: string } {
    const ownsBusiness = this.data.staff_memberships.some(s => s.userId === userId && s.role === 'ISLETME_SAHIBI');
    if (ownsBusiness) {
      return { success: false, error: 'İşletme sahibi hesapları uygulama içinden silinemez. Lütfen destek ekibiyle iletişime geçin.' };
    }

    const now = nowLocal();

    // Leave other players' open matches (promotes their waitlist)
    const joinedMatchIds = this.data.open_match_participants
      .filter(p => p.userId === userId)
      .map(p => p.reservationId)
      .filter(id => this.data.reservations.find(r => r.id === id)?.ownerUserId !== userId);
    joinedMatchIds.forEach(matchId => this.leaveOpenMatch(matchId, userId));
    this.data.open_match_waitlists = this.data.open_match_waitlists.filter(w => w.userId !== userId);

    // Cancel the user's upcoming bookings; past ones stay for the venue's records
    const cancelledIds = new Set<string>();
    this.data.reservations.forEach(r => {
      if (r.ownerUserId === userId && r.startAt > now && r.status !== 'CANCELLED') {
        r.status = 'CANCELLED';
        r.updatedAt = new Date().toISOString();
        cancelledIds.add(r.id);
      }
    });
    this.data.reservation_slots = this.data.reservation_slots.filter(s => !cancelledIds.has(s.reservationId));
    this.data.open_match_participants
      .filter(p => cancelledIds.has(p.reservationId) && p.userId !== userId)
      .forEach(p => this.addNotification({
        userId: p.userId,
        title: 'Maç İptal Edildi',
        message: 'Katıldığınız bir açık maç, organizatörün hesabını silmesi nedeniyle iptal edildi.',
        type: 'RESERVATION_UPDATE',
        matchId: p.reservationId
      }));
    this.data.open_match_participants = this.data.open_match_participants
      .filter(p => p.userId !== userId && !cancelledIds.has(p.reservationId));

    // Messages and conversations; conversations left with fewer than two people are removed
    this.data.messages = this.data.messages.filter(m => m.senderUserId !== userId);
    const emptiedConversationIds = new Set<string>();
    this.data.conversations.forEach(c => {
      if (!c.participantIds.includes(userId)) return;
      c.participantIds = c.participantIds.filter(id => id !== userId);
      if (c.participantIds.length < 2) emptiedConversationIds.add(c.id);
    });
    this.data.conversations = this.data.conversations.filter(c => !emptiedConversationIds.has(c.id));
    this.data.messages = this.data.messages.filter(m => !emptiedConversationIds.has(m.conversationId));

    // Notifications, social feed, friend lists and staff role
    this.data.notifications = this.data.notifications.filter(n => n.userId !== userId && n.senderId !== userId);
    this.data.feed_posts = this.getFeedPosts().filter(p => p.userId !== userId);
    this.data.feed_posts.forEach(p => {
      p.replies = p.replies.filter(r => r.userId !== userId);
      p.likes = p.likes.filter(id => id !== userId);
    });
    this.data.users.forEach(u => {
      if (u.friends) u.friends = u.friends.filter(id => id !== userId);
    });
    this.data.staff_memberships = this.data.staff_memberships.filter(s => s.userId !== userId);
    this.data.credentials = this.data.credentials.filter(c => c.id !== userId);
    this.data.auth_tokens = this.data.auth_tokens.filter(t => t.userId !== userId);
    this.data.users = this.data.users.filter(u => u.id !== userId);

    this.save();
    return { success: true };
  }

  // Delete Court Block
  public deleteCourtBlock(blockId: string): boolean {
    const initialLen = this.data.court_blocks.length;
    this.data.court_blocks = this.data.court_blocks.filter(b => b.id !== blockId);
    if (this.data.court_blocks.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }
}

export const dbStore = new ArenaStore();
