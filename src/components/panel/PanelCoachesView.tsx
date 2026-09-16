import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { CoachContract } from '../../types/lessons.js';
import { GraduationCap, UserPlus } from 'lucide-react';

const STATUS_LABELS: Record<CoachContract['status'], string> = {
  ACTIVE: 'Aktif', PENDING: 'Beklemede', SUSPENDED: 'Askıda', ENDED: 'Sona erdi'
};

/** Club owner: coaches contracted with the club (they create lessons that book the club's courts). */
export const PanelCoachesView: React.FC = () => {
  const [coaches, setCoaches] = useState<CoachContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setError(null);
    try {
      setCoaches((await api.getPanelCoaches()).coaches);
    } catch (err: any) {
      setError(err.message || 'Antrenörler yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.addPanelCoach(name.trim(), email.trim());
      setCoaches(res.coaches);
      setName('');
      setEmail('');
      setNotice({
        tone: 'success',
        text: res.invited
          ? (res.inviteEmailSent ? 'Antrenör eklendi ve şifre belirleme bağlantısı e-postayla gönderildi.' : 'Antrenör eklendi ancak davet e-postası gönderilemedi. Daha sonra tekrar deneyin.')
          : 'Antrenör eklendi. Mevcut hesabıyla giriş yapıp Antrenör Paneli\'nden ders açabilir.'
      });
    } catch (err: any) {
      setNotice({ tone: 'error', text: err.message || 'Antrenör eklenemedi.' });
    } finally {
      setBusy(false);
    }
  };

  const endContract = async (coach: CoachContract) => {
    if (!window.confirm(`${coach.coachName} ile sözleşme sonlandırılsın mı? Antrenör bu kulüpte yeni ders açamayacak.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      setCoaches((await api.endPanelCoach(coach.id)).coaches);
      setNotice({ tone: 'success', text: `${coach.coachName} ile sözleşme sonlandırıldı.` });
    } catch (err: any) {
      setNotice({ tone: 'error', text: err.message || 'Sözleşme sonlandırılamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500';

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-amber-600" aria-hidden="true" /> Antrenörler
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Kulübünüzle çalışan antrenörler uygulamadan grup ve özel ders açar; her oturum kortunuzu takviminizde bloke eder.
          Ders platform ücreti RALO hesap özetinize eklenir.
        </p>
      </div>

      <form onSubmit={addCoach} className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end" noValidate>
        <div>
          <label htmlFor="coach-name" className="block text-xs font-bold text-slate-700 mb-1">Ad soyad</label>
          <input id="coach-name" className={inputClass} maxLength={60} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="coach-email" className="block text-xs font-bold text-slate-700 mb-1">E-posta</label>
          <input id="coach-email" type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <button type="submit" disabled={busy || !name.trim() || !email.trim()} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black cursor-pointer">
          <UserPlus className="w-4 h-4" aria-hidden="true" /> Antrenör Ekle
        </button>
      </form>

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`p-3 rounded-2xl text-xs font-semibold border ${
          notice.tone === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          {notice.text}
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !coaches ? (
        <LoadingState message="Antrenörler yükleniyor..." />
      ) : coaches.length === 0 ? (
        <p className="text-sm text-slate-600">Henüz antrenör eklenmedi.</p>
      ) : (
        <ul className="bg-white rounded-3xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
          {coaches.map(coach => (
            <li key={coach.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">{coach.coachName}</p>
                <p className="text-slate-600 break-all">{coach.coachEmail}</p>
                <p className="text-slate-500 mt-0.5">
                  {STATUS_LABELS[coach.status]} · {coach.startsOn}{coach.endsOn ? ` – ${coach.endsOn}` : ''} · {coach.activeLessons} aktif ders
                  {!coach.coachHasPassword && ' · Davet bekliyor'}
                </p>
              </div>
              {coach.status !== 'ENDED' && (
                <button type="button" disabled={busy} onClick={() => endContract(coach)}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-slate-800 font-bold cursor-pointer disabled:opacity-50">
                  Sözleşmeyi Sonlandır
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
