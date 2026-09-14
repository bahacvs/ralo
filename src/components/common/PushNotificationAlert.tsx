import React, { useEffect, useState } from 'react';
import { usePushNotification } from '../../context/PushNotificationContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { Clock, MapPin, X, ArrowRight, Bell, Sparkles, Navigation } from 'lucide-react';
import { RaloIcon } from './RaloLogo.js';

export const PushNotificationAlert: React.FC = () => {
  const { activeAlert, dismissAlert } = usePushNotification();
  const { navigate } = useAuth();
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!activeAlert) {
      setProgress(100);
      return;
    }

    const duration = 10000; // 10 seconds auto-dismiss
    const intervalTime = 100;
    const startProgress = 100;
    const step = (intervalTime / duration) * 100;
    let current = startProgress;

    const timer = setInterval(() => {
      if (!isPaused) {
        current -= step;
        if (current <= 0) {
          clearInterval(timer);
          setProgress(0);
          dismissAlert();
        } else {
          setProgress(current);
        }
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [activeAlert, dismissAlert, isPaused]);

  if (!activeAlert) return null;

  const handleGoToMatch = () => {
    dismissAlert();
    if (activeAlert.matchId) {
      navigate(`/acik-mac/${activeAlert.matchId}`);
    } else if (activeAlert.courtId) {
      navigate(`/saha/${activeAlert.courtId}`);
    } else {
      navigate('/maclarim');
    }
  };

  return (
    <aside
      aria-label="Anlık Bildirim"
      aria-live="assertive"
      className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[100] w-[calc(100vw-1.5rem)] max-w-lg"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div 
        id="push-alert-card"
        className="relative overflow-hidden rounded-3xl bg-slate-900/95 text-white border border-amber-500/50 shadow-2xl shadow-amber-950/40 backdrop-blur-xl transition-all animate-in slide-in-from-top duration-300 ring-1 ring-amber-400/20"
      >
        {/* Top App Identity Row */}
        <div className="flex items-center justify-between px-3.5 sm:px-4 pt-3 pb-2 border-b border-white/10 text-xs gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-slate-950 border border-amber-500/40 flex items-center justify-center p-0.5 shadow-xs shrink-0">
              <RaloIcon size={16} />
            </div>
            <span className="font-black tracking-widest text-white text-xs uppercase font-sans shrink-0">RALO</span>
            <span className="text-[11px] text-slate-400 hidden xs:inline shrink-0">• Şimdi</span>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9.5px] sm:text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>2 Saat Kaldı</span>
            </span>
          </div>

          <button
            type="button"
            onClick={dismissAlert}
            className="w-7 h-7 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Bildirimi Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Bell className="w-5 h-5 text-amber-400 animate-bounce" />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5 font-serif">
                <span>{activeAlert.title}</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {activeAlert.message}
              </p>

              {/* Match Details Chip */}
              {(activeAlert.courtName || activeAlert.businessName) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                  {activeAlert.matchTime && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700/80 font-bold text-amber-300">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{activeAlert.matchTime}</span>
                    </span>
                  )}
                  {activeAlert.courtName && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700/80 font-semibold text-slate-200">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate max-w-[200px]">{activeAlert.courtName}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleGoToMatch}
              className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-950/50 active:scale-98"
            >
              <span>Maç Detayına Git</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const query = encodeURIComponent(`${activeAlert.businessName || 'Padel Kulübü'} ${activeAlert.courtName || ''}`);
                window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
            >
              <Navigation className="w-3.5 h-3.5 text-amber-400" />
              <span>Yol Tarifi Al</span>
            </button>
          </div>
        </div>

        {/* Auto-Dismiss Progress Bar */}
        <div className="h-1 bg-slate-800 w-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
