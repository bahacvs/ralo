import React from 'react';
import { useLocation, TURKEY_CITIES } from '../../context/LocationContext.js';
import { Modal } from './Modal.js';
import { MapPin, Navigation, Compass, CheckCircle2, Building2 } from 'lucide-react';

export const LocationPromptModal: React.FC = () => {
  const { 
    isLocationModalOpen, 
    closeLocationModal, 
    requestLocation, 
    status, 
    selectedCity, 
    setSelectedCity,
    coords,
    detectedCityName
  } = useLocation();

  const handleAllowGPS = async () => {
    const success = await requestLocation();
    if (success) {
      setTimeout(() => {
        closeLocationModal();
      }, 600);
    }
  };

  const handleSelectCity = (city: string) => {
    setSelectedCity(city);
    closeLocationModal();
  };

  return (
    <Modal
      isOpen={isLocationModalOpen}
      onClose={closeLocationModal}
      title="Konumunuzu Belirleyin"
      description="Size en yakın kortları, müsait saatleri ve açık maçları anında listelemek için konumunuza ihtiyaç duyuyoruz."
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* GPS Request Hero Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950 via-slate-900 to-slate-900 p-5 text-white shadow-md border border-amber-500/30">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Navigation className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-white font-serif">
                Hassas GPS ile En Yakın Kortlar
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tek dokunuşla bulunduğunuz noktayı belirleyin; 1 km'den 25 km'ye kadar en yakın tüm padel tesislerini mesafeye göre sıralayalım.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            {coords ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
                <span>Konumunuz alındı: {detectedCityName || 'Mevcut Konum'}</span>
              </div>
            ) : status === 'denied' ? (
              <p className="text-xs text-amber-300 font-medium">
                Tarayıcı konum izni verilmedi. Aşağıdan şehrinizi manuel seçebilirsiniz.
              </p>
            ) : (
              <span className="text-[11px] text-slate-400">
                🔒 Konum veriniz yalnızca cihazınızda mesafe hesabı için kullanılır.
              </span>
            )}

            <button
              type="button"
              onClick={handleAllowGPS}
              disabled={status === 'requesting'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-950/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <Compass className={`w-4 h-4 ${status === 'requesting' ? 'animate-spin' : ''}`} />
              <span>{status === 'requesting' ? 'Konum Alınıyor...' : 'Konumumu Otomatik Bul'}</span>
            </button>
          </div>
        </div>

        {/* Manual City Selector */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span>Veya Şehrinizi Seçin</span>
            </h4>
            <span className="text-[11px] text-slate-500">Tüm Türkiye Aktif</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSelectCity('Tüm Türkiye')}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${
                selectedCity === 'Tüm Türkiye'
                  ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>🇹🇷 Tüm Türkiye</span>
              {selectedCity === 'Tüm Türkiye' && <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>

            {Object.keys(TURKEY_CITIES).map((cityName) => {
              const isSelected = selectedCity === cityName;
              return (
                <button
                  key={cityName}
                  type="button"
                  onClick={() => handleSelectCity(cityName)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 opacity-60" />
                    {cityName}
                  </span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={closeLocationModal}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            Daha Sonra
          </button>
        </div>
      </div>
    </Modal>
  );
};
