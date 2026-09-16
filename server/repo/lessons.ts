import { getDb, type Queryable } from '../db/instance.js';
import { sqlState } from '../db/client.js';
import { addMinutesToLocal, nowLocal } from '../time.js';
import { fromLocal, localTs, kurusToTl, tlToKurus } from './mappers.js';
import { addNotification } from './notifications.js';
import { isUuid, HttpError } from './util.js';
import type { User } from '../../src/types/index.js';
import type {
  CoachContract, CoachLesson, CoachNote, CoachOverview, LessonDetail, LessonKind, LessonLevel, LessonSession, LessonSummary,
  MyLessonsResponse
} from '../../src/types/lessons.js';

const KINDS: Record<string, LessonKind> = { group: 'GROUP', private: 'PRIVATE' };
const LEVELS: Record<string, LessonLevel> = { beginner: 'BEGINNER', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED', all: 'ALL' };
const ATTENDANCE = ['present', 'late', 'absent', 'excused'];
const MAX_SESSIONS = 24;

const upper = (value: string) => value.toUpperCase();

// -------------------------------------------------------------
// Reading lessons
// -------------------------------------------------------------

/** Columns for toSummary(); alias lessons as l; $1 = viewer user id (may be NULL). */
const LESSON_SELECT = `
  l.id, l.club_id, c.name AS club_name, ci.name AS city_name, d.name AS district_name,
  l.coach_user_id, cu.display_name AS coach_name, l.kind, l.title, l.description, l.level, l.capacity, l.enrolled_count,
  (SELECT count(*)::int FROM app.lesson_enrollments w WHERE w.lesson_id = l.id AND w.status = 'waitlisted') AS waitlist_count,
  l.price_per_student_kurus, l.min_elo, l.max_elo, l.status,
  (SELECT ${localTs('min(r.starts_at)')} FROM app.lesson_sessions s JOIN app.reservations r ON r.id = s.reservation_id
   WHERE s.lesson_id = l.id AND r.status <> 'cancelled' AND r.starts_at > now()) AS next_session_at,
  (SELECT count(*)::int FROM app.lesson_sessions s JOIN app.reservations r ON r.id = s.reservation_id
   WHERE s.lesson_id = l.id AND r.status <> 'cancelled') AS session_count,
  me.id AS my_enrollment_id, me.status AS my_status,
  (SELECT count(*)::int FROM app.lesson_enrollments w
   WHERE w.lesson_id = l.id AND w.status = 'waitlisted' AND w.waitlist_position <= me.waitlist_position) AS my_rank
  FROM app.lessons l
  JOIN app.clubs c ON c.id = l.club_id
  JOIN app.cities ci ON ci.id = c.city_id
  JOIN app.districts d ON d.id = c.district_id
  JOIN app.users cu ON cu.id = l.coach_user_id
  LEFT JOIN app.lesson_enrollments me ON me.lesson_id = l.id AND me.user_id = $1::uuid AND me.status IN ('enrolled','waitlisted')`;

function toSummary(row: any): LessonSummary {
  return {
    id: row.id,
    clubId: row.club_id,
    clubName: row.club_name,
    city: row.city_name,
    district: row.district_name,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name,
    kind: KINDS[row.kind],
    title: row.title,
    description: row.description ?? '',
    level: LEVELS[row.level],
    capacity: row.capacity,
    enrolledCount: row.enrolled_count,
    waitlistCount: row.waitlist_count,
    pricePerStudent: row.price_per_student_kurus === null ? null : kurusToTl(row.price_per_student_kurus),
    minElo: row.min_elo ?? null,
    maxElo: row.max_elo ?? null,
    status: upper(row.status) as LessonSummary['status'],
    nextSessionAt: row.next_session_at ?? null,
    sessionCount: row.session_count,
    myEnrollment: row.my_status
      ? { status: upper(row.my_status) as 'ENROLLED' | 'WAITLISTED', waitlistRank: row.my_status === 'waitlisted' ? row.my_rank : null }
      : null
  };
}

async function getSessions(lessonIds: string[], q: Queryable = getDb()): Promise<Map<string, LessonSession[]>> {
  const map = new Map<string, LessonSession[]>();
  if (lessonIds.length === 0) return map;
  const { rows } = await q.query(
    `SELECT s.id, s.lesson_id, s.session_no, s.attendance_taken_at, r.court_id, co.name AS court_name,
            ${localTs('r.starts_at')} AS start_at, ${localTs('r.ends_at')} AS end_at, r.status
     FROM app.lesson_sessions s
     JOIN app.reservations r ON r.id = s.reservation_id
     JOIN app.courts co ON co.id = r.court_id
     WHERE s.lesson_id = ANY(string_to_array($1, ',')::uuid[])
     ORDER BY r.starts_at`,
    [lessonIds.join(',')]
  );
  for (const row of rows) {
    const list = map.get(row.lesson_id) ?? [];
    list.push({
      id: row.id,
      sessionNo: row.session_no,
      courtId: row.court_id,
      courtName: row.court_name,
      startAt: row.start_at,
      endAt: row.end_at,
      status: upper(row.status) as LessonSession['status'],
      attendanceTaken: !!row.attendance_taken_at
    });
    map.set(row.lesson_id, list);
  }
  return map;
}

/** Published lessons at active clubs that still have an upcoming session. */
export async function listLessons(viewerId: string | null, filters: { city?: string; clubId?: string } = {}): Promise<LessonSummary[]> {
  const params: unknown[] = [viewerId];
  let where = `l.status = 'published' AND c.is_active`;
  if (filters.city) {
    params.push(filters.city);
    where += ` AND lower(ci.name) = lower($${params.length})`;
  }
  if (filters.clubId && isUuid(filters.clubId)) {
    params.push(filters.clubId);
    where += ` AND l.club_id = $${params.length}`;
  }
  const { rows } = await getDb().query(`SELECT ${LESSON_SELECT} WHERE ${where} ORDER BY l.created_at DESC LIMIT 200`, params);
  return rows.map(toSummary).filter(l => l.nextSessionAt !== null)
    .sort((a, b) => (a.nextSessionAt ?? '').localeCompare(b.nextSessionAt ?? ''));
}

export async function getLesson(lessonId: string, viewerId: string | null): Promise<LessonDetail | null> {
  if (!isUuid(lessonId)) return null;
  const { rows } = await getDb().query(`SELECT ${LESSON_SELECT} WHERE l.id = $2`, [viewerId, lessonId]);
  if (!rows[0]) return null;
  const sessions = (await getSessions([lessonId])).get(lessonId) ?? [];
  const myNotes = viewerId ? await getStudentNotes(viewerId, lessonId) : [];
  return { ...toSummary(rows[0]), sessions, myNotes };
}

const NOTE_SELECT = `
  n.id, n.note, n.assessed_level, n.visible_to_student, n.created_at, n.lesson_id, l.title AS lesson_title,
  cu.display_name AS coach_name, n.student_user_id, su.masked_name AS student_name
  FROM app.coach_student_notes n
  JOIN app.users cu ON cu.id = n.coach_user_id
  JOIN app.users su ON su.id = n.student_user_id
  LEFT JOIN app.lessons l ON l.id = n.lesson_id`;

function toNote(row: any): CoachNote {
  return {
    id: row.id,
    note: row.note,
    assessedLevel: row.assessed_level ? (LEVELS[row.assessed_level] as CoachNote['assessedLevel']) : null,
    visibleToStudent: row.visible_to_student,
    createdAt: new Date(row.created_at).toISOString(),
    lessonId: row.lesson_id ?? null,
    lessonTitle: row.lesson_title ?? null,
    coachName: row.coach_name,
    studentUserId: row.student_user_id,
    studentName: row.student_name
  };
}

async function getStudentNotes(studentId: string, lessonId?: string): Promise<CoachNote[]> {
  const params: unknown[] = [studentId];
  let filter = '';
  if (lessonId) {
    params.push(lessonId);
    filter = ' AND n.lesson_id = $2';
  }
  const { rows } = await getDb().query(
    `SELECT ${NOTE_SELECT} WHERE n.student_user_id = $1 AND n.visible_to_student${filter} ORDER BY n.created_at DESC LIMIT 100`,
    params
  );
  return rows.map(toNote);
}

export async function getMyLessons(userId: string): Promise<MyLessonsResponse> {
  const { rows } = await getDb().query(
    `SELECT ${LESSON_SELECT} WHERE me.id IS NOT NULL ORDER BY l.created_at DESC LIMIT 100`,
    [userId]
  );
  const lessons = rows.map(toSummary);
  const sessions = await getSessions(lessons.map(l => l.id));
  return {
    lessons: lessons.map(l => ({ ...l, sessions: sessions.get(l.id) ?? [], myNotes: [] })),
    notes: await getStudentNotes(userId)
  };
}

// -------------------------------------------------------------
// Player enrollment
// -------------------------------------------------------------

export async function enroll(lessonId: string, user: User): Promise<'ENROLLED' | 'WAITLISTED'> {
  if (!isUuid(lessonId)) throw new HttpError(404, 'Ders bulunamadı.');
  return getDb().tx(async q => {
    const { rows } = await q.query(
      `SELECT l.status, l.capacity, l.enrolled_count, l.min_elo, l.max_elo, l.coach_user_id, l.title, c.is_active,
              EXISTS (SELECT 1 FROM app.lesson_sessions s JOIN app.reservations r ON r.id = s.reservation_id
                      WHERE s.lesson_id = l.id AND r.status <> 'cancelled' AND r.starts_at > now()) AS has_upcoming
       FROM app.lessons l JOIN app.clubs c ON c.id = l.club_id WHERE l.id = $1 FOR UPDATE OF l`,
      [lessonId]
    );
    const lesson = rows[0];
    if (!lesson || !lesson.is_active) throw new HttpError(404, 'Ders bulunamadı.');
    if (lesson.status !== 'published' || !lesson.has_upcoming) throw new HttpError(400, 'Bu ders kayda kapalı.');
    if (lesson.coach_user_id === user.id) throw new HttpError(400, 'Kendi dersinize öğrenci olarak kayıt olamazsınız.');
    if (lesson.min_elo && user.elo < lesson.min_elo) throw new HttpError(400, `Bu ders için minimum Elo ${lesson.min_elo}. Sizin puanınız: ${user.elo}.`);
    if (lesson.max_elo && user.elo > lesson.max_elo) throw new HttpError(400, `Bu ders için maksimum Elo ${lesson.max_elo}. Sizin puanınız: ${user.elo}.`);

    const existing = await q.query<{ status: string }>(
      `SELECT status FROM app.lesson_enrollments WHERE lesson_id = $1 AND user_id = $2 FOR UPDATE`, [lessonId, user.id]
    );
    if (existing.rows[0] && ['enrolled', 'waitlisted'].includes(existing.rows[0].status)) {
      throw new HttpError(400, 'Bu derse zaten kayıtlısınız.');
    }

    const hasSeat = lesson.enrolled_count < lesson.capacity;
    if (existing.rows[0]) {
      await q.query(
        hasSeat
          ? `UPDATE app.lesson_enrollments SET status = 'enrolled', enrolled_at = now(), waitlist_position = NULL, cancelled_at = NULL
             WHERE lesson_id = $1 AND user_id = $2`
          : `UPDATE app.lesson_enrollments SET status = 'waitlisted', enrolled_at = NULL, cancelled_at = NULL,
               waitlist_position = (SELECT COALESCE(max(waitlist_position), 0) + 1 FROM app.lesson_enrollments WHERE lesson_id = $1)
             WHERE lesson_id = $1 AND user_id = $2`,
        [lessonId, user.id]
      );
    } else if (hasSeat) {
      await q.query(
        `INSERT INTO app.lesson_enrollments (lesson_id, user_id, status, enrolled_at) VALUES ($1, $2, 'enrolled', now())`,
        [lessonId, user.id]
      );
    } else {
      await q.query(
        `INSERT INTO app.lesson_enrollments (lesson_id, user_id, status, waitlist_position)
         SELECT $1, $2, 'waitlisted', COALESCE(max(waitlist_position), 0) + 1 FROM app.lesson_enrollments WHERE lesson_id = $1`,
        [lessonId, user.id]
      );
    }
    if (hasSeat) {
      await q.query(`UPDATE app.lessons SET enrolled_count = enrolled_count + 1 WHERE id = $1`, [lessonId]);
      await addNotification(q, {
        userId: lesson.coach_user_id,
        type: 'lesson_enrolled',
        title: 'Derse Yeni Kayıt',
        body: `${user.displayName} "${lesson.title}" dersine kayıt oldu.`,
        actorUserId: user.id
      });
    }
    return hasSeat ? 'ENROLLED' : 'WAITLISTED';
  });
}

export async function cancelEnrollment(lessonId: string, user: User): Promise<void> {
  if (!isUuid(lessonId)) throw new HttpError(404, 'Ders bulunamadı.');
  await getDb().tx(async q => {
    const { rows } = await q.query<{ id: string; title: string }>(
      `SELECT e.id, l.title FROM app.lesson_enrollments e JOIN app.lessons l ON l.id = e.lesson_id
       WHERE e.lesson_id = $1 AND e.user_id = $2 AND e.status IN ('enrolled','waitlisted')`,
      [lessonId, user.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Bu derse kaydınız bulunmuyor.');
    const promoted = await q.query<{ user_id: string | null }>(`SELECT app.cancel_lesson_enrollment($1) AS user_id`, [rows[0].id]);
    const promotedUserId = promoted.rows[0]?.user_id;
    if (promotedUserId) {
      await addNotification(q, {
        userId: promotedUserId,
        type: 'lesson_waitlist_promoted',
        title: 'Derse Kaydınız Kesinleşti 🎉',
        body: `"${rows[0].title}" dersinde yer açıldı ve bekleme listesinden derse alındınız.`
      });
    }
  });
}

// -------------------------------------------------------------
// Club: coach contracts
// -------------------------------------------------------------

export async function listCoachContracts(clubId: string): Promise<CoachContract[]> {
  const { rows } = await getDb().query(
    `SELECT cc.id, cc.club_id, c.name AS club_name, cc.status, to_char(cc.starts_on, 'YYYY-MM-DD') AS starts_on,
            to_char(cc.ends_on, 'YYYY-MM-DD') AS ends_on, cc.coach_user_id, u.display_name, u.email,
            (u.password_hash IS NOT NULL) AS has_password,
            (SELECT count(*)::int FROM app.lessons l WHERE l.contract_id = cc.id AND l.status = 'published') AS active_lessons
     FROM app.coach_club_contracts cc
     JOIN app.clubs c ON c.id = cc.club_id
     JOIN app.users u ON u.id = cc.coach_user_id
     WHERE cc.club_id = $1
     ORDER BY (cc.status = 'active') DESC, u.display_name`,
    [clubId]
  );
  return rows.map(row => ({
    id: row.id,
    clubId: row.club_id,
    clubName: row.club_name,
    status: upper(row.status) as CoachContract['status'],
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? null,
    coachUserId: row.coach_user_id,
    coachName: row.display_name,
    coachEmail: row.email ?? null,
    coachHasPassword: row.has_password,
    activeLessons: row.active_lessons
  }));
}

/** Links a user (existing or newly invited) to the club as a coach with an active contract. */
export async function createCoachContract(q: Queryable, clubId: string, userId: string, createdBy: string): Promise<void> {
  const live = await q.query(
    `SELECT 1 FROM app.coach_club_contracts WHERE coach_user_id = $1 AND club_id = $2 AND status IN ('pending','active','suspended')`,
    [userId, clubId]
  );
  if (live.rows.length > 0) throw new HttpError(409, 'Bu antrenör kulübünüzde zaten kayıtlı.');
  await q.query(`INSERT INTO app.coach_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  await q.query(
    `INSERT INTO app.coach_club_contracts (coach_user_id, club_id, status, starts_on, created_by)
     VALUES ($1, $2, 'active', app.istanbul_date(now()), $3)`,
    [userId, clubId, createdBy]
  );
}

export async function endCoachContract(clubId: string, contractId: string): Promise<void> {
  if (!isUuid(contractId)) throw new HttpError(404, 'Antrenör sözleşmesi bulunamadı.');
  await getDb().tx(async q => {
    const { rows } = await q.query<{ upcoming: number }>(
      `SELECT (SELECT count(*)::int FROM app.lessons l JOIN app.lesson_sessions s ON s.lesson_id = l.id
               JOIN app.reservations r ON r.id = s.reservation_id
               WHERE l.contract_id = cc.id AND r.status <> 'cancelled' AND r.starts_at > now()) AS upcoming
       FROM app.coach_club_contracts cc WHERE cc.id = $1 AND cc.club_id = $2 AND cc.status <> 'ended' FOR UPDATE`,
      [contractId, clubId]
    );
    if (!rows[0]) throw new HttpError(404, 'Antrenör sözleşmesi bulunamadı.');
    if (rows[0].upcoming > 0) {
      throw new HttpError(409, `Antrenörün ${rows[0].upcoming} yaklaşan ders oturumu var. Önce bu oturumlar iptal edilmelidir.`);
    }
    await q.query(
      `UPDATE app.coach_club_contracts SET status = 'ended', ends_on = GREATEST(starts_on, app.istanbul_date(now())) WHERE id = $1`,
      [contractId]
    );
    await q.query(`UPDATE app.lessons SET status = 'completed' WHERE contract_id = $1 AND status = 'published'`, [contractId]);
  }, `club:${clubId}`);
}

// -------------------------------------------------------------
// Coach
// -------------------------------------------------------------

export async function isCoach(userId: string): Promise<boolean> {
  const { rows } = await getDb().query(
    `SELECT 1 FROM app.coach_club_contracts WHERE coach_user_id = $1 AND status = 'active' LIMIT 1`, [userId]
  );
  return rows.length > 0;
}

export async function getCoachOverview(coachId: string): Promise<CoachOverview> {
  const { rows: contractRows } = await getDb().query(
    `SELECT cc.id, cc.club_id, c.name AS club_name, to_char(cc.starts_on, 'YYYY-MM-DD') AS starts_on,
            COALESCE((SELECT json_agg(json_build_object('id', co.id, 'name', co.name) ORDER BY co.name)
                      FROM app.courts co WHERE co.club_id = cc.club_id AND co.is_active), '[]'::json) AS courts,
            EXISTS (SELECT 1 FROM app.platform_fee_rates r WHERE r.fee_type = 'lesson' AND r.club_id = cc.club_id
                    AND r.effective_from <= now()) AS lesson_fee_configured
     FROM app.coach_club_contracts cc JOIN app.clubs c ON c.id = cc.club_id
     WHERE cc.coach_user_id = $1 AND cc.status = 'active' AND c.is_active
     ORDER BY c.name`,
    [coachId]
  );
  const { rows: lessonRows } = await getDb().query(
    `SELECT ${LESSON_SELECT} WHERE l.coach_user_id = $2 AND l.status <> 'draft' ORDER BY l.created_at DESC LIMIT 100`,
    [null, coachId]
  );
  const lessons = lessonRows.map(toSummary);
  const ids = lessons.map(l => l.id).join(',');
  const sessions = await getSessions(lessons.map(l => l.id));
  const empty = { rows: [] as any[] };
  const students = lessons.length === 0 ? empty : await getDb().query(
    `SELECT e.id, e.lesson_id, e.user_id, e.status, e.waitlist_position, u.display_name, u.masked_name, u.elo
     FROM app.lesson_enrollments e JOIN app.users u ON u.id = e.user_id
     WHERE e.lesson_id = ANY(string_to_array($1, ',')::uuid[]) AND e.status IN ('enrolled','waitlisted')
     ORDER BY e.status, e.waitlist_position NULLS FIRST, e.enrolled_at`,
    [ids]
  );
  const attendance = lessons.length === 0 ? empty : await getDb().query(
    `SELECT a.session_id, a.enrollment_id, a.status, s.lesson_id FROM app.lesson_attendance a
     JOIN app.lesson_sessions s ON s.id = a.session_id WHERE s.lesson_id = ANY(string_to_array($1, ',')::uuid[])`,
    [ids]
  );
  const notes = lessons.length === 0 ? empty : await getDb().query(
    `SELECT ${NOTE_SELECT} WHERE n.coach_user_id = $1 AND n.lesson_id = ANY(string_to_array($2, ',')::uuid[])
     ORDER BY n.created_at DESC`,
    [coachId, ids]
  );

  return {
    contracts: contractRows.map(row => ({
      id: row.id,
      clubId: row.club_id,
      clubName: row.club_name,
      status: 'ACTIVE' as const,
      startsOn: row.starts_on,
      endsOn: null,
      coachUserId: coachId,
      coachName: '',
      coachEmail: null,
      coachHasPassword: true,
      activeLessons: lessons.filter(l => l.clubId === row.club_id && l.status === 'PUBLISHED').length,
      courts: row.courts ?? [],
      lessonFeeConfigured: row.lesson_fee_configured
    })),
    lessons: lessons.map((lesson): CoachLesson => ({
      ...lesson,
      sessions: sessions.get(lesson.id) ?? [],
      myNotes: [],
      students: students.rows.filter(s => s.lesson_id === lesson.id).map(s => ({
        enrollmentId: s.id,
        userId: s.user_id,
        name: s.display_name,
        maskedName: s.masked_name,
        elo: s.elo,
        status: upper(s.status) as 'ENROLLED' | 'WAITLISTED',
        waitlistPosition: s.waitlist_position ?? null
      })),
      attendance: attendance.rows.filter(a => a.lesson_id === lesson.id)
        .reduce<Record<string, Record<string, string>>>((acc, a) => {
          acc[a.session_id] = { ...(acc[a.session_id] ?? {}), [a.enrollment_id]: upper(a.status) };
          return acc;
        }, {}),
      notes: notes.rows.filter(n => n.lesson_id === lesson.id).map(toNote)
    }))
  };
}

export interface NewLessonInput {
  clubId?: unknown;
  courtId?: unknown;
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  level?: unknown;
  capacity?: unknown;
  pricePerStudent?: unknown;
  minElo?: unknown;
  maxElo?: unknown;
  firstSessionAt?: unknown;
  durationMinutes?: unknown;
  sessionCount?: unknown;
}

const optionalInt = (value: unknown, min: number, max: number, message: string): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, message);
  return n;
};

/** Creates the lesson with weekly sessions; each session books the court (overlaps are refused). */
export async function createLesson(coach: User, input: NewLessonInput): Promise<string> {
  const clubId = String(input.clubId ?? '');
  const courtId = String(input.courtId ?? '');
  if (!isUuid(clubId) || !isUuid(courtId)) throw new HttpError(400, 'Kulüp ve kort seçilmelidir.');
  const kind = input.kind === 'PRIVATE' ? 'private' : input.kind === 'GROUP' ? 'group' : null;
  if (!kind) throw new HttpError(400, 'Ders türü grup veya özel ders olmalıdır.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 2 || title.length > 120) throw new HttpError(400, 'Ders başlığı 2 ile 120 karakter arasında olmalıdır.');
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 2000) : '';
  const level = Object.keys(LEVELS).find(key => LEVELS[key] === input.level) ?? 'all';
  const capacity = Number(input.capacity);
  const [minCap, maxCap] = kind === 'private' ? [1, 4] : [2, 16];
  if (!Number.isInteger(capacity) || capacity < minCap || capacity > maxCap) {
    throw new HttpError(400, kind === 'private' ? 'Özel ders kontenjanı 1 ile 4 arasında olmalıdır.' : 'Grup dersi kontenjanı 2 ile 16 arasında olmalıdır.');
  }
  const price = input.pricePerStudent === undefined || input.pricePerStudent === null || input.pricePerStudent === ''
    ? null : Number(input.pricePerStudent);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) throw new HttpError(400, 'Öğrenci başı ücret geçersiz.');
  const minElo = optionalInt(input.minElo, 0, 4000, 'Minimum Elo 0 ile 4000 arasında olmalıdır.');
  const maxElo = optionalInt(input.maxElo, 0, 4000, 'Maksimum Elo 0 ile 4000 arasında olmalıdır.');
  if (minElo !== null && maxElo !== null && minElo > maxElo) throw new HttpError(400, 'Minimum Elo, maksimum Elo değerinden büyük olamaz.');
  const duration = Number(input.durationMinutes);
  if (!Number.isInteger(duration) || duration < 30 || duration > 240 || duration % 15 !== 0) {
    throw new HttpError(400, 'Ders süresi 30 ile 240 dakika arasında ve 15 dakikanın katı olmalıdır.');
  }
  const sessionCount = Number(input.sessionCount ?? 1);
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > MAX_SESSIONS) {
    throw new HttpError(400, `Oturum sayısı 1 ile ${MAX_SESSIONS} arasında olmalıdır.`);
  }
  const first = typeof input.firstSessionAt === 'string' ? input.firstSessionAt.slice(0, 16) : '';
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(first)) throw new HttpError(400, 'İlk oturum tarihi ve saati geçersiz.');
  const firstStart = `${first}:00`;
  if (firstStart <= nowLocal()) throw new HttpError(400, 'İlk oturum ileri bir tarihte olmalıdır.');

  return getDb().tx(async q => {
    const contract = await q.query<{ id: string }>(
      `SELECT cc.id FROM app.coach_club_contracts cc JOIN app.clubs c ON c.id = cc.club_id
       WHERE cc.coach_user_id = $1 AND cc.club_id = $2 AND cc.status = 'active' AND c.is_active`,
      [coach.id, clubId]
    );
    if (!contract.rows[0]) throw new HttpError(403, 'Bu kulüpte aktif antrenör sözleşmeniz bulunmuyor.');
    const court = await q.query(`SELECT 1 FROM app.courts WHERE id = $1 AND club_id = $2 AND is_active`, [courtId, clubId]);
    if (!court.rows[0]) throw new HttpError(400, 'Seçilen kort bu kulüpte bulunamadı veya kapalı.');

    let lessonId: string;
    try {
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO app.lessons (club_id, coach_user_id, contract_id, kind, title, description, level, capacity,
                                  price_per_student_kurus, min_elo, max_elo, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published') RETURNING id`,
        [clubId, coach.id, contract.rows[0].id, kind, title, description || null, level, capacity,
         price === null ? null : tlToKurus(price), minElo, maxElo]
      );
      lessonId = rows[0].id;
    } catch (err) {
      if (sqlState(err) === 'P0002') {
        throw new HttpError(409, 'Bu kulüp için ders platform ücreti henüz tanımlanmadı. RALO yönetimi ücreti tanımladıktan sonra ders açabilirsiniz.', 'LESSON_FEE_NOT_CONFIGURED');
      }
      throw err;
    }

    for (let n = 0; n < sessionCount; n++) {
      const startAt = addMinutesToLocal(firstStart, n * 7 * 24 * 60);
      const endAt = addMinutesToLocal(startAt, duration);
      let bookingId: string;
      try {
        const booking = await q.query<{ id: string }>(
          `INSERT INTO app.court_bookings (club_id, court_id, kind, starts_at, ends_at)
           VALUES ($1, $2, 'reservation', ${fromLocal('$3')}, ${fromLocal('$4')}) RETURNING id`,
          [clubId, courtId, startAt, endAt]
        );
        bookingId = booking.rows[0].id;
      } catch (err) {
        if (sqlState(err) === '23P01') {
          throw new HttpError(409, `${n + 1}. oturum (${startAt.slice(0, 10)} ${startAt.slice(11, 16)}) kortta başka bir rezervasyonla çakışıyor.`, 'SLOT_TAKEN');
        }
        throw err;
      }
      const reservation = await q.query<{ id: string }>(
        `INSERT INTO app.reservations (booking_id, club_id, court_id, starts_at, ends_at, source, owner_user_id, created_by,
                                       total_price_kurus, note)
         SELECT b.id, b.club_id, b.court_id, b.starts_at, b.ends_at, 'lesson', $2, $2, 0, $3
         FROM app.court_bookings b WHERE b.id = $1 RETURNING id`,
        [bookingId, coach.id, `Ders: ${title}`.slice(0, 300)]
      );
      const session = await q.query<{ id: string }>(
        `INSERT INTO app.lesson_sessions (lesson_id, reservation_id, session_no) VALUES ($1, $2, $3) RETURNING id`,
        [lessonId, reservation.rows[0].id, n + 1]
      );
      // per_session and per_lesson fees accrue with the booking; per enrolled student at session start (job)
      await q.query(`SELECT app.charge_lesson_session($1)`, [session.rows[0].id]);
    }
    return lessonId;
  }, `club:${clubId}`);
}

