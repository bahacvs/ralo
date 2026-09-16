// Coach and lesson module shapes (/api/lessons, /api/my-lessons, /api/coach/*, /api/panel/coaches).

export type LessonKind = 'GROUP' | 'PRIVATE';
export type LessonLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export interface LessonSession {
  id: string;
  sessionNo: number;
  courtId: string;
  courtName: string;
  startAt: string; // Istanbul local time
  endAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  attendanceTaken: boolean;
}

export interface LessonSummary {
  id: string;
  clubId: string;
  clubName: string;
  city: string;
  district: string;
  coachUserId: string;
  coachName: string;
  kind: LessonKind;
  title: string;
  description: string;
  level: LessonLevel;
  capacity: number;
  enrolledCount: number;
  waitlistCount: number;
  pricePerStudent: number | null; // TL, paid at the venue
  minElo: number | null;
  maxElo: number | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  nextSessionAt: string | null;
  sessionCount: number;
  myEnrollment: { status: 'ENROLLED' | 'WAITLISTED'; waitlistRank: number | null } | null;
}

export interface CoachNote {
  id: string;
  note: string;
  assessedLevel: Exclude<LessonLevel, 'ALL'> | null;
  visibleToStudent: boolean;
  createdAt: string;
  lessonId: string | null;
  lessonTitle: string | null;
  coachName: string;
  studentUserId: string;
  studentName: string;
}

export interface LessonDetail extends LessonSummary {
  sessions: LessonSession[];
  myNotes: CoachNote[];
}

export interface LessonStudent {
  enrollmentId: string;
  userId: string;
  name: string;
  maskedName: string;
  elo: number;
  status: 'ENROLLED' | 'WAITLISTED';
  waitlistPosition: number | null;
}

export interface CoachLesson extends LessonDetail {
  students: LessonStudent[];
  /** sessionId -> enrollmentId -> status */
  attendance: Record<string, Record<string, string>>;
  notes: CoachNote[];
}

export interface CoachContract {
  id: string;
  clubId: string;
  clubName: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ENDED';
  startsOn: string;
  endsOn: string | null;
  coachUserId: string;
  coachName: string;
  coachEmail: string | null;
  coachHasPassword: boolean;
  activeLessons: number;
}

export interface CoachOverview {
  contracts: (CoachContract & { courts: { id: string; name: string }[]; lessonFeeConfigured: boolean })[];
  lessons: CoachLesson[];
}

export interface MyLessonsResponse {
  lessons: LessonDetail[];
  notes: CoachNote[];
}
