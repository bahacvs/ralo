import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Home, Compass, Trophy, Share2, MessageSquare } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { currentRoute, navigate } = useAuth();

  if (currentRoute.startsWith('/panel') || currentRoute === '/giris') {
    return null;
  }

  const navItems = [
    { label: 'Ana Sayfa', path: '/ana', icon: Home },
    { label: 'Kortlar', path: '/sahalar', icon: Compass },
    { label: 'Açık Maçlar', path: '/acik-maclar', icon: Trophy },
    { label: 'Sosyal Ağ', path: '/sosyal-ag', icon: Share2 },
    { label: 'Mesajlar', path: '/mesajlar', icon: MessageSquare }
  ];

  return (
    <nav 
      aria-label="Oyuncu Alt Navigasyon"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 shadow-lg px-2 sm:px-6 pb-[env(safe-area-inset-bottom,0px)] transition-colors"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = currentRoute === item.path || 
            (item.path === '/sosyal-ag' && currentRoute === '/akis') ||
            (item.path !== '/ana' && currentRoute.startsWith(item.path));
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 rounded-xl transition-all ${
                isActive 
                  ? 'text-amber-600 dark:text-amber-400 font-bold' 
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              } focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-amber-600 dark:text-amber-400 stroke-[2.4]' : 'text-slate-600 dark:text-slate-400'}`} aria-hidden="true" />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                )}
              </div>
              <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