interface OwnedSession {
  session_id: string;
  lesson_id: string;
  reservation_id: string;
  title: string;
  status: string;
  started: boolean;
  start_at: string;
}

async function clubOfSession(sessionId: string): Promise<string> {
  const { rows } = await getDb().query<{ club_id: string }>(
    `SELECT l.club_id FROM app.lesson_sessions s JOIN app.lessons l ON l.id = s.lesson_id WHERE s.id = $1`,
    [isUuid(sessionId) ? sessionId : null]
  );
  if (!rows[0]) throw new HttpError(404, 'Ders oturumu bulunamadı.');
  return rows[0].club_id;
}

async function lockOwnedSession(q: Queryable, coachId: string, sessionId: string): Promise<OwnedSession> {
  const { rows } = await q.query<OwnedSession>(
    `SELECT s.id AS session_id, s.lesson_id, r.id AS reservation_id, l.title, r.status,
            (r.starts_at <= now() + interval '30 minutes') AS started, ${localTs('r.starts_at')} AS start_at
     FROM app.lesson_sessions s JOIN app.lessons l ON l.id = s.lesson_id JOIN app.reservations r ON r.id = s.reservation_id
     WHERE s.id = $1 AND l.coach_user_id = $2
     FOR UPDATE OF s`,
    [sessionId, coachId]
  );
  if (!rows[0]) throw new HttpError(404, 'Ders oturumu bulunamadı.');
  return rows[0];
}

