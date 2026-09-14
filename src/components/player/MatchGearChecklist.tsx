import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, RotateCcw, CheckSquare, Sparkles, AlertCircle } from 'lucide-react';

export interface GearItem {
  id: string;
  name: string;
  category: 'racket' | 'balls' | 'water' | 'extra';
  description: string;
  icon: string;
  isRequired: boolean;
}

const DEFAULT_GEAR_ITEMS: GearItem[] = [
  {
    id: 'gear_racket',
    name: 'Padel Raketi',
    category: 'racket',
    description: 'Yüzey ve elcik (overgrip) bandı kontrol edildi',
    icon: '🎾',
    isRequired: true
  },
  {
    id: 'gear_balls',
    name: 'Padel Maç Topları',
    category: 'balls',
    description: 'En az 3 adet basınçlı maç topu kutuda hazır',
    icon: '🟡',
    isRequired: true
  },
  {
    id: 'gear_water',
    name: 'Su & Hidrasyon',
    category: 'water',
    description: 'En az 1 litre soğuk su veya elektrolitli içecek',
    icon: '💧',
    isRequired: true
  },
  {
    id: 'gear_towel',
    name: 'Spor Havlusu & Ter Bandı',
    category: 'extra',
    description: 'Sıcak havalarda ve yoğun rallilerde konfor için',
    icon: '🎽',
    isRequired: false
  }
];

const STORAGE_KEY = 'arenamate_gear_checklist_v1';

export const MatchGearChecklist: React.FC<{ matchTitle?: string; matchTime?: string }> = ({
  matchTitle,
  matchTime
}) => {
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      gear_racket: false,
      gear_balls: false,
      gear_water: false,
      gear_towel: false
    };
  });

  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedIds));
    } catch {
      // ignore
    }
  }, [checkedIds]);

  const toggleItem = (id: string) => {
    setCheckedIds(prev => {
      const next = { ...prev, [id]: !prev[id] };
      return next;
    });
  };

  const checkAll = () => {
    const allChecked = DEFAULT_GEAR_ITEMS.reduce((acc, item) => {
      acc[item.id] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setCheckedIds(allChecked);
    setFeedback('Tüm ekipmanlar onaylandı!');
    setTimeout(() => setFeedback(null), 2500);
  };

  const resetAll = () => {
    const allUnchecked = DEFAULT_GEAR_ITEMS.reduce((acc, item) => {
      acc[item.id] = false;
      return acc;
    }, {} as Record<string, boolean>);
    setCheckedIds(allUnchecked);
    setFeedback('Kontrol listesi sıfırlandı.');
    setTimeout(() => setFeedback(null), 2000);
  };

  // Check required core items (racket, balls, water)
  const coreItems = DEFAULT_GEAR_ITEMS.filter(i => i.isRequired);
  const coreCheckedCount = coreItems.filter(i => checkedIds[i.id]).length;
  const isCoreReady = coreCheckedCount === coreItems.length;

  const totalChecked = Object.values(checkedIds).filter(Boolean).length;
  const progressPercent = Math.round((totalChecked / DEFAULT_GEAR_ITEMS.length) * 100);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs transition-colors">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 flex items-center justify-center font-bold shrink-0">
            <CheckSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Maç Ekipman Kontrolü
              </h2>
              {isCoreReady ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-full shadow-2xs">
                  <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                  <span>Korta Hazırsın</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{coreCheckedCount} / {coreItems.length} Temel Ekipman</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {matchTitle ? `${matchTitle} öncesi çantanızı teyit edin` : 'Maça çıkmadan önce raket, toplar ve suyunuzu kontrol edin'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={checkAll}
            className="text-xs font-bold text-amber-950 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 px-2.5 py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-800 transition-colors cursor-pointer"
            title="Tüm ekipmanları onaylandı olarak işaretle"
          >
            Tümünü Seç
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Sıfırla"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
          <span className="font-semibold">Hazırlık Seviyesi:</span>
          <span className="font-bold text-slate-900 dark:text-white">{totalChecked} / {DEFAULT_GEAR_ITEMS.length} Parça Tamam (%{progressPercent})</span>
        </div>
        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Interactive Gear Checklist Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3.5">
        {DEFAULT_GEAR_ITEMS.map((item) => {
          const isChecked = !!checkedIds[item.id];
          return (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              role="checkbox"
              aria-checked={isChecked}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggleItem(item.id);
                }
              }}
              className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 min-h-[58px] ${
                isChecked
                  ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-600 shadow-2xs'
                  : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-xl shrink-0 select-none">
                  {item.icon}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isChecked ? 'text-slate-900 dark:text-white line-through opacity-80' : 'text-slate-900 dark:text-white'}`}>
                      {item.name}
                    </span>
                    {item.isRequired && (
                      <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/70 px-1.5 py-0.2 rounded">
                        Zorunlu
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {isChecked ? (
                  <CheckCircle2 className="w-5 h-5 text-amber-600 dark:text-amber-400 fill-amber-500 text-white dark:text-slate-950" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Banner */}
      {isCoreReady && (
        <div className="mt-3 p-3 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-black">
            <Sparkles className="w-4 h-4 text-slate-950 shrink-0 animate-bounce" />
            <span>Harika! Raket, toplar ve suyunuz hazır. Sahaya çıkabilirsiniz!</span>
          </div>
          {matchTime && (
            <span className="text-[11px] font-extrabold bg-slate-950 text-amber-300 px-2.5 py-1 rounded-xl shrink-0">
              Başlama: {matchTime}
            </span>
          )}
        </div>
      )}

      {feedback && (
        <div className="mt-2 text-center text-xs font-semibold text-amber-700 dark:text-amber-400 animate-in fade-in">
          {feedback}
        </div>
      )}

    </div>
  );
};
