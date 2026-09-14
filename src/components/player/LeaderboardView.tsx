import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';

type LeaderboardPlayer = Awaited<ReturnType<typeof api.getLeaderboard>>['players'][number];

const PLAY_SIDE_LABELS: Record<string, string> = {
  LEFT: 'Sol Kanat',
  RIGHT: 'Sağ Kanat',
  BOTH: 'Çift Yön'
};

export const LeaderboardView: React.FC = () => {
  const { user } = useAuth();
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getLeaderboard();
      setPlayers(res.players);
    } catch (err: any) {
      setError(err.message || 'Sıralama yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const me = user ? players.find(p => p.id === user.id) : undefined;

  return (
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
          Padel Oyuncu Sıralaması (Elo)
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Türkiye geneli en yüksek Elo puanına sahip ilk 50 oyuncu
        </p>
      </div>

      {/* User Rank Highlight */}
      {me && (
        <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-amber-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-xs">
              #{me.rank}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Senin Sıralaman</h2>
              <p className="text-xs text-amber-300 font-semibold">
                {me.maskedName} • {me.elo.toLocaleString('tr-TR')} Elo • {me.matchesCount} Maç
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Table / Cards */}
      {loading ? (
        <LoadingState message="Sıralama yükleniyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchLeaderboard} />
      ) : players.length === 0 ? (
        <EmptyState
          title="Henüz Sıralama Yok"
          description="Sıralamada gösterilecek oyuncu bulunmuyor. Maç oynadıkça Elo puanları burada listelenecek."
        />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Oyuncu</span>
            <div className="flex items-center gap-6">
              <span className="hidden sm:inline">Maçlar</span>
              <span className="text-right w-16">Elo Puanı</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {players.map((item) => {
              const isMe = item.id === user?.id;
              return (
                <div
                  key={item.id}
                  className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                    isMe ? 'bg-amber-50/60 font-bold' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 text-center font-extrabold text-sm shrink-0 ${
                      item.rank === 1 ? 'text-amber-500' : item.rank === 3 ? 'text-amber-700' : 'text-slate-400'
                    }`}>
                      {item.rank}
                    </span>

                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt={item.maskedName}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-500 shrink-0" aria-hidden="true">
                        {item.maskedName?.[0] || '?'}
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="truncate">{item.maskedName}</span>
                        {isMe && <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded-md">Sen</span>}
                      </h3>
                      <span className="text-[11px] text-slate-500 font-normal">
                        {PLAY_SIDE_LABELS[item.playSide] || 'Çift Yön'}
                        <span className="sm:hidden"> • {item.matchesCount} Maç</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs shrink-0">
                    <span className="text-slate-600 hidden sm:inline">{item.matchesCount} Maç</span>
                    <span className="font-extrabold text-slate-900 text-sm sm:text-base w-16 text-right">
                      {item.elo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed border border-slate-200/80">
        <strong className="text-slate-900 block mb-1">Elo Sıralama Sistemi Nasıl Çalışır?</strong>
        RALO, rekabetçi spor matematiğine dayalı Elo algoritmasını kullanır. Maç kazandığınızda rakip takımın ortalama seviyesine göre puan kazanırsınız. Beklenmedik galibiyetler daha yüksek puan kazandırır.
      </div>

    </div>
  );
};
