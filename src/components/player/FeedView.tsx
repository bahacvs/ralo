import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { FeedPost, FeedCategory } from '../../types/index.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { 
  MessageSquare, Send, Heart, MessageCircle, 
  MapPin, Sparkles, Filter, RefreshCw, ChevronDown, 
  Users, Trophy, Check, ArrowRight, UserPlus, UserCheck, Share2
} from 'lucide-react';

const CATEGORIES: { id: string; label: string; icon: string; badgeClass: string }[] = [
  { id: 'ALL', label: 'Tüm Paylaşımlar', icon: '⚡', badgeClass: 'bg-slate-100 text-slate-800' },
  { id: 'SOHBET', label: 'Genel Paylaşım', icon: '💬', badgeClass: 'bg-amber-100 text-amber-950 border-amber-200' },
  { id: 'OYUNCU_ARIYORUM', label: 'Partner Aranıyor', icon: '🎾', badgeClass: 'bg-amber-100 text-amber-950 border-amber-300' },
  { id: 'MAC_DUYURUSU', label: 'Maç & Turnuva', icon: '🏆', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'EKIPMAN', label: 'Ekipman & Taktik', icon: '🏓', badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-200' }
];

const VENUES = [
  'Belirtilmedi',
  'Padel Arena Urla',
  'Alaçatı Padel Club',
  'Çeşme Padel & Tennis Park',
  'Alsancak Spor Vadisi',
  'Mavişehir Padel Court'
];

export const FeedView: React.FC = () => {
  const { user, navigate } = useAuth();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [friendActionMessage, setFriendActionMessage] = useState<string | null>(null);

  // Post composer state
  const [newContent, setNewContent] = useState('');
  const [postCategory, setPostCategory] = useState<FeedCategory>('SOHBET');
  const [postVenue, setPostVenue] = useState<string>('Belirtilmedi');
  const [posting, setPosting] = useState(false);
  const [postSuccessMessage, setPostSuccessMessage] = useState<string | null>(null);

  // Active replies thread state (expanded post ids)
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});

  const loadFriends = useCallback(async () => {
    try {
      const res = await api.getFriends();
      if (res && res.friends) {
        setFriendIds(new Set(res.friends.map(f => f.id)));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchFeed = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const res = await api.getFeed(selectedCategory);
      setPosts(res.posts || []);
    } catch (err: any) {
      setError(err.message || 'Sosyal ağ yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchFeed();
    loadFriends();
  }, [fetchFeed, loadFriends]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchFeed(true);
    loadFriends();
  };

  const handleToggleFriend = async (targetUserId: string, targetName: string) => {
    if (!user || targetUserId === user.id) return;
    try {
      const res = await api.toggleFriend(targetUserId);
      if (res.isFriend) {
        setFriendIds(prev => new Set(prev).add(targetUserId));
        setFriendActionMessage(`${targetName} arkadaş listenize eklendi! Bildirim gönderildi.`);
      } else {
        setFriendIds(prev => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        setFriendActionMessage(`${targetName} arkadaş listenizden çıkarıldı.`);
      }
      setTimeout(() => setFriendActionMessage(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Arkadaşlık işlemi gerçekleştirilemedi.');
    }
  };

  const handleStartDirectMessage = async (targetUserId: string) => {
    if (!user) return;
    try {
      await api.startDirectMessage(targetUserId);
      navigate('/mesajlar');
    } catch (err: any) {
      alert(err.message || 'Sohbet başlatılamadı.');
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || posting) return;

    setPosting(true);
    try {
      const res = await api.createFeedPost({
        content: newContent.trim(),
        category: postCategory,
        venueName: postVenue !== 'Belirtilmedi' ? postVenue : undefined
      });

      if (res.success && res.post) {
        setPosts(prev => [res.post, ...prev]);
        setNewContent('');
        setPostSuccessMessage('Paylaşımınız akışta yayınlandı!');
        setTimeout(() => setPostSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      alert(err.message || 'Paylaşım yapılamadı.');
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;
    try {
      const res = await api.toggleLikePost(postId);
      if (res.success) {
        setPosts(prev => prev.map(p => {
          if (p.id !== postId) return p;
          const currentLikes = p.likes || [];
          const userLiked = currentLikes.includes(user.id);
          const newLikes = userLiked 
            ? currentLikes.filter(id => id !== user.id)
            : [...currentLikes, user.id];
          return { ...p, likes: newLikes };
        }));
      }
    } catch (err) {
      console.error('Beğeni güncellenemedi:', err);
    }
  };

  const toggleRepliesVisibility = (postId: string) => {
    setExpandedReplies(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  const handleSendReply = async (postId: string) => {
    const text = (replyInputs[postId] || '').trim();
    if (!text || submittingReply[postId]) return;

    setSubmittingReply(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await api.replyToPost(postId, text);
      if (res.success && res.reply) {
        setPosts(prev => prev.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            replies: [...(p.replies || []), res.reply]
          };
        }));
        setReplyInputs(prev => ({ ...prev, [postId]: '' }));
        // Ensure thread is expanded
        setExpandedReplies(prev => ({ ...prev, [postId]: true }));
      }
    } catch (err: any) {
      alert(err.message || 'Yanıt gönderilemedi.');
    } finally {
      setSubmittingReply(prev => ({ ...prev, [postId]: false }));
    }
  };

  const formatTimeAgo = (isoDate: string) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
    if (diffSec < 60) return 'Az önce';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} saat önce`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'Dün';
    return `${diffDay} gün önce`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast alert for friendship action */}
      {friendActionMessage && (
        <div className="fixed bottom-20 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{friendActionMessage}</span>
        </div>
      )}

      {/* 3D Social Community Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl min-h-[190px] sm:min-h-[210px] p-6 sm:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col justify-between [perspective:1000px] group">
        {/* Background Community Photo with 3D Zoom */}
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1526676037777-05a232554f77?w=1400&auto=format&fit=crop&q=80" 
            alt="Padel Topluluğu ve Oyuncular"
            className="w-full h-full object-cover object-center scale-100 group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-900/60" />
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/25 border border-indigo-400/40 backdrop-blur-md text-indigo-300 text-xs font-black shadow-md">
                <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                <span>Padel Topluluğu</span>
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {posts.length} Gönderi
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-serif drop-shadow-md">
              Sosyal Ağ & Oyuncu Akışı
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed drop-shadow-xs">
              Padel camiasında durum paylaşın, yeni partnerlerle tanışın, arkadaş ekleyin ve maç davetleri oluşturun.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/mesajlar')}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all shadow-lg shadow-indigo-950/60 border border-indigo-400/50 backdrop-blur-md cursor-pointer hover:scale-[1.02] active:scale-95"
              title="Özel Mesajlarınıza Gidin"
            >
              <MessageSquare className="w-4 h-4 text-white" aria-hidden="true" />
              <span>Özel Mesajlar</span>
            </button>

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/30 backdrop-blur-md shadow-md transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
              title="Sosyal Ağı Yenile"
            >
              <RefreshCw className={`w-4 h-4 text-amber-300 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Yenile</span>
            </button>
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 pt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/90">
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            💬 Canlı Sohbet
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            👥 Oyuncu Profilleri
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs">
            🎾 Partner İlanları
          </span>
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map(cat => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all min-h-[40px] ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                  : 'bg-white text-slate-700 hover:bg-slate-100/80 border border-slate-200/80'
              } focus-visible:ring-2 focus-visible:ring-amber-500`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* New Post Composer Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <img
            src={user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
            alt={user?.displayName || 'Oyuncu'}
            className="w-10 h-10 rounded-2xl object-cover border border-slate-200 shrink-0 mt-0.5"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-slate-900 truncate">
                {user?.displayName || 'Oyuncu'}
              </span>
              <span className="bg-amber-50 text-amber-950 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-amber-200/60">
                Elo {user?.elo || 1400}
              </span>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Tüm oyuncularla bir mesaj, maç daveti veya soru paylaş..."
                rows={3}
                maxLength={1000}
                className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/70 border border-slate-200 rounded-2xl p-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white resize-none transition-all"
              />

              {/* Composer Options */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Category select */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 font-medium hidden sm:inline">Kategori:</span>
                    <select
                      value={postCategory}
                      onChange={(e) => setPostCategory(e.target.value as FeedCategory)}
                      className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-semibold text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="SOHBET">💬 Genel Sohbet</option>
                      <option value="OYUNCU_ARIYORUM">🎾 Partner Aranıyor</option>
                      <option value="MAC_DUYURUSU">🏆 Maç & Turnuva</option>
                      <option value="EKIPMAN">🏓 Ekipman & Taktik</option>
                    </select>
                  </div>

                  {/* Venue select */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 font-medium hidden sm:inline">Tesis:</span>
                    <select
                      value={postVenue}
                      onChange={(e) => setPostVenue(e.target.value)}
                      className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-semibold text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer max-w-[150px] truncate"
                    >
                      {VENUES.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={posting || !newContent.trim()}
                  className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors min-h-[40px] focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{posting ? 'Yayınlanıyor...' : 'Paylaş'}</span>
                </button>
              </div>

              {postSuccessMessage && (
                <div className="text-xs text-amber-950 bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-semibold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-amber-600" />
                  <span>{postSuccessMessage}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Posts Stream */}
      {loading ? (
        <LoadingState message="Oyuncu akışı yükleniyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchFeed()} />
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Bu kategoride henüz paylaşım yok</h2>
          <p className="text-xs text-slate-500 mt-1">
            Topluluk akışında ilk mesajı siz paylaşın veya filtreyi değiştirin.
          </p>
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className="mt-4 inline-flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            Tüm Akışı Göster
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isLiked = user && post.likes?.includes(user.id);
            const likesCount = post.likes?.length || 0;
            const replies = post.replies || [];
            const isThreadExpanded = expandedReplies[post.id] ?? (replies.length > 0);
            const categoryConfig = CATEGORIES.find(c => c.id === post.category) || CATEGORIES[1];

            return (
              <article
                key={post.id}
                className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs hover:shadow-sm transition-all"
              >
                {/* Author Info & Category Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <img
                      src={post.authorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={post.authorName}
                      className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900">
                          {post.authorName}
                        </span>
                        <span className="bg-amber-50 text-amber-950 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-amber-200/60">
                          Elo {post.authorElo || 1400}
                        </span>
                        {post.authorPlaySide && (
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                            {post.authorPlaySide === 'BOTH' ? 'Çift Yön' : post.authorPlaySide === 'LEFT' ? 'Sol Kanat' : 'Sağ Kanat'}
                          </span>
                        )}

                        {/* Friend and Direct Message Quick Actions */}
                        {user && post.userId !== user.id && (
                          <div className="flex items-center gap-1.5 ml-1">
                            {friendIds.has(post.userId) ? (
                              <button
                                type="button"
                                onClick={() => handleToggleFriend(post.userId, post.authorName)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 hover:bg-rose-50 hover:text-rose-700 border border-amber-200 hover:border-rose-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer group"
                                title="Arkadaşınız (Çıkarmak için tıklayın)"
                              >
                                <UserCheck className="w-3 h-3 group-hover:hidden text-amber-600" />
                                <span className="group-hover:hidden">Arkadaşsınız</span>
                                <span className="hidden group-hover:inline">Çıkar</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleFriend(post.userId, post.authorName)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-amber-500 hover:text-slate-950 border border-slate-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                title="Arkadaş olarak ekle"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>+ Arkadaş Ekle</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleStartDirectMessage(post.userId)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                              title="Özel Mesaj Gönder"
                            >
                              <MessageSquare className="w-3 h-3 text-slate-500" />
                              <span>Mesaj</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        {formatTimeAgo(post.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Category Pill */}
                  <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${categoryConfig.badgeClass}`}>
                    <span className="mr-1">{categoryConfig.icon}</span>
                    <span>{categoryConfig.label}</span>
                  </span>
                </div>

                {/* Content */}
                <div className="mt-3.5 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </div>

                {/* Optional Venue Badge */}
                {post.venueName && (
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-xl">
                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                    <span>{post.venueName}</span>
                  </div>
                )}

                {/* Post Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-3">
                    {/* Like Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleLike(post.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors font-bold ${
                        isLiked 
                          ? 'bg-rose-50 text-rose-600' 
                          : 'hover:bg-slate-100 text-slate-600'
                      }`}
                      aria-label="Beğen"
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span>{likesCount}</span>
                    </button>

                    {/* Replies Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleRepliesVisibility(post.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 text-slate-600 font-semibold transition-colors"
                    >
                      <MessageCircle className="w-4 h-4 text-amber-600" />
                      <span>{replies.length} Yanıt</span>
                    </button>
                  </div>

                  {/* Contextual Link */}
                  {post.category === 'OYUNCU_ARIYORUM' || post.category === 'MAC_DUYURUSU' ? (
                    <button
                      type="button"
                      onClick={() => navigate('/acik-maclar')}
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
                    >
                      <span>Açık Maçlara Git</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>

                {/* Replies Thread Section */}
                {isThreadExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100/90 space-y-3">
                    {replies.length > 0 && (
                      <div className="space-y-2.5 pl-3 sm:pl-6 border-l-2 border-slate-100">
                        {replies.map((reply) => (
                          <div key={reply.id} className="bg-slate-50/80 rounded-2xl p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={reply.authorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                                  alt={reply.authorName}
                                  className="w-6 h-6 rounded-lg object-cover"
                                />
                                <span className="font-extrabold text-slate-900">{reply.authorName}</span>
                                <span className="text-[10px] font-bold text-amber-950 bg-amber-100/80 px-1.5 py-0.2 rounded">
                                  Elo {reply.authorElo || 1400}
                                </span>

                                {user && reply.userId !== user.id && (
                                  <div className="inline-flex items-center gap-1 ml-1">
                                    {friendIds.has(reply.userId) ? (
                                      <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                        <Check className="w-2.5 h-2.5" /> Arkadaş
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleFriend(reply.userId, reply.authorName)}
                                        className="text-[9px] font-bold text-slate-600 hover:text-amber-700 bg-white border border-slate-200 hover:border-amber-300 px-1.5 py-0.2 rounded flex items-center gap-0.5 transition-colors cursor-pointer"
                                        title="Arkadaş Ekle"
                                      >
                                        <UserPlus className="w-2.5 h-2.5" /> + Ekle
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleStartDirectMessage(reply.userId)}
                                      className="text-[9px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-1.5 py-0.2 rounded flex items-center gap-0.5 transition-colors cursor-pointer"
                                      title="Özel Mesaj"
                                    >
                                      <MessageSquare className="w-2.5 h-2.5 text-slate-400" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {formatTimeAgo(reply.createdAt)}
                              </span>
                            </div>
                            <p className="text-slate-800 pl-8 leading-relaxed">
                              {reply.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inline Reply Input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={replyInputs[post.id] || ''}
                        onChange={(e) => setReplyInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendReply(post.id);
                          }
                        }}
                        placeholder="Bu paylaşıma yanıt yaz..."
                        className="flex-1 text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendReply(post.id)}
                        disabled={submittingReply[post.id] || !(replyInputs[post.id] || '').trim()}
                        className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        title="Yanıtı Gönder"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
