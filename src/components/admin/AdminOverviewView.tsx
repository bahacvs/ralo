import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { AdminOverview, FeeSettings } from '../../types/admin.js';
import { PageHeader, StatCard, Alert, formatTl, secondaryButton } from './adminUi.js';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';

export const AdminOverviewView: React.FC = () => {
  const { navigate } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [fees, setFees] = useState<FeeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [o, f] = await Promise.all([api.admin.overview(), api.admin.fees()]);
      setOverview(o);
      setFees(f);
    } catch (err: any) {
      setError(err.message || 'Genel bakış yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!overview || !fees) return <LoadingState message="Platform özeti yükleniyor..." />;

  const checklist = [
    {
      done: !!fees.appReservationFee,
      title: fees.appReservationFee
        ? `Uygulama rezervasyon ücreti tanımlı: ${formatTl(fees.appReservationFee.amount)}`
        : 'Uygulama rezervasyon ücretini tanımlayın',
      detail: fees.appReservationFee ? undefined : 'Ücret tanımlanmadan oyuncular uygulamadan rezervasyon yapamaz.',
      path: '/admin/ucretler'
    },
    {
      done: !!fees.billingPolicy,
      title: fees.billingPolicy
        ? `Fatura ayarı: ücretler KDV ${fees.billingPolicy.amountsIncludeVat ? 'dahil' : 'hariç'}, %${fees.billingPolicy.vatRatePercent}, ${fees.billingPolicy.statementDueDays} gün vade`
        : 'KDV ve ödeme vadesi ayarını kaydedin',
      detail: fees.billingPolicy ? undefined : 'Bu ayar olmadan aylık hesap özeti oluşturulamaz.',
      path: '/admin/ucretler'
    },
    {
      done: overview.activeClubs > 0,
      title: overview.activeClubs > 0 ? `${overview.activeClubs} kulüp yayında` : 'İlk kulübü ekleyip aktifleştirin',
      detail: overview.activeClubs > 0 ? undefined : 'Pasif kulüpler oyunculara görünmez.',
      path: '/admin/kulupler'
    }
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Genel Bakış" description="RALO platformunun güncel durumu" />

      {overview.overdueStatements > 0 && (
        <Alert tone="error">
          {overview.overdueStatements} hesap özetinin ödeme vadesi geçti.{' '}
          <button type="button" className="underline cursor-pointer" onClick={() => navigate('/admin/hesap-ozetleri')}>Hesap özetlerine git</button>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Aktif kulüp" value={`${overview.activeClubs} / ${overview.clubs}`} hint="yayında / toplam" />
        <StatCard label="Kullanıcı" value={overview.users.toLocaleString('tr-TR')} hint={`${overview.verifiedUsers.toLocaleString('tr-TR')} e-postası doğrulanmış`} />
        <StatCard label="Bu ay uygulama rezervasyonu" value={overview.appReservationsThisMonth.toLocaleString('tr-TR')} hint="iptaller hariç" />
        <StatCard label="Bu ay tahakkuk eden ücret" value={formatTl(overview.feesThisMonth)} hint="KDV hariç, iptaller düşülmüş" />
        <StatCard label="Ödenmemiş hesap özetleri" value={formatTl(overview.openStatementsTotal)} />
        <StatCard label="Vadesi geçen" value={overview.overdueStatements} tone={overview.overdueStatements > 0 ? 'warning' : 'default'} />
        <button type="button" onClick={() => navigate('/admin/hatalar')} className="text-left cursor-pointer">
          <StatCard label="Son 24 saatteki hatalar" value={overview.errorsLast24h} hint="Ayrıntılar için tıklayın" tone={overview.errorsLast24h > 0 ? 'warning' : 'default'} />
        </button>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-3" aria-labelledby="setup-title">
        <h2 id="setup-title" className="text-sm font-black text-slate-900">Yayın hazırlığı</h2>
        <ul className="space-y-2">
          {checklist.map(item => (
            <li key={item.title} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-2xl bg-slate-50">
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                {item.done
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="Tamam" />
                  : <Circle className="w-5 h-5 text-amber-500 shrink-0" aria-label="Yapılacak" />}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{item.title}</p>
                  {item.detail && <p className="text-[11px] text-slate-600 mt-0.5">{item.detail}</p>}
                </div>
              </div>
              {!item.done && (
                <button type="button" onClick={() => navigate(item.path)} className={secondaryButton}>
                  <span>Ayarla</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
