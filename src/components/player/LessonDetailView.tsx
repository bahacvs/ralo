import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { LessonDetail } from '../../types/lessons.js';
import { KIND_LABELS, LEVEL_LABELS, formatSessionTime } from './lessonLabels.js';
import { ArrowLeft, MapPin, Users, CheckCircle2 } from 'lucide-react';

export const LessonDetailView: React.FC = () => {
  const { user, currentRoute, navigate, setReturnTo } = useAuth();
  const lessonId = currentRoute.split('/')[2] ?? '';
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      setLesson((await api.getLesson(lessonId)).lesson);
    } catch (err: any) {
      setError(err.message || 'Ders yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, [lessonId, user?.id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!lesson) return <LoadingState message="Ders yükleniyor..." />;

  const act = async (action: () => Promise<{ message: string }>) => {
    if (!user) {
      setReturnTo(currentRoute);
      navigate('/giris');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await action();
      setMessage({ tone: 'success', text: res.message });
      await load();
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message || 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const activeSessions = lesson.sessions.filter(s => s.status !== 'CANCELLED');
  const isFull = lesson.enrolledCount >= lesson.capacity;
  const isOwnLesson = user?.id === lesson.coachUserId;
  const open = lesson.status === 'PUBLISHED' && !!lesson.nextSessionAt;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <button
        type="button"
        onClick={() => navigate('/dersler')}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Derslere Dön
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">{KIND_LABELS[lesson.kind]}</span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{LEVEL_LABELS[lesson.level]}</span>
          {(lesson.minElo !== null || lesson.maxElo !== null) && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Elo {lesson.minElo ?? 0}–{lesson.maxElo ?? '∞'}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-serif">{lesson.title}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Antrenör: <strong>{lesson.coachName}</strong></p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {lesson.clubName} · {lesson.district}, {lesson.city}
          </p>
        </div>
        {lesson.description && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{lesson.description}</p>}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
            <p className="text-slate-500">Kontenjan</p>
            <p className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1"><Users className="w-4 h-4" aria-hidden="true" /> {lesson.enrolledCount}/{lesson.capacity}</p>
            {lesson.waitlistCount > 0 && <p className="text-slate-500">{lesson.waitlistCount} kişi bekleme listesinde</p>}
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
            <p className="text-slate-500">Öğrenci başı ücret</p>
            <p className="text-base font-black text-slate-900 dark:text-white">{lesson.pricePerStudent !== null ? `${lesson.pricePerStudent.toLocaleString('tr-TR')} ₺` : 'Kulüpten öğrenin'}</p>
            <p className="text-slate-500">Tesiste ödenir</p>
          </div>
        </div>

        {message && (
          <div role={message.tone === 'error' ? 'alert' : 'status'} className={`p-3 rounded-2xl text-xs font-semibold border ${
            message.tone === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}>
            {message.text}
          </div>
        )}

        {!isOwnLesson && (
          lesson.myEnrollment ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
              <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                {lesson.myEnrollment.status === 'ENROLLED' ? 'Bu derse kayıtlısınız.' : `Bekleme listesinde ${lesson.myEnrollment.waitlistRank}. sıradasınız.`}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Ders kaydınızı iptal etmek istediğinize emin misiniz?')) act(() => api.cancelLessonEnrollment(lesson.id));
                }}
                className="min-h-[44px] px-4 rounded-xl border border-red-300 text-red-700 dark:text-red-300 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Kaydı İptal Et
              </button>
            </div>
          ) : open ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.enrollLesson(lesson.id))}
              className="w-full min-h-[48px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-50"
            >
              {isFull ? 'Bekleme Listesine Yazıl' : 'Derse Kayıt Ol'}
            </button>
          ) : (
            <p className="text-xs font-semibold text-slate-500">Bu ders şu an kayda kapalı.</p>
          )
        )}
      </div>

      <section aria-labelledby="sessions-title" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
        <h2 id="sessions-title" className="text-sm font-black text-slate-900 dark:text-white">Oturumlar ({activeSessions.length})</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {lesson.sessions.map(session => (
            <li key={session.id} className="py-2 flex items-center justify-between gap-2 text-xs">
              <span className={session.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200 font-semibold'}>
                {session.sessionNo}. {formatSessionTime(session.startAt)}–{session.endAt.slice(11, 16)}
              </span>
              <span className="text-slate-500">{session.status === 'CANCELLED' ? 'İptal edildi' : session.courtName}</span>
            </li>
          ))}
        </ul>
      </section>

      {lesson.myNotes.length > 0 && (
        <section aria-labelledby="notes-title" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
          <h2 id="notes-title" className="text-sm font-black text-slate-900 dark:text-white">Antrenörünüzün Notları</h2>
          <ul className="space-y-2">
            {lesson.myNotes.map(note => (
              <li key={note.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line">{note.note}</p>
                <p className="mt-1 text-[11px] text-slate-500">{new Date(note.createdAt).toLocaleDateString('tr-TR')}{note.assessedLevel ? ` · Seviye: ${LEVEL_LABELS[note.assessedLevel]}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
