export type UserRole = 'OYUNCU' | 'ISLETME_SAHIBI' | 'PERSONEL';

export type PlaySide = 'LEFT' | 'RIGHT' | 'BOTH';
export type DominantHand = 'RIGHT' | 'LEFT';

export interface User {
  id: string;
  role: UserRole;
  email?: string; // sign-in address, lowercase; only shown to the user and their club's staff
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  phone?: string; // optional contact number, not verified
  termsAcceptedAt?: string;
  displayName: string;
  maskedName: string;
  avatarUrl: string;
  elo: number;
  matchesCount: number;
  playSide: PlaySide;
  dominantHand: DominantHand;
  preferredDays: string[];
  preferredHours: string[];
  businessId?: string; // set for ISLETME_SAHIBI and PERSONEL
  isPlatformAdmin?: boolean; // RALO platform owner: super-admin panel access
  friends?: string[]; // array of friend user IDs
  favoriteCourtIds?: string[]; // array of favorited court IDs
  pushNotificationsEnabled?: boolean;
  reminder2HoursBefore?: boolean;
  notificationSoundEnabled?: boolean;
  createdAt: string;
}

export interface Business {
  id: string;
  name: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  rating: number;
  reviewsCount: number;
  amenities: string[];
  openingHour: string; // e.g. "08:00"
  closingHour: string; // e.g. "24:00"
  policies: string[];
  coverImage: string;
  latitude?: number;
  longitude?: number;
  cancellationWindowHours?: number; // players may cancel app bookings until this many hours before start (default 24)
}

export type CourtType = 
  | 'OUTDOOR_PANORAMIC'
  | 'INDOOR_PANORAMIC'
  | 'OUTDOOR_STANDARD'
  | 'INDOOR_STANDARD';

export interface Court {
  id: string;
  businessId: string;
  name: string;
  type: CourtType;
  surface: string;
  pricePerHour: number; // in TRY
  isActive: boolean;
  photos: string[];
}

export interface CourtPhoto {
  id: string;
  courtId: string;
  url: string;
  altText: string;
  isPrimary: boolean;
}

export type ReservationSource = 'ONLINE' | 'PANEL';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type PaymentStatus = 'PAY_AT_VENUE' | 'PAID' | 'REFUNDED';
export type MatchType = 'CASUAL' | 'COMPETITIVE';
export type GenderPreference = 'MIXED' | 'FEMALE' | 'MALE' | 'ANY';

export interface Reservation {
  id: string;
  courtId: string;
  businessId: string;
  ownerUserId: string;
  startAt: string; // ISO 8601 string
  endAt: string;   // ISO 8601 string
  durationMinutes: 60 | 90 | 120;
  totalPrice: number;
  source: ReservationSource;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  isOpenMatch: boolean;
  openMatchNote?: string;
  participantLimit: number;
  minElo?: number;
  maxElo?: number;
  matchType?: MatchType;
  genderPreference?: GenderPreference;
  approvalRequired?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationSlot {
  id: string; // Composite key: `${courtId}_${date}_${time}`
  courtId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  durationMinutes: number;
  reservationId: string;
}

export interface OpenMatchParticipant {
  id: string;
  reservationId: string;
  userId: string;
  slotIndex: number; // 0, 1, 2, 3
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  joinedAt: string;
  userMaskedName?: string;
  userElo?: number;
  userAvatar?: string;
  userPlaySide?: PlaySide;
  userDominantHand?: DominantHand;
}

export interface OpenMatchWaitlist {
  id: string;
  reservationId: string;
  userId: string;
  requestedAt: string;
  position: number;
  userMaskedName?: string;
  userElo?: number;
}

export type CourtBlockReason = 'BAKIM' | 'OZEL_ETKINLIK' | 'TURNUVA' | 'DIGER';

export interface CourtBlock {
  id: string;
  courtId: string;
  businessId: string;
  startAt: string;
  endAt: string;
  reason: CourtBlockReason;
  reasonNote?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface StaffMembership {
  id: string;
  businessId: string;
  userId: string;
  role: 'ISLETME_SAHIBI' | 'PERSONEL';
  permissions: string[];
  createdAt: string;
  userName?: string;
  userEmail?: string;
}

export interface Conversation {
  id: string;
  matchId: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  participantIds: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type: 'MATCH_JOIN' | 'MATCH_LEAVE' | 'MATCH_INVITE' | 'NEW_MESSAGE' | 'FRIEND_ADD' | 'MATCH_APPROVED' | 'SLOT_AVAILABLE' | 'RESERVATION_UPDATE' | 'MATCH_REMINDER_2H';
  matchId?: string;
  courtId?: string;
  senderId?: string;
  senderName?: string;
  createdAt: string;
}

export interface PaymentStatusRecord {
  id: string;
  reservationId: string;
  amount: number;
  status: PaymentStatus;
  method: 'CASH' | 'POS_TERMINAL' | 'ONLINE_MOCK';
  recordedByUserId: string;
  createdAt: string;
}

// UI & Filter helper interfaces
export type OccupancyStatus = 'LOW' | 'MODERATE' | 'HIGH' | 'FULL';

export interface CourtOccupancyInfo {
  occupancyRate: number; // percentage 0-100
  bookedSlotsCount: number;
  totalSlotsCount: number;
  availableSlotsCount: number;
  status: OccupancyStatus;
  label: string;
}

export interface CourtFilterOptions {
  date: string;
  startTime: string;
  duration: 60 | 90 | 120;
  city?: string;
  district?: string;
  courtType?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  amenities?: string[];
  userLat?: number;
  userLng?: number;
  maxDistanceKm?: number;
  sortBy?: 'RECOMMENDED' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING_DESC' | 'DISTANCE_ASC';
}

export interface OpenMatchFilterOptions {
  date?: string;
  timeRange?: 'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING';
  minAvailableSpots?: number;
  maxPricePerPlayer?: number;
  fitForMe?: boolean;
  city?: string;
  district?: string;
  userLat?: number;
  userLng?: number;
  maxDistanceKm?: number;
  sortBy?: 'DATE_ASC' | 'PRICE_ASC' | 'SPOTS_DESC' | 'DISTANCE_ASC';
  search?: string;
}

export type FeedCategory = 'SOHBET' | 'OYUNCU_ARIYORUM' | 'MAC_DUYURUSU' | 'EKIPMAN';

export interface FeedReply {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  authorElo: number;
  content: string;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  authorElo: number;
  authorPlaySide?: PlaySide;
  content: string;
  category: FeedCategory;
  venueName?: string;
  likes: string[];
  replies: FeedReply[];
  createdAt: string;
}