async function notifyStudents(q: Queryable, lessonId: string, title: string, body: string) {
  const { rows } = await q.query<{ user_id: string }>(
    `SELECT user_id FROM app.lesson_enrollments WHERE lesson_id = $1 AND status IN ('enrolled','waitlisted')`, [lessonId]
  );
  for (const row of rows) {
    await addNotification(q, { userId: row.user_id, type: 'lesson_cancelled', title, body });
  }
}

export async function cancelSession(coach: User, sessionId: string): Promise<void> {
  const clubId = await clubOfSession(sessionId);
  await getDb().tx(async q => {
    const session = await lockOwnedSession(q, coach.id, sessionId);
    if (session.status === 'cancelled') throw new HttpError(400, 'Bu oturum zaten iptal edilmiş.');
    if (session.started) throw new HttpError(400, 'Başlamış veya 30 dakika içinde başlayacak oturum iptal edilemez.');
    await q.query(
      `UPDATE app.reservations SET status = 'cancelled', cancelled_at = now(), cancelled_by_party = 'coach', cancelled_by_user_id = $2
       WHERE id = $1`,
      [session.reservation_id, coach.id]
    );
    await notifyStudents(q, session.lesson_id, 'Ders Oturumu İptal Edildi',
      `"${session.title}" dersinin ${session.start_at.slice(0, 10)} ${session.start_at.slice(11, 16)} oturumu antrenör tarafından iptal edildi.`);
  }, `club:${clubId}`);
}

