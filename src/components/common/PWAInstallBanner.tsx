import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share2, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../../hooks/usePWAInstall.js';
import { PWAInstallModal } from './PWAInstallModal.js';
import { RaloIcon } from './RaloLogo.js';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('ralo_pwa_banner_dismissed') === 'true' || localStorage.getItem('arenamate_pwa_banner_dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('ralo_pwa_banner_dismissed', 'true');
  };

  // Do not show banner if already running in standalone mode or dismissed
  if (isInstalled || dismissed) {
    return (
      <>
        <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  return (
    <>
      <div 
        role="region" 
        aria-label="Mobil Uygulama Yükleme Bildirimi"
        className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 text-white border-b border-amber-800/40 px-3 py-2 sm:px-6 relative z-30 shadow-sm overflow-hidden"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-center shrink-0 shadow-xs p-0.5 sm:p-1">
              <RaloIcon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-xs font-black text-white tracking-tight uppercase truncate">
                  RALO Padel
                </span>
                <span className="bg-amber-500/20 text-amber-300 text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.2 rounded border border-amber-500/30 shrink-0">
                  {isIOS ? 'iOS' : isAndroid ? 'Android' : 'Mobil'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate hidden sm:block">
                The Social Network for Padel • Kort rezervasyonları ve açık maçlar için ana ekranınıza ekleyin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs transition-colors cursor-pointer min-h-[32px] sm:min-h-[36px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Yükle</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400/50 shadow-xs transition-colors cursor-pointer min-h-[32px] sm:min-h-[36px] whitespace-nowrap"
              >
                {isIOS ? (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>iPhone'a Ekle</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Yükle</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Bildirimi Kapat"
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div 
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 right-4 sm:left-6 sm:right-auto z-50 max-w-sm bg-amber-950/95 text-amber-100 border border-amber-600/60 p-3 rounded-2xl shadow-xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-800 text-amber-200 flex items-center justify-center shrink-0">
        <WifiOff className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white">Çevrimdışı Mod</p>
        <p className="text-[11px] text-amber-200/90 leading-tight mt-0.5">
          İnternet bağlantısı kesildi. Önbellekteki verilerle çalışılıyor.
        </p>
      </div>
    </div>
  );
};
