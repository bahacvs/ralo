// Translations between the relational schema (lowercase enums, kurus, timestamptz, uuid) and the
// API shapes the React app consumes (src/types/index.ts). SQL fragments here are trusted constants.
import type {
  User, Business, Court, CourtType, Reservation, ReservationStatus, PaymentStatus,
  OpenMatchParticipant, OpenMatchWaitlist, CourtBlock, CourtBlockReason, Notification, FeedCategory,
  PlaySide, DominantHand, StaffMembership
} from '../../src/types/index.js';

/** SQL: timestamptz expression as Istanbul local 'YYYY-MM-DDTHH:mm:ss'. */
export const localTs = (expr: string) => `to_char(${expr} AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS')`;
/** SQL: naive Istanbul local timestamp parameter ('YYYY-MM-DDTHH:mm:ss') as timestamptz. */
export const fromLocal = (param: string) => `(${param}::timestamp AT TIME ZONE 'Europe/Istanbul')`;

export const kurusToTl = (kurus: number | null | undefined) => Math.round(Number(kurus) || 0) / 100;
export const tlToKurus = (tl: number) => Math.round(tl * 100);

export function iso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function upper<T extends string>(value: string | null | undefined, fallback: T): T {
  return (value ? value.toUpperCase() : fallback) as T;
}

// -------------------------------------------------------------
// Enums
// -------------------------------------------------------------

const COURT_TYPES: Record<string, CourtType> = {
  outdoor_panoramic: 'OUTDOOR_PANORAMIC',
  indoor_panoramic: 'INDOOR_PANORAMIC',
  outdoor_standard: 'OUTDOOR_STANDARD',
  indoor_standard: 'INDOOR_STANDARD'
};
export const courtTypeToDb = (type: unknown): string | null =>
  Object.entries(COURT_TYPES).find(([, api]) => api === type)?.[0] ?? null;

const PAYMENT_TO_API: Record<string, PaymentStatus> = { unpaid: 'PAY_AT_VENUE', paid: 'PAID', refunded: 'REFUNDED' };
export const paymentStatusToDb = (status: unknown): string | null =>
  Object.entries(PAYMENT_TO_API).find(([, api]) => api === status)?.[0] ?? null;

export const RESERVATION_STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'];
export const reservationStatusToDb = (status: ReservationStatus) => status.toLowerCase();

const BLOCK_REASONS: Record<string, CourtBlockReason> = {
  maintenance: 'BAKIM', private_event: 'OZEL_ETKINLIK', tournament: 'TURNUVA', other: 'DIGER'
};
export const blockReasonToDb = (reason: unknown): string | null =>
  Object.entries(BLOCK_REASONS).find(([, api]) => api === reason)?.[0] ?? null;

const FEED_CATEGORIES: Record<string, FeedCategory> = {
  chat: 'SOHBET', looking_for_players: 'OYUNCU_ARIYORUM', match_announcement: 'MAC_DUYURUSU', equipment: 'EKIPMAN'
};
export const feedCategoryToApi = (category: string): FeedCategory => FEED_CATEGORIES[category] ?? 'SOHBET';
export const feedCategoryToDb = (category: unknown): string | null =>
  Object.entries(FEED_CATEGORIES).find(([, api]) => api === category)?.[0] ?? null;

export const WEEKDAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const STAFF_PERMISSIONS = ['RESERVATION_MANAGE', 'PAYMENT_COLLECT', 'COURT_BLOCK'];

