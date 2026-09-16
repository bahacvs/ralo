import type { LessonKind, LessonLevel } from '../../types/lessons.js';

export const LEVEL_LABELS: Record<LessonLevel, string> = {
  BEGINNER: 'Başlangıç',
  INTERMEDIATE: 'Orta seviye',
  ADVANCED: 'İleri seviye',
  ALL: 'Her seviye'
};

export const KIND_LABELS: Record<LessonKind, string> = {
  GROUP: 'Grup dersi',
  PRIVATE: 'Özel ders'
};

/** Istanbul local "YYYY-MM-DDTHH:MM:SS" as "Çar 30 Eyl · 09:00". */
export function formatSessionTime(localStart: string): string {
  const [year, month, day] = localStart.slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${localStart.slice(11, 16)}`;
}
