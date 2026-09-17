import React, { ReactNode, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { LayoutDashboard, Building2, BadgePercent, Receipt, Users, ArrowLeft, LogOut, Menu, X, ShieldCheck, Bug } from 'lucide-react';

const MENU = [
  { label: 'Genel Bakış', path: '/admin', icon: LayoutDashboard, match: (route: string) => route === '/admin' },
  { label: 'Kulüpler', path: '/admin/kulupler', icon: Building2, match: (route: string) => route.startsWith('/admin/kulupler') },
  { label: 'Ücretler & KDV', path: '/admin/ucretler', icon: BadgePercent, match: (route: string) => route === '/admin/ucretler' },
  { label: 'Hesap Özetleri', path: '/admin/hesap-ozetleri', icon: Receipt, match: (route: string) => route === '/admin/hesap-ozetleri' },
  { label: 'Kullanıcılar', path: '/admin/kullanicilar', icon: Users, match: (route: string) => route === '/admin/kullanicilar' },
  { label: 'Hatalar', path: '/admin/hatalar', icon: Bug, match: (route: string) => route === '/admin/hatalar' }
];

export const AdminLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, currentRoute, navigate, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <span className="font-bold text-sm">RALO Yönetim</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Menüyü aç veya kapat"
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-30 bg-slate-900 text-white w-64 p-5 flex flex-col justify-between border-r border-slate-800 transition-transform ${
          menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div>
          <div className="pb-5 border-b border-slate-800 flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center" aria-hidden="true">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm tracking-wide">RALO Yönetim</h2>
              <p className="text-[11px] text-amber-400">Platform yöneticisi</p>
            </div>
          </div>

          <nav aria-label="Yönetim menüsü" className="mt-5 space-y-1.5">
            {MENU.map(item => {
              const active = item.match(currentRoute);
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(item.path);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    active ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-slate-950' : 'text-slate-400'}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-2">
          <button
            type="button"
            onClick={() => navigate('/ana')}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span>Uygulamaya Dön</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-950/30 transition-colors min-h-[44px]"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Oturumu Kapat</span>
          </button>
          <div className="px-3 py-2 bg-slate-950/60 rounded-xl text-[11px] text-slate-400 break-all">
            Giriş yapan: <strong className="text-slate-200">{user?.displayName}</strong>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button type="button" aria-label="Menüyü kapat" className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />
      )}

      <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl overflow-x-hidden">
        {children}
      </main>
    </div>
  );
};
