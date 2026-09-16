import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { 
  User, Trophy, Calendar, Clock, ShieldCheck, 
  MessageSquare, ChevronRight, LogOut, Settings, Award, CheckCircle2,
  Users, UserPlus, UserCheck, Trash2, Smartphone, Camera,
  Heart, MapPin, Sparkles, ArrowRight, Bell, BellRing, Volume2, Play
} from 'lucide-react';
import { usePushNotification } from '../../context/PushNotificationContext.js';
import { PWAInstallModal } from '../common/PWAInstallModal.js';
import { ThemeToggle } from '../common/ThemeToggle.js';
import { CameraCaptureModal } from './CameraCaptureModal.js';

export const ProfileView: React.FC = () => {
  const { user, logout, navigate, updateUser } = useAuth();
  const { 
    pushEnabled, 
    setPushEnabled, 
    reminder2HoursEnabled, 
    setReminder2HoursEnabled, 
    soundEnabled, 
    setSoundEnabled, 
    pushPermission, 
    requestPushPermission, 
    simulate2HourAlert, 
    isSimulating 
  } = usePushNotification();

  const [profileSimSuccess, setProfileSimSuccess] = useState(false);
  const [playSide, setPlaySide] = useState(user?.playSide || 'BOTH');
  const [dominantHand, setDominantHand] = useState(user?.dominantHand || 'RIGHT');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [photoUpdateSuccess, setPhotoUpdateSuccess] = useState<string | null>(null);

  // Saved Courts (Favorites) state
  const [savedCourts, setSavedCourts] = useState<any[]>([]);
  const [loadingSavedCourts, setLoadingSavedCourts] = useState(false);
  const [savedCourtsFeedback, setSavedCourtsFeedback] = useState<string | null>(null);

  const loadSavedCourts = async () => {
    setLoadingSavedCourts(true);
    try {
      const res = await api.getFavoriteCourts();
      if (res?.courts) {
        setSavedCourts(res.courts);
      }
    } catch (err) {
      console.error('Kaydedilen kortlar yüklenirken hata:', err);
    } finally {
      setLoadingSavedCourts(false);
    }
  };

  const handleRemoveFavorite = async (courtId: string, courtName: string) => {
    try {
      const res = await api.toggleFavoriteCourt(courtId);
      if (res?.user) {
        updateUser(res.user);
      }
      setSavedCourts(prev => prev.filter(c => c.id !== courtId));
      setSavedCourtsFeedback(`"${courtName}" favorilerinizden kaldırıldı.`);
      setTimeout(() => setSavedCourtsFeedback(null), 3000);
    } catch (err: any) {
      alert(err.message || 'İşlem gerçekleştirilemedi.');
    }
  };

  // Friends state
  const [friends, setFriends] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadFriends = async () => {
    setLoadingFriends(true);
    try {
      const res = await api.getFriends();
      if (res) {
        setFriends(res.friends || []);
        setAllPlayers(res.allPlayers || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    loadFriends();
    loadSavedCourts();
  }, [user?.favoriteCourtIds]);

  const handleToggleFriend = async (targetUserId: string, targetName: string) => {
    try {
      const res = await api.toggleFriend(targetUserId);
      if (res.isFriend) {
        setActionFeedback(`${targetName} arkadaş listenize eklendi.`);
      } else {
        setActionFeedback(`${targetName} arkadaş listenizden çıkarıldı.`);
      }
      await loadFriends();
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: any) {
      alert(err.message || 'İşlem başarısız.');
    }
  };

  const handleStartMessage = async (targetUserId: string) => {
    try {
      await api.startDirectMessage(targetUserId);
      navigate('/mesajlar');
    } catch (err: any) {
      alert(err.message || 'Mesaj başlatılamadı.');
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateProfile({ playSide, dominantHand });
      if (res?.user) {
        updateUser(res.user);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const handleSavePhoto = async (photoDataUrl: string) => {
    try {
      const res = await api.updateProfile({ avatarUrl: photoDataUrl });
      if (res?.user) {
        updateUser(res.user);
      }
      setPhotoUpdateSuccess('Profil fotoğrafınız başarıyla güncellendi.');
      setTimeout(() => setPhotoUpdateSuccess(null), 4000);
    } catch (err: any) {
      throw new Error(err.message || 'Fotoğraf kaydedilirken bir hata oluştu.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Success Notification for Photo Update */}
      {photoUpdateSuccess && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{photoUpdateSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setPhotoUpdateSuccess(null)}
            className="text-xs text-amber-900 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white font-bold cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {/* Profile Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            
            {/* Avatar with Camera Access Overlay */}
            <div className="relative group shrink-0">
              <img
                src={user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                alt={user?.displayName || 'Oyuncu'}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-500 shadow-xs"
              />
              <button
                type="button"
                onClick={() => setShowCameraModal(true)}
                className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900 transition-all cursor-pointer group-hover:scale-105"
                title="Kamerayı aç ve yeni fotoğraf çek"
                aria-label="Kamerayı aç ve yeni fotoğraf çek"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white font-serif">
                  {user?.displayName}
                </h1>
                {user?.emailVerified && (
                  <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    Doğrulanmış Oyuncu
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">{user?.email}</p>
              
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                  Maskelenmiş: {user?.maskedName}
                </span>

                <button
                  type="button"
                  onClick={() => setShowCameraModal(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-900 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-200 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Fotoğrafı Güncelle</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/dersler')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            >
              <span>Dersler</span>
            </button>
            {user?.isCoach && (
              <button
                type="button"
                onClick={() => navigate('/antrenor')}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
              >
                <span>Antrenör Paneli</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/hesap-ve-gizlilik')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span>Ayarlar</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-red-600 cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Çıkış</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Elo Puanı</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{user?.elo || 1450}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Toplam Maç</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{user?.matchesCount || 14}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Kazanma Oranı</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">%64</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Güvenilirlik</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">%98</span>
          </div>
        </div>
      </div>

      {/* Night-time Match Mode & Dark Theme Card */}
      <ThemeToggle variant="card" />

      {/* Padel Player Attributes & Preferences Form */}
      <form onSubmit={handleSavePreferences} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Oyuncu Tercihleri</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Açık maçlarda takım arkadaşı eşleşmeleri için kullanılır</p>
          </div>
          {savedSuccess && (
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800">
              <CheckCircle2 className="w-3.5 h-3.5" /> Kaydedildi
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Play Side */}
          <div>
            <label htmlFor="pref-playside" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Kort Pozisyonu / Kanat Tercihi
            </label>
            <select
              id="pref-playside"
              value={playSide}
              onChange={(e) => setPlaySide(e.target.value as any)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="LEFT">Sol Kanat (Revés - Hücum / Smash)</option>
              <option value="RIGHT">Sağ Kanat (Drive - Savunma / Kontrol)</option>
              <option value="BOTH">Çift Yön (Her iki kanatta da oynarım)</option>
            </select>
          </div>

          {/* Dominant Hand */}
          <div>
            <label htmlFor="pref-hand" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Baskın El
            </label>
            <select
              id="pref-hand"
              value={dominantHand}
              onChange={(e) => setDominantHand(e.target.value as any)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="RIGHT">Sağ El</option>
              <option value="LEFT">Sol El</option>
            </select>
          </div>

        </div>

        {/* Preferred Days and Hours info tags */}
        <div className="pt-2">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Sık Oynanan Zaman Aralıkları</span>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl font-medium">Hafta Sonu (Cumartesi / Pazar)</span>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl font-medium">Hafta İçi Akşam (18:00 - 22:00)</span>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer shadow-xs"
          >
            Tercihleri Güncelle
          </button>
        </div>
      </form>

      {/* Saved Courts (Favorites) Dedicated Section */}
      <div id="saved-courts-section" className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white font-serif">
                  Kaydedilen Kortlarım
                </h2>
                <span className="bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                  {savedCourts.length} Kort
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Favorilediğiniz padel kortları; tek dokunuşla saatleri görüp rezerve edin.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/sahalar')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <span>Tüm Kortları İncele</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {savedCourtsFeedback && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-300 text-xs font-semibold rounded-2xl flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{savedCourtsFeedback}</span>
          </div>
        )}

        {loadingSavedCourts ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
            Kaydedilen kortlar yükleniyor...
          </div>
        ) : savedCourts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {savedCourts.map((court) => (
              <div
                key={court.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all overflow-hidden flex flex-col justify-between shadow-2xs hover:shadow-md"
              >
                <div>
                  {/* Photo & Overlays */}
                  <div className="relative h-36 w-full overflow-hidden bg-slate-900">
                    <img
                      src={court.photos?.[0] || court.business?.coverImage || 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&auto=format&fit=crop&q=80'}
                      alt={court.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-black/20" />
                    
                    {/* Court Type Badge */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-white/10">
                        {court.type === 'OUTDOOR_PANORAMIC' ? 'Panoramik Cam' : court.type === 'INDOOR_PANORAMIC' ? 'Kapalı Panoramik' : 'Padel Kortu'}
                      </span>
                    </div>

                    {/* Remove from favorites heart button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFavorite(court.id, court.name);
                      }}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-white/90 dark:bg-slate-900/90 hover:bg-rose-50 dark:hover:bg-rose-950/90 text-rose-600 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-sm hover:scale-110"
                      title="Favorilerden Kaldır"
                      aria-label="Favorilerden Kaldır"
                    >
                      <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                    </button>

                    {/* Price tag on photo */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white">
                      <span className="text-xs font-black drop-shadow-sm">
                        ₺{court.pricePerHour} <span className="text-[10px] font-normal text-slate-300">/ saat</span>
                      </span>
                      {court.business?.rating && (
                        <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                          ★ {court.business.rating}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info Content */}
                  <div className="p-3.5 space-y-2">
                    <div>
                      <h3 className="text-xs font-black text-slate-900 dark:text-white line-clamp-1">
                        {court.name}
                      </h3>
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block line-clamp-1">
                        {court.business?.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="truncate">
                        {court.business?.district ? `${court.business.district}, ` : ''}{court.business?.city}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card CTA */}
                <div className="p-3.5 pt-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/saha/${court.id}`)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                  >
                    <span>Hemen Rezervasyon Yap</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 border border-rose-200/60 dark:border-rose-900/60 flex items-center justify-center mx-auto">
              <Heart className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                Henüz Favori Kort Eklenmedi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                Beğendiğiniz veya sık oynadığınız kortların detay sayfasındaki kalp simgesine basarak buraya kaydedebilirsiniz.
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => navigate('/sahalar')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Kortları Keşfet ve Kaydet</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Friends List & Management */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-serif">Padel Arkadaşlarım</h2>
            <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs px-2.5 py-0.5 rounded-full font-extrabold">
              {friends.length} Arkadaş
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/akis')}
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Sosyal Ağda Oyuncu Bul</span>
          </button>
        </div>

        {actionFeedback && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-300 text-xs font-semibold rounded-2xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {friends.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={friend.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                    alt={friend.name}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{friend.name}</span>
                      <span className="text-[10px] font-extrabold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800">
                        {friend.elo} Elo
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {friend.playSide === 'LEFT' ? 'Sol Kanat' : friend.playSide === 'RIGHT' ? 'Sağ Kanat' : 'Çift Yön'} • {friend.district || 'İzmir'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartMessage(friend.id)}
                    className="inline-flex items-center gap-1 p-2 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-[11px] font-bold transition-colors cursor-pointer"
                    title="Özel Mesaj Gönder"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mesaj</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleFriend(friend.id, friend.name)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-colors cursor-pointer"
                    title="Arkadaşlıktan Çıkar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
            <Users className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Henüz Arkadaşınız Bulunmuyor</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Sosyal Ağ veya Açık Maçlar üzerinden diğer padel oyuncularını arkadaş listenize ekleyerek maç davetleri gönderebilirsiniz.
            </p>
            
            {allPlayers.length > 0 && (
              <div className="pt-3 max-w-md mx-auto space-y-2 text-left">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Önerilen Oyuncular:</span>
                {allPlayers.slice(0, 3).map((p) => (
                  <div key={p.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={p.avatarUrl} alt={p.name} className="w-7 h-7 rounded-lg object-cover" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">{p.name}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{p.elo} Elo</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFriend(p.id, p.name)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ Ekle</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Push Notification and 2-Hour Reminder Preferences */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight font-serif">
                Push Bildirim ve Hatırlatma Ayarları
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Maç öncesi hatırlatıcılar ve anlık bildirim tercihleriniz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Tarayıcı İzni: {pushPermission === 'granted' ? 'Verildi ✅' : pushPermission === 'denied' ? 'Reddedildi ❌' : 'Varsayılan ⏳'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Toggle 1: Push Notifications */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Anlık Push Bildirimleri
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Uygulama içi ve sistem bildirim banner'larını etkinleştir
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => setPushEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Toggle 2: 2-Hour Reminder Alert */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/80 flex items-center justify-center text-amber-700 dark:text-amber-300 shadow-xs">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    2 Saat Öncesi Maç Hatırlatıcısı
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-950 dark:text-amber-100">
                    Önerilen
                  </span>
                </div>
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  Maçınızın başlamasına 2 saat kaldığında cihazınıza sesli anlık bildirim gönderir
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={reminder2HoursEnabled}
                onChange={(e) => setReminder2HoursEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Toggle 3: Sound Effect Chime */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Bildirim Sesi ve Zil Tonu
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Bildirim geldiğinde polifonik zil sesi ve titreşim oynat
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </div>

        {/* Action / Simulation Bar */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={async () => {
              setProfileSimSuccess(false);
              await simulate2HourAlert();
              setProfileSimSuccess(true);
              setTimeout(() => setProfileSimSuccess(false), 4000);
            }}
            disabled={isSimulating}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-98 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulating ? 'Simüle Ediliyor...' : '2 Saat Öncesi Uyarısını Şimdi Test Et'}</span>
          </button>

          {pushPermission === 'default' && (
            <button
              type="button"
              onClick={() => requestPushPermission()}
              className="w-full sm:w-auto min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Tarayıcı İzni İste</span>
            </button>
          )}
        </div>

        {profileSimSuccess && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-950 dark:text-amber-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
            <span>2 saat öncesi push bildirim uyarısı başarıyla tetiklendi! Ekranın üst kısmında banner gösterildi ve bildirim merkezine kaydedildi.</span>
          </div>
        )}
      </div>

      {/* Menu Navigation Links */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden transition-colors">
        <button
          type="button"
          onClick={() => navigate('/akis')}
          className="w-full flex items-center justify-between p-4.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left min-h-[48px] focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">Sosyal Ağ (Padel Topluluğu)</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/mesajlar')}
          className="w-full flex items-center justify-between p-4.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left min-h-[48px] focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">Özel Mesajlar</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('saved-courts-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="w-full flex items-center justify-between p-4.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left min-h-[48px] focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500" aria-hidden="true" />
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Kaydedilen Kortlarım ({savedCourts.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Favorilediğiniz padel sahaları ve hızlı rezervasyon
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/maclarim')}
          className="w-full flex items-center justify-between p-4.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left min-h-[48px] focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">Maçlarım ve Rezervasyon Geçmişim</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => setShowInstallModal(true)}
          className="w-full flex items-center justify-between p-4.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left min-h-[48px] focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">Mobil Uygulama (iOS & Android) Kurulumu</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Ana ekrana ekleme rehberi ve tam ekran mod</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/hesap-ve-gizlilik')}
          className="w-full flex items-center justify-between p-4.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left min-h-[48px] focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">Hesap, Güvenlik ve Gizlilik</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <PWAInstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />

      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onSavePhoto={handleSavePhoto}
        currentAvatarUrl={user?.avatarUrl}
      />
    </div>
  );
};
