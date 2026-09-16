import { 
  User, Court, Business, Reservation, 
  CourtFilterOptions, OpenMatchFilterOptions, Message, Conversation, Notification,
  FeedPost, FeedReply, FeedCategory, CourtOccupancyInfo
} from '../types/index.js';
import type {
  AdminOverview, AdminReference, AdminClubListItem, AdminClubDetail, FeeSettings, MonthlyStatement,
  AdminUserRow, LessonFeeBasis
} from '../types/admin.js';

/** Fired on window when the server rejects the session; detail: { method } */
export const UNAUTHORIZED_EVENT = 'ralo:unauthorized';

let authToken: string | null = localStorage.getItem('arenamate_token');

export function setApiToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('arenamate_token', token);
  } else {
    localStorage.removeItem('arenamate_token');
  }
}

export function getApiToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('arenamate_token');
  }
  return authToken;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  
  const token = getApiToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      if (token) setApiToken(null);
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, {
        detail: { method: (options.method || 'GET').toUpperCase() }
      }));
    }

    let errorMsg = 'Beklenmeyen bir hata oluştu.';
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // Use status text
      errorMsg = res.statusText || errorMsg;
    }
    const err = new Error(errorMsg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  // Legal documents and consents
  getLegalDocument: (slug: string) =>
    request<{ document: { slug: string; title: string; version: string; publishedAt: string; content: string } }>(`/api/legal/${encodeURIComponent(slug)}`),

  getConsents: () =>
    request<{ consents: Record<'terms_of_use' | 'privacy_notice' | 'share_card' | 'club_service_agreement', { granted: boolean; currentVersion: boolean; at: string | null }> }>('/api/user/consents'),

  setShareCardConsent: (granted: boolean) =>
    request<{ success: boolean; message: string }>('/api/user/consents/share-card', {
      method: 'PUT',
      body: JSON.stringify({ granted })
    }),

  getClubAgreement: () =>
    request<{ document: { slug: string; title: string; version: string } | null; accepted: boolean; acceptedAt: string | null }>('/api/panel/club-agreement'),

  acceptClubAgreement: () =>
    request<{ success: boolean; message: string }>('/api/panel/club-agreement/accept', { method: 'POST' }),

  register: (data: { displayName: string; email: string; password: string; acceptTerms: boolean; shareCardConsent?: boolean }) =>
    request<{ success: boolean; token: string; user: User; verificationEmailSent: boolean }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  login: (email: string, password: string) =>
    request<{ success: boolean; token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  verifyEmail: (token: string) =>
    request<{ success: boolean; message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),

  resendVerification: () =>
    request<{ success: boolean; message: string; alreadyVerified?: boolean }>('/api/auth/resend-verification', {
      method: 'POST'
    }),

  forgotPassword: (email: string) =>
    request<{ success: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  resetPassword: (token: string, password: string) =>
    request<{ success: boolean; token: string; user: User; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    }),

  demoSwitch: (targetRole: 'OYUNCU' | 'ISLETME_SAHIBI' | 'PERSONEL') => 
    request<{ success: boolean; token: string; user: User }>('/api/auth/demo-switch', {
      method: 'POST',
      body: JSON.stringify({ targetRole })
    }),

  getMe: () => 
    request<{ user: User; token: string; isGuest?: boolean }>('/api/auth/me'),

  logout: () => 
    request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  deleteAccount: (confirmationText: string, confirmationCheck: boolean) => 
    request<{ success: boolean; message: string }>('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ confirmationText, confirmationCheck })
    }),

  updateProfile: (data: Partial<User>) =>
    request<{ success: boolean; user: User }>('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  // Courts
  getCourts: (filters: CourtFilterOptions) => {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.startTime) params.set('startTime', filters.startTime);
    if (filters.duration) params.set('duration', String(filters.duration));
    if (filters.city) params.set('city', filters.city);
    if (filters.district) params.set('district', filters.district);
    if (filters.courtType) params.set('courtType', filters.courtType);
    if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
    if (filters.minRating) params.set('minRating', String(filters.minRating));
    if (filters.userLat !== undefined) params.set('userLat', String(filters.userLat));
    if (filters.userLng !== undefined) params.set('userLng', String(filters.userLng));
    if (filters.maxDistanceKm !== undefined) params.set('maxDistanceKm', String(filters.maxDistanceKm));
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.amenities) {
      filters.amenities.forEach(a => params.append('amenities', a));
    }
    return request<{ courts: any[]; total: number }>(`/api/courts?${params.toString()}`);
  },

  getCourtDetail: (courtId: string, date?: string, duration?: number) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (duration) params.set('duration', String(duration));
    return request<{
      court: Court;
      business: Business;
      date: string;
      durationMinutes: number;
      slots: Array<{ time: string; endTime: string; isAvailable: boolean; reason?: string }>;
      pricePerHour: number;
      totalPrice: number;
      pricePerPlayer: number;
    }>(`/api/courts/${courtId}?${params.toString()}`);
  },

  toggleFavoriteCourt: (courtId: string) =>
    request<{
      success: boolean;
      isFavorite: boolean;
      favoriteCourtIds: string[];
      user: User;
    }>(`/api/courts/${courtId}/toggle-favorite`, { method: 'POST' }),

  getFavoriteCourts: () =>
    request<{ courts: any[]; total: number }>('/api/user/favorites/courts'),

  // Reservations
  createReservation: (data: {
    courtId: string;
    startAt: string;
    durationMinutes: 60 | 90 | 120;
    isOpenMatch?: boolean;
    openMatchNote?: string;
    minElo?: number;
    maxElo?: number;
    matchType?: 'CASUAL' | 'COMPETITIVE';
    genderPreference?: 'MIXED' | 'FEMALE' | 'MALE' | 'ANY';
    approvalRequired?: boolean;
  }) => request<{ success: boolean; reservation: Reservation; message: string }>('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Open Matches
  getOpenMatches: (filters: OpenMatchFilterOptions) => {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.timeRange) params.set('timeRange', filters.timeRange);
    if (filters.minAvailableSpots) params.set('minAvailableSpots', String(filters.minAvailableSpots));
    if (filters.maxPricePerPlayer) params.set('maxPricePerPlayer', String(filters.maxPricePerPlayer));
    if (filters.fitForMe) params.set('fitForMe', 'true');
    if (filters.city) params.set('city', filters.city);
    if (filters.district) params.set('district', filters.district);
    if (filters.userLat !== undefined) params.set('userLat', String(filters.userLat));
    if (filters.userLng !== undefined) params.set('userLng', String(filters.userLng));
    if (filters.maxDistanceKm !== undefined) params.set('maxDistanceKm', String(filters.maxDistanceKm));
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.search) params.set('search', filters.search);
    return request<{ matches: any[]; total: number }>(`/api/open-matches?${params.toString()}`);
  },

  getOpenMatchDetail: (id: string) => 
    request<any>(`/api/open-matches/${id}`),

  joinOpenMatch: (id: string) => 
    request<{ success: boolean; status: string; message: string }>(`/api/open-matches/${id}/join`, {
      method: 'POST'
    }),

  leaveOpenMatch: (id: string) => 
    request<{ success: boolean; message: string }>(`/api/open-matches/${id}/leave`, {
      method: 'POST'
    }),

  submitMatchResult: (matchId: string, data: { teamA: string[]; teamB: string[]; sets: [number, number][] }) =>
    request<{ success: boolean; message: string }>(`/api/matches/${matchId}/result`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  confirmMatchResult: (matchId: string) =>
    request<{ success: boolean; eloChange: number; message: string }>(`/api/matches/${matchId}/result/confirm`, { method: 'POST' }),

  disputeMatchResult: (matchId: string, reason: string) =>
    request<{ success: boolean; message: string }>(`/api/matches/${matchId}/result/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  respondToJoinRequest: (matchId: string, userId: string, decision: 'approve' | 'reject') =>
    request<{ success: boolean; message: string }>(`/api/open-matches/${matchId}/requests/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    }),

  toggleWaitlist: (id: string) =>
    request<{ success: boolean; action: 'JOINED' | 'LEFT'; message: string }>(`/api/open-matches/${id}/waitlist`, {
      method: 'POST'
    }),

  inviteFriendToMatch: (matchId: string, friendUserId: string) =>
    request<{ success: boolean; message: string }>(`/api/open-matches/${matchId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ friendUserId })
    }),

  generateMatchShareCard: (matchId: string, options?: { theme?: string; format?: string }) =>
    request<{
      success: boolean;
      matchId: string;
      theme: any;
      format: string;
      match: any;
      aiHeadline: string;
      aiCaption: string;
      shareUrl: string;
    }>(`/api/open-matches/${matchId}/generate-share-card`, {
      method: 'POST',
      body: JSON.stringify(options || {})
    }),

  // User & Friends
  getMyMatches: () =>
    request<{ upcoming: any[]; past: any[] }>('/api/my-matches'),

  cancelReservation: (id: string) =>
    request<{ success: boolean; message: string; reservation: Reservation }>(`/api/reservations/${id}/cancel`, {
      method: 'POST'
    }),

  getLeaderboard: () =>
    request<{ players: (Pick<User, 'id' | 'role' | 'displayName' | 'maskedName' | 'avatarUrl' | 'elo' | 'matchesCount' | 'playSide' | 'dominantHand'> & { rank: number })[] }>('/api/leaderboard'),

  getPanelBusiness: () =>
    request<{ business: Business; activeCourtCount: number }>('/api/panel/business'),

  getFriends: () =>
    request<{ friends: User[]; allPlayers: User[] }>('/api/friends'),

  toggleFriend: (targetUserId: string) =>
    request<{ success: boolean; isFriend: boolean; friends: string[]; message: string }>('/api/friends/toggle', {
      method: 'POST',
      body: JSON.stringify({ targetUserId })
    }),

  getMessages: () => 
    request<{ conversations: Conversation[]; messages: Message[] }>('/api/messages'),

  startDirectMessage: (targetUserId: string) =>
    request<{ success: boolean; conversation: Conversation }>('/api/messages/start-direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId })
    }),

  sendMessage: (conversationId: string, text: string) => 
    request<{ success: boolean; message: Message }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ conversationId, text })
    }),

  // Community Feed & Chat
  getFeed: (category?: string) => {
    const q = category && category !== 'ALL' ? `?category=${category}` : '';
    return request<{ posts: FeedPost[] }>(`/api/feed${q}`);
  },

  createFeedPost: (data: { content: string; category?: FeedCategory; venueName?: string }) =>
    request<{ success: boolean; post: FeedPost }>('/api/feed', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  toggleLikePost: (id: string) =>
    request<{ success: boolean; isLiked: boolean; likesCount: number }>(`/api/feed/${id}/like`, {
      method: 'POST'
    }),

  replyToPost: (id: string, content: string) =>
    request<{ success: boolean; reply: FeedReply }>(`/api/feed/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content })
    }),

  getNotifications: () => 
    request<{ notifications: Notification[] }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  simulate2HourMatchReminder: (matchId?: string) =>
    request<{ success: boolean; notification: Notification; match: any }>('/api/notifications/simulate-2h-reminder', {
      method: 'POST',
      body: JSON.stringify({ matchId })
    }),

  checkUpcomingReminders: () =>
    request<{ sent: boolean; notification?: Notification; match?: any }>('/api/notifications/check-reminders'),

  updateNotificationSettings: (settings: {
    pushNotificationsEnabled?: boolean;
    reminder2HoursBefore?: boolean;
    notificationSoundEnabled?: boolean;
  }) =>
    request<{ success: boolean; user: User }>('/api/user/notification-settings', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    }),

  // Business Panel
  getPanelSchedule: (businessId: string, date: string, days: number = 1) => 
    request<any>(`/api/panel/schedule?businessId=${businessId}&date=${date}&days=${days}`),

  createManualReservation: (data: any) => 
    request<{ success: boolean; reservation: Reservation }>('/api/panel/reservations/manual', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  createCourtBlock: (data: any) => 
    request<{ success: boolean; block: any }>('/api/panel/blocks', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  deleteCourtBlock: (id: string) => 
    request<{ success: boolean }>(`/api/panel/blocks/${id}`, { method: 'DELETE' }),

  updateReservationStatus: (id: string, status: string) => 
    request<{ success: boolean; reservation: Reservation }>(`/api/panel/reservations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),

  updateReservationPayment: (id: string, paymentStatus: string) => 
    request<{ success: boolean; reservation: Reservation }>(`/api/panel/reservations/${id}/payment`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus })
    }),

  getPanelCourts: (businessId: string, date?: string) => {
    const q = date ? `&date=${date}` : '';
    return request<{ 
      courts: (Court & { occupancy?: CourtOccupancyInfo & { estimatedDailyRevenue?: number } })[];
      analytics?: {
        avgOccupancyRate: number;
        totalCourts: number;
        activeCourts: number;
        totalDailyRevenue: number;
        totalBookedHours: number;
        date: string;
        hourlyOccupancy: {
          hour: string;
          activeBookings: number;
          totalCourts: number;
          occupancyRate: number;
        }[];
      };
    }>(`/api/panel/courts?businessId=${businessId}${q}`);
  },

  createPanelCourt: (data: any) => 
    request<{ success: boolean; court: Court }>('/api/panel/courts', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updatePanelCourt: (id: string, data: any) => 
    request<{ success: boolean; court: Court }>(`/api/panel/courts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  getPanelStaff: (businessId: string) => 
    request<{ staff: any[] }>(`/api/panel/staff?businessId=${businessId}`),

  createPanelStaff: (data: any) => 
    request<{ success: boolean; staff: any; invited: boolean; inviteEmailSent: boolean }>('/api/panel/staff', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getPanelReports: (businessId: string) =>
    request<any>(`/api/panel/reports?businessId=${businessId}`),

  // Club billing (owner)
  getPanelStatements: () =>
    request<{ statements: MonthlyStatement[] }>('/api/panel/statements'),

  getPanelStatement: (id: string) =>
    request<{ statement: MonthlyStatement }>(`/api/panel/statements/${id}`),

  // Platform admin (super-admin panel)
  admin: {
    overview: () => request<AdminOverview>('/api/admin/overview'),

    reference: () => request<AdminReference>('/api/admin/reference'),

    clubs: () => request<{ clubs: AdminClubListItem[] }>('/api/admin/clubs'),

    club: (id: string) => request<{ club: AdminClubDetail }>(`/api/admin/clubs/${id}`),

    createClub: (data: Record<string, unknown>) =>
      request<{ success: boolean; club: AdminClubDetail; ownerInvited: boolean; inviteEmailSent: boolean }>('/api/admin/clubs', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    updateClub: (id: string, data: Record<string, unknown>) =>
      request<{ success: boolean; club: AdminClubDetail }>(`/api/admin/clubs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),

    setOpeningHours: (id: string, days: { isClosed: boolean; open: string; close: string }[]) =>
      request<{ success: boolean; club: AdminClubDetail }>(`/api/admin/clubs/${id}/opening-hours`, {
        method: 'PUT',
        body: JSON.stringify({ days })
      }),

    createCourt: (clubId: string, data: Record<string, unknown>) =>
      request<{ success: boolean; court: Court }>(`/api/admin/clubs/${clubId}/courts`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    updateCourt: (clubId: string, courtId: string, data: Record<string, unknown>) =>
      request<{ success: boolean; court: Court }>(`/api/admin/clubs/${clubId}/courts/${courtId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),

    setLessonFee: (clubId: string, amount: number, basis: LessonFeeBasis) =>
      request<{ success: boolean; club: AdminClubDetail }>(`/api/admin/clubs/${clubId}/lesson-fee`, {
        method: 'PUT',
        body: JSON.stringify({ amount, basis })
      }),

    resendOwnerInvite: (clubId: string) =>
      request<{ success: boolean; message: string }>(`/api/admin/clubs/${clubId}/resend-owner-invite`, { method: 'POST' }),

    fees: () => request<FeeSettings>('/api/admin/fees'),

    setAppReservationFee: (amount: number, reason?: string) =>
      request<FeeSettings & { success: boolean }>('/api/admin/fees/app-reservation', {
        method: 'POST',
        body: JSON.stringify({ amount, reason })
      }),

    setBillingPolicy: (data: { amountsIncludeVat: boolean; vatRatePercent: number; statementDueDays: number; chargeNoShow: boolean }) =>
      request<FeeSettings & { success: boolean }>('/api/admin/billing-policy', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    statements: (period?: string) =>
      request<{ statements: MonthlyStatement[] }>(`/api/admin/statements${period ? `?period=${encodeURIComponent(period)}` : ''}`),

    statement: (id: string) => request<{ statement: MonthlyStatement }>(`/api/admin/statements/${id}`),

    generateStatements: (period: string) =>
      request<{ success: boolean; created: number; statements: MonthlyStatement[] }>('/api/admin/statements/generate', {
        method: 'POST',
        body: JSON.stringify({ period })
      }),

    markStatementPaid: (id: string, data: { paidAmount?: number; paymentReference?: string }) =>
      request<{ success: boolean; statement: MonthlyStatement }>(`/api/admin/statements/${id}/paid`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    cancelStatement: (id: string, reason: string) =>
      request<{ success: boolean; statement: MonthlyStatement }>(`/api/admin/statements/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      }),

    users: (search?: string) =>
      request<{ users: AdminUserRow[] }>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`)
  }
};