/** Cancels every upcoming session and closes the lesson for enrollment. */
export async function cancelLesson(coach: User, lessonId: string): Promise<void> {
  if (!isUuid(lessonId)) throw new HttpError(404, 'Ders bulunamadı.');
  const { rows } = await getDb().query<{ club_id: string; title: string; status: string }>(
    `SELECT club_id, title, status FROM app.lessons WHERE id = $1 AND coach_user_id = $2`, [lessonId, coach.id]
  );
  const lesson = rows[0];
  if (!lesson) throw new HttpError(404, 'Ders bulunamadı.');
  if (lesson.status === 'cancelled') throw new HttpError(400, 'Bu ders zaten iptal edilmiş.');
  await getDb().tx(async q => {
    await q.query(`SELECT 1 FROM app.lessons WHERE id = $1 FOR UPDATE`, [lessonId]);
    await q.query(
      `UPDATE app.reservations SET status = 'cancelled', cancelled_at = now(), cancelled_by_party = 'coach', cancelled_by_user_id = $2
       WHERE id IN (SELECT s.reservation_id FROM app.lesson_sessions s WHERE s.lesson_id = $1)
         AND status IN ('pending','confirmed') AND starts_at > now()`,
      [lessonId, coach.id]
    );
    await q.query(`UPDATE app.lessons SET status = 'cancelled' WHERE id = $1`, [lessonId]);
    await notifyStudents(q, lessonId, 'Ders İptal Edildi', `"${lesson.title}" dersinin kalan oturumları antrenör tarafından iptal edildi.`);
  }, `club:${lesson.club_id}`);
}

