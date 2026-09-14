import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { ReservationSuccessNotification, ReservationSuccessData } from '../common/ReservationSuccessNotification.js';
import { 
  Calendar, Clock, MapPin, Users, ShieldCheck, 
  ArrowLeft, CheckCircle2, AlertCircle, Sparkles, Heart,
  Zap, Check, Flame, ChevronRight
} from 'lucide-react';

export const CourtDetailView: React.FC = () => {
  const { routeParams, navigate, user, updateUser } = useAuth();
  const courtId = routeParams.sahaId;

  const urlParams = new URLSearchParams(window.location.search);
  const initialDate = urlParams.get('date') || new Date().toISOString().split('T')[0];
  const initialDuration = Number(urlParams.get('duration')) || 90;

  const [date, setDate] = useState<string>(initialDate);
  const [duration, setDuration] = useState<60 | 90 | 120>(initialDuration as any);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Favorite states
  const [isFavorite, setIsFavorite] = useState<boolean>(() => {
    if (courtId && user?.favoriteCourtIds) {
      return user.favoriteCourtIds.includes(courtId);
    }
    return false;
  });
  const [favLoading, setFavLoading] = useState(false);
  const [favFeedback, setFavFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (courtId && user?.favoriteCourtIds) {
      setIsFavorite(user.favoriteCourtIds.includes(courtId));
    }
  }, [courtId, user?.favoriteCourtIds]);

  const handleToggleFavorite = async () => {
    if (!courtId) return;
    const nextFav = !isFavorite;
    setIsFavorite(nextFav);
    setFavLoading(true);
    try {
      const res = await api.toggleFavoriteCourt(courtId);
      if (res?.user) {
        updateUser(res.user);
      }
      setFavFeedback(nextFav ? 'Kort favorilerinize kaydedildi! Profilinizde görebilirsiniz.' : 'Kort favorilerinizden çıkarıldı.');
      setTimeout(() => setFavFeedback(null), 3500);
    } catch (err: any) {
      setIsFavorite(!nextFav);
      setFavFeedback('Favori durumu güncellenemedi.');
      setTimeout(() => setFavFeedback(null), 3000);
    } finally {
      setFavLoading(false);
    }
  };

  // Open match creation toggle
  const [isOpenMatch, setIsOpenMatch] = useState(false);
  const [openMatchNote, setOpenMatchNote] = useState('');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [minElo, setMinElo] = useState<number>(1200);
  const [maxElo, setMaxElo] = useState<number>(1600);

  // States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courtData, setCourtData] = useState<any | null>(null);

  // Booking states
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<any | null>(null);

  const fetchDetail = async () => {
    if (!courtId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCourtDetail(courtId, date, duration);
      setCourtData(res);
      // Auto-select first available slot if not selected
      const firstAvailable = res.slots.find(s => s.isAvailable);
      if (firstAvailable && !selectedSlot) {
        setSelectedSlot(firstAvailable.time);
      }
    } catch (err: any) {
      setError(err.message || 'Kort bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [courtId, date, duration]);

  const handleBooking = async () => {
    if (!courtId || !selectedSlot) return;
    setBookingLoading(true);
    setBookingError(null);

    const startAt = `${date}T${selectedSlot}:00`;

    try {
      const res = await api.createReservation({
        courtId,
        startAt,
        durationMinutes: duration,
        isOpenMatch,
        openMatchNote: isOpenMatch ? openMatchNote : undefined,
        approvalRequired: isOpenMatch ? approvalRequired : false,
        minElo: isOpenMatch ? minElo : undefined,
        maxElo: isOpenMatch ? maxElo : undefined
      });

      setBookingSuccess(res.reservation);
    } catch (err: any) {
      setBookingError(err.message || 'Rezervasyon oluşturulurken bir çakışma veya hata oluştu.');
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) return <LoadingState message="Kort müsaitlik tablosu yükleniyor..." />;
  if (error) return <ErrorState message={error} onRetry={fetchDetail} />;
  if (!courtData) return null;

  const { court, business, slots, pricePerHour } = courtData;
  const totalPrice = Math.round(pricePerHour * (duration / 60));
  const pricePerPlayer = Math.round(totalPrice / 4);

  const availableSlots = (slots || []).filter((s: any) => s.isAvailable);
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

  const dateObj = new Date(date + 'T12:00:00');
  const formattedDate = dateObj.toLocaleDateString('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  return (
    <div className="space-y-6 pb-28">
      
      {/* Feedback Toast */}
      {favFeedback && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{favFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFavFeedback(null)}
            className="text-xs text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white font-bold cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-3">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => navigate('/sahalar')}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Kort Listesine Dön</span>
        </button>

        {/* Favorite Heart Button in Header */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={favLoading}
          className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer border active:scale-95 disabled:opacity-60 ${
            isFavorite
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 hover:bg-rose-100'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
          }`}
          title={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
          aria-label={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
        >
          <Heart className={`w-4 h-4 transition-transform active:scale-125 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-500 dark:text-slate-400'}`} />
          <span>{isFavorite ? 'Favorilerimde' : 'Favorilere Ekle'}</span>
        </button>
      </div>

      {/* Court Header & Photo */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition-colors">
        <div className="relative h-64 sm:h-80 w-full bg-slate-900">
          <img
            src={court.photos?.[0] || 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'}
            alt={court.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-black/20 to-black/30" />

          {/* Floating Heart Favorite Button on the Photo */}
          <div className="absolute top-4 right-4 z-10">
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={favLoading}
              className={`group flex items-center gap-2 px-3.5 py-2 rounded-2xl backdrop-blur-md transition-all shadow-lg cursor-pointer border active:scale-95 disabled:opacity-60 ${
                isFavorite
                  ? 'bg-rose-600/90 hover:bg-rose-600 text-white border-rose-300/40 shadow-rose-950/50'
                  : 'bg-black/45 hover:bg-black/70 text-white border-white/25 hover:border-white/40'
              }`}
              title={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
              aria-label={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
            >
              <Heart 
                className={`w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110 ${
                  isFavorite ? 'fill-white text-white' : 'text-white fill-transparent group-hover:text-rose-400'
                }`} 
              />
              <span className="text-xs font-bold drop-shadow-xs">
                {isFavorite ? 'Kaydedildi' : 'Favorilere Ekle'}
              </span>
            </button>
          </div>

          <div className="absolute bottom-5 left-5 right-5 text-white">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="bg-amber-500 text-slate-950 text-xs font-black px-3 py-1 rounded-full shadow-xs">
                {court.type === 'OUTDOOR_PANORAMIC' ? 'Panoramik Cam' : 'Kapalı Kort'}
              </span>
              <span className="bg-slate-900/80 backdrop-blur-xs text-slate-200 text-xs font-semibold px-3 py-1 rounded-full">
                {court.surface}
              </span>
              <span className="bg-amber-400 text-slate-950 text-xs font-black px-2.5 py-1 rounded-full">
                ★ {business?.rating || '4.9'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-serif text-white tracking-tight">
              {business?.name} - {court.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>{business?.address}, {business?.district}, {business?.city || 'İzmir'}</span>
            </p>
          </div>
        </div>

        {/* Business Amenities & Features */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Tesis Olanakları</h2>
          <div className="flex flex-wrap gap-2">
            {business?.amenities?.map((amenity: string) => (
              <span key={amenity} className="inline-flex items-center gap-1.5 text-xs font-medium bg-white text-slate-800 border border-slate-200/90 px-3 py-1.5 rounded-xl shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span>{amenity}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Instant Quick-Rent Card ("Hemen Kirala") */}
      <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-50 dark:to-slate-900 rounded-3xl p-5 sm:p-6 border-2 border-amber-400/80 dark:border-amber-500/50 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 dark:border-amber-900/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
              <Zap className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 text-[11px] font-black uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Hızlı Rezervasyon</span>
              </div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Takvime Gitmeden Hemen Kirala
              </h2>
            </div>
          </div>

          {/* Quick Date Shortcuts (Bugün / Yarın) */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto shadow-2xs">
            <button
              type="button"
              onClick={() => setDate(todayStr)}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                date === todayStr
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Bugün ({todayStr.slice(5)})
            </button>
            <button
              type="button"
              onClick={() => setDate(tomorrowStr)}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                date === tomorrowStr
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Yarın ({tomorrowStr.slice(5)})
            </button>
          </div>
        </div>

        {/* Quick Time Slots Selection */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Müsait Saat Dilimi Seçin ({date === todayStr ? 'Bugün' : date === tomorrowStr ? 'Yarın' : date}):</span>
            </span>
            {selectedSlot && (
              <span className="text-xs font-bold text-amber-800 dark:text-amber-400">
                Seçili Seans: {selectedSlot} ({duration} dk)
              </span>
            )}
          </div>

          {availableSlots.length === 0 ? (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
              Seçilen tarihte ({date}) uygun seans bulunamadı. Lütfen yukarıdan yarını kontrol edin veya aşağıdaki takvimden başka bir gün seçin.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {availableSlots.map((slot: any) => {
                const isSelected = selectedSlot === slot.time;
                return (
                  <button
                    key={`quick-${slot.time}`}
                    type="button"
                    onClick={() => setSelectedSlot(slot.time)}
                    className={`min-h-[48px] p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 border-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-400/50 scale-102'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-amber-400 font-bold hover:bg-amber-50/50 dark:hover:bg-slate-750'
                    }`}
                  >
                    <div className="text-xs font-black">{slot.time}</div>
                    <div className={`text-[10px] ${isSelected ? 'text-slate-950/80 font-bold' : 'text-slate-500'}`}>
                      {slot.endTime}'ye kadar
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Slot Callout & Instant 'Hemen Kirala' Button */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-amber-300/80 dark:border-amber-500/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Hızlı Rezervasyon:</span>
              <strong className="text-xs font-black text-slate-900 dark:text-white">
                {date === todayStr ? 'Bugün' : date === tomorrowStr ? 'Yarın' : date} • {selectedSlot || 'Lütfen seans seçin'}
              </strong>
              {selectedSlot && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300">
                  {duration} dk
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span>Toplam Kira Bedeli:</span>
              <span className="text-base font-black text-slate-950 dark:text-white font-mono">{totalPrice} ₺</span>
              <span className="text-slate-400 text-[11px]">(4 kişi paylaşımlı: {pricePerPlayer} ₺ / kişi)</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!selectedSlot || bookingLoading}
            onClick={handleBooking}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-8 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-black transition-all shadow-md active:scale-98 focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer shrink-0"
          >
            <Zap className="w-4 h-4 fill-slate-950" />
            <span>{bookingLoading ? 'Ayırtılıyor...' : 'Hemen Kirala'}</span>
            <span className="text-xs font-mono font-bold bg-slate-950/10 px-2 py-0.5 rounded-lg">
              {totalPrice} ₺
            </span>
          </button>
        </div>

        {bookingError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{bookingError}</span>
          </div>
        )}
      </div>

      {/* Date & Duration Selectors */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-500" aria-hidden="true" />
          <span>Rezervasyon Tarihi ve Süresi</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="res-date" className="block text-xs font-bold text-slate-700 mb-1">
              Tarih Seçin
            </label>
            <input
              id="res-date"
              type="date"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <span id="res-duration-label" className="block text-xs font-bold text-slate-700 mb-1">
              Oyun Süresi (Kort Standartları)
            </span>
            <div role="radiogroup" aria-labelledby="res-duration-label" className="grid grid-cols-3 gap-2">
              {[60, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={duration === d}
                  onClick={() => setDuration(d as 60 | 90 | 120)}
                  className={`min-h-[44px] rounded-xl text-xs font-bold transition-all ${
                    duration === d 
                      ? 'bg-amber-500 text-slate-950 shadow-xs' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  } focus-visible:ring-2 focus-visible:ring-amber-500`}
                >
                  {d} Dakika
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Slot Selection Grid */}
        <div className="pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
            <span>Müsait Başlama Saatleri ({date})</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {slots.map((slot: any) => {
              const isSelected = selectedSlot === slot.time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.isAvailable}
                  onClick={() => setSelectedSlot(slot.time)}
                  aria-pressed={isSelected}
                  className={`min-h-[50px] p-2 rounded-xl border text-center transition-all ${
                    !slot.isAvailable
                      ? 'bg-slate-100/70 border-slate-200 text-slate-400 line-through cursor-not-allowed'
                      : isSelected
                      ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-sm font-black'
                      : 'bg-white border-slate-200 hover:border-amber-400 text-slate-900 font-semibold'
                  } focus-visible:ring-2 focus-visible:ring-amber-500`}
                >
                  <div className="text-sm">{slot.time}</div>
                  <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                    {slot.isAvailable ? `${slot.endTime}'ye kadar` : 'Dolu'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Booking Options: Standard vs Open Match */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" aria-hidden="true" />
              <span>Açık Maç Olarak Başlat</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              4 kişi değilseniz maçı platforma açın; diğer oyuncular katılarak masrafı paylaşsın.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={isOpenMatch}
              onChange={(e) => setIsOpenMatch(e.target.checked)}
              className="sr-only peer"
              aria-label="Açık maç modunu aç veya kapat"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>

        {isOpenMatch && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
            <div>
              <label htmlFor="openmatch-note" className="block text-xs font-bold text-slate-700 mb-1">
                Oyuncular İçin Not / Kurallar
              </label>
              <textarea
                id="openmatch-note"
                rows={2}
                value={openMatchNote}
                onChange={(e) => setOpenMatchNote(e.target.value)}
                placeholder="Örn: Orta seviye tempo, keyifli oyun. 15 dk önce ısınma için kortta olalım."
                className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Elo Seviye Aralığı</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minElo}
                    onChange={(e) => setMinElo(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    placeholder="Min Elo (1200)"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    value={maxElo}
                    onChange={(e) => setMaxElo(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    placeholder="Maks Elo (1600)"
                  />
                </div>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={approvalRequired}
                    onChange={(e) => setApprovalRequired(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-500 h-4 w-4"
                  />
                  <span>Katılımcıları onaylamam gereksin</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reservation Summary & Booking Action */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400">Rezervasyon Özeti</span>
            <h3 className="text-lg font-bold text-white mt-0.5">
              {court.name} • {date} • {selectedSlot || '--:--'} ({duration} Dk)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              İptal Politikası: Maçtan 24 saat öncesine kadar cezasız tam iptal hakkı.
            </p>
          </div>

          <div className="text-right sm:text-right">
            <span className="text-xs text-slate-400 block">Kort Toplam Tutar</span>
            <div className="text-2xl font-black text-white">{totalPrice} ₺</div>
            <span className="text-xs font-bold text-amber-400">Kişi Başı: {pricePerPlayer} ₺</span>
          </div>
        </div>

        {bookingError && (
          <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{bookingError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Ödeme tesiste, nakit veya POS ile yapılacaktır. Ön ödeme gerekmez.</span>
          </div>

          <button
            type="button"
            disabled={!selectedSlot || bookingLoading}
            onClick={handleBooking}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] px-8 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-black transition-all shadow-md focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-slate-950" />
            <span>{bookingLoading ? 'İşleniyor...' : isOpenMatch ? 'Açık Maçı Oluştur' : 'Hemen Kirala'}</span>
          </button>
        </div>
      </div>

      {/* Sticky Floating Quick-Rent Bottom Dock */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-4 py-3 text-white shadow-2xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-400 truncate">{court.name}</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">• {business?.name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-200 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-bold text-white">
                {date === todayStr ? 'Bugün' : date === tomorrowStr ? 'Yarın' : date} {selectedSlot || 'Seans Seçin'}
              </span>
              <span className="text-slate-400">({duration} dk)</span>
              <span className="font-black text-amber-400 ml-1 font-mono text-sm">{totalPrice} ₺</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!selectedSlot || bookingLoading}
            onClick={handleBooking}
            className="inline-flex items-center gap-2 min-h-[46px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-md active:scale-95 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Zap className="w-4 h-4 fill-slate-950" />
            <span>{bookingLoading ? 'Ayırtılıyor...' : 'Hemen Kirala'}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Booking Success Notification (Mini Modal / Interactive Toast) */}
      {bookingSuccess && (
        <ReservationSuccessNotification
          data={{
            reservation: bookingSuccess,
            court,
            business,
            date,
            startTime: selectedSlot || '18:00',
            duration,
            totalPrice,
            isOpenMatch,
            participantLimit: 4,
            openMatchNote: isOpenMatch ? openMatchNote : undefined
          }}
          onClose={() => {
            setBookingSuccess(null);
          }}
          onNavigateToMatches={() => {
            setBookingSuccess(null);
            navigate('/maclarim');
          }}
          onNavigateToOpenMatch={(matchId) => {
            setBookingSuccess(null);
            navigate(`/acik-mac/${matchId}`);
          }}
        />
      )}

    </div>
  );
};
