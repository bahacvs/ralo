import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { StatementStatus, LessonFeeBasis } from '../../types/admin.js';
import type { CourtType } from '../../types/index.js';

// Shared styles and small building blocks for the platform admin screens.

export const inputClass =
  'w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';
export const labelClass = 'block text-xs font-bold text-slate-700 mb-1';
export const primaryButton =
  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer';
export const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer';
export const dangerButton =
  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer';
export const cardClass = 'bg-white rounded-3xl border border-slate-200 shadow-xs';

export const formatTl = (amount: number | null | undefined) =>
  `${(amount ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} TL`;

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return `${MONTHS[month - 1] ?? ''} ${year}`;
};

/** The last `count` finished months as YYYY-MM, most recent first. */
export function finishedPeriods(count: number): string[] {
  const now = new Date();
  const periods: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
}

export const STATEMENT_STATUS: Record<StatementStatus, { label: string; className: string }> = {
  issued: { label: 'Ödeme bekleniyor', className: 'bg-amber-100 text-amber-900 border border-amber-200' },
  overdue: { label: 'Vadesi geçti', className: 'bg-red-100 text-red-800 border border-red-200' },
  paid: { label: 'Ödendi', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  cancelled: { label: 'İptal edildi', className: 'bg-slate-100 text-slate-600 border border-slate-200' }
};

export const COURT_TYPE_LABELS: Record<CourtType, string> = {
  OUTDOOR_PANORAMIC: 'Açık Panoramik',
  INDOOR_PANORAMIC: 'Kapalı Panoramik',
  OUTDOOR_STANDARD: 'Açık Standart',
  INDOOR_STANDARD: 'Kapalı Standart'
};

export const LESSON_BASIS_LABELS: Record<LessonFeeBasis, string> = {
  per_session: 'Her ders oturumu başına',
  per_lesson: 'Ders (paket) başına bir kez',
  per_enrolled_student_session: 'Her öğrenci × oturum başına'
};

export const PageHeader: React.FC<{ title: string; description?: string; actions?: React.ReactNode }> = ({ title, description, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
      {description && <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Alert: React.FC<{ tone: 'error' | 'success' | 'info' | 'warning'; children: React.ReactNode }> = ({ tone, children }) => {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    info: 'bg-slate-50 border-slate-200 text-slate-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-950'
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`p-3 rounded-2xl border text-xs flex items-start gap-2 ${styles}`}>
      <Icon className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
      <div className="font-semibold min-w-0">{children}</div>
    </div>
  );
};

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'warning' }> = ({ label, value, hint, tone = 'default' }) => (
  <div className={`${cardClass} p-4 ${tone === 'warning' ? 'border-red-200 bg-red-50/40' : ''}`}>
    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

export const minutesToClock = (minute: number | null) => {
  if (minute === null) return '';
  const m = minute % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
