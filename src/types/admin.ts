// Shapes returned by the platform admin (/api/admin/*) and club billing (/api/panel/statements) endpoints.
import type { Business, Court } from './index.js';

export interface AdminOverview {
  clubs: number;
  activeClubs: number;
  users: number;
  verifiedUsers: number;
  appReservationsThisMonth: number;
  feesThisMonth: number;
  openStatementsTotal: number;
  overdueStatements: number;
  errorsLast24h: number;
}

export interface ErrorGroup {
  fingerprint: string;
  source: 'server' | 'client';
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  lastPath: string | null;
  lastMethod: string | null;
  lastStack: string | null;
  lastUserAgent: string | null;
}

export interface AdminReference {
  cities: { id: number; name: string }[];
  amenities: { code: string; label: string }[];
}

export interface AdminClubListItem {
  id: string;
  name: string;
  city: string;
  district: string;
  isActive: boolean;
  appBookingEnabled: boolean;
  /** App bookings were turned off automatically because a statement is unpaid past the grace period */
  bookingSuspendedForPayment: boolean;
  courtCount: number;
  activeCourtCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerHasPassword: boolean;
  createdAt: string;
}

export interface AdminOpeningHour {
  weekday: number; // ISO, 1 = Monday
  isClosed: boolean;
  openMinute: number | null;
  closeMinute: number | null; // > 1440 closes after midnight
}

export type LessonFeeBasis = 'per_session' | 'per_lesson' | 'per_enrolled_student_session';

export interface AdminClubDetail extends AdminClubListItem {
  business: Business;
  cityId: number;
  amenityCodes: string[];
  lessonFee: { amount: number; basis: LessonFeeBasis } | null;
  openingHours: AdminOpeningHour[];
  courts: Court[];
}

export interface FeeRate {
  amount: number;
  effectiveFrom: string;
  reason: string | null;
  createdByName: string;
}

export interface BillingPolicy {
  chargeNoShow: boolean;
  statementDueDays: number;
  vatRatePercent: number;
  amountsIncludeVat: boolean;
  effectiveFrom: string;
}

export interface FeeSettings {
  appReservationFee: FeeRate | null;
  appReservationFeeHistory: FeeRate[];
  billingPolicy: BillingPolicy | null;
  lessonFees: { clubId: string; clubName: string; amount: number; basis: LessonFeeBasis; effectiveFrom: string }[];
}

export type StatementStatus = 'issued' | 'paid' | 'overdue' | 'cancelled';

export interface StatementLine {
  type: 'app_reservation' | 'lesson' | 'adjustment';
  description: string;
  serviceDate: string;
  amount: number;
}

export interface MonthlyStatement {
  id: string;
  statementNo: string;
  clubId: string;
  clubName: string;
  period: string; // YYYY-MM
  reservationFeeCount: number;
  reservationFeeTotal: number;
  lessonFeeCount: number;
  lessonFeeTotal: number;
  adjustmentsTotal: number;
  subtotal: number;
  vatRatePercent: number;
  vatTotal: number;
  total: number;
  status: StatementStatus;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  paidAmount: number | null;
  paymentReference: string | null;
  cancelledReason: string | null;
  lines?: StatementLine[];
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  clubName: string | null;
  clubRole: 'owner' | 'staff' | null;
  isPlatformAdmin: boolean;
}
