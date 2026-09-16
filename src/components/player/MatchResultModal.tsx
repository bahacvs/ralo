import React, { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { api } from '../../services/api.js';

interface Props {
  match: any;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type Side = 'a' | 'b';

/** Team assignment and set scores for a finished 4-player match. */
export const MatchResultModal: React.FC<Props> = ({ match, onClose, onSaved }) => {
  const players = (match.participants ?? []).filter((p: any) => p.status === 'ACTIVE');
  const previous = match.result;

  const [sides, setSides] = useState<Record<string, Side>>(() => {
    const initial: Record<string, Side> = {};
    players.forEach((p: any, index: number) => {
      if (previous) initial[p.userId] = previous.teamA.some((t: any) => t.userId === p.userId) ? 'a' : 'b';
      else initial[p.userId] = index < 2 ? 'a' : 'b';
    });
    return initial;
  });
  const [sets, setSets] = useState<string[][]>(() =>
    [0, 1, 2].map(i => previous?.sets?.[i] ? previous.sets[i].map(String) : ['', ''])
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const teamA = players.filter((p: any) => sides[p.userId] === 'a');
  const teamB = players.filter((p: any) => sides[p.userId] === 'b');
  const filledSets = sets.filter(([a, b]) => a !== '' || b !== '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (teamA.length !== 2 || teamB.length !== 2) {
      setError('Her takımda 2 oyuncu olmalıdır.');
      return;
    }
    if (filledSets.length === 0) {
      setError('En az bir set skoru girin.');
      return;
    }
    if (filledSets.some(([a, b]) => a === '' || b === '' || a === b)) {
      setError('Her sette iki takımın skorunu girin; setin bir kazananı olmalıdır.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.submitMatchResult(match.id, {
        teamA: teamA.map((p: any) => p.userId),
        teamB: teamB.map((p: any) => p.userId),
        sets: filledSets.map(([a, b]) => [Number(a), Number(b)] as [number, number])
      });
      onSaved(res.message);
    } catch (err: any) {
      setError(err.message || 'Sonuç kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-16 min-h-[44px] px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Maç Sonucunu Gir"
      description="Rakip takım 48 saat içinde onaylar veya itiraz eder; yanıt gelmezse sonuç kesinleşir ve Elo puanları güncellenir."
      maxWidth="md"
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs font-semibold text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-xs font-black text-slate-800 dark:text-slate-200 mb-1">Takımlar</legend>
          {players.map((p: any) => (
            <div key={p.userId} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
              <span className="text-xs font-bold text-slate-900 dark:text-white">{p.userMaskedName} <span className="text-slate-500 font-semibold">({p.userElo} Elo)</span></span>
              <div role="radiogroup" aria-label={`${p.userMaskedName} takımı`} className="flex rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600">
                {(['a', 'b'] as Side[]).map(side => (
                  <button
                    key={side}
                    type="button"
                    role="radio"
                    aria-checked={sides[p.userId] === side}
                    onClick={() => setSides(prev => ({ ...prev, [p.userId]: side }))}
                    className={`min-h-[40px] px-3 text-xs font-black cursor-pointer ${
                      sides[p.userId] === side ? 'bg-amber-500 text-slate-950' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Takım {side.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Takım A: {teamA.map((p: any) => p.userMaskedName).join(' & ') || '—'} · Takım B: {teamB.map((p: any) => p.userMaskedName).join(' & ') || '—'}
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-black text-slate-800 dark:text-slate-200 mb-1">Set skorları (üçüncü set isteğe bağlı)</legend>
          {sets.map((set, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="w-12 text-xs font-bold text-slate-600 dark:text-slate-400">{index + 1}. set</span>
              <label className="sr-only" htmlFor={`set-${index}-a`}>{index + 1}. set Takım A</label>
              <input id={`set-${index}-a`} type="number" min={0} max={99} inputMode="numeric" className={inputClass} placeholder="A" value={set[0]}
                onChange={e => setSets(prev => prev.map((s, i) => i === index ? [e.target.value, s[1]] : s))} />
              <span className="text-slate-400 font-black">-</span>
              <label className="sr-only" htmlFor={`set-${index}-b`}>{index + 1}. set Takım B</label>
              <input id={`set-${index}-b`} type="number" min={0} max={99} inputMode="numeric" className={inputClass} placeholder="B" value={set[1]}
                onChange={e => setSets(prev => prev.map((s, i) => i === index ? [s[0], e.target.value] : s))} />
            </div>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
            Vazgeç
          </button>
          <button type="submit" disabled={saving} className="min-h-[44px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black cursor-pointer">
            {saving ? 'Kaydediliyor...' : 'Sonucu Gönder'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
