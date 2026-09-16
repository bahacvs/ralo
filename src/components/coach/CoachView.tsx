import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState, EmptyState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import type { CoachLesson, CoachOverview, LessonSession, LessonStudent } from '../../types/lessons.js';
import { KIND_LABELS, LEVEL_LABELS, formatSessionTime } from '../player/lessonLabels.js';
import { GraduationCap, Plus, Users, ClipboardCheck, StickyNote, XCircle } from 'lucide-react';

const inputClass = 'w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500';
const labelClass = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1';
const primaryButton = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black cursor-pointer';
const secondaryButton = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-50';

const ATTENDANCE_LABELS: Record<string, string> = { PRESENT: 'Geldi', LATE: 'Geç kaldı', ABSENT: 'Gelmedi', EXCUSED: 'Mazeretli' };

/** Session starts within 30 minutes or already started (Istanbul local time is UTC+3). */
const hasStarted = (session: LessonSession) => new Date(`${session.startAt}+03:00`).getTime() - Date.now() <= 30 * 60 * 1000;

const EMPTY_FORM = {
  clubId: '', courtId: '', kind: 'GROUP', title: '', description: '', level: 'ALL', capacity: '4',
  pricePerStudent: '', minElo: '', maxElo: '', date: '', time: '09:00', durationMinutes: '60', sessionCount: '4'
};

