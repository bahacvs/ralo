import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { usePushNotification } from '../../context/PushNotificationContext.js';
import { api } from '../../services/api.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';
import { MatchGearChecklist } from './MatchGearChecklist.js';
import { 
  Calendar, Clock, MapPin, Users, ChevronRight, CheckCircle2, 
  Bell, BellRing, Sparkles, Volume2, ShieldCheck, Play, XCircle
} from 'lucide-react';

export const MyMatchesView: React.FC = () => {
  const { navigate, user } = useAuth();
  const { 
    pushEnabled, 
    reminder2HoursEnabled, 
    soundEnabled, 
    simulate2HourAlert, 
    isSimulating,
    pushPermission,
    requestPushPermission 
  } = usePushNotification();

  const [tab, setTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ upcoming: any[]; past: any[] }>({ upcoming: [], past: [] });
  const [simulationSuccess, setSimulationSuccess] = useState(false);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMyMatches();
      setMatches(res);
    } catch (err: any) {
      setError(err.message || 'Maçlarınız yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleSimulate = async (matchId?: string) => {
    setSimulationSuccess(false);
    await simulate2HourAlert(matchId);
    setSimulationSuccess(true);
    setTimeout(() => setSimulationSuccess(false), 4000);
  };

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getWindowHours = (m: any): number =>
    typeof m.business?.cancellationWindowHours === 'number' ? m.business.cancellationWindowHours : 24;

  const isCancellable = (m: any): boolean =>
    // startAt is Istanbul local time (fixed UTC+3), independent of the device's time zone
    new Date(`${m.startAt}+03:00`).getTime() - Date.now() > getWindowHours(m) * 60 * 60 * 1000;

  const handleCancel = async (m: any) => {
    setCancelFeedback(null);
    const hours = getWindowHours(m);
    if (!isCancellable(m)) {
      setCancelFeedback({
        type: 'error',
        text: `İptal süresi doldu. Bu kulüpte rezervasyonlar başlama saatinden en geç ${hours} saat önce iptal edilebilir. Lütfen kulüple iletişime geçin.`
      });
      return;
    }
    const confirmText = m.isOpenMatch
      ? 'Bu açık maçı iptal etmek istediğinize emin misiniz? Katılan oyunculara bildirim gönderilecek.'
      : 'Bu rezervasyonu iptal etmek istediğinize emin misiniz?';
    if (!window.confirm(confirmText)) return;

    setCancellingId(m.id);
    try {
      const res = await api.cancelReservation(m.id);
      setCancelFeedback({ type: 'success', text: res.message || 'Rezervasyonunuz iptal edildi.' });
      await fetchMatches();
    } catch (err: any) {
      setCancelFeedback({ type: 'error', text: err.message || 'Rezervasyon iptal edilemedi.' });
    } finally {
      setCancellingId(null);
    }
  };

  const list = tab === 'UPCOMING' ? matches.upcoming : matches.past;

  return (
    <div className="space-y-5 pb-8">
      
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight font-serif">
          Maçlarım ve Rezervasyonlarım
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Katıldığınız ve oluşturduğunuz padel organizasyonlarını yönetin
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Maç türleri" className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl max-w-sm border border-slate-200/60 dark:border-slate-700/60">
        <button
          role="tab"
          aria-selected={tab === 'UPCOMING'}
          type="button"
          onClick={() => setTab('UPCOMING')}
          className={`flex-1 min-h-[44px] rounded-xl text-xs font-bold transition-all ${
            tab === 'UPCOMING'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          } focus-visible:ring-2 focus-visible:ring-amber-500`}
        >
          Yaklaşan ({matches.upcoming.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'PAST'}
          type="button"
          onClick={() => setTab('PAST')}
          className={`flex-1 min-h-[44px] rounded-xl text-xs font-bold transition-all ${
            tab === 'PAST'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          } focus-visible:ring-2 focus-visible:ring-amber-500`}
        >
          Geçmiş ({matches.past.length})
        </button>
      </div>

      {/* 2-Hour Reminder Push Notification Simulator Banner */}
      {tab === 'UPCOMING' && (
        <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 text-white border border-amber-500/30 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <BellRing className="w-5 h-5 animate-pulse" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black tracking-tight text-white font-serif">
                    Push Bildirim Sistemi: 2 Saat Öncesi Hatırlatıcı
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <CheckCircle2 className="w-3 h-3 text-amber-400" />
                    <span>Aktif</span>
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                  Onaylı maçlarınızın başlama saatine tam <strong>2 saat kala</strong> cihazınıza otomatik sesli anlık push bildirimi ve hatırlatma uyarısı iletilir.
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-amber-300">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Zamanlama: Başlamaya 2 saat kala</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-300">
                    <Volume2 className="w-3 h-3 text-amber-400" />
                    <span>Sesli Uyarı: {soundEnabled ? 'Açık' : 'Kapalı'}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 pt-1 md:pt-0">
              <button
                type="button"
                onClick={() => handleSimulate()}
                disabled={isSimulating}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-amber-500/20 active:scale-98 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isSimulating ? 'Simüle Ediliyor...' : '2 Saat Uyarısını Simüle Et'}</span>
              </button>

              {pushPermission === 'default' && (
                <button
                  type="button"
                  onClick={() => requestPushPermission()}
                  className="w-full sm:w-auto min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tarayıcı İzni Ver</span>
                </button>
              )}
            </div>
          </div>

          {simulationSuccess && (
            <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-center gap-2 text-xs text-amber-300 animate-in fade-in">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Simülasyon tetiklendi: Ekranın üst kısmında 2 saat öncesi anlık bildirim kartı açıldı ve sesli uyarı çalındı!</span>
            </div>
          )}
        </div>
      )}

      {/* Pre-Match Gear Checklist for Upcoming Matches */}
      {tab === 'UPCOMING' && (
        <MatchGearChecklist
          matchTitle={matches.upcoming[0]?.business?.name ? `${matches.upcoming[0].business.name} (${matches.upcoming[0].court?.name || 'Kort'})` : undefined}
          matchTime={matches.upcoming[0]?.startAt ? matches.upcoming[0].startAt.split('T')[1].slice(0, 5) : undefined}
        />
      )}

      {cancelFeedback && (
        <div
          role={cancelFeedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-2xl px-4 py-3 text-xs font-semibold border ${
            cancelFeedback.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
              : 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
          }`}
        >
          {cancelFeedback.text}
        </div>
      )}

      {/* List */}
      {loading ? (
        <LoadingState message="Maç kayıtlarınız yükleniyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMatches} />
      ) : list.length === 0 ? (
        <EmptyState
          title={tab === 'UPCOMING' ? 'Yaklaşan Maçınız Yok' : 'Geçmiş Maç Bulunmuyor'}
          description={
            tab === 'UPCOMING'
              ? 'Henüz bir rezervasyon yapmadınız. Hemen kort kiralayabilir veya açık maçlara dahil olabilirsiniz.'
              : 'Daha önce tamamlanmış bir maç kaydı bulunamadı.'
          }
          actionLabel={tab === 'UPCOMING' ? 'Kort Rezervasyonu Yap' : undefined}
          onAction={() => navigate('/sahalar')}
        />
      ) : (
        <div className="space-y-3">
          {list.map((m) => (
            <div
              key={m.id}
              onClick={() => navigate(m.isOpenMatch ? `/acik-mac/${m.id}` : `/saha/${m.courtId}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(m.isOpenMatch ? `/acik-mac/${m.id}` : `/saha/${m.courtId}`);
                }
              }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:border-amber-500 dark:hover:border-amber-500 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 flex items-center justify-center font-bold">
                    <Calendar className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {new Date(m.startAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      <span>{m.startAt.split('T')[1].slice(0, 5)}</span>
                      <span>•</span>
                      <span>{m.durationMinutes} Dakika</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* 2-Hour Reminder Badge */}
                  {tab === 'UPCOMING' && (m.status === 'CONFIRMED' || m.status === 'PENDING') && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/80">
                      <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>2 Saat Öncesi Hatırlatıcı Açık</span>
                    </span>
                  )}

                  <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full ${
                    m.status === 'CONFIRMED' || m.status === 'COMPLETED'
                      ? 'bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-300'
                      : m.status === 'CANCELLED'
                      ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300'
                      : 'bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-300'
                  }`}>
                    {m.status === 'CONFIRMED' ? 'Onaylı' : m.status === 'COMPLETED' ? 'Tamamlandı' : m.status === 'CANCELLED' ? 'İptal Edildi' : 'Beklemede'}
                  </span>
                  {m.isOpenMatch && (
                    <span className="text-[11px] font-bold bg-slate-900 text-white px-2.5 py-1 rounded-full">
                      Açık Maç
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{m.business?.name || 'Padel Kulübü'}</p>
                  <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{m.court?.name || 'Kort'} ({m.business?.district})</span>
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  {tab === 'UPCOMING' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSimulate(m.id);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-slate-700 transition-colors cursor-pointer"
                      title="Bu maç için 2 saat öncesi push bildirimini simüle et"
                    >
                      <Bell className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>Uyarıyı Simüle Et</span>
                    </button>
                  )}

                  {tab === 'UPCOMING' && m.ownerUserId === user?.id && m.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancel(m);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      disabled={cancellingId === m.id}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
                        isCancellable(m)
                          ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-slate-700 border-red-200 dark:border-slate-700'
                          : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                      title={isCancellable(m) ? 'Rezervasyonu iptal et' : `İptal süresi doldu (başlamaya ${getWindowHours(m)} saatten az kaldı)`}
                    >
                      <XCircle className="w-3 h-3" aria-hidden="true" />
                      <span>{cancellingId === m.id ? 'İptal Ediliyor...' : 'İptal Et'}</span>
                    </button>
                  )}

                  <div className="text-left sm:text-right">
                    <span className="text-slate-400 text-[10px] block">Ücret</span>
                    <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                      {m.isOpenMatch ? `${Math.round(m.totalPrice / 4)} ₺ (Pay)` : `${m.totalPrice} ₺`}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
