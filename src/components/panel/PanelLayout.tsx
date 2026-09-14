import React, { useState, ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { 
  Calendar, ListFilter, LayoutGrid, Users2, 
  BarChart3, Building2, User, Menu, X, ArrowLeft, LogOut
} from 'lucide-react';

interface PanelLayoutProps {
  children: ReactNode;
}

export const PanelLayout: React.FC<PanelLayoutProps> = ({ children }) => {
  const { user, currentRoute, navigate, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const businessId = user?.businessId || 'biz_urla';

  const isOwner = user?.role === 'ISLETME_SAHIBI';
  const menuItems = [
    { label: 'Günlük Takvim', path: `/panel/${businessId}/takvim`, icon: Calendar },
    { label: 'Rezervasyonlar', path: `/panel/${businessId}/rezervasyonlar`, icon: ListFilter },
    { label: 'Kort Yönetimi', path: `/panel/${businessId}/kortlar`, icon: LayoutGrid },
    { label: 'Personel & Yetkiler', path: `/panel/${businessId}/personel`, icon: Users2, ownerOnly: true },
    { label: 'Raporlar & Doluluk', path: `/panel/${businessId}/raporlar`, icon: BarChart3, ownerOnly: true },
  ].filter(item => isOwner || !item.ownerOnly);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      
      {/* Mobile Top Header */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-sm">İşletme Portalı</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label="Menüyü aç veya kapat"
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Permanent Desktop Sidebar / Responsive Mobile Drawer */}
      <aside 
        className={`fixed md:sticky top-0 left-0 h-screen z-30 bg-slate-900 text-white w-64 p-5 flex flex-col justify-between border-r border-slate-800 transition-transform ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div>
          {/* Business Info Header */}
          <div className="pb-5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm">
                PA
              </div>
              <div className="overflow-hidden">
                <h2 className="font-bold text-sm text-white truncate">Padel Arena Urla</h2>
                <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>3 Kort Aktif</span>
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav aria-label="İşletme Yönetim Menüsü" className="mt-5 space-y-1.5">
            {menuItems.map((item) => {
              const isActive = currentRoute === item.path || (item.path.includes('takvim') && currentRoute.endsWith('/takvim'));
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate(item.path);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all min-h-[44px] ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  } focus-visible:ring-2 focus-visible:ring-amber-400`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Switch to Player view */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <button
            type="button"
            onClick={() => navigate('/ana')}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span>Oyuncu Görünümüne Geç</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-950/30 transition-colors min-h-[44px]"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Oturumu Kapat</span>
          </button>

          <div className="px-3 py-2 bg-slate-950/60 rounded-xl text-[11px] text-slate-400">
            Giriş yapan: <strong className="text-slate-200">{user?.displayName}</strong> ({user?.role === 'ISLETME_SAHIBI' ? 'İşletme Sahibi' : 'Personel'})
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl overflow-x-hidden">
        {children}
      </main>

    </div>
  );
};
