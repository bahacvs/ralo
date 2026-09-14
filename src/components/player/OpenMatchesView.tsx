import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { OpenMatchFilterOptions } from '../../types/index.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';
import { 
  Calendar, Clock, Users, ShieldCheck, MapPin, 
  ChevronRight, Trophy, Sparkles, Filter, RotateCcw,
  CheckCircle2, Clock3, MessageSquare, Search, X
} from 'lucide-react';

export const OpenMatchesView: React.FC = () => {
  const { user, navigate } = useAuth();

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Filter states
  const [date, setDate] = useState<string>('ALL');
  const [timeRange, setTimeRange] = useState<string>('ALL');
  const [minAvailableSpots, setMinAvailableSpots] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [fitForMe, setFitForMe] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('DEFAULT');

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);

  // Debounce search input for backend API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const options: OpenMatchFilterOptions = {
        date: date !== 'ALL' ? date : undefined,
        timeRange: timeRange !== 'ALL' ? (timeRange as any) : undefined,
        minAvailableSpots: minAvailableSpots ? Number(minAvailableSpots) : undefined,
        maxPricePerPlayer: maxPrice ? Number(maxPrice) : undefined,
        fitForMe: fitForMe || undefined,
        sortBy: sortBy !== 'DEFAULT' ? (sortBy as any) : undefined,
        search: debouncedSearch.trim() || undefined
      };

      const res = await api.getOpenMatches(options);
      setMatches(res.matches);
    } catch (err: any) {
      setError(err.message || 'Açık maçlar yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [date, timeRange, minAvailableSpots, maxPrice, fitForMe, sortBy, debouncedSearch]);

  // Instant client-side search filtering on matches for zero-latency feedback
  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) return matches;
    const q = searchQuery.trim().toLowerCase();

    return matches.filter((m) => {
      const bizName = (m.business?.name || '').toLowerCase();
      const district = (m.business?.district || '').toLowerCase();
      const city = (m.business?.city || '').toLowerCase();
      const courtName = (m.court?.name || '').toLowerCase();
      const courtType = (m.court?.type || '').toLowerCase();
      const timeStr = m.startAt ? m.startAt.split('T')[1]?.slice(0, 5) : '';
      const dateStr = m.startAt ? m.startAt.split('T')[0] : '';
      
      const dateObj = new Date(m.startAt);
      const dayName = dateObj.toLocaleDateString('tr-TR', { weekday: 'long' }).toLowerCase();
      const dayShort = dateObj.toLocaleDateString('tr-TR', { weekday: 'short' }).toLowerCase();
      const monthName = dateObj.toLocaleDateString('tr-TR', { month: 'long' }).toLowerCase();

      const hour = parseInt(timeStr.slice(0, 2), 10);
      const isMorning = hour < 12 && (q.includes('sabah') || q.includes('morning'));
      const isAfternoon = hour >= 12 && hour < 17 && (q.includes('öğle') || q.includes('ogle') || q.includes('afternoon'));
      const isEvening = hour >= 17 && hour < 21 && (q.includes('akşam') || q.includes('aksam') || q.includes('evening'));
      const isNight = hour >= 21 && (q.includes('gece') || q.includes('night'));

      return (
        bizName.includes(q) ||
        district.includes(q) ||
        city.includes(q) ||
        courtName.includes(q) ||
        courtType.includes(q) ||
        timeStr.includes(q) ||
        dateStr.includes(q) ||
        dayName.includes(q) ||
        dayShort.includes(q) ||
        monthName.includes(q) ||
        isMorning ||
        isAfternoon ||
        isEvening ||
        isNight
      );
    });
  }, [matches, searchQuery]);

  const resetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setDate('ALL');
    setTimeRange('ALL');
    setMinAvailableSpots('');
    setMaxPrice('');
    setFitForMe(false);
    setSortBy('DEFAULT');
  };

  // Quick suggestion chips for location & time
  const quickSearchSuggestions = [
    { label: 'Urla', value: 'Urla', type: 'location' },
    { label: 'Bornova', value: 'Bornova', type: 'location' },
    { label: 'Çeşme', value: 'Çeşme', type: 'location' },
    { label: '18:00 (Akşam)', value: '18:00', type: 'time' },
    { label: '20:00 (Gece)', value: '20:00', type: 'time' },
    { label: 'Sabah', value: 'Sabah', type: 'time' },
  ];

  const handleSuggestionClick = (value: string) => {
    if (searchQuery.toLowerCase() === value.toLowerCase()) {
      setSearchQuery('');
    } else {
      setSearchQuery(value);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      
      {/* 3D Action Padel Header Banner */}
      <div className="relative overflow-hidden rounded-3xl min-h-[200px] sm:min-h-[220px] p-6 sm:p-8 text-white shadow-xl border border-amber-500/30 dark:border-amber-500/20 flex flex-col justify-between [perspective:1000px] group">
        {/* Background Image of Players Playing Padel */}
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=1400&auto=format&fit=crop&q=80" 
            alt="Padel Maçı Oynayan Oyuncular"
            className="w-full h-full object-cover object-center scale-100 group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-900/60" />
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/25 border border-amber-400/40 backdrop-blur-md text-amber-300 text-xs font-black shadow-md">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Canlı Oyuncu Eşleşmeleri</span>
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {matches.length} Müsait Maç
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-serif drop-shadow-md">
              Açık Padel Maçları
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed drop-shadow-xs">
              4 kişilik maçlara tek veya çift olarak katılın, eksik partneri anında tamamlayın ve kort masraflarını eşit bölüşün.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/sahalar')}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all shadow-lg shadow-amber-950/60 border border-amber-400/50 backdrop-blur-md cursor-pointer hover:scale-[1.02] active:scale-95"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Yeni Açık Maç Başlat</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/akis')}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-all border border-white/20 backdrop-blur-md cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span>Sohbet Akışı</span>
            </button>
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 pt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/90">
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            ⚡ Anında Katılım
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            ⚖️ Elo Seviye Dengesi
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            💰 Kişi Başı Eşit Ücret
          </span>
        </div>
      </div>

      {/* Search Bar for Location or Time */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
        
        {/* Main Search Input */}
        <div className="relative flex items-center">
          <div className="absolute left-3.5 pointer-events-none text-slate-400 dark:text-slate-500 flex items-center">
            <Search className="w-4 h-4 text-amber-500" aria-hidden="true" />
          </div>
          <input
            id="open-matches-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Konum (Urla, Bornova, Çeşme...) veya saat (18:00, 20:30, Akşam...) ile ara"
            aria-label="Açık maçları konum veya saat ile filtrele"
            className="w-full min-h-[46px] pl-10 pr-24 sm:pr-28 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
          />
          <div className="absolute right-2.5 flex items-center gap-1.5">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Aramayı Temizle"
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <span className="hidden sm:inline-flex text-[11px] font-black px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
              {filteredMatches.length} Maç
            </span>
          </div>
        </div>

        {/* Quick Filter Chips (Location & Time suggestions) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
            <span>Hızlı Seçim:</span>
          </span>
          {quickSearchSuggestions.map((item) => {
            const isActive = searchQuery.toLowerCase() === item.value.toLowerCase();
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleSuggestionClick(item.value)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-600 text-slate-950 font-bold shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/60'
                }`}
              >
                {item.type === 'location' ? (
                  <MapPin className={`w-3 h-3 ${isActive ? 'text-slate-950' : 'text-slate-400 dark:text-slate-500'}`} />
                ) : (
                  <Clock className={`w-3 h-3 ${isActive ? 'text-slate-950' : 'text-slate-400 dark:text-slate-500'}`} />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary Detailed Filter Row */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            
            {/* Time Range */}
            <div>
              <label htmlFor="filter-timerange" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Günün Zamanı
              </label>
              <select
                id="filter-timerange"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="ALL">Tüm Gün</option>
                <option value="MORNING">Sabah (&lt; 12:00)</option>
                <option value="AFTERNOON">Öğleden Sonra (12-17)</option>
                <option value="EVENING">Akşam (17:00+)</option>
              </select>
            </div>

            {/* Available spots */}
            <div>
              <label htmlFor="filter-spots" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Minimum Boş Yer
              </label>
              <select
                id="filter-spots"
                value={minAvailableSpots}
                onChange={(e) => setMinAvailableSpots(e.target.value)}
                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="">Farketmez</option>
                <option value="1">En az 1 yer boş</option>
                <option value="2">En az 2 yer boş</option>
                <option value="3">3 yer boş (Yeni Maç)</option>
              </select>
            </div>

            {/* Max Price */}
            <div>
              <label htmlFor="filter-maxprice" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Maks. Kişi Başı (₺)
              </label>
              <input
                id="filter-maxprice"
                type="number"
                placeholder="Maks ₺ (örn: 350)"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Sorting */}
            <div>
              <label htmlFor="filter-sort" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Sırala
              </label>
              <select
                id="filter-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="DEFAULT">En Yakın Tarih</option>
                <option value="PRICE_ASC">Ücret (Düşükten Yükseğe)</option>
                <option value="SPOTS_DESC">Boş Yere Göre</option>
              </select>
            </div>

          </div>

          {/* Quick Filter Pill: Bana Uygun Olanlar & Reset */}
          <div className="pt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={fitForMe}
                onChange={(e) => setFitForMe(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
              />
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                <span>Sadece Seviyeme (Elo) Uygun Olanlar ({user?.elo || 1450} Elo)</span>
              </span>
            </label>

            {(searchQuery || timeRange !== 'ALL' || minAvailableSpots || maxPrice || fitForMe || sortBy !== 'DEFAULT') && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-bold flex items-center gap-1 min-h-[44px] px-2 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Filtreleri Sıfırla</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Matches List */}
      {loading ? (
        <LoadingState message="Açık maçlar listeleniyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMatches} />
      ) : filteredMatches.length === 0 ? (
        <EmptyState
          title={searchQuery ? `"${searchQuery}" için Maç Bulunamadı` : "Açık Maç Bulunamadı"}
          description={
            searchQuery
              ? `"${searchQuery}" arama kriterine uygun açık maç bulunamadı. Farklı bir ilçe (örn: Urla, Bornova) veya saat (örn: 18:00, 20:00) deneyebilirsiniz.`
              : "Seçtiğiniz kriterlerde açık maç bulunamadı. Filtreleri kaldırabilir veya siz yeni bir açık maç oluşturabilirsiniz."
          }
          actionLabel={searchQuery ? "Aramayı Temizle" : "Filtreleri Temizle"}
          onAction={resetFilters}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMatches.map((m) => {
            const isFull = m.availableSpots === 0;
            return (
              <div
                key={m.id}
                onClick={() => navigate(`/acik-mac/${m.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/acik-mac/${m.id}`);
                }}
                className={`open-match-card group bg-white dark:bg-slate-900 rounded-3xl border p-5 shadow-xs hover:shadow-md cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none transition-transform duration-200 ease-in-out hover:scale-[1.02] focus-within:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none ${
                  m.isUserJoined 
                    ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-400/40 bg-amber-50/20 dark:bg-amber-950/10' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/70 dark:hover:border-amber-500/60'
                }`}
              >
                {/* Top Row: Date, Time, Status */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-900 dark:bg-slate-800 text-white text-xs font-black px-3 py-1 rounded-xl border border-slate-700/50">
                      {m.startAt.split('T')[1].slice(0, 5)}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {new Date(m.startAt).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">• {m.durationMinutes} Dk</span>
                  </div>

                  {m.isUserJoined ? (
                    <span className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-xs font-black px-3 py-1 rounded-full shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                      <span>Katıldın</span>
                    </span>
                  ) : m.isUserOnWaitlist ? (
                    <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                      <Clock3 className="w-3 h-3 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                      <span>Yedektesin</span>
                    </span>
                  ) : (
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      isFull 
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' 
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}>
                      {isFull ? 'Kadro Dolu' : `${m.availableSpots} Boş Yer`}
                    </span>
                  )}
                </div>

                {/* Venue & Court Info */}
                <div className="mt-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug">
                    {m.business?.name} - {m.court?.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <span>{m.business?.district}, İzmir</span>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span>{m.court?.type === 'OUTDOOR_PANORAMIC' ? 'Panoramik Cam' : 'Kapalı'}</span>
                  </p>
                </div>

                {/* Secondary Badges: Elo, Casual, Approval */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/60 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>Elo {m.minElo || 1200} - {m.maxElo || 1600}</span>
                  </span>

                  <span className="text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg">
                    {m.matchType === 'CASUAL' ? 'Dostluk Maçı' : 'Rekabetçi'}
                  </span>

                  <span className="text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg">
                    {m.genderPreference === 'MIXED' ? 'Karma' : m.genderPreference === 'FEMALE' ? 'Kadınlar' : 'Erkekler'}
                  </span>

                  {m.approvalRequired && (
                    <span className="text-[11px] font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span>Onaylı</span>
                    </span>
                  )}
                </div>

                {/* Slots Indicator (1/4, 2/4, 3/4, 4/4) */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Katılımcı Durumu:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {m.activeParticipantsCount} / 4 Oyuncu
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 1, 2, 3].map((slotIdx) => {
                      const isOccupied = slotIdx < m.activeParticipantsCount;
                      return (
                        <div
                          key={slotIdx}
                          className={`h-2.5 rounded-full transition-colors ${
                            isOccupied ? 'bg-amber-500 dark:bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Card Footer: Price & CTA */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Kişi Başı Pay</span>
                    <div className="text-lg font-black text-slate-900 dark:text-white">
                      {m.pricePerPlayer} ₺
                    </div>
                  </div>

                  <button
                    type="button"
                    tabIndex={-1}
                    className="inline-flex items-center gap-1 min-h-[44px] px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs transition-colors shadow-md shadow-amber-950/20 border border-amber-400/40 cursor-pointer"
                  >
                    <span>{isFull ? 'Yedek Listesi / İncele' : 'Detayı Gör / Katıl'}</span>
                    <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
