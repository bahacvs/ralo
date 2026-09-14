import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { Notification } from '../../types/index.js';
import { 
  Building2, UserCheck, ShieldCheck, Bell, 
  ChevronDown, LogOut, Check, MessageSquare,
  Trophy, UserPlus, UserMinus, Compass, Share2,
  Smartphone, AlarmClock
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall.js';
import { PWAInstallModal } from './PWAInstallModal.js';
import { ThemeToggle } from './ThemeToggle.js';
import { RaloWordmark } from './RaloLogo.js';

const IS_DEMO_UI = import.meta.env.VITE_DEMO_MODE === 'true';

export const Header: React.FC = () => {
  const { user, role, demoSwitch, logout, navigate, currentRoute } = useAuth();
  const { isInstalled, isIOS } = usePWAInstall();
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const isPanel = currentRoute.startsWith('/panel');

  const fetchNotifications = async () => {
    try {
      const res = await api.getNotifications();
      if (res && res.notifications) {
        setNotifications(res.notifications);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotifClick = async (notif: Notification) => {
    try {
      await api.markNotificationRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    } catch (err) {
      console.error(err);
    }

    setShowNotifMenu(false);

    if (notif.type === 'MATCH_REMINDER_2H') {
      if (notif.matchId) {
        navigate(`/acik-mac/${notif.matchId}`);
      } else if (notif.courtId) {
        navigate(`/saha/${notif.courtId}`);
      } else {
        navigate('/maclarim');
      }
    } else if (notif.matchId) {
      navigate(`/acik-mac/${notif.matchId}`);
    } else if (notif.type === 'NEW_MESSAGE') {
      navigate('/mesajlar');
    } else if (notif.type === 'FRIEND_ADD') {
      navigate('/profil');
    }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'MATCH_REMINDER_2H':
        return <AlarmClock className="w-4 h-4 text-amber-500 animate-pulse" />;
      case 'MATCH_INVITE':
        return <Trophy className="w-4 h-4 text-amber-600" />;
      case 'NEW_MESSAGE':
        return <MessageSquare className="w-4 h-4 text-blue-600" />;
      case 'MATCH_JOIN':
        return <UserCheck className="w-4 h-4 text-amber-600" />;
      case 'MATCH_LEAVE':
        return <UserMinus className="w-4 h-4 text-rose-600" />;
      case 'FRIEND_ADD':
        return <UserPlus className="w-4 h-4 text-violet-600" />;
      default:
        return <Bell className="w-4 h-4 text-amber-600" />;
    }
  };

  const demoAccounts = [
    {
      role: 'OYUNCU' as const,
      title: 'Oyuncu Hesabı',
      name: 'Baha Çavuşoğlu (1450 Elo)',
      badge: 'Mobil PWA',
      icon: UserCheck
    },
    {
      role: 'ISLETME_SAHIBI' as const,
      title: 'İşletme Sahibi',
      name: 'Kemal D. (Padel Arena Urla)',
      badge: 'Yönetim Paneli',
      icon: Building2
    },
    {
      role: 'PERSONEL' as const,
      title: 'Personel Hesabı',
      name: 'Gözde Y. (Resepsiyon / Kasa)',
      badge: 'Kort & Blokaj',
      icon: ShieldCheck
    }
  ];

  return (
    <>
      {/* WCAG 2.2 AA Skip Link */}
      <a
        href="#main-content"
        className="sr-only-focusable fixed top-2 left-2 z-50 bg-amber-600 text-slate-950 px-4 py-2 rounded-lg text-sm font-black shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Ana İçeriğe Atla
      </a>

      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo in Official RALO Design */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(isPanel ? `/panel/${user?.businessId || 'biz_urla'}/takvim` : '/ana')}
              className="flex items-center gap-2 text-left rounded-xl py-1 px-1 focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
              aria-label="RALO - The Social Network for Padel Ana Sayfa"
            >
              <RaloWordmark 
                size="sm" 
                theme="dark" 
                subtitleText={isPanel ? 'İŞLETME PORTALI' : 'THE SOCIAL NETWORK FOR PADEL'} 
                subtitleClassName="hidden sm:block"
              />
            </button>

            {/* Desktop Navigation for Players */}
            {!isPanel && (
              <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Masaüstü Navigasyon">
                <button
                  type="button"
                  onClick={() => navigate('/sahalar')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    currentRoute === '/sahalar' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  Kortlar
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/acik-maclar')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    currentRoute === '/acik-maclar' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Trophy className="w-3.5 h-3.5" />
                  Açık Maçlar
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/sosyal-ag')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    currentRoute === '/sosyal-ag' || currentRoute === '/akis' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Sosyal Ağ
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/mesajlar')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    currentRoute === '/mesajlar' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Mesajlar
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/siralama')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    currentRoute === '/siralama' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  Sıralama
                </button>
              </nav>
            )}
          </div>

          {/* Controls: Mesajlar + Bildirimler + Demo Switcher */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            
            {/* Business Panel / Player Switch Shortcut */}
            {role !== 'OYUNCU' && (
              <button
                type="button"
                onClick={() => navigate(isPanel ? '/ana' : `/panel/${user?.businessId || 'biz_urla'}/takvim`)}
                className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>{isPanel ? 'Oyuncu Görünümü' : 'Yönetim Paneli'}</span>
              </button>
            )}

            {/* Quick Demo Switcher Dropdown (VITE_DEMO_MODE only) */}
            {IS_DEMO_UI && (
            <div className="relative shrink-0">
              <button
                type="button"
                id="demo-menu-button"
                aria-haspopup="true"
                aria-expanded={showDemoMenu}
                onClick={() => setShowDemoMenu(!showDemoMenu)}
                className="inline-flex items-center gap-1.5 sm:gap-2 h-9 sm:min-h-[44px] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-amber-300 border border-amber-500/40 hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
                title="Demo Hesap Değiştirici"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline font-semibold">Demo:</span>
                <span className="font-medium max-w-[65px] sm:max-w-[120px] truncate text-white">
                  {role === 'OYUNCU' ? 'Oyuncu' : role === 'ISLETME_SAHIBI' ? 'İşletme' : 'Personel'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              </button>

              {showDemoMenu && (
                <div 
                  className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50 text-slate-100 animate-in fade-in zoom-in-95"
                  role="menu"
                  aria-labelledby="demo-menu-button"
                >
                  <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-400">
                    <p className="font-semibold text-slate-200">Geliştirici & Önizleme Modu</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tek tıkla farklı rolleri deneyimleyin:</p>
                  </div>

                  <div className="py-1 space-y-1">
                    {demoAccounts.map((acc) => {
                      const isSelected = role === acc.role;
                      const Icon = acc.icon;
                      return (
                        <button
                          key={acc.role}
                          role="menuitem"
                          type="button"
                          onClick={async () => {
                            setShowDemoMenu(false);
                            await demoSwitch(acc.role);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors min-h-[44px] ${
                            isSelected 
                              ? 'bg-amber-950/60 text-amber-200 border border-amber-600/50' 
                              : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                            }`} aria-hidden="true">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-100">{acc.title}</div>
                              <div className="text-[11px] text-slate-400">{acc.name}</div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-amber-400 ml-2" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowDemoMenu(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-950/30 transition-colors min-h-[40px]"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Oturumu Kapat</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Dedicated Mesajlar Button (Desktop/tablet; on mobile BottomNav includes Mesajlar) */}
            {!isPanel && (
              <button
                type="button"
                onClick={() => navigate('/mesajlar')}
                className={`hidden md:inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold transition-all border ${
                  currentRoute === '/mesajlar'
                    ? 'bg-amber-600 text-slate-950 font-bold border-amber-500 shadow-xs'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white'
                } focus-visible:ring-2 focus-visible:ring-amber-400 shrink-0`}
                title="Özel Mesajlar"
              >
                <MessageSquare className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>Mesajlar</span>
              </button>
            )}

            {/* Dark Theme / Night Match Mode Toggle */}
            <div className="shrink-0">
              <ThemeToggle variant="icon" />
            </div>

            {/* Install Mobile App Quick Action (Visible on tablet/desktop, mobile uses top banner) */}
            {!isInstalled && (
              <button
                type="button"
                onClick={() => setShowInstallModal(true)}
                className="hidden sm:inline-flex items-center justify-center gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/50 shadow-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-400 shrink-0"
                title="Mobil Uygulama (iOS & Android) Olarak Yükle"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-bold">Uygulama</span>
              </button>
            )}

            {/* Notifications Button & Dropdown */}
            {user && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
                aria-label="Bildirimler"
                aria-expanded={showNotifMenu}
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center ring-2 ring-slate-900 animate-pulse shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div 
                  className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[92vw] rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl p-3 z-50 animate-in fade-in"
                  role="region"
                  aria-label="Bildirimler Penceresi"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Bildirimler</h3>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-black text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
                          {unreadCount} Yeni
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                      >
                        Tümünü Okundu Say
                      </button>
                    )}
                  </div>

                  <div className="py-2 space-y-2 max-h-80 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                        <Bell className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2 opacity-50" />
                        Henüz yeni bir bildiriminiz yok.
                      </div>
                    ) : (
                      notifications.slice(0, 8).map((notif) => (
                        <div 
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            !notif.read 
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 shadow-xs' 
                              : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-xs border border-slate-200/80 dark:border-slate-700 shrink-0 mt-0.5">
                              {getNotifIcon(notif.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className={`font-bold truncate ${!notif.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {notif.title}
                                </p>
                                {!notif.read && (
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                )}
                              </div>
                              <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                                {notif.message}
                              </p>
                              <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/50">
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {new Date(notif.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-0.5">
                                  {notif.matchId ? 'Maça Git' : notif.type === 'NEW_MESSAGE' ? 'Mesajı Aç' : 'Detay'} &rarr;
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifMenu(false);
                        navigate('/maclarim');
                      }}
                      className="text-center py-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      Maçlarım
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifMenu(false);
                        navigate('/mesajlar');
                      }}
                      className="text-center py-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
                    >
                      Mesaj Kutusu &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Profile Avatar Shortcut */}
            {!isPanel && user && (
              <button
                type="button"
                onClick={() => navigate('/profil')}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-700 bg-slate-800 hover:border-amber-400 transition-all overflow-hidden focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Profilim"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.maskedName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-amber-400">
                    {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'OY'}
                  </span>
                )}
              </button>
            )}

            {/* Guest Login Button */}
            {!user && currentRoute !== '/giris' && (
              <button
                type="button"
                onClick={() => navigate('/giris')}
                className="inline-flex items-center justify-center h-9 px-3.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 shrink-0"
              >
                Giriş Yap
              </button>
            )}

          </div>

        </div>
      </header>

      <PWAInstallModal 
        isOpen={showInstallModal} 
        onClose={() => setShowInstallModal(false)} 
      />
    </>
  );
};