export async function takeAttendance(coach: User, sessionId: string, entries: unknown): Promise<void> {
  if (!Array.isArray(entries) || entries.length === 0) throw new HttpError(400, 'Yoklama listesi boş olamaz.');
  const clubId = await clubOfSession(sessionId);
  await getDb().tx(async q => {
    const session = await lockOwnedSession(q, coach.id, sessionId);
    if (session.status === 'cancelled') throw new HttpError(400, 'İptal edilen oturum için yoklama alınamaz.');
    if (!session.started) throw new HttpError(400, 'Yoklama, oturumun başlamasına 30 dakikadan az kala alınabilir.');
    const enrolled = await q.query<{ id: string }>(
      `SELECT id FROM app.lesson_enrollments WHERE lesson_id = $1 AND status = 'enrolled'`, [session.lesson_id]
    );
    const allowed = new Set(enrolled.rows.map(r => r.id));
    for (const entry of entries) {
      const enrollmentId = String((entry as any)?.enrollmentId ?? '');
      const status = String((entry as any)?.status ?? '').toLowerCase();
      if (!allowed.has(enrollmentId) || !ATTENDANCE.includes(status)) throw new HttpError(400, 'Yoklama kaydı geçersiz.');
      await q.query(
        `INSERT INTO app.lesson_attendance (session_id, enrollment_id, status, marked_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, enrollment_id) DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now()`,
        [session.session_id, enrollmentId, status, coach.id]
      );
    }
    await q.query(`UPDATE app.lesson_sessions SET attendance_taken_at = now() WHERE id = $1`, [session.session_id]);
  }, `club:${clubId}`);
}

