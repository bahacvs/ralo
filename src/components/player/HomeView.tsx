import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { 
  Calendar, Clock, MapPin, Users, ChevronRight, 
  Sparkles, CheckCircle2, Trophy, MessageSquare,
  Smartphone, Download, ArrowRight, Flame, Zap
} from 'lucide-react';
import { PWAInstallModal } from '../common/PWAInstallModal.js';

export const HomeView: React.FC = () => {
  const { user, navigate } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<any | null>(null);
  const [todayOpenMatches, setTodayOpenMatches] = useState<any[]>([]);
  const [featuredClubs, setFeaturedClubs] = useState<{
    id: string; name: string; location: string; coverImage: string; rating: number; reviewsCount: number;
    courtCount: number; minPrice: number; firstCourtId: string;
  }[]>([]);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
      const [matchesRes, openMatchesRes, courtsRes] = await Promise.all([
        user
          ? api.getMyMatches().catch(() => ({ upcoming: [], past: [] }))
          : Promise.resolve({ upcoming: [], past: [] }),
        api.getOpenMatches({ minAvailableSpots: 1 }).catch(() => ({ matches: [], total: 0 })),
        api.getCourts({ date: today, startTime: '', duration: 90 }).catch(() => ({ courts: [], total: 0 }))
      ]);

      // Group bookable courts by club: best rated first, then the ones with more courts
      const clubs = new Map<string, any>();
      for (const court of courtsRes.courts) {
        const biz = court.business;
        if (!biz) continue;
        const club = clubs.get(biz.id) ?? {
          id: biz.id, name: biz.name, location: [biz.district, biz.city].filter(Boolean).join(', '),
          coverImage: biz.coverImage || court.photos?.[0] || '', rating: biz.rating ?? 0, reviewsCount: biz.reviewsCount ?? 0,
          courtCount: 0, minPrice: Infinity, firstCourtId: court.id
        };
        club.courtCount++;
        club.minPrice = Math.min(club.minPrice, court.pricePerHour);
        clubs.set(biz.id, club);
      }
      setFeaturedClubs([...clubs.values()]
        .sort((a, b) => (b.reviewsCount > 0 ? b.rating : 0) - (a.reviewsCount > 0 ? a.rating : 0) || b.courtCount - a.courtCount)
        .slice(0, 4));

      if (matchesRes.upcoming && matchesRes.upcoming.length > 0) {
        setUpcomingMatch(matchesRes.upcoming[0]);
      } else {
        setUpcomingMatch(null);
      }

      setTodayOpenMatches(openMatchesRes.matches.slice(0, 3));
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  if (loading) return <LoadingState message="RALO ana sayfası yükleniyor..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6 pb-8">
      
      {/* Welcome & Player Status Bar */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-lg border border-slate-700/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img 
              src={user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'} 
              alt={user?.displayName || 'Oyuncu Avatarı'} 
              className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400 shadow-md shadow-amber-950/30"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-serif">
                  Merhaba, {user?.displayName?.split(' ')[0] || 'Oyuncu'}!
                </h1>
                {user && (
                  <span className="bg-amber-950/80 text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-500/40">
                    {user.role === 'OYUNCU' ? 'Oyuncu' : 'İşletme'}
                  </span>
                )}
              </div>
              {user ? (
                <p className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-2">
                  <span className="font-bold text-amber-400">Elo: {user.elo}</span>
                  <span className="text-slate-500">•</span>
                  <span>{user.playSide === 'BOTH' ? 'Çift Yön (Sol/Sağ)' : user.playSide === 'LEFT' ? 'Sol Kanat' : 'Sağ Kanat'}</span>
                </p>
              ) : (
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Kort ayır, açık maçlara katıl, oyuncularla tanış.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            <button
              type="button"
              onClick={() => navigate('/siralama')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-600 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Trophy className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>Sıralama</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(user ? '/profil' : '/giris')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 shadow-lg shadow-amber-950/40 border border-amber-400/40"
            >
              <span>{user ? 'Profilim' : 'Giriş Yap'}</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming Reservation Banner */}
      {upcomingMatch ? (
        <section aria-labelledby="upcoming-match-heading" className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-3xl p-5 shadow-xs transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              <h2 id="upcoming-match-heading" className="text-sm font-extrabold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                Yaklaşan Rezervasyonunuz
              </h2>
            </div>
            <span className="text-xs font-bold text-amber-900 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-900/60 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
              {upcomingMatch.status === 'CONFIRMED' ? 'Onaylandı' : 'Ödeme Tesisde'}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs border border-amber-100 dark:border-amber-900">
                <Calendar className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Tarih & Saat</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {new Date(upcomingMatch.startAt).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })} • {upcomingMatch.startAt.split('T')[1].slice(0, 5)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs border border-amber-100 dark:border-amber-900">
                <MapPin className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Tesis & Kort</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {upcomingMatch.business?.name || 'Padel Tesis'} - {upcomingMatch.court?.name || 'Kort 1'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-start sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate(upcomingMatch.isOpenMatch ? `/acik-mac/${upcomingMatch.id}` : '/maclarim')}
                className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-500 text-white dark:text-slate-950 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer shadow-xs"
              >
                <span>Maç Detayı</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100/70 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <Calendar className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Aktif yaklaşan rezervasyonunuz yok</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Bugün kort ayırtın veya açık maçlara dahil olun.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/sahalar')}
            className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 min-h-[44px] px-3 py-2 flex items-center cursor-pointer"
          >
            Hemen Bak
          </button>
        </div>
      )}

      {/* 3D Primary Action Hero Cards */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="quick-actions-heading" className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-serif flex items-center gap-2">
              <span>Keşfet & Oyna</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kort randevusu, oyuncu eşleşmeleri ve padel topluluğu
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 [perspective:1200px]">
          
          {/* Card 1: Kort Rezervasyonu (Padel Court Background & 3D Glass) */}
          <div 
            onClick={() => navigate('/sahalar')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/sahalar'); }}
            className="group relative overflow-hidden rounded-3xl min-h-[380px] p-6 flex flex-col justify-between cursor-pointer border border-amber-500/30 dark:border-amber-500/20 shadow-xl hover:shadow-2xl hover:shadow-amber-950/50 transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-[1.015] active:scale-[0.99] transform-gpu focus-visible:ring-4 focus-visible:ring-amber-500"
          >
            {/* Background Padel Court Photo with 3D Zoom */}
            <div className="absolute inset-0 -z-20 overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&auto=format&fit=crop&q=80" 
                alt="Panoramik Padel Kortu"
                className="w-full h-full object-cover object-center scale-100 group-hover:scale-110 transition-transform duration-700 ease-out"
              />
              {/* Multi-layered 3D Depth Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/40" />
              <div className="absolute inset-0 bg-gradient-to-b from-amber-950/30 via-transparent to-slate-950/90" />
              {/* 3D Light Accent Spot */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl group-hover:bg-amber-400/30 transition-colors" />
              {/* Gloss Specular Highlight Line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
            </div>

            {/* Top Row: Floating 3D Badges */}
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-600/90 hover:bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-950/60 border border-amber-400/40 backdrop-blur-md group-hover:scale-105 group-hover:rotate-3 transition-transform duration-300">
                <Calendar className="w-6 h-6 text-slate-950 font-bold" aria-hidden="true" />
              </div>
              
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/70 border border-amber-400/40 backdrop-blur-md text-amber-300 text-xs font-bold shadow-md">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>16 Aktif Kort</span>
              </div>
            </div>

            {/* Middle 3D Feature Chips */}
            <div className="relative z-10 my-4 flex flex-wrap gap-2">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                WPT Standart Mavi Çim
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                Gece Aydınlatmalı
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                Panoramik Cam
              </span>
            </div>

            {/* Bottom Content & 3D Interactive CTA */}
            <div className="relative z-10 space-y-3">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md group-hover:text-amber-300 transition-colors font-serif">
                  Kort Rezervasyonu Yap
                </h3>
                <p className="text-xs sm:text-sm text-slate-200 mt-1 leading-relaxed line-clamp-2 drop-shadow-xs">
                  Türkiye'deki padel kortlarını inceleyin, müsait saatleri seçin ve saniyeler içinde ayırtın.
                </p>
              </div>

              <div className="pt-2">
                <div className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/60 border border-amber-400/40 backdrop-blur-md flex items-center justify-between group-hover:shadow-amber-500/40 transition-all">
                  <span className="tracking-wide">Müsait Saatleri İncele</span>
                  <div className="w-7 h-7 rounded-xl bg-slate-950/20 flex items-center justify-center group-hover:translate-x-1.5 transition-transform">
                    <ArrowRight className="w-4 h-4 text-slate-950" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Açık Maçlara Katıl (Action Padel Players Background & 3D Glass) */}
          <div 
            onClick={() => navigate('/acik-maclar')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/acik-maclar'); }}
            className="group relative overflow-hidden rounded-3xl min-h-[380px] p-6 flex flex-col justify-between cursor-pointer border border-amber-500/30 dark:border-amber-500/20 shadow-xl hover:shadow-2xl hover:shadow-amber-950/50 transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-[1.015] active:scale-[0.99] transform-gpu focus-visible:ring-4 focus-visible:ring-amber-500"
          >
            {/* Background Padel Action Players Photo with 3D Zoom */}
            <div className="absolute inset-0 -z-20 overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=1200&auto=format&fit=crop&q=80" 
                alt="Padel Oynayan Oyuncular"
                className="w-full h-full object-cover object-center scale-100 group-hover:scale-110 transition-transform duration-700 ease-out"
              />
              {/* Multi-layered 3D Depth Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/40" />
              <div className="absolute inset-0 bg-gradient-to-b from-amber-950/30 via-transparent to-slate-950/90" />
              {/* 3D Light Accent Spot */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl group-hover:bg-amber-400/30 transition-colors" />
              {/* Gloss Specular Highlight Line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />
            </div>

            {/* Top Row: Floating 3D Badges */}
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-600/90 hover:bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-950/60 border border-amber-400/40 backdrop-blur-md group-hover:scale-105 group-hover:-rotate-3 transition-transform duration-300">
                <Users className="w-6 h-6 text-amber-100" aria-hidden="true" />
              </div>
              
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/70 border border-amber-400/40 backdrop-blur-md text-amber-300 text-xs font-bold shadow-md">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Oyuncu Aranıyor</span>
              </div>
            </div>

            {/* Middle 3D Feature Chips with Avatar Stack */}
            <div className="relative z-10 my-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2 overflow-hidden py-1">
                  <img className="inline-block h-7 w-7 rounded-full ring-2 ring-amber-400 object-cover" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&q=80" alt="Oyuncu 1" />
                  <img className="inline-block h-7 w-7 rounded-full ring-2 ring-amber-400 object-cover" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&fit=crop&q=80" alt="Oyuncu 2" />
                  <img className="inline-block h-7 w-7 rounded-full ring-2 ring-amber-400 object-cover" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&fit=crop&q=80" alt="Oyuncu 3" />
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-slate-950 ring-2 ring-white">
                    +1
                  </span>
                </div>
                <span className="text-[11px] font-bold text-amber-200 drop-shadow-xs">
                  4. Oyuncu Aranıyor!
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                  Ücret Paylaşımlı
                </span>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                  Elo Seviye Dengeli
                </span>
              </div>
            </div>

            {/* Bottom Content & 3D Interactive CTA */}
            <div className="relative z-10 space-y-3">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md group-hover:text-amber-300 transition-colors font-serif">
                  Açık Maçlara Katıl
                </h3>
                <p className="text-xs sm:text-sm text-slate-200 mt-1 leading-relaxed line-clamp-2 drop-shadow-xs">
                  Eksik oyuncusu olan gruplara anında katılın, partner arama derdine son verin ve seviyenizi yükseltin.
                </p>
              </div>

              <div className="pt-2">
                <div className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-black shadow-lg shadow-amber-950/60 border border-amber-400/40 backdrop-blur-md flex items-center justify-between group-hover:shadow-amber-500/40 transition-all">
                  <span className="tracking-wide">Açık Maçları Keşfet</span>
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center group-hover:translate-x-1.5 transition-transform">
                    <ArrowRight className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Sosyal Ağ & Padel Topluluğu (Community Celebration Background & 3D Glass) */}
          <div 
            onClick={() => navigate('/akis')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/akis'); }}
            className="group relative overflow-hidden rounded-3xl min-h-[380px] p-6 flex flex-col justify-between cursor-pointer border border-indigo-500/30 dark:border-indigo-500/20 shadow-xl hover:shadow-2xl hover:shadow-indigo-950/50 transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-[1.015] active:scale-[0.99] transform-gpu focus-visible:ring-4 focus-visible:ring-indigo-500"
          >
            {/* Background Social Community Photo with 3D Zoom */}
            <div className="absolute inset-0 -z-20 overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1526676037777-05a232554f77?w=1200&auto=format&fit=crop&q=80" 
                alt="Padel Topluluğu ve Arkadaşlar"
                className="w-full h-full object-cover object-center scale-100 group-hover:scale-110 transition-transform duration-700 ease-out"
              />
              {/* Multi-layered 3D Depth Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/40" />
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-transparent to-slate-950/90" />
              {/* 3D Light Accent Spot */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-400/30 transition-colors" />
              {/* Gloss Specular Highlight Line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent" />
            </div>

            {/* Top Row: Floating 3D Badges */}
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-950/60 border border-indigo-400/40 backdrop-blur-md group-hover:scale-105 group-hover:rotate-3 transition-transform duration-300">
                <MessageSquare className="w-6 h-6 text-indigo-100" aria-hidden="true" />
              </div>
              
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/70 border border-indigo-400/40 backdrop-blur-md text-indigo-300 text-xs font-bold shadow-md">
                <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                <span>Sosyal Ağ & Akış</span>
              </div>
            </div>

            {/* Middle 3D Feature Chips */}
            <div className="relative z-10 my-4 flex flex-wrap gap-2">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                Padel Topluluğu
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                Arkadaş Ekle & Sohbet
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 backdrop-blur-xs shadow-xs transition-colors">
                Maç Daveti Gönder
              </span>
            </div>

            {/* Bottom Content & 3D Interactive CTA */}
            <div className="relative z-10 space-y-3">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md group-hover:text-indigo-300 transition-colors font-serif">
                  Sosyal Ağ & Topluluk
                </h3>
                <p className="text-xs sm:text-sm text-slate-200 mt-1 leading-relaxed line-clamp-2 drop-shadow-xs">
                  Oyuncularla takipleşin, maç davetleri gönderin, anlık durum güncellemelerini ve galibiyetleri kutlayın.
                </p>
              </div>

              <div className="pt-2">
                <div className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-black shadow-lg shadow-indigo-950/60 border border-indigo-400/40 backdrop-blur-md flex items-center justify-between group-hover:shadow-indigo-500/40 transition-all">
                  <span className="tracking-wide">Topluluk Akışına Katıl</span>
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center group-hover:translate-x-1.5 transition-transform">
                    <ArrowRight className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Today's Open Matches Spotlight */}
      <section aria-labelledby="today-matches-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="today-matches-heading" className="text-base font-extrabold text-slate-900 dark:text-white">
              Günün Öne Çıkan Açık Maçları
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Kişi başı ücret paylaşımlı ve anında katılım</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/acik-maclar')}
            className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 min-h-[44px] px-2 py-1 flex items-center cursor-pointer"
          >
            <span>Tümünü Gör</span>
            <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {todayOpenMatches.map((m) => (
            <div 
              key={m.id}
              onClick={() => navigate(`/acik-mac/${m.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/acik-mac/${m.id}`); }}
              className="open-match-card bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-amber-500/70 dark:hover:border-amber-500/60 hover:shadow-md cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none transition-transform duration-200 ease-in-out hover:scale-[1.02] focus-within:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {m.startAt.split('T')[1].slice(0, 5)} • {m.durationMinutes} dk
                </span>
                {m.isUserJoined ? (
                  <span className="inline-flex items-center gap-1 bg-amber-500 text-slate-950 font-black px-2.5 py-0.5 rounded-full text-[11px] shadow-2xs">
                    <CheckCircle2 className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                    <span>Katıldın</span>
                  </span>
                ) : (
                  <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                    m.availableSpots > 0 
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    {m.availableSpots > 0 ? `${m.availableSpots} yer boş` : 'Dolu (Yedek)'}
                  </span>
                )}
              </div>

              <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {m.business?.name || 'Padel Tesis'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-3">
                {m.court?.name || 'Kort'} ({m.court?.type === 'OUTDOOR_PANORAMIC' ? 'Panoramik' : 'Kapalı'})
              </p>

              {/* Progress & Slots */}
              <div className="flex items-center gap-1.5 mb-3">
                {[0, 1, 2, 3].map((slotIdx) => (
                  <div
                    key={slotIdx}
                    className={`h-2 flex-1 rounded-full ${
                      slotIdx < (4 - m.availableSpots) ? 'bg-amber-500 dark:bg-amber-400' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Kişi Başı</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">{m.pricePerPlayer} ₺</span>
                </div>
                <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center">
                  İncele <ChevronRight className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured clubs (real, bookable clubs) */}
      {featuredClubs.length > 0 && (
        <section aria-labelledby="featured-venues-heading" className="space-y-3">
          <h2 id="featured-venues-heading" className="text-base font-extrabold text-slate-900 dark:text-white">
            Padel Kulüpleri
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featuredClubs.map(club => (
              <div key={club.id} className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 shadow-2xs transition-colors">
                {club.coverImage ? (
                  <img src={club.coverImage} alt={`${club.name} kortları`} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center text-amber-400 font-black text-lg" aria-hidden="true">
                    {club.name}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{club.name}</h3>
                    {club.reviewsCount > 0 && (
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 shrink-0">
                        ★ {club.rating.toFixed(1)} ({club.reviewsCount})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {club.location} • {club.courtCount} Kort
                  </p>
                  <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Saatlik {club.minPrice.toLocaleString('tr-TR')} ₺'den başlayan</span>
                    <button
                      type="button"
                      onClick={() => navigate(`/saha/${club.firstCourtId}`)}
                      className="font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 min-h-[44px] px-2 py-1 flex items-center cursor-pointer"
                    >
                      Kortları Gör
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mobile App Promotion Card for iOS & Android */}
      <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 text-white border border-amber-800/40 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-600/70 border border-amber-400/40 flex items-center justify-center shrink-0 shadow-xs">
            <Smartphone className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">RALO Mobil Deneyimi</h3>
              <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                iOS & Android
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              The Social Network for Padel • Ana ekranınıza ekleyin; tam ekran kullanım, anlık maç bildirimleri ve tek dokunuşla kort rezervasyonu yapın.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInstallModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm transition-all cursor-pointer shrink-0 min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Telefona Yükle</span>
        </button>
      </div>

      {/* Padel Level & Accessibility Notice */}
      <div className="bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-3 transition-colors">
        <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="font-bold text-slate-900 dark:text-white">RALO Puanlama Sistemi (Elo):</strong> Her maç sonucunda kazanma ve kaybetme durumuna göre seviyeniz otomatik güncellenir. Seviyenize uygun açık maçlara katılarak dengeli ve keyifli padel oynayabilirsiniz.
        </p>
      </div>

      <PWAInstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  );
};
