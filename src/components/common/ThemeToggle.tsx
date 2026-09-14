import React from 'react';
import { Moon, Sun, Monitor, Sparkles } from 'lucide-react';
import { useTheme, ThemeMode } from '../../context/ThemeContext.js';

interface ThemeToggleProps {
  variant?: 'icon' | 'pill' | 'card';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'icon', className = '' }) => {
  const { theme, resolvedTheme, isDark, setTheme, toggleTheme } = useTheme();

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
          isDark
            ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700 shadow-sm'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
        } ${className}`}
        aria-label={`Temayı değiştir. Şu an: ${isDark ? 'Gece Maçı Modu' : 'Gündüz Modu'}`}
        title={isDark ? 'Gündüz Moduna Geç' : 'Gece Maçı Moduna Geç (Koyu Tema)'}
      >
        {isDark ? (
          <>
            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Gündüz Modu</span>
          </>
        ) : (
          <>
            <Moon className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Gece Maçı Modu</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`p-4 rounded-2xl border transition-all ${
        isDark 
          ? 'bg-slate-900 border-slate-800 text-white' 
          : 'bg-white border-slate-200 text-slate-900 shadow-xs'
      } ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDark ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-600" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Gece Maçı Modu (Koyu Tema)</h4>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  {isDark ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Gece ve akşam saatlerindeki maçlarda kort kenarında ekran parlamasını önler ve pil tüketimini azaltır.
              </p>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Gündüz</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Gece</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                theme === 'system'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Oto</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default 'icon' variant (used in Header & Navigation bars)
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-400 ${
        isDark
          ? 'bg-slate-800 text-amber-400 hover:bg-slate-700 hover:text-amber-300 border border-slate-700'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
      } ${className}`}
      aria-label={`Temayı değiştir. Şu an: ${isDark ? 'Gece Maçı Modu (Koyu)' : 'Gündüz Modu (Açık)'}`}
      title={isDark ? 'Gündüz Moduna Geç' : 'Gece Maçı Moduna Geç (Koyu Tema)'}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 text-slate-300 transition-transform hover:-rotate-12" aria-hidden="true" />
      )}
    </button>
  );
};
