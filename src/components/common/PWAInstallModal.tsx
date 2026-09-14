import React from 'react';
import { Modal } from './Modal.js';
import { Smartphone, Download, Share2, PlusSquare, CheckCircle2, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall.js';
import { RaloIcon } from './RaloLogo.js';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        onClose();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mobil Uygulama Olarak Yükle"
      description="RALO'yu iOS (iPhone) ve Android cihazınızda tam ekran yerel uygulama deneyimiyle kullanın."
      maxWidth="lg"
    >
      <div className="space-y-5 pt-2">
        {/* App Hero Card */}
        <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-950 text-white border border-amber-500/40 shadow-md">
          <div className="w-14 h-14 rounded-2xl bg-slate-950 border-2 border-amber-400 shadow-sm shrink-0 flex items-center justify-center p-1.5">
            <RaloIcon size={36} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-white tracking-tight uppercase">RALO</h3>
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-500/30">
                PWA / Native
              </span>
            </div>
            <p className="text-xs text-amber-400 font-semibold tracking-wider uppercase text-[10px]">
              The Social Network for Padel
            </p>
            <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
              Kort rezervasyonları, anlık maç eşleşmeleri ve padel topluluğu tek dokunuşla cebinizde.
            </p>
          </div>
        </div>

        {/* Status banner if already running in standalone */}
        {isInstalled && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-semibold flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Harika! RALO şu anda mobil uygulama (standalone) modunda çalışıyor.</span>
          </div>
        )}

        {/* Direct Android / Chrome One-Tap Install Action */}
        {isInstallable && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-amber-950">Doğrudan Cihazınıza Yükleyin</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Cihazınız tek dokunuşla yüklemeyi destekliyor.
              </p>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-xs transition-colors cursor-pointer min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              <span>Hemen Yükle</span>
            </button>
          </div>
        )}

        {/* Tabs / Platform Guidance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          
          {/* iOS (Apple iPhone / iPad) Guide */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isIOS ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-400/20' : 'border-slate-200 bg-slate-50/60'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                  
                </div>
                <h4 className="text-xs font-extrabold text-slate-900">Apple iOS (iPhone / iPad)</h4>
              </div>
              {isIOS && (
                <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                  Cihazınız
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mb-3">
              Safari tarayıcısında 3 kolay adımda ana ekranınıza ekleyebilirsiniz:
            </p>

            <ol className="space-y-2.5 text-xs text-slate-700">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Safari tarayıcısının altındaki <strong className="text-slate-950 inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200"><Share2 className="w-3 h-3 text-blue-600" /> Paylaş</strong> butonuna dokunun.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Menüyü aşağı kaydırıp <strong className="text-slate-950 inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200"><PlusSquare className="w-3 h-3 text-amber-600" /> Ana Ekrana Ekle</strong> seçeneğini seçin.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>
                  Sağ üstteki <strong className="text-slate-950 bg-white px-1.5 py-0.5 rounded border border-slate-200">Ekle</strong> butonuna basın. RALO ana ekranınıza yerleşir.
                </span>
              </li>
            </ol>
          </div>

          {/* Android (Google Chrome & Samsung Browser) Guide */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isAndroid ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-400/20' : 'border-slate-200 bg-slate-50/60'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-extrabold text-slate-900">Android (Chrome)</h4>
              </div>
              {isAndroid && (
                <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                  Cihazınız
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mb-3">
              Chrome menüsünden veya sistem bildiriminden tek tıkla yükleyin:
            </p>

            <ol className="space-y-2.5 text-xs text-slate-700">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Chrome sağ üst köşedeki <strong className="text-slate-950 bg-white px-1.5 py-0.5 rounded border border-slate-200">üç nokta (⋮)</strong> menüsüne dokunun.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Menüdeki <strong className="text-slate-950 inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200"><Download className="w-3 h-3 text-amber-600" /> Uygulamayı Yükle</strong> seçeneğine dokunun.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>
                  Yükleme onayından sonra RALO telefonunuza yüklenir ve bildirimler açılır.
                </span>
              </li>
            </ol>
          </div>

        </div>

        {/* Benefits list */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200">
          <h5 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider mb-2">
            Mobil Uygulama Avantajları
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Tam Ekran Deneyimi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Çevrimdışı Önbellekleme</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Hızlı Maç Bildirimleri</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
};
