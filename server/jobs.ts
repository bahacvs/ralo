import { getDb } from './db/instance.js';
import { nowLocal, todayLocal } from './time.js';
import { purgeExpiredAuthRows } from './auth.js';
import { autoConfirmDueResults } from './repo/matchResults.js';
import { generateStatements, markOverdueStatements, suspendClubsForOverdueStatements } from './repo/admin.js';
import { chargeStartedLessonSessions } from './repo/lessons.js';

/**
 * Background jobs, run in-process on every instance. Periodic jobs are safe to run concurrently (row locks,
 * idempotent writes); dated jobs claim a job_runs row first, so only one instance runs them per run key.
 */
const TICK_MS = 10 * 60 * 1000;
/** Monthly statements for the previous month are issued after this Istanbul time. */
const STATEMENT_ISSUE_TIME = '03:00';

/** Claims (job_name, run_key); a failed or stuck run can be retried after a delay. */
async function claim(jobName: string, runKey: string): Promise<boolean> {
  const { rows } = await getDb().query(
    `INSERT INTO app.job_runs (job_name, run_key, status) VALUES ($1, $2, 'running')
     ON CONFLICT (job_name, run_key) DO UPDATE SET status = 'running', started_at = now(), finished_at = NULL, error = NULL
       WHERE (app.job_runs.status = 'failed' AND app.job_runs.started_at < now() - interval '1 hour')
          OR (app.job_runs.status = 'running' AND app.job_runs.started_at < now() - interval '2 hours')
     RETURNING job_name`,
    [jobName, runKey]
  );
  return rows.length > 0;
}

async function finish(jobName: string, runKey: string, error?: unknown) {
  await getDb().query(
    `UPDATE app.job_runs SET status = $3, finished_at = now(), error = $4 WHERE job_name = $1 AND run_key = $2`,
    [jobName, runKey, error ? 'failed' : 'succeeded', error ? String((error as any)?.message ?? error).slice(0, 1000) : null]
  );
}

async function once(jobName: string, runKey: string, fn: () => Promise<unknown>) {
  if (!(await claim(jobName, runKey))) return;
  try {
    const result = await fn();
    await finish(jobName, runKey);
    console.log(`Job ${jobName} (${runKey}) finished:`, result ?? 'ok');
  } catch (err) {
    await finish(jobName, runKey, err).catch(() => {});
    console.error(`Job ${jobName} (${runKey}) failed:`, (err as any)?.message ?? err);
  }
}

async function periodic(jobName: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`Job ${jobName} failed:`, (err as any)?.message ?? err);
  }
}

export function previousPeriod(today: string): string {
  const [year, month] = today.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export async function runJobs(): Promise<void> {
  await periodic('auth_purge', () => purgeExpiredAuthRows());
  await periodic('match_results_auto_confirm', () => autoConfirmDueResults());
  await periodic('lesson_session_charges', () => chargeStartedLessonSessions());

  const today = todayLocal();
  await once('statements_overdue', today, () => markOverdueStatements());
  await once('booking_suspensions', today, () => suspendClubsForOverdueStatements());
  if (nowLocal().slice(11, 16) >= STATEMENT_ISSUE_TIME) {
    const period = previousPeriod(today);
    await once('monthly_statements', period, async () => (await generateStatements(null, period)).created);
  }
}

/** Starts the job loop (first run shortly after boot). Returns a stop function. */
export function startJobs(): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    runJobs().finally(() => { running = false; });
  };
  const first = setTimeout(tick, 30_000);
  const timer = setInterval(tick, TICK_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