export async function addStudentNote(
  coach: User, input: { lessonId?: unknown; studentUserId?: unknown; note?: unknown; visibleToStudent?: unknown; assessedLevel?: unknown }
): Promise<void> {
  const lessonId = String(input.lessonId ?? '');
  const studentId = String(input.studentUserId ?? '');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!isUuid(lessonId) || !isUuid(studentId)) throw new HttpError(400, 'Ders ve öğrenci seçilmelidir.');
  if (note.length < 1 || note.length > 4000) throw new HttpError(400, 'Not 1 ile 4000 karakter arasında olmalıdır.');
  let assessed: string | null = null;
  if (input.assessedLevel !== undefined && input.assessedLevel !== null && input.assessedLevel !== '') {
    assessed = ['beginner', 'intermediate', 'advanced'].find(key => LEVELS[key] === input.assessedLevel) ?? null;
    if (!assessed) throw new HttpError(400, 'Seviye değerlendirmesi geçersiz.');
  }
  const visible = input.visibleToStudent !== false;

  const { rows } = await getDb().query<{ club_id: string; title: string }>(
    `SELECT l.club_id, l.title FROM app.lessons l
     WHERE l.id = $1 AND l.coach_user_id = $2
       AND EXISTS (SELECT 1 FROM app.lesson_enrollments e WHERE e.lesson_id = l.id AND e.user_id = $3)`,
    [lessonId, coach.id, studentId]
  );
  const lesson = rows[0];
  if (!lesson) throw new HttpError(404, 'Bu öğrenci dersinize kayıtlı değil.');
  await getDb().tx(async q => {
    await q.query(
      `INSERT INTO app.coach_student_notes (coach_user_id, student_user_id, club_id, lesson_id, note, assessed_level, visible_to_student)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [coach.id, studentId, lesson.club_id, lessonId, note, assessed, visible]
    );
    if (visible) {
      await addNotification(q, {
        userId: studentId,
        type: 'coach_note',
        title: 'Antrenörünüzden Yeni Not',
        body: `${coach.displayName}, "${lesson.title}" dersi için size bir not bıraktı.`,
        actorUserId: coach.id
      });
    }
  }, `club:${lesson.club_id}`);
}

/** Background job: per-enrolled-student lesson fees are written when a session starts. */
export async function chargeStartedLessonSessions(limit = 200): Promise<number> {
  const { rows } = await getDb().query<{ id: string; club_id: string }>(
    `SELECT s.id, l.club_id FROM app.lesson_sessions s
     JOIN app.lessons l ON l.id = s.lesson_id
     JOIN app.reservations r ON r.id = s.reservation_id
     WHERE l.fee_basis = 'per_enrolled_student_session' AND r.status <> 'cancelled'
       AND r.starts_at <= now() AND r.starts_at > now() - interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM app.fee_ledger_entries f WHERE f.lesson_session_id = s.id)
     LIMIT $1`,
    [limit]
  );
  let written = 0;
  for (const row of rows) {
    written += await getDb().tx(async q => {
      const { rows: result } = await q.query<{ n: number }>(`SELECT app.charge_lesson_session($1) AS n`, [row.id]);
      return result[0]?.n ?? 0;
    }, `club:${row.club_id}`);
  }
  return written;
}
