import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Trophy, Medal, Award, Sparkles, UserCheck } from 'lucide-react';

export const LeaderboardView: React.FC = () => {
  const { user } = useAuth();

  const mockLeaderboard = [
    { rank: 1, name: 'Can E. (Urla)', elo: 1680, matches: 38, winRate: 78, side: 'Sol Kanat', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' },
    { rank: 2, name: 'Baha Ç. (Sen)', elo: 1450, matches: 14, winRate: 64, side: 'Çift Yön', avatar: user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
    { rank: 3, name: 'Sarp D. (Çeşme)', elo: 1420, matches: 22, winRate: 59, side: 'Sağ Kanat', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
    { rank: 4, name: 'Emre K. (Bornova)', elo: 1390, matches: 19, winRate: 53, side: 'Sol Kanat', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80' },
    { rank: 5, name: 'Deniz A. (Urla)', elo: 1350, matches: 16, winRate: 50, side: 'Çift Yön', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80' },
    { rank: 6, name: 'Alp T. (Çeşme)', elo: 1320, matches: 11, winRate: 45, side: 'Sağ Kanat', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80' }
  ];

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
          Padel Oyuncu Sıralaması (Elo)
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Ege bölgesi doğrulanmış açık maç performans tablosu
        </p>
      </div>

      {/* User Rank Highlight */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-amber-800/40 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-xs">
            #2
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Senin Sıralaman</h2>
            <p className="text-xs text-amber-300 font-semibold">Baha Ç. • 1.450 Elo • 14 Maç</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Kategori</span>
          <span className="text-xs font-black text-amber-300">İleri / Orta Düzey</span>
        </div>
      </div>

      {/* Leaderboard Table / Cards */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
          <span>Oyuncu & Bölge</span>
          <div className="flex items-center gap-6">
            <span>Maçlar</span>
            <span className="text-right w-16">Elo Puanı</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {mockLeaderboard.map((item) => {
            const isMe = item.rank === 2;
            return (
              <div
                key={item.rank}
                className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                  isMe ? 'bg-amber-50/60 font-bold' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 text-center font-extrabold text-sm ${
                    item.rank === 1 ? 'text-amber-500' : item.rank === 2 ? 'text-slate-400' : item.rank === 3 ? 'text-amber-700' : 'text-slate-400'
                  }`}>
                    {item.rank}
                  </span>

                  <img
                    src={item.avatar}
                    alt={item.name}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                  />

                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{item.name}</span>
                      {isMe && <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded-md">Sen</span>}
                    </h3>
                    <span className="text-[11px] text-slate-500 font-normal">
                      {item.side} • %{item.winRate} Kazanma
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <span className="text-slate-600 hidden sm:inline">{item.matches} Maç</span>
                  <span className="font-extrabold text-slate-900 text-sm sm:text-base w-16 text-right">
                    {item.elo}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed border border-slate-200/80">
        <strong className="text-slate-900 block mb-1">Elo Sıralama Sistemi Nasıl Çalışır?</strong>
        RALO, resmi satranç ve rekabetçi spor matematiğine dayalı Elo algoritmasını kullanır. Maç kazandığınızda rakip takımın ortalama seviyesine göre puan kazanırsınız. Beklenmedik galibiyetler daha yüksek puan kazandırır.
      </div>

    </div>
  );
};
