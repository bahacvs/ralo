import { getDb, type Queryable } from '../db/instance.js';
import { addMinutesToLocal, todayLocal } from '../time.js';
import { fromLocal, kurusToTl } from './mappers.js';
import { listClubCourts } from './clubs.js';
import { activeBookings, overlaps } from './reservations.js';
import type { OccupancyStatus } from '../../src/types/index.js';

// Club panel analytics computed from real bookings and the club's opening hours.

const DEFAULT_HOURS = { open: 8 * 60, close: 23 * 60 };
const SLOT_MINUTES = 90;

/** ISO weekday (1 = Monday) of a 'YYYY-MM-DD' date. */
function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00`).getDay();
  return ((day + 6) % 7) + 1;
}

async function openingHoursFor(q: Queryable, clubId: string, date: string): Promise<{ open: number; close: number } | null> {
  const { rows } = await q.query<{ is_closed: boolean; open_minute: number | null; close_minute: number | null }>(
    `SELECT is_closed, open_minute, close_minute FROM app.club_opening_hours WHERE club_id = $1 AND weekday = $2`,
    [clubId, isoWeekday(date)]
  );
  const row = rows[0];
  if (!row) return DEFAULT_HOURS;
  if (row.is_closed || row.open_minute === null || row.close_minute === null) return null;
  return { open: row.open_minute, close: row.close_minute };
}

function occupancyStatus(rate: number): { status: OccupancyStatus; label: string } {
  if (rate >= 80) return { status: 'FULL', label: 'Kritik / Dolu' };
  if (rate >= 60) return { status: 'HIGH', label: 'Yoğun Talep' };
  if (rate >= 35) return { status: 'MODERATE', label: 'Orta Doluluk' };
  return { status: 'LOW', label: 'Sakin' };
}

const clock = (minute: number) =>
  `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export async function getPanelCourts(clubId: string, date: string) {
  const data = await getDb().tx(async q => {
    const courts = await listClubCourts(clubId, q);
    const hours = await openingHoursFor(q, clubId, date);
    const dayStart = `${date}T00:00:00`;
    const windowStart = hours ? addMinutesToLocal(dayStart, hours.open) : dayStart;
    const windowEnd = hours ? addMinutesToLocal(dayStart, hours.close) : dayStart;

    const booked = await q.query<{ court_id: string; minutes: number }>(
      `SELECT court_id,
              COALESCE(sum(extract(epoch FROM (least(ends_at, ${fromLocal('$3')}) - greatest(starts_at, ${fromLocal('$2')}))) / 60), 0)::int AS minutes
       FROM app.court_bookings
       WHERE club_id = $1 AND is_active AND starts_at < ${fromLocal('$3')} AND ends_at > ${fromLocal('$2')}
       GROUP BY court_id`,
      [clubId, windowStart, windowEnd]
    );
    const revenue = await q.query<{ court_id: string; kurus: number }>(
      `SELECT court_id, COALESCE(sum(total_price_kurus), 0)::int AS kurus
       FROM app.reservations WHERE club_id = $1 AND local_date = $2::date AND status <> 'cancelled'
       GROUP BY court_id`,
      [clubId, date]
    );
    return { courts, hours, booked: booked.rows, revenue: revenue.rows };
  }, `club:${clubId}`);

  const openMinutes = data.hours ? data.hours.close - data.hours.open : 0;
  const totalSlotsCount = Math.floor(openMinutes / SLOT_MINUTES);

  const courtsWithOccupancy = data.courts.map(court => {
    const bookedMinutes = data.booked.find(b => b.court_id === court.id)?.minutes ?? 0;
    const occupancyRate = court.isActive && openMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100)) : 0;
    const bookedSlotsCount = Math.min(totalSlotsCount, Math.round(bookedMinutes / SLOT_MINUTES));
    return {
      ...court,
      occupancy: {
        occupancyRate,
        bookedSlotsCount,
        totalSlotsCount: court.isActive ? totalSlotsCount : 0,
        availableSlotsCount: court.isActive ? Math.max(0, totalSlotsCount - bookedSlotsCount) : 0,
        ...occupancyStatus(occupancyRate),
        estimatedDailyRevenue: kurusToTl(data.revenue.find(r => r.court_id === court.id)?.kurus ?? 0),
        bookedMinutes
      }
    };
  });

  const activeCourts = courtsWithOccupancy.filter(c => c.isActive);
  const bookings = await activeBookings(activeCourts.map(c => c.id), date);
  const hourlyOccupancy: { hour: string; activeBookings: number; totalCourts: number; occupancyRate: number }[] = [];
  if (data.hours) {
    for (let minute = data.hours.open; minute + 60 <= data.hours.close; minute += SLOT_MINUTES) {
      const start = addMinutesToLocal(`${date}T00:00:00`, minute);
      const end = addMinutesToLocal(start, SLOT_MINUTES);
      const busy = activeCourts.filter(c => overlaps(bookings.get(c.id) ?? [], start, end)).length;
      hourlyOccupancy.push({
        hour: clock(minute),
        activeBookings: busy,
        totalCourts: activeCourts.length,
        occupancyRate: activeCourts.length > 0 ? Math.round((busy / activeCourts.length) * 100) : 0
      });
    }
  }

  return {
    courts: courtsWithOccupancy.map(({ occupancy: { bookedMinutes, ...occupancy }, ...court }) => ({ ...court, occupancy })),
    analytics: {
      avgOccupancyRate: activeCourts.length > 0
        ? Math.round(activeCourts.reduce((sum, c) => sum + c.occupancy.occupancyRate, 0) / activeCourts.length)
        : 0,
      totalCourts: data.courts.length,
      activeCourts: activeCourts.length,
      totalDailyRevenue: courtsWithOccupancy.reduce((sum, c) => sum + c.occupancy.estimatedDailyRevenue, 0),
      totalBookedHours: Math.round(courtsWithOccupancy.reduce((sum, c) => sum + c.occupancy.bookedMinutes, 0) / 60),
      date,
      hourlyOccupancy
    }
  };
}

