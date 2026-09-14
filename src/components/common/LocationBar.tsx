import React from 'react';
import { useLocation } from '../../context/LocationContext.js';
import { MapPin, Navigation, ChevronDown, Compass } from 'lucide-react';

interface LocationBarProps {
  className?: string;
  showRadiusSelect?: boolean;
  selectedRadius?: number;
  onRadiusChange?: (radius: number) => void;
}

export const LocationBar: React.FC<LocationBarProps> = ({ 
  className = '',
  showRadiusSelect = false,
  selectedRadius = 0,
  onRadiusChange
}) => {
  const { 
    coords, 
    selectedCity, 
    selectedDistrict, 
    openLocationModal, 
    requestLocation,
    status 
  } = useLocation();

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-sm ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={openLocationModal}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer group"
          title="Konumu veya şehri değiştirin"
        >
          {coords ? (
            <Navigation className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <span className="truncate max-w-[140px] sm:max-w-[200px]">
            {coords ? 'Yakınımdaki Kortlar' : selectedCity}
            {selectedDistrict && selectedDistrict !== 'ALL' && selectedDistrict !== 'Tüm İlçeler' ? ` • ${selectedDistrict}` : ''}
          </span>
          <ChevronDown className="w-3 h-3 text-amber-600/70 group-hover:translate-y-0.5 transition-transform shrink-0" />
        </button>

        {!coords && (
          <button
            type="button"
            onClick={() => requestLocation()}
            disabled={status === 'requesting'}
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer disabled:opacity-50"
          >
            <Compass className={`w-3.5 h-3.5 ${status === 'requesting' ? 'animate-spin' : ''}`} />
            <span>{status === 'requesting' ? 'Konum aranıyor...' : 'GPS ile En Yakınları Bul'}</span>
          </button>
        )}
      </div>

      {/* Optional Radius filter when GPS is active */}
      {showRadiusSelect && coords && onRadiusChange && (
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-500 font-medium mr-1 hidden xs:inline">Menzil:</span>
          {[0, 10, 25, 50].map((r) => {
            const isSelected = selectedRadius === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRadiusChange(r)}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {r === 0 ? 'Tümü' : `${r} km`}
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile GPS Quick button */}
      {!coords && (
        <button
          type="button"
          onClick={() => requestLocation()}
          disabled={status === 'requesting'}
          className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-black cursor-pointer disabled:opacity-50"
        >
          <Compass className={`w-3 h-3 ${status === 'requesting' ? 'animate-spin' : ''}`} />
          <span>GPS</span>
        </button>
      )}
    </div>
  );
};