export const CoachView: React.FC = () => {
  const [data, setData] = useState<CoachOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [attendanceFor, setAttendanceFor] = useState<{ lesson: CoachLesson; session: LessonSession } | null>(null);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [noteFor, setNoteFor] = useState<{ lesson: CoachLesson; student: LessonStudent } | null>(null);
  const [note, setNote] = useState({ text: '', level: '', visible: true });
  const [modalError, setModalError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setData(await api.getCoachOverview());
    } catch (err: any) {
      setError(err.message || 'Antrenör paneli yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (action: () => Promise<{ message: string }>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await action();
      setNotice({ tone: 'success', text: res.message });
      await load();
    } catch (err: any) {
      setNotice({ tone: 'error', text: err.message || 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState message="Antrenör paneli yükleniyor..." />;

  const selectedContract = data.contracts.find(c => c.clubId === form.clubId);
  const update = (field: keyof typeof EMPTY_FORM, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const openCreate = () => {
    const first = data.contracts[0];
    setForm({ ...EMPTY_FORM, clubId: first?.clubId ?? '', courtId: first?.courts[0]?.id ?? '' });
    setFormError(null);
    setShowCreate(true);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.date) {
      setFormError('İlk oturum tarihini seçin.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createLesson({
        clubId: form.clubId,
        courtId: form.courtId,
        kind: form.kind,
        title: form.title,
        description: form.description,
        level: form.level,
        capacity: Number(form.capacity),
        pricePerStudent: form.pricePerStudent === '' ? null : Number(form.pricePerStudent),
        minElo: form.minElo === '' ? null : Number(form.minElo),
        maxElo: form.maxElo === '' ? null : Number(form.maxElo),
        firstSessionAt: `${form.date}T${form.time}`,
        durationMinutes: Number(form.durationMinutes),
        sessionCount: Number(form.sessionCount)
      });
      setShowCreate(false);
      setNotice({ tone: 'success', text: res.message });
      await load();
    } catch (err: any) {
      setFormError(err.message || 'Ders oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const openAttendance = (lesson: CoachLesson, session: LessonSession) => {
    const saved = lesson.attendance[session.id] ?? {};
    setAttendance(Object.fromEntries(lesson.students.filter(s => s.status === 'ENROLLED').map(s => [s.enrollmentId, saved[s.enrollmentId] ?? 'PRESENT'])));
    setModalError(null);
    setAttendanceFor({ lesson, session });
  };

  const submitAttendance = async () => {
    if (!attendanceFor) return;
    setBusy(true);
    setModalError(null);
    try {
      const res = await api.saveAttendance(attendanceFor.session.id, Object.entries(attendance).map(([enrollmentId, status]) => ({ enrollmentId, status: String(status) })));
      setAttendanceFor(null);
      setNotice({ tone: 'success', text: res.message });
      await load();
    } catch (err: any) {
      setModalError(err.message || 'Yoklama kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteFor) return;
    setBusy(true);
    setModalError(null);
    try {
      const res = await api.addStudentNote({
        lessonId: noteFor.lesson.id,
        studentUserId: noteFor.student.userId,
        note: note.text,
        assessedLevel: note.level || undefined,
        visibleToStudent: note.visible
      });
      setNoteFor(null);
      setNotice({ tone: 'success', text: res.message });
      await load();
    } catch (err: any) {
      setModalError(err.message || 'Not kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const studentNotes = (lesson: CoachLesson, userId: string) => lesson.notes.filter(n => n.studentUserId === userId);

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0" aria-hidden="true">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight font-serif">Antrenör Paneli</h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {data.contracts.length > 0 ? `Çalıştığınız kulüpler: ${data.contracts.map(c => c.clubName).join(', ')}` : 'Aktif kulüp sözleşmeniz yok.'}
            </p>
          </div>
        </div>
        {data.contracts.length > 0 && (
          <button type="button" className={primaryButton} onClick={openCreate}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Yeni Ders Aç
          </button>
        )}
      </div>

      {data.contracts.some(c => !c.lessonFeeConfigured) && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-semibold">
          {data.contracts.filter(c => !c.lessonFeeConfigured).map(c => c.clubName).join(', ')} için ders platform ücreti henüz tanımlanmadı; bu kulüplerde ders açılamaz.
        </div>
      )}

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`p-3 rounded-2xl text-xs font-semibold border ${
          notice.tone === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          {notice.text}
        </div>
      )}

      {data.lessons.length === 0 ? (
        <EmptyState title="Henüz ders açmadınız" description="Yeni Ders Aç ile kulübünüzün bir kortunda tek seferlik veya haftalık tekrarlı ders oluşturun." />
      ) : (
        <ul className="space-y-4">
          {data.lessons.map(lesson => {
            const enrolled = lesson.students.filter(s => s.status === 'ENROLLED');
            const waitlisted = lesson.students.filter(s => s.status === 'WAITLISTED');
            return (
              <li key={lesson.id} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">{KIND_LABELS[lesson.kind]}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{LEVEL_LABELS[lesson.level]}</span>
                      {lesson.status !== 'PUBLISHED' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">{lesson.status === 'CANCELLED' ? 'İptal edildi' : 'Tamamlandı'}</span>
                      )}
                    </div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">{lesson.title}</h2>
                    <p className="text-xs text-slate-500">{lesson.clubName} · {lesson.enrolledCount}/{lesson.capacity} öğrenci{waitlisted.length > 0 ? ` · ${waitlisted.length} bekleme listesinde` : ''}</p>
                  </div>
                  {lesson.status === 'PUBLISHED' && (
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Dersin kalan tüm oturumları iptal edilecek ve öğrencilere bildirim gidecek. Emin misiniz?')) run(() => api.cancelLesson(lesson.id));
                      }}
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Dersi İptal Et
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section aria-label="Oturumlar" className="space-y-2">
                    <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Oturumlar</h3>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                      {lesson.sessions.map(session => {
                        const cancelled = session.status === 'CANCELLED';
                        return (
                          <li key={session.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className={cancelled ? 'line-through text-slate-400' : 'font-semibold text-slate-800 dark:text-slate-200'}>
                              {session.sessionNo}. {formatSessionTime(session.startAt)} · {session.courtName}
                              {session.attendanceTaken && <span className="ml-1 text-emerald-700">✓ yoklama</span>}
                            </span>
                            {!cancelled && (hasStarted(session) ? (
                              enrolled.length > 0 && (
                                <button type="button" className={secondaryButton} onClick={() => openAttendance(lesson, session)}>
                                  <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> Yoklama
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                className={secondaryButton}
                                disabled={busy}
                                onClick={() => {
                                  if (window.confirm('Bu oturum iptal edilecek, kort serbest kalacak ve öğrencilere bildirim gidecek.')) run(() => api.cancelLessonSession(session.id));
                                }}
                              >
                                İptal
                              </button>
                            ))}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section aria-label="Öğrenciler" className="space-y-2">
                    <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" /> Öğrenciler
                    </h3>
                    {lesson.students.length === 0 ? (
                      <p className="text-xs text-slate-500">Henüz kayıt yok.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                        {lesson.students.map(student => (
                          <li key={student.enrollmentId} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-800 dark:text-slate-200">
                              <strong>{student.name}</strong> · {student.elo} Elo
                              {student.status === 'WAITLISTED' && <span className="ml-1 text-amber-700">(bekleme {student.waitlistPosition})</span>}
                              {studentNotes(lesson, student.userId).length > 0 && (
                                <span className="ml-1 text-slate-500">· {studentNotes(lesson, student.userId).length} not</span>
                              )}
                            </span>
                            <button
                              type="button"
                              className={secondaryButton}
                              onClick={() => {
                                setNote({ text: '', level: '', visible: true });
                                setModalError(null);
                                setNoteFor({ lesson, student });
                              }}
                            >
                              <StickyNote className="w-3.5 h-3.5" aria-hidden="true" /> Not
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Yeni Ders Aç" description="Her oturum için seçtiğiniz kort ayrılır. Haftalık tekrarda oturumlar aynı gün ve saatte oluşturulur." maxWidth="lg">
        <form onSubmit={submitCreate} className="space-y-4" noValidate>
          {formError && <div role="alert" className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="lesson-club" className={labelClass}>Kulüp</label>
              <select id="lesson-club" className={inputClass} value={form.clubId}
                onChange={e => {
                  const contract = data.contracts.find(c => c.clubId === e.target.value);
                  setForm(prev => ({ ...prev, clubId: e.target.value, courtId: contract?.courts[0]?.id ?? '' }));
                }}>
                {data.contracts.map(c => <option key={c.clubId} value={c.clubId}>{c.clubName}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lesson-court" className={labelClass}>Kort</label>
              <select id="lesson-court" className={inputClass} value={form.courtId} onChange={e => update('courtId', e.target.value)}>
                {(selectedContract?.courts ?? []).map(court => <option key={court.id} value={court.id}>{court.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="lesson-title" className={labelClass}>Ders başlığı</label>
            <input id="lesson-title" className={inputClass} maxLength={120} value={form.title} onChange={e => update('title', e.target.value)} placeholder="Örn. Başlangıç grubu – temel vuruşlar" />
          </div>
          <div>
            <label htmlFor="lesson-description" className={labelClass}>Açıklama (isteğe bağlı)</label>
            <textarea id="lesson-description" rows={3} className={`${inputClass} py-2`} maxLength={2000} value={form.description} onChange={e => update('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="lesson-kind" className={labelClass}>Tür</label>
              <select id="lesson-kind" className={inputClass} value={form.kind}
                onChange={e => setForm(prev => ({ ...prev, kind: e.target.value, capacity: e.target.value === 'PRIVATE' ? '1' : '4' }))}>
                <option value="GROUP">Grup (2-16)</option>
                <option value="PRIVATE">Özel (1-4)</option>
              </select>
            </div>
            <div>
              <label htmlFor="lesson-level" className={labelClass}>Seviye</label>
              <select id="lesson-level" className={inputClass} value={form.level} onChange={e => update('level', e.target.value)}>
                {Object.entries(LEVEL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lesson-capacity" className={labelClass}>Kontenjan</label>
              <input id="lesson-capacity" type="number" min={1} max={16} className={inputClass} value={form.capacity} onChange={e => update('capacity', e.target.value)} />
            </div>
            <div>
              <label htmlFor="lesson-price" className={labelClass}>Öğrenci başı (TL)</label>
              <input id="lesson-price" type="number" min={0} className={inputClass} value={form.pricePerStudent} onChange={e => update('pricePerStudent', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="lesson-date" className={labelClass}>İlk oturum tarihi</label>
              <input id="lesson-date" type="date" className={inputClass} value={form.date} onChange={e => update('date', e.target.value)} />
            </div>
            <div>
              <label htmlFor="lesson-time" className={labelClass}>Saat</label>
              <input id="lesson-time" type="time" step={900} className={inputClass} value={form.time} onChange={e => update('time', e.target.value)} />
            </div>
            <div>
              <label htmlFor="lesson-duration" className={labelClass}>Süre (dk)</label>
              <select id="lesson-duration" className={inputClass} value={form.durationMinutes} onChange={e => update('durationMinutes', e.target.value)}>
                {[45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lesson-count" className={labelClass}>Haftalık oturum</label>
              <input id="lesson-count" type="number" min={1} max={24} className={inputClass} value={form.sessionCount} onChange={e => update('sessionCount', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lesson-min-elo" className={labelClass}>Minimum Elo (isteğe bağlı)</label>
              <input id="lesson-min-elo" type="number" min={0} max={4000} className={inputClass} value={form.minElo} onChange={e => update('minElo', e.target.value)} />
            </div>
            <div>
              <label htmlFor="lesson-max-elo" className={labelClass}>Maksimum Elo (isteğe bağlı)</label>
              <input id="lesson-max-elo" type="number" min={0} max={4000} className={inputClass} value={form.maxElo} onChange={e => update('maxElo', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" className={secondaryButton} onClick={() => setShowCreate(false)}>Vazgeç</button>
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? 'Oluşturuluyor...' : 'Dersi Oluştur'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!attendanceFor} onClose={() => setAttendanceFor(null)} title="Yoklama"
        description={attendanceFor ? `${attendanceFor.lesson.title} · ${formatSessionTime(attendanceFor.session.startAt)}` : ''} maxWidth="md">
        {attendanceFor && (
          <div className="space-y-3">
            {modalError && <div role="alert" className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">{modalError}</div>}
            <ul className="space-y-2">
              {attendanceFor.lesson.students.filter(s => s.status === 'ENROLLED').map(student => (
                <li key={student.enrollmentId} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <label htmlFor={`att-${student.enrollmentId}`} className="text-xs font-bold text-slate-900 dark:text-white">{student.name}</label>
                  <select id={`att-${student.enrollmentId}`} className="min-h-[40px] px-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                    value={attendance[student.enrollmentId] ?? 'PRESENT'}
                    onChange={e => setAttendance(prev => ({ ...prev, [student.enrollmentId]: e.target.value }))}>
                    {Object.entries(ATTENDANCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButton} onClick={() => setAttendanceFor(null)}>Vazgeç</button>
              <button type="button" className={primaryButton} disabled={busy} onClick={submitAttendance}>Yoklamayı Kaydet</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!noteFor} onClose={() => setNoteFor(null)} title="Öğrenci Notu" description={noteFor ? `${noteFor.student.name} · ${noteFor.lesson.title}` : ''} maxWidth="md">
        {noteFor && (
          <form onSubmit={submitNote} className="space-y-3" noValidate>
            {modalError && <div role="alert" className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">{modalError}</div>}
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-2">
              Notlara sakatlık, hastalık gibi sağlık bilgisi yazmayın (KVKK: özel nitelikli kişisel veri).
            </p>
            {studentNotes(noteFor.lesson, noteFor.student.userId).length > 0 && (
              <ul className="max-h-40 overflow-y-auto space-y-1.5">
                {studentNotes(noteFor.lesson, noteFor.student.userId).map(n => (
                  <li key={n.id} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                    <p className="whitespace-pre-line">{n.note}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{new Date(n.createdAt).toLocaleDateString('tr-TR')}{n.visibleToStudent ? '' : ' · yalnızca siz görürsünüz'}</p>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <label htmlFor="note-text" className={labelClass}>Yeni not</label>
              <textarea id="note-text" rows={4} maxLength={4000} className={`${inputClass} py-2`} value={note.text} onChange={e => setNote(prev => ({ ...prev, text: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label htmlFor="note-level" className={labelClass}>Seviye değerlendirmesi</label>
                <select id="note-level" className={inputClass} value={note.level} onChange={e => setNote(prev => ({ ...prev, level: e.target.value }))}>
                  <option value="">Belirtme</option>
                  <option value="BEGINNER">Başlangıç</option>
                  <option value="INTERMEDIATE">Orta seviye</option>
                  <option value="ADVANCED">İleri seviye</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 min-h-[44px] cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={note.visible} onChange={e => setNote(prev => ({ ...prev, visible: e.target.checked }))} />
                Öğrenci görebilsin
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButton} onClick={() => setNoteFor(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton} disabled={busy || !note.text.trim()}>Notu Kaydet</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
