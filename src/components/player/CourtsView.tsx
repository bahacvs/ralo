import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLocation, TURKEY_CITIES } from '../../context/LocationContext.js';
import { api } from '../../services/api.js';
import { CourtFilterOptions } from '../../types/index.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { LocationBar } from '../common/LocationBar.js';
import { 
  Calendar, Clock, SlidersHorizontal, MapPin, 
  Sparkles, Check, ChevronRight, RotateCcw, Navigation
} from 'lucide-react';

export const CourtsView: React.FC = () => {
  const { navigate } = useAuth();
  const { 
    coords, 
    selectedCity, 
    selectedDistrict, 
    setSelectedCity, 
    setSelectedDistrict, 
    formatDistance 
  } = useLocation();
  
  // Basic initial filters
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState<string>(todayStr);
  const [startTime, setStartTime] = useState<string>('18:00');
  const [duration, setDuration] = useState<60 | 90 | 120>(90);
  const [radiusKm, setRadiusKm] = useState<number>(0);

  // Advanced filters state
  const [courtType, setCourtType] = useState<string>('ALL');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minRating, setMinRating] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('DEFAULT');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  
  // Modal toggle for advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courts, setCourts] = useState<any[]>([]);

  // Count active advanced filters
  const activeAdvancedCount = [
    selectedCity !== 'Tüm Türkiye',
    selectedDistrict !== 'ALL' && selectedDistrict !== 'Tüm İlçeler',
    radiusKm > 0,
    courtType !== 'ALL',
    minPrice !== '',
    maxPrice !== '',
    minRating !== '',
    sortBy !== 'DEFAULT',
    selectedAmenities.length > 0
  ].filter(Boolean).length;

  const fetchCourts = async () => {
    setLoading(true);
    setError(null);
    try {
      const options: CourtFilterOptions = {
        date,
        startTime,
        duration,
        city: selectedCity !== 'Tüm Türkiye' ? selectedCity : undefined,
        district: selectedDistrict !== 'ALL' && selectedDistrict !== 'Tüm İlçeler' ? selectedDistrict : undefined,
        courtType: courtType !== 'ALL' ? courtType : undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        minRating: minRating ? Number(minRating) : undefined,
        sortBy: sortBy !== 'DEFAULT' ? (sortBy as any) : undefined,
        amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
        userLat: coords?.latitude,
        userLng: coords?.longitude,
        maxDistanceKm: radiusKm > 0 ? radiusKm : undefined
      };

      const res = await api.getCourts(options);
      setCourts(res.courts);
    } catch (err: any) {
      setError(err.message || 'Kortlar listelenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourts();
  }, [date, startTime, duration, selectedCity, selectedDistrict, radiusKm, courtType, minPrice, maxPrice, minRating, sortBy, selectedAmenities, coords]);

  const resetAllFilters = () => {
    setDate(todayStr);
    setStartTime('18:00');
    setDuration(90);
    setSelectedCity('Tüm Türkiye');
    setSelectedDistrict('ALL');
    setRadiusKm(0);
    setCourtType('ALL');
    setMinPrice('');
    setMaxPrice('');
    setMinRating('');
    setSortBy('DEFAULT');
    setSelectedAmenities([]);
    setShowAdvancedFilters(false);
  };

  const amenitiesList = [
    'Işıklandırma (LED)',
    'Soyunma Odası & Duş',
    'Otopark',
    'Kafe / Dinlenme Alanı',
    'Raket & Top Kiralama',
    'Kamera / Maç Kaydı'
  ];

  return (
    <div className="space-y-5 pb-8">
      
      {/* 3D Panoramic Court Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl min-h-[190px] sm:min-h-[210px] p-6 sm:p-8 text-white shadow-xl border border-amber-500/30 dark:border-amber-500/20 flex flex-col justify-between [perspective:1000px] group">
        {/* Background Panoramic Court Image with 3D Zoom */}
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400&auto=format&fit=crop&q=80" 
            alt="Panoramik Padel Kortu"
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
                <span>Türkiye Geneli Doğrulanmış Tesisler</span>
              </span>
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-amber-400" />
                <span>{selectedCity !== 'Tüm Türkiye' ? selectedCity : 'Tüm Türkiye'}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-serif drop-shadow-md">
              Kort Rezervasyonu Yap
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed drop-shadow-xs">
              İstanbul, Ankara, İzmir, Antalya ve diğer şehirlerdeki WPT standartlarında panoramik cam kortları inceleyin, size en yakın kortu anında ayırtın.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(true)}
              className="relative inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/30 backdrop-blur-md shadow-md transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
              aria-expanded={showAdvancedFilters}
            >
              <SlidersHorizontal className="w-4 h-4 text-amber-300" aria-hidden="true" />
              <span>Gelişmiş Filtreler</span>
              {activeAdvancedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black">
                  {activeAdvancedCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 pt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/90">
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            🎾 30+ Panoramik Kort
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            📍 Konuma Göre En Yakınlar
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            💡 Gece LED Aydınlatması
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            🔒 Anında Rezervasyon Onayı
          </span>
        </div>
      </div>

      {/* Location & Radius Selection Bar */}
      <LocationBar 
        showRadiusSelect={!!coords} 
        selectedRadius={radiusKm} 
        onRadiusChange={setRadiusKm} 
      />

      {/* 3 Core Basic Filters Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          
          {/* 1. Date Picker */}
          <div>
            <label htmlFor="court-filter-date" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Oynama Tarihi</span>
            </label>
            <input
              id="court-filter-date"
              type="date"
              value={date}
              min={todayStr}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* 2. Start Time */}
          <div>
            <label htmlFor="court-filter-time" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Tercih Edilen Saat</span>
            </label>
            <select
              id="court-filter-time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="09:00">09:00 (Sabah)</option>
              <option value="10:30">10:30</option>
              <option value="12:00">12:00 (Öğle)</option>
              <option value="14:00">14:00</option>
              <option value="16:00">16:00</option>
              <option value="17:30">17:30</option>
              <option value="18:00">18:00 (Akşam)</option>
              <option value="19:30">19:30</option>
              <option value="21:00">21:00 (Gece - Işıklandırmalı)</option>
            </select>
          </div>

          {/* 3. Duration (Strictly 60, 90, 120 minutes) */}
          <div>
            <label id="duration-label" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Maç Süresi</span>
            </label>
            <div role="radiogroup" aria-labelledby="duration-label" className="grid grid-cols-3 gap-1.5">
              {[60, 90, 120].map((d) => {
                const isSelected = duration === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setDuration(d as 60 | 90 | 120)}
                    className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    } focus-visible:ring-2 focus-visible:ring-amber-500`}
                  >
                    {d} dk
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Active Filter Tags */}
        {activeAdvancedCount > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Uygulanan filtreler:</span>
              {selectedCity !== 'Tüm Türkiye' && (
                <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                  📍 {selectedCity}
                </span>
              )}
              {selectedDistrict !== 'ALL' && selectedDistrict !== 'Tüm İlçeler' && (
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-md">
                  {selectedDistrict}
                </span>
              )}
              {radiusKm > 0 && (
                <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold px-2 py-0.5 rounded-md">
                  Maks {radiusKm} km
                </span>
              )}
              {courtType !== 'ALL' && (
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-md">
                  {courtType === 'OUTDOOR_PANORAMIC' ? 'Panoramik' : 'Kapalı'}
                </span>
              )}
              {minPrice && (
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-md">
                  Min {minPrice} ₺
                </span>
              )}
              {maxPrice && (
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-md">
                  Maks {maxPrice} ₺
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1 min-h-[44px] px-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sıfırla</span>
            </button>
          </div>
        )}
      </div>

      {/* Courts List */}
      {loading ? (
        <LoadingState message="Kort müsaitlikleri hesaplanıyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchCourts} />
      ) : courts.length === 0 ? (
        <EmptyState
          title="Uygun Kort Bulunamadı"
          description="Seçtiğiniz tarih, süre veya filtre kriterlerine uygun müsait kort bulunamadı. Filtreleri esnetmeyi deneyin."
          actionLabel="Tüm Filtreleri Temizle"
          onAction={resetAllFilters}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courts.map((court) => {
            const biz = court.business;
            return (
              <div
                key={court.id}
                onClick={() => navigate(`/saha/${court.id}?date=${date}&duration=${duration}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    navigate(`/saha/${court.id}?date=${date}&duration=${duration}`);
                  }
                }}
                className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md hover:border-amber-500 dark:hover:border-amber-500 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {/* Court Photo Banner */}
                <div className="relative h-44 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={court.photos?.[0] || 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'}
                    alt={`${court.name} fotoğrafı`}
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <span className="bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                      {court.type === 'OUTDOOR_PANORAMIC' ? 'Açık Panoramik' : court.type === 'INDOOR' ? 'Kapalı Kort' : 'Açık Standart'}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 rounded-full text-xs font-extrabold text-slate-900 dark:text-amber-400 shadow-xs">
                    ★ {biz?.rating || '4.8'}
                  </div>
                  <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-xs text-amber-300 text-xs font-bold px-3 py-1 rounded-xl">
                    İlk Uygun Saat: {court.firstAvailableTime}
                  </div>
                </div>

                {/* Court Content */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {biz?.name} - {court.name}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span>{biz?.district}, İzmir</span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span>{court.surface}</span>
                      </p>
                    </div>
                  </div>

                  {/* Amenities Badges */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {biz?.amenities?.slice(0, 3).map((a: string) => (
                      <span key={a} className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                        {a}
                      </span>
                    ))}
                    {biz?.amenities?.length > 3 && (
                      <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-md">
                        +{biz.amenities.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Pricing and Action Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-extrabold text-slate-900 dark:text-white">
                          {court.totalPrice} ₺
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">/ {duration} dk</span>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block">
                        Kişi başı: {court.pricePerPlayer} ₺ (4 kişi)
                      </span>
                    </div>

                    <button
                      type="button"
                      tabIndex={-1}
                      className="inline-flex items-center gap-1 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-xs cursor-pointer"
                    >
                      <span>Uygunlukları Gör</span>
                      <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Accessible Advanced Filters Modal */}
      <Modal
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        title="Detaylı Filtreleme"
        description="Padel kortu aramanızı konum, kort türü ve özelliklere göre özelleştirin."
        maxWidth="lg"
      >
        <div className="space-y-4">
          
          {/* District Filter */}
          <div>
            <label htmlFor="filter-district" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              İlçe / Bölge
            </label>
            <select
              id="filter-district"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="ALL">Tüm İlçeler</option>
              {selectedCity !== 'Tüm Türkiye' && TURKEY_CITIES[selectedCity] ? (
                TURKEY_CITIES[selectedCity].districts.filter(d => d !== 'Tüm İlçeler').map(d => (
                  <option key={d} value={d}>{d}</option>
                ))
              ) : (
                <>
                  <option value="Urla">Urla (İzmir)</option>
                  <option value="Çeşme">Çeşme (İzmir)</option>
                  <option value="Bornova">Bornova (İzmir)</option>
                  <option value="Karşıyaka">Karşıyaka (İzmir)</option>
                  <option value="Sarıyer">Sarıyer (İstanbul)</option>
                  <option value="Kadıköy">Kadıköy (İstanbul)</option>
                  <option value="Çankaya">Çankaya (Ankara)</option>
                  <option value="Muratpaşa">Muratpaşa (Antalya)</option>
                  <option value="Bodrum">Bodrum (Muğla)</option>
                </>
              )}
            </select>
          </div>

          {/* Court Type Filter */}
          <div>
            <label htmlFor="filter-courttype" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Kort Tipi
            </label>
            <select
              id="filter-courttype"
              value={courtType}
              onChange={(e) => setCourtType(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="ALL">Tümü (Açık & Kapalı)</option>
              <option value="OUTDOOR_PANORAMIC">Açık Panoramik (WPT Cam)</option>
              <option value="INDOOR">Kapalı Kort (İklimlendirilmiş)</option>
              <option value="OUTDOOR_STANDARD">Açık Standart</option>
            </select>
          </div>

          {/* Price Range */}
          <div>
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Fiyat Aralığı (₺/saat)</span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Min ₺ (örn: 800)"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Maks ₺ (örn: 1400)"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Sorting */}
          <div>
            <label htmlFor="filter-sortby" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Sıralama
            </label>
            <select
              id="filter-sortby"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="DEFAULT">Önerilen Sıralama</option>
              <option value="PRICE_ASC">Fiyata Göre (Önce En Düşük)</option>
              <option value="PRICE_DESC">Fiyata Göre (Önce En Yüksek)</option>
              <option value="RATING_DESC">İşletme Puanına Göre</option>
            </select>
          </div>

          {/* Amenities Multi-Select */}
          <div>
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Tesis Olanakları</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {amenitiesList.map((a) => {
                const checked = selectedAmenities.includes(a);
                return (
                  <label 
                    key={a}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      checked 
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 font-bold' 
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setSelectedAmenities(selectedAmenities.filter(x => x !== a));
                        } else {
                          setSelectedAmenities([...selectedAmenities, a]);
                        }
                      }}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 bg-white dark:bg-slate-800"
                    />
                    <span>{a}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={resetAllFilters}
              className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Filtreleri Sıfırla
            </button>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(false)}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer shadow-xs"
            >
              Uygula ({courts.length} Kort)
            </button>
          </div>

        </div>
      </Modal>

    </div>
  );
};
