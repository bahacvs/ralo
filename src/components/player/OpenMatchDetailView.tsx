import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { MatchShareModal } from './MatchShareModal.js';
import { 
  Calendar, Clock, MapPin, Users, ShieldCheck, 
  ArrowLeft, AlertTriangle, CheckCircle2, UserPlus, LogOut, MessageSquare,
  Send, UserCheck, Check, Sparkles, Share2
} from 'lucide-react';

export const OpenMatchDetailView: React.FC = () => {
  const { routeParams, user, navigate } = useAuth();
  const reservationId = routeParams.rezervasyonId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<any | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Friend Invite State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [allPlayersList, setAllPlayersList] = useState<any[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteModalLoading, setInviteModalLoading] = useState(false);

  const fetchDetail = async () => {
    if (!reservationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOpenMatchDetail(reservationId);
      setMatchData(res);
    } catch (err: any) {
      setError(err.message || 'Maç detayı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const loadFriendsData = async () => {
    try {
      const res = await api.getFriends();
      if (res) {
        setFriendsList(res.friends || []);
        setAllPlayersList(res.allPlayers || []);
        setFriendIds(new Set((res.friends || []).map((f: any) => f.id)));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDetail();
    loadFriendsData();
  }, [reservationId]);

  const handleOpenInviteModal = () => {
    loadFriendsData();
    setShowInviteModal(true);
  };

  const handleInviteFriend = async (friendUserId: string, friendName: string) => {
    if (!reservationId || invitingId) return;
    setInvitingId(friendUserId);
    try {
      const res = await api.inviteFriendToMatch(reservationId, friendUserId);
      setInvitedFriendIds(prev => new Set(prev).add(friendUserId));
      setActionMessage(`${friendName} adlı arkadaşınıza maç daveti ve bildirim gönderildi! 🎾`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage(err.message || 'Davet gönderilemedi.');
    } finally {
      setInvitingId(null);
    }
  };

  const handleToggleFriendFromMatch = async (targetUserId: string, targetName: string) => {
    if (!user || targetUserId === user.id) return;
    try {
      const res = await api.toggleFriend(targetUserId);
      if (res.isFriend) {
        setFriendIds(prev => new Set(prev).add(targetUserId));
        setActionMessage(`${targetName} arkadaş listenize eklendi! Bildirim gönderildi.`);
      } else {
        setFriendIds(prev => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        setActionMessage(`${targetName} arkadaş listenizden çıkarıldı.`);
      }
      loadFriendsData();
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: any) {
      alert(err.message || 'İşlem başarısız.');
    }
  };

  const handleStartDirectMessage = async (targetUserId: string) => {
    try {
      await api.startDirectMessage(targetUserId);
      navigate('/mesajlar');
    } catch (err: any) {
      alert(err.message || 'Sohbet başlatılamadı.');
    }
  };

  const handleJoin = async () => {
    if (!reservationId) return;
    setActionLoading(true);
    try {
      const res = await api.joinOpenMatch(reservationId);
      setActionMessage(res.message);
      await fetchDetail();
    } catch (err: any) {
      setActionMessage(err.message || 'Katılım sırasında bir hata oluştu.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!reservationId) return;
    setActionLoading(true);
    try {
      const res = await api.leaveOpenMatch(reservationId);
      setShowLeaveModal(false);
      setActionMessage(res.message);
      await fetchDetail();
    } catch (err: any) {
      setActionMessage(err.message || 'Ayrılma işlemi başarısız.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleWaitlist = async () => {
    if (!reservationId) return;
    setActionLoading(true);
    try {
      const res = await api.toggleWaitlist(reservationId);
      setActionMessage(res.message);
      await fetchDetail();
    } catch (err: any) {
      setActionMessage(err.message || 'Yedek listesi güncellenemedi.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState message="Açık maç detayları yükleniyor..." />;
  if (error) return <ErrorState message={error} onRetry={fetchDetail} />;
  if (!matchData) return null;

  const { match, court, business, participants = [], waitlist = [], organizerMaskedName, pricePerPlayer } = matchData;
  
  const activeParticipants = participants.filter((p: any) => p.status === 'ACTIVE');
  const isUserJoined = participants.some((p: any) => p.userId === user?.id && p.status === 'ACTIVE');
  const isUserPending = participants.some((p: any) => p.userId === user?.id && p.status === 'PENDING_APPROVAL');
  const userWaitlistEntry = waitlist.find((w: any) => w.userId === user?.id);
  const isUserOnWaitlist = !!userWaitlistEntry;
  const isFull = activeParticipants.length >= 4;

  // 4 Slot representation array
  const slots = [0, 1, 2, 3].map((idx) => {
    const participant = activeParticipants[idx];
    return {
      slotIndex: idx,
      isOccupied: !!participant,
      participant
    };
  });

  return (
    <div className="space-y-6 pb-12">
      
      {/* Back Button */}
      <button
        type="button"
        onClick={() => navigate('/acik-maclar')}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Açık Maçlara Dön</span>
      </button>

      {/* Match Banner Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition-colors">
        <div className="bg-slate-900 dark:bg-slate-950 text-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {isUserJoined && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-xs font-black px-3 py-1 rounded-full shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                <span>Katıldın</span>
              </span>
            )}
            <span className="bg-amber-500 text-slate-950 text-xs font-black px-3 py-1 rounded-full">
              Açık Padel Maçı
            </span>
            <span className="bg-slate-800 text-slate-200 text-xs font-semibold px-3 py-1 rounded-full">
              {match.durationMinutes} Dakika
            </span>
            <span className="bg-slate-800 text-slate-200 text-xs font-semibold px-3 py-1 rounded-full">
              Elo {match.minElo || 1200} - {match.maxElo || 1600}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black font-serif text-white tracking-tight">
            {business?.name} - {court?.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-300">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>{new Date(match.startAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-white">{match.startAt.split('T')[1].slice(0, 5)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>{business?.district}, İzmir</span>
            </div>
          </div>
        </div>

        {/* Message Notice Alert */}
        {actionMessage && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{actionMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-xs text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white min-h-[44px] px-2 font-bold cursor-pointer"
            >
              Tamam
            </button>
          </div>
        )}

        {/* 4 Player Slots Showcase */}
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Kadro & Oyuncu Koltukları (4 Kişilik)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Oyuncu gizliliği için isimler maskelenmiştir</p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                {activeParticipants.length} / 4 Dolu
              </span>

              {/* Share Match AI Button */}
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs transition-colors cursor-pointer min-h-[36px]"
                title="Yapay zeka ile sosyal medya görseli oluşturup maçı paylaş"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <Share2 className="w-3.5 h-3.5" />
                <span>Maçı Paylaş</span>
              </button>

              {/* Arkadaşını Maça Davet Et Button */}
              <button
                type="button"
                onClick={handleOpenInviteModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs transition-colors cursor-pointer min-h-[36px]"
                title="Arkadaşını bu maça çağır"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Arkadaşını Davet Et</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {slots.map((slot) => {
              if (slot.isOccupied) {
                const p = slot.participant;
                const isCurrent = p.userId === user?.id;
                const isFriend = friendIds.has(p.userId);
                return (
                  <div
                    key={slot.slotIndex}
                    className={`rounded-2xl p-4 border flex flex-col justify-between transition-all ${
                      isCurrent 
                        ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-600 ring-1 ring-amber-400/40' 
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <img
                        src={p.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                        alt={p.maskedName}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {isCurrent ? `${p.maskedName} (Sen)` : p.maskedName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Elo: <strong className="text-slate-800 dark:text-slate-200">{p.elo}</strong>
                        </p>
                        <span className="inline-block text-[10px] font-semibold bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-600 mt-1">
                          {p.playSide === 'LEFT' ? 'Sol Kanat' : p.playSide === 'RIGHT' ? 'Sağ Kanat' : 'Çift Yön'}
                        </span>
                      </div>
                    </div>

                    {/* Friend & Message actions for other players */}
                    {!isCurrent && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-1">
                        {isFriend ? (
                          <button
                            type="button"
                            onClick={() => handleToggleFriendFromMatch(p.userId, p.maskedName)}
                            className="text-[10px] font-bold text-amber-950 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 px-2 py-1 rounded-lg transition-colors cursor-pointer group"
                            title="Arkadaşınız (Çıkarmak için tıklayın)"
                          >
                            <span className="group-hover:hidden flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Arkadaşsınız
                            </span>
                            <span className="hidden group-hover:inline">Çıkar</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleFriendFromMatch(p.userId, p.maskedName)}
                            className="text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:text-amber-900 dark:hover:text-amber-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-amber-300 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Arkadaş olarak ekle"
                          >
                            <UserPlus className="w-2.5 h-2.5" /> + Arkadaş Ekle
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartDirectMessage(p.userId)}
                          className="text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="Özel Mesaj Gönder"
                        >
                          <MessageSquare className="w-2.5 h-2.5 text-slate-500 dark:text-slate-400" />
                          <span>Mesaj</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={slot.slotIndex}
                  className="rounded-2xl p-4 border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40 flex flex-col items-center justify-center text-center min-h-[120px]"
                >
                  <Users className="w-6 h-6 text-slate-400 dark:text-slate-500 mb-1" aria-hidden="true" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Oyuncu Aranıyor</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Slot {slot.slotIndex + 1}</span>

                  <button
                    type="button"
                    onClick={handleOpenInviteModal}
                    className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold text-amber-950 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/40 px-2.5 py-1 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Arkadaşını Çağır</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Waitlist (if full) */}
        {waitlist.length > 0 && (
          <div className="px-6 pb-6 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Yedek Listesi ({waitlist.length} Oyuncu)
            </h3>
            <div className="flex flex-wrap gap-2">
              {waitlist.map((w: any) => (
                <div key={w.id} className="text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <span className="font-bold">{w.position}.</span>
                  <span>{w.userId === user?.id ? `${w.maskedName} (Sen)` : w.maskedName}</span>
                  <span className="text-[10px] text-amber-700 dark:text-amber-400">({w.elo} Elo)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Match Rules & Notes */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Maç Bilgileri & Kurallar</h2>
        
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <p className="font-bold text-slate-900 dark:text-white mb-1">Organizatör Notu:</p>
          <p>{match.openMatchNote || 'Orta seviye keyifli maç, lütfen maç saatinden 10 dakika önce kortta olun.'}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80">
            <strong className="text-slate-900 dark:text-white block mb-0.5">Organizatör:</strong>
            <span>{organizerMaskedName} (Doğrulanmış Oyuncu)</span>
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80">
            <strong className="text-slate-900 dark:text-white block mb-0.5">Ödeme Koşulları:</strong>
            <span>Kişi başı {pricePerPlayer} ₺ tesis resepsiyonunda ödenir.</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-950 dark:text-amber-200 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Fair-Play & No-Show Politikası:</span>
          </p>
          <p className="text-amber-900 dark:text-amber-300 leading-relaxed">
            Katılım onaylandıktan sonra mazeretsiz gelmeyen oyuncuların ArenaMate Güvenilirlik Skoru düşer ve 14 gün boyunca açık maçlara katılımı kısıtlanır. İptal için maçtan en az 6 saat önce ayrılmanız gerekmektedir.
          </p>
        </div>
      </div>

      {/* Social Network Callout */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Sosyal Ağ</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              İzmir padel topluluğunda maç organize edin, durum paylaşın ve yeni oyuncularla tanışın.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/akis')}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-colors min-h-[40px] focus-visible:ring-2 focus-visible:ring-slate-900 cursor-pointer shrink-0"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Sosyal Ağa Git</span>
        </button>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-400 block">Kişi Başı Katılım Tutarı</span>
          <div className="text-2xl font-black text-white">{pricePerPlayer} ₺</div>
          <span className="text-[11px] text-amber-400">Tesiste nakit veya kredi kartıyla ödeme</span>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          {/* Maçı Paylaş in Bottom Bar */}
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[48px] px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer shadow-xs"
            title="AI ile görsel oluşturup maçı paylaş"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            <Share2 className="w-4 h-4 mr-1.5" />
            <span>Maçı Paylaş</span>
          </button>

          {/* Arkadaşını Davet Et in Bottom Bar */}
          <button
            type="button"
            onClick={handleOpenInviteModal}
            className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[48px] px-4 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
            title="Arkadaşını maça davet et"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            <span>Arkadaşını Davet Et</span>
          </button>

          {/* Messages link */}
          <button
            type="button"
            onClick={() => navigate('/mesajlar')}
            className="inline-flex items-center justify-center min-h-[48px] px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
            title="Özel Mesajlar"
          >
            <MessageSquare className="w-4 h-4 mr-1.5" />
            <span>Mesajlar</span>
          </button>

          {isUserJoined ? (
            <button
              type="button"
              onClick={() => setShowLeaveModal(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold transition-colors focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              <span>Maçtan Ayrıl</span>
            </button>
          ) : isUserPending ? (
            <div className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 rounded-2xl bg-blue-900/60 border border-blue-600 text-blue-200 text-xs font-bold">
              <span>Onay Bekleniyor</span>
            </div>
          ) : isFull ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleToggleWaitlist}
              className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
            >
              <span>{isUserOnWaitlist ? `Yedek Listesinden Çık (${userWaitlistEntry?.position}. Sıra)` : 'Yedek Listesine Yazıl'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleJoin}
              className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[48px] px-8 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black transition-colors shadow-md focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              <span>{match.approvalRequired ? 'Katılım İsteği Gönder' : 'Maça Katıl'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Invite Friend Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Arkadaşını Maça Davet Et"
        description="Seçtiğiniz arkadaşınıza anında maç daveti ve bildirim gönderilir."
        maxWidth="md"
      >
        <div className="space-y-4 pt-2">
          {friendsList.length > 0 ? (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {friendsList.map((friend) => {
                const isAlreadyJoined = activeParticipants.some((p: any) => p.userId === friend.id);
                const isInvited = invitedFriendIds.has(friend.id);
                const isCurrentInviting = invitingId === friend.id;

                return (
                  <div
                    key={friend.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={friend.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                        alt={friend.name}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{friend.name}</span>
                          <span className="text-[10px] font-extrabold text-amber-950 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 px-1.5 py-0.2 rounded">
                            {friend.elo} Elo
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {friend.playSide === 'LEFT' ? 'Sol Kanat' : friend.playSide === 'RIGHT' ? 'Sağ Kanat' : 'Çift Yön'} • {friend.district || 'İzmir'}
                        </span>
                      </div>
                    </div>

                    <div>
                      {isAlreadyJoined ? (
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-slate-400" />
                          <span>Zaten Maçta</span>
                        </span>
                      ) : isInvited ? (
                        <span className="text-xs font-bold text-amber-950 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-amber-600" />
                          <span>Davet Edildi</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isCurrentInviting}
                          onClick={() => handleInviteFriend(friend.id, friend.name)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isCurrentInviting ? 'Gönderiliyor...' : 'Davet Et'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                Henüz arkadaş listenizde kayıtlı kimse bulunmuyor. Aşağıdaki İzmir padel oyuncularını arkadaş ekleyerek hemen maça davet edebilirsiniz:
              </div>

              {allPlayersList.length > 0 && (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {allPlayersList.map((player) => (
                    <div
                      key={player.id}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={player.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                          alt={player.name}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{player.name}</span>
                            <span className="text-[10px] text-amber-950 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/60 px-1 rounded">
                              {player.elo} Elo
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {player.playSide === 'LEFT' ? 'Sol Kanat' : player.playSide === 'RIGHT' ? 'Sağ Kanat' : 'Çift Yön'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await handleToggleFriendFromMatch(player.id, player.name);
                          await loadFriendsData();
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Arkadaş Ekle</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </Modal>

      {/* Leave Confirmation Modal */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Maçtan Ayrılmak İstediğinize Emin Misiniz?"
        description="Ayrıldığınızda koltuğunuz yedek listesindeki diğer oyunculara devredilecektir."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Maçtan ayrılmanız durumunda takım arkadaşlarınız eksik kalabilir. Maç saatine 6 saatten az kaldıysa bu işlem profil puanınızı etkileyebilir.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowLeaveModal(false)}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleLeave}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
            >
              {actionLoading ? 'İşleniyor...' : 'Evet, Ayrıl'}
            </button>
          </div>
        </div>
      </Modal>

      {/* AI Match Share Modal */}
      {matchData && (
        <MatchShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          matchData={matchData}
        />
      )}

    </div>
  );
};
