import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, Calendar, Clock, MapPin, Share2, Copy, Check, 
  ArrowRight, Users, Sparkles, X, Minimize2, Maximize2, ExternalLink
} from 'lucide-react';

export interface ReservationSuccessData {
  reservation: {
    id: string;
    totalPrice?: number;
    status?: string;
    isOpenMatch?: boolean;
    startAt?: string;
  };
  court: {
    id: string;
    name: string;
    type?: string;
    surface?: string;
    pricePerHour?: number;
    photos?: string[];
  };
  business: {
    id: string;
    name: string;
    city: string;
    district: string;
    address?: string;
    phone?: string;
  };
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  duration: number; // minutes: 60, 90, 120
  totalPrice: number;
  isOpenMatch?: boolean;
  participantLimit?: number;
  openMatchNote?: string;
}

interface Props {
  data: ReservationSuccessData | null;
  onClose: () => void;
  onNavigateToMatches: () => void;
  onNavigateToOpenMatch?: (matchId: string) => void;
}

// Gentle pleasant success chime using Web Audio API
function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    
    // First tone (E5 ~ 659Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.04, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (B5 ~ 987Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.12);
    gain2.gain.setValueAtTime(0.05, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    // Graceful fallback if Web Audio is restricted
  }
}

export const ReservationSuccessNotification: React.FC<Props> = ({
  data,
  onClose,
  onNavigateToMatches,
  onNavigateToOpenMatch
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [countdown, setCountdown] = useState<number>(10);
  const [isPaused, setIsPaused] = useState(false);

  // Play audio chime once when notification opens
  useEffect(() => {
    if (data) {
      playSuccessChime();
      setCountdown(10);
      setIsPaused(false);
      setIsMinimized(false);
    }
  }, [data?.reservation?.id]);

  // Dynamic countdown timer for automatic navigation
  useEffect(() => {
    if (!data || isPaused || isMinimized) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handlePrimaryAction();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [data, isPaused, isMinimized]);

  if (!data) return null;

  const {
    reservation,
    court,
    business,
    date,
    startTime,
    duration,
    totalPrice,
    isOpenMatch
  } = data;

  // Calculate end time
  const [startH, startM] = startTime.split(':').map(Number);
  const endMinutesTotal = startH * 60 + startM + duration;
  const endH = Math.floor(endMinutesTotal / 60) % 24;
  const endM = endMinutesTotal % 60;
  const endTimeFormatted = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

  // Formatted date
  const dateObj = new Date(date + 'T12:00:00');
  const formattedDate = dateObj.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const pricePerPlayer = Math.round(totalPrice / 4);
  const reservationCode = reservation.id.startsWith('res_') 
    ? `#REZ-${reservation.id.slice(-6).toUpperCase()}` 
    : `#${reservation.id}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(reservation.id);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleShareMatch = async () => {
    const text = `🎾 Padel Maçı Rezervasyonu:\n📍 ${business.name} - ${court.name} (${business.district}, ${business.city})\n📅 ${formattedDate}\n⏰ ${startTime} - ${endTimeFormatted} (${duration} dk)\n🎟️ Kod: ${reservationCode}\nRALO ile padel oyna!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Padel Rezervasyonum',
          text,
          url: window.location.origin
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handlePrimaryAction = () => {
    if (isOpenMatch && onNavigateToOpenMatch && reservation.id) {
      onNavigateToOpenMatch(reservation.id);
    } else {
      onNavigateToMatches();
    }
  };

  return (
    <AnimatePresence>
      {/* Toast Mode (When Minimized or on Mobile bottom dock) */}
      {isMinimized ? (
        <motion.div
          key="minimized-toast"
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-5 right-4 left-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-amber-400/40 backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold">
                <Check className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-400 truncate">
                  {isOpenMatch ? 'Açık Maç Oluşturuldu' : 'Kort Ayırtıldı'}
                </p>
                <p className="text-xs font-medium text-slate-200 truncate">
                  {court.name} • {startTime} ({duration} dk)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                title="Büyüt"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Kapat"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">{reservationCode}</span>
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            >
              <span>{isOpenMatch ? 'Maça Git' : 'Maçlarıma Git'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      ) : (
        /* Full Mini Modal View with Dynamic Reservation Details */
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <motion.div
            key="full-modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-slate-100 my-auto"
          >
            {/* Top Celebratory Header */}
            <div className="relative bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 p-6 text-slate-950">
              {/* Subtle decorative circles */}
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-28 h-28 bg-black/10 rounded-full blur-xl pointer-events-none" />

              {/* Action Buttons Top Right */}
              <div className="absolute top-4 right-4 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  title="Küçült (Toast görünümü)"
                  className="p-1.5 rounded-full text-slate-950/70 hover:text-slate-950 hover:bg-black/10 transition-colors cursor-pointer"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  title="Kapat"
                  className="p-1.5 rounded-full text-slate-950/70 hover:text-slate-950 hover:bg-black/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Animated Success Badge */}
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center shadow-lg shrink-0">
                  <CheckCircle2 className="w-8 h-8 animate-pulse" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/20 text-slate-950 text-[11px] font-black uppercase tracking-wider mb-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{isOpenMatch ? 'Açık Maç Oluşturuldu' : 'Rezervasyon Onaylandı'}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 font-serif">
                    Kortunuz Hazır!
                  </h2>
                </div>
              </div>
            </div>

            {/* Dynamic Reservation Info Card */}
            <div className="p-6 space-y-5">
              
              {/* Venue & Court Summary Box */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {court.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{business.name} • {business.district}, {business.city}</span>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                    {court.type === 'OUTDOOR_PANORAMIC' ? 'Panoramik Cam' : court.type === 'INDOOR_PANORAMIC' ? 'Kapalı Klimalı' : 'WPT Kort'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Tarih</span>
                      <strong className="text-slate-900 dark:text-white text-xs">{date}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Saat & Süre</span>
                      <strong className="text-slate-900 dark:text-white text-xs">{startTime} - {endTimeFormatted} ({duration} dk)</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Financial & Match Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                  <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300 block">
                    {isOpenMatch ? 'Kişi Başı Ücret' : 'Toplam Kira Bedeli'}
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                      {isOpenMatch ? pricePerPlayer : totalPrice}
                    </span>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">₺</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                    Tesisde nakit / kredi kartı ile
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                      {isOpenMatch ? 'Açık Maç Durumu' : 'Rezervasyon Türü'}
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1">
                      {isOpenMatch ? (
                        <>
                          <Users className="w-3.5 h-3.5 text-amber-600" />
                          <span>1/4 Kişi (3 Boş Yer)</span>
                        </>
                      ) : (
                        <span>Özel Kort Rezervasyonu</span>
                      )}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                    ✓ SMS & E-posta teyidi iletildi
                  </span>
                </div>
              </div>

              {/* Reservation Code with Quick Copy Button */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Rezervasyon PNR Kodu
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {reservationCode}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-bold border border-slate-200 dark:border-slate-600 shadow-2xs transition-all active:scale-95 cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400">Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              {/* Dynamic Countdown & Auto-Redirect Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  <span>
                    {isPaused ? 'Geri sayım duraklatıldı' : `${countdown} saniye içinde yönlendiriliyorsunuz`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPaused(!isPaused)}
                    className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    {isPaused ? 'Devam Ettir' : 'Durdur'}
                  </button>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber-500"
                    initial={{ width: '100%' }}
                    animate={{ width: isPaused ? `${(countdown / 10) * 100}%` : `${(countdown / 10) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="flex-1 min-h-[44px] px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <span>{isOpenMatch ? 'Açık Maç Sayfasına Git' : 'Rezervasyonlarıma Git'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleShareMatch}
                  className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  {copiedShare ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>Paylaş</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2.5 rounded-2xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
