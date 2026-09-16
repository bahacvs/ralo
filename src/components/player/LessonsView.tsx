import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState, EmptyState } from '../common/StateViews.js';
import type { LessonDetail, LessonSummary, CoachNote } from '../../types/lessons.js';
import { KIND_LABELS, LEVEL_LABELS, formatSessionTime } from './lessonLabels.js';
import { GraduationCap, MapPin, Users, Clock, ChevronRight } from 'lucide-react';

export const LessonsView: React.FC = () => {
  const { user, navigate } = useAuth();
  const [tab, setTab] = useState<'ALL' | 'MINE'>('ALL');
  const [city, setCity] = useState('ALL');
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [mine, setMine] = useState<{ lessons: LessonDetail[]; notes: CoachNote[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      if (tab === 'ALL') setLessons((await api.getLessons()).lessons);
      else setMine(await api.getMyLessons());
    } catch (err: any) {
      setError(err.message || 'Dersler yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, [tab, user?.id]);

  const cities = useMemo(() => [...new Set<string>((lessons ?? []).map(l => l.city))].sort((a, b) => a.localeCompare(b, 'tr')), [lessons]);
  const visible = (lessons ?? []).filter(l => city === 'ALL' || l.city === city);

  const card = (lesson: LessonSummary) => (
    <li key={lesson.id}>
      <button
        type="button"
        onClick={() => navigate(`/ders/${lesson.id}`)}
        className="w-full text-left bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 hover:border-amber-500 shadow-xs transition-colors cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">{KIND_LABELS[lesson.kind]}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{LEVEL_LABELS[lesson.level]}</span>
              {lesson.myEnrollment && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  {lesson.myEnrollment.status === 'ENROLLED' ? 'Kayıtlısınız' : `Bekleme listesi ${lesson.myEnrollment.waitlistRank ?? ''}. sıra`}
                </span>
              )}
              {lesson.status === 'CANCELLED' && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">İptal edildi</span>
              )}
            </div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">{lesson.title}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Antrenör: {lesson.coachName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {lesson.clubName} · {lesson.district}, {lesson.city}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            {lesson.nextSessionAt ? `Sıradaki: ${formatSessionTime(lesson.nextSessionAt)}` : 'Yaklaşan oturum yok'} · {lesson.sessionCount} oturum
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" aria-hidden="true" /> {lesson.enrolledCount}/{lesson.capacity}
            {lesson.pricePerStudent !== null && <strong className="ml-2 text-slate-900 dark:text-white">{lesson.pricePerStudent.toLocaleString('tr-TR')} ₺ / öğrenci</strong>}
          </span>
        </div>
      </button>
    </li>
  );

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0" aria-hidden="true">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight font-serif">Padel Dersleri</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">Kulüplerle çalışan antrenörlerin grup ve özel dersleri. Ücret tesiste ödenir.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Ders listesi" className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
          {([['ALL', 'Tüm Dersler'], ['MINE', 'Derslerim']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              disabled={key === 'MINE' && !user}
              onClick={() => setTab(key)}
              className={`min-h-[40px] px-4 rounded-xl text-xs font-bold disabled:opacity-40 ${tab === key ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'ALL' && cities.length > 1 && (
          <select
            aria-label="Şehir"
            value={city}
            onChange={e => setCity(e.target.value)}
            className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
          >
            <option value="ALL">Tüm şehirler</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'ALL' ? (
        !lessons ? <LoadingState message="Dersler yükleniyor..." />
          : visible.length === 0 ? <EmptyState title="Şu an açık ders yok" description="Kulüplerdeki antrenörler ders açtığında burada listelenecek." />
          : <ul className="space-y-3">{visible.map(card)}</ul>
      ) : !mine ? (
        <LoadingState message="Dersleriniz yükleniyor..." />
      ) : (
        <div className="space-y-5">
          {mine.lessons.length === 0
            ? <EmptyState title="Kayıtlı olduğunuz ders yok" description="Tüm Dersler sekmesinden bir derse kayıt olabilirsiniz." />
            : <ul className="space-y-3">{mine.lessons.map(card)}</ul>}
          {mine.notes.length > 0 && (
            <section aria-labelledby="coach-notes-title" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 id="coach-notes-title" className="text-sm font-black text-slate-900 dark:text-white">Antrenör Notları</h2>
              <ul className="space-y-2">
                {mine.notes.map(note => (
                  <li key={note.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line">{note.note}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {note.coachName}{note.lessonTitle ? ` · ${note.lessonTitle}` : ''}{note.assessedLevel ? ` · Seviye: ${LEVEL_LABELS[note.assessedLevel]}` : ''} · {new Date(note.createdAt).toLocaleDateString('tr-TR')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