function minuteToClock(minute: number | null | undefined, fallback: string): string {
  if (minute === null || minute === undefined) return fallback;
  if (minute === 1440) return '24:00';
  const m = minute % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// -------------------------------------------------------------
// Users
// -------------------------------------------------------------

/** Columns + joins for toUser(); alias the users table as u. */
export const USER_SELECT = `
  u.id, u.email, u.email_verified_at, u.phone, u.display_name, u.masked_name, u.avatar_url, u.elo,
  u.matches_count, u.play_side, u.dominant_hand, u.preferred_weekdays, u.preferred_time_ranges,
  u.push_notifications_enabled, u.reminder_2h_enabled, u.notification_sound_enabled,
  u.terms_accepted_at, u.created_at, u.status,
  m.club_id AS membership_club_id, m.role AS membership_role,
  EXISTS (SELECT 1 FROM app.platform_admins pa WHERE pa.user_id = u.id) AS is_platform_admin,
  EXISTS (SELECT 1 FROM app.coach_club_contracts cc WHERE cc.coach_user_id = u.id AND cc.status = 'active') AS is_coach
  FROM app.users u
  LEFT JOIN LATERAL (
    SELECT cm.club_id, cm.role FROM app.club_memberships cm
    WHERE cm.user_id = u.id AND cm.status = 'active'
    ORDER BY (cm.role = 'owner') DESC, cm.created_at
    LIMIT 1
  ) m ON true`;

export function toUser(row: any): User {
  return {
    id: row.id,
    role: row.membership_role === 'owner' ? 'ISLETME_SAHIBI' : row.membership_role === 'staff' ? 'PERSONEL' : 'OYUNCU',
    email: row.email ?? undefined,
    emailVerified: !!row.email_verified_at,
    emailVerifiedAt: row.email_verified_at ? iso(row.email_verified_at) : undefined,
    phone: row.phone ? `+${row.phone}` : undefined,
    termsAcceptedAt: row.terms_accepted_at ? iso(row.terms_accepted_at) : undefined,
    displayName: row.display_name,
    maskedName: row.masked_name,
    avatarUrl: row.avatar_url ?? '',
    elo: row.elo,
    matchesCount: row.matches_count,
    playSide: upper<PlaySide>(row.play_side, 'BOTH'),
    dominantHand: upper<DominantHand>(row.dominant_hand, 'RIGHT'),
    preferredDays: (row.preferred_weekdays ?? []).map((d: number) => WEEKDAY_NAMES[d - 1]).filter(Boolean),
    preferredHours: row.preferred_time_ranges ?? [],
    businessId: row.membership_club_id ?? undefined,
    isPlatformAdmin: !!row.is_platform_admin,
    isCoach: !!row.is_coach,
    pushNotificationsEnabled: row.push_notifications_enabled,
    reminder2HoursBefore: row.reminder_2h_enabled,
    notificationSoundEnabled: row.notification_sound_enabled,
    createdAt: iso(row.created_at)
  };
}

/** Profile fields other players may see: no contact details or settings. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    maskedName: user.maskedName,
    avatarUrl: user.avatarUrl,
    elo: user.elo,
    matchesCount: user.matchesCount,
    playSide: user.playSide,
    dominantHand: user.dominantHand,
    preferredDays: user.preferredDays,
    preferredHours: user.preferredHours
  };
}

export function toMaskedName(displayName: string): string {
  const [first, last] = displayName.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
}

// -------------------------------------------------------------
// Clubs and courts
// -------------------------------------------------------------

/** Columns + joins for toBusiness(); alias the clubs table as c. */
export const BUSINESS_SELECT = `
  c.id, c.name, ci.name AS city_name, d.name AS district_name, c.address, c.phone, c.rating_avg::float8 AS rating_avg,
  c.reviews_count, c.policies, c.cover_image_url, c.latitude, c.longitude, c.cancellation_window_hours,
  c.is_active, c.app_booking_enabled,
  ARRAY(SELECT a.label_tr FROM app.club_amenities ca JOIN app.amenities a ON a.code = ca.amenity_code
        WHERE ca.club_id = c.id ORDER BY a.sort_order) AS amenities,
  (SELECT min(h.open_minute) FROM app.club_opening_hours h WHERE h.club_id = c.id AND NOT h.is_closed) AS open_minute,
  (SELECT max(h.close_minute) FROM app.club_opening_hours h WHERE h.club_id = c.id AND NOT h.is_closed) AS close_minute
  FROM app.clubs c
  JOIN app.cities ci ON ci.id = c.city_id
  JOIN app.districts d ON d.id = c.district_id`;

export function toBusiness(row: any): Business {
  return {
    id: row.id,
    name: row.name,
    city: row.city_name,
    district: row.district_name,
    address: row.address,
    phone: row.phone ? `+${row.phone}` : '',
    rating: row.rating_avg ?? 0,
    reviewsCount: row.reviews_count ?? 0,
    amenities: row.amenities ?? [],
    openingHour: minuteToClock(row.open_minute, '08:00'),
    closingHour: minuteToClock(row.close_minute, '23:00'),
    policies: row.policies ?? [],
    coverImage: row.cover_image_url ?? '',
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    cancellationWindowHours: row.cancellation_window_hours
  };
}

/** Columns for toCourt(); alias the courts table as co. */
export const COURT_SELECT = `
  co.id, co.club_id, co.name, co.court_type, co.surface, co.hourly_price_kurus, co.is_active,
  ARRAY(SELECT p.url FROM app.court_photos p WHERE p.court_id = co.id ORDER BY p.is_primary DESC, p.position) AS photos`;

export function toCourt(row: any): Court {
  return {
    id: row.id,
    businessId: row.club_id,
    name: row.name,
    type: COURT_TYPES[row.court_type] ?? 'OUTDOOR_STANDARD',
    surface: row.surface,
    pricePerHour: kurusToTl(row.hourly_price_kurus),
    isActive: row.is_active,
    photos: row.photos ?? []
  };
}

// -------------------------------------------------------------
// Reservations, open matches, blocks
// -------------------------------------------------------------

/** Columns for toReservation(); alias the reservations table as r. */
export const RESERVATION_SELECT = `
  r.id, r.court_id, r.club_id, r.owner_user_id, ${localTs('r.starts_at')} AS start_at, ${localTs('r.ends_at')} AS end_at,
  r.duration_minutes, r.total_price_kurus, r.source, r.status, r.payment_status, r.is_open_match, r.open_match_note,
  r.participant_limit, r.active_participant_count, r.min_elo, r.max_elo, r.match_type, r.gender_preference,
  r.approval_required, r.guest_name, r.guest_phone, r.cancellation_deadline, r.created_at, r.updated_at`;

export function toReservation(row: any): Reservation & { guestName?: string } {
  return {
    id: row.id,
    courtId: row.court_id,
    businessId: row.club_id,
    ownerUserId: row.owner_user_id ?? '',
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: row.duration_minutes,
    totalPrice: kurusToTl(row.total_price_kurus),
    source: row.source === 'app' ? 'ONLINE' : 'PANEL',
    status: upper<ReservationStatus>(row.status, 'CONFIRMED'),
    paymentStatus: PAYMENT_TO_API[row.payment_status] ?? 'PAY_AT_VENUE',
    isOpenMatch: row.is_open_match,
    openMatchNote: row.open_match_note ?? undefined,
    participantLimit: row.participant_limit,
    minElo: row.min_elo ?? undefined,
    maxElo: row.max_elo ?? undefined,
    matchType: row.match_type ? upper(row.match_type, 'CASUAL') : undefined,
    genderPreference: row.gender_preference ? upper(row.gender_preference, 'MIXED') : undefined,
    approvalRequired: row.approval_required,
    guestName: row.guest_name ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

/** Columns + join for toParticipant(); alias reservation_participants as p. */
export const PARTICIPANT_SELECT = `
  p.id, p.reservation_id, p.user_id, p.slot_index, p.status, p.is_organizer, p.joined_at,
  u.masked_name, u.elo, u.avatar_url, u.play_side, u.dominant_hand
  FROM app.reservation_participants p JOIN app.users u ON u.id = p.user_id`;

export function toParticipant(row: any): OpenMatchParticipant {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    userId: row.user_id,
    slotIndex: row.slot_index ?? -1,
    status: row.status === 'active' ? 'ACTIVE' : 'PENDING_APPROVAL',
    joinedAt: iso(row.joined_at),
    userMaskedName: row.masked_name,
    userElo: row.elo,
    userAvatar: row.avatar_url ?? '',
    userPlaySide: upper<PlaySide>(row.play_side, 'BOTH'),
    userDominantHand: upper<DominantHand>(row.dominant_hand, 'RIGHT')
  };
}

/** Columns + join for toWaitlistEntry(); alias reservation_waitlist as w. */
export const WAITLIST_SELECT = `
  w.id, w.reservation_id, w.user_id, w.requested_at, u.masked_name, u.elo,
  row_number() OVER (PARTITION BY w.reservation_id ORDER BY w.position)::int AS rank
  FROM app.reservation_waitlist w JOIN app.users u ON u.id = w.user_id`;

export function toWaitlistEntry(row: any): OpenMatchWaitlist {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    userId: row.user_id,
    requestedAt: iso(row.requested_at),
    position: row.rank,
    userMaskedName: row.masked_name,
    userElo: row.elo
  };
}

/** Columns for toBlock(); alias court_blocks as b. */
export const BLOCK_SELECT = `
  b.id, b.court_id, b.club_id, ${localTs('b.starts_at')} AS start_at, ${localTs('b.ends_at')} AS end_at,
  b.reason, b.reason_note, b.created_by, b.created_at`;

export function toBlock(row: any): CourtBlock {
  return {
    id: row.id,
    courtId: row.court_id,
    businessId: row.club_id,
    startAt: row.start_at,
    endAt: row.end_at,
    reason: BLOCK_REASONS[row.reason] ?? 'DIGER',
    reasonNote: row.reason_note ?? undefined,
    createdByUserId: row.created_by,
    createdAt: iso(row.created_at)
  };
}

// -------------------------------------------------------------
// Staff and notifications
// -------------------------------------------------------------

export function toStaffMembership(row: any): StaffMembership {
  return {
    id: row.id,
    businessId: row.club_id,
    userId: row.user_id,
    role: row.role === 'owner' ? 'ISLETME_SAHIBI' : 'PERSONEL',
    permissions: row.permissions ?? [],
    createdAt: iso(row.created_at),
    userName: row.display_name ?? undefined,
    userEmail: row.email ?? undefined
  };
}

/** Columns + join for toNotification(); alias notifications as n. */
export const NOTIFICATION_SELECT = `
  n.id, n.user_id, n.type, n.title, n.body, n.reservation_id, n.court_id, n.actor_user_id, n.read_at, n.created_at,
  au.display_name AS actor_name
  FROM app.notifications n LEFT JOIN app.users au ON au.id = n.actor_user_id`;

export function toNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.body,
    read: !!row.read_at,
    type: String(row.type).toUpperCase() as Notification['type'],
    matchId: row.reservation_id ?? undefined,
    courtId: row.court_id ?? undefined,
    senderId: row.actor_user_id ?? undefined,
    senderName: row.actor_name ?? undefined,
    createdAt: iso(row.created_at)
  };
}