/** Totals over all reservations plus the court occupancy of the last 7 days. */
export async function getPanelReports(clubId: string) {
  return getDb().tx(async q => {
    const totals = await q.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status IN ('confirmed','completed'))::int AS confirmed,
              count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              COALESCE(sum(total_price_kurus) FILTER (WHERE status <> 'cancelled'), 0)::int AS revenue_kurus
       FROM app.reservations WHERE club_id = $1`,
      [clubId]
    );
    const courts = await q.query<{ total: number; active: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS active FROM app.courts WHERE club_id = $1`,
      [clubId]
    );

    const today = todayLocal();
    const from = addMinutesToLocal(`${today}T00:00:00`, -6 * 24 * 60);
    const to = addMinutesToLocal(`${today}T00:00:00`, 24 * 60);
    const booked = await q.query<{ minutes: number }>(
      `SELECT COALESCE(sum(extract(epoch FROM (least(ends_at, ${fromLocal('$3')}) - greatest(starts_at, ${fromLocal('$2')}))) / 60), 0)::int AS minutes
       FROM app.court_bookings b JOIN app.courts co ON co.id = b.court_id
       WHERE b.club_id = $1 AND b.kind = 'reservation' AND b.is_active AND co.is_active
         AND b.starts_at < ${fromLocal('$3')} AND b.ends_at > ${fromLocal('$2')}`,
      [clubId, from, to]
    );
    let openMinutes = 0;
    for (let i = 0; i < 7; i++) {
      const date = addMinutesToLocal(from, i * 24 * 60).slice(0, 10);
      const hours = await openingHoursFor(q, clubId, date);
      if (hours) openMinutes += hours.close - hours.open;
    }
    openMinutes *= courts.rows[0].active;

    const t = totals.rows[0];
    return {
      businessId: clubId,
      totalCourts: courts.rows[0].total,
      totalBookings: t.total,
      totalRevenue: kurusToTl(t.revenue_kurus),
      noShowRate: t.total > 0 ? Math.round((t.no_show / t.total) * 100) : 0,
      occupancyRate: openMinutes > 0 ? Math.min(100, Math.round((booked.rows[0].minutes / openMinutes) * 100)) : 0,
      confirmedCount: t.confirmed,
      noShowCount: t.no_show,
      cancelledCount: t.cancelled
    };
  }, `club:${clubId}`);
}
