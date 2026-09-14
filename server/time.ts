// Business timezone. Reservation times are stored as naive wall-clock strings
// ("YYYY-MM-DDTHH:mm:ss") interpreted in this zone, so the process must run in it.
export const APP_TIMEZONE = 'Europe/Istanbul';
process.env.TZ = APP_TIMEZONE;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatLocalDateTime(d: Date): string {
  return `${formatLocalDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/** Current local time, comparable as a string with stored startAt/endAt values. */
export function nowLocal(): string {
  return formatLocalDateTime(new Date());
}

/** Adds minutes to a local wall-clock string, rolling over midnight correctly. */
export function addMinutesToLocal(localDateTime: string, minutes: number): string {
  return formatLocalDateTime(new Date(new Date(localDateTime).getTime() + minutes * 60_000));
}

/**
 * Accepts "YYYY-MM-DDTHH:mm[:ss]" (local) or an ISO string with Z/offset and returns
 * a local "YYYY-MM-DDTHH:mm:00" string, or null when invalid.
 */
export function parseClientDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const naive = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (naive) {
    const candidate = `${naive[1]}T${naive[2]}:${naive[3]}:00`;
    return Number.isNaN(new Date(candidate).getTime()) ? null : candidate;
  }

  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setSeconds(0, 0);
    return formatLocalDateTime(d);
  }

  return null;
}
