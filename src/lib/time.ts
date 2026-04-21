import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { format, addDays, parseISO } from 'date-fns';

export const ET_TZ = 'America/New_York';

export type ShiftName = 'Day' | 'Swing' | 'Overnight';
export type DayAbbr = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAY_ABBRS: readonly DayAbbr[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Parse "YYYY-MM-DDTHH:MM:SS" as an ET-local wall-clock reading and return a
 * proper UTC Date instance. DST-safe via date-fns-tz.
 */
export function parseEtLocal(isoLocal: string): Date {
  return fromZonedTime(isoLocal, ET_TZ);
}

/**
 * Convert a UTC Date to "YYYY-MM-DDTHH:MM:SS" as it reads in ET wall clock.
 * Useful for reversible display when writing computed grace-window boundaries.
 */
export function toEtLocal(date: Date): string {
  const zoned = toZonedTime(date, ET_TZ);
  return format(zoned, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Given a calendar date (YYYY-MM-DD) and an ET-local end_time ("HH:MM"), return
 * the shift's end moment as a UTC Date. The date parameter is the date the shift
 * was SCHEDULED to start — Overnight shifts ending after midnight roll into the
 * next calendar day automatically.
 *
 * @param shiftStartDate calendar date the shift starts (YYYY-MM-DD)
 * @param startTimeLocal "HH:MM" ET local
 * @param endTimeLocal "HH:MM" ET local; if less than startTimeLocal, treated as next-day
 */
export function shiftEndUtc(
  shiftStartDate: string,
  startTimeLocal: string,
  endTimeLocal: string,
): Date {
  const [sh, sm] = startTimeLocal.split(':').map((s) => Number.parseInt(s, 10));
  const [eh, em] = endTimeLocal.split(':').map((s) => Number.parseInt(s, 10));
  if (sh === undefined || sm === undefined || eh === undefined || em === undefined) {
    throw new Error(`shiftEndUtc: bad times start=${startTimeLocal} end=${endTimeLocal}`);
  }
  const startsAfterEnds = sh * 60 + sm >= eh * 60 + em;
  const endDateLocal = startsAfterEnds
    ? format(addDays(parseISO(shiftStartDate), 1), 'yyyy-MM-dd')
    : shiftStartDate;
  const endLocalIso = `${endDateLocal}T${pad(eh)}:${pad(em)}:00`;
  return fromZonedTime(endLocalIso, ET_TZ);
}

/**
 * Day-of-week abbreviation ("mon", ...) for a YYYY-MM-DD in America/New_York.
 */
export function dayOfWeekEt(date: string): DayAbbr {
  const zoned = toZonedTime(parseISO(`${date}T12:00:00Z`), ET_TZ);
  const abbr = DAY_ABBRS[zoned.getDay()];
  if (!abbr) throw new Error(`dayOfWeekEt: bad date ${date}`);
  return abbr;
}

export interface SchedulePattern {
  individual_id: string;
  shift_name: ShiftName;
  start_time: string;  // "HH:MM" ET
  end_time: string;    // "HH:MM" ET
  days_of_week: string; // csv, e.g. "mon,tue,wed,thu,fri"
}

export interface ExpectedShift {
  individual_id: string;
  /** Date the shift is SCHEDULED TO START, YYYY-MM-DD in ET. */
  shift_start_date: string;
  /** Date a corresponding t_log is expected to carry as reported_date. */
  expected_reported_date: string;
  shift_name: ShiftName;
  start_time_local: string;
  end_time_local: string;
}

/**
 * Walk every calendar day in [windowStart, windowEnd] and emit an ExpectedShift
 * for each (pattern, day_of_week_match) combination.
 *
 * reported_date vs shift_start_date semantics (per fixture convention):
 *   - Day / Swing: reported_date = shift_start_date
 *   - Overnight:   reported_date = shift_start_date + 1
 */
export function expandScheduleOverWindow(
  patterns: SchedulePattern[],
  windowStart: string,
  windowEnd: string,
): ExpectedShift[] {
  const out: ExpectedShift[] = [];
  const end = parseISO(windowEnd);
  let cursor = parseISO(windowStart);
  while (cursor <= end) {
    const date = format(cursor, 'yyyy-MM-dd');
    const abbr = dayOfWeekEt(date);
    for (const p of patterns) {
      const days = p.days_of_week.split(',').map((d) => d.trim().toLowerCase());
      if (!days.includes(abbr)) continue;

      const expected_reported_date =
        p.shift_name === 'Overnight'
          ? format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
          : date;

      out.push({
        individual_id: p.individual_id,
        shift_start_date: date,
        expected_reported_date,
        shift_name: p.shift_name,
        start_time_local: p.start_time,
        end_time_local: p.end_time,
      });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Humanize a SQLite TEXT timestamp (UTC) as "just now", "2 hours ago", etc.
 * Used for the "Data current as of..." bar in the layout.
 */
export function humanizeSince(timestamp: string | null | undefined, now: Date = new Date()): string {
  if (!timestamp) return 'never';
  // SQLite's datetime('now') emits "YYYY-MM-DD HH:MM:SS" with implicit UTC;
  // convert to ISO by swapping space for T and appending Z if needed.
  const iso = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T');
  const withTz = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const then = new Date(withTz);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return 'unknown';
  if (diffMs < 45_000) return 'just now';
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  return then.toISOString().slice(0, 10);
}

/**
 * Windows supported in the Filter disclosure.
 * "Last N days" is anchored to max(t_logs.reported_date) rather than wall-clock
 * today, so demos on fixture data default to a window that contains notes
 * (per the UI/UX sign-off decision #5 — option a).
 */
export type WindowPreset = '7d' | '30d' | 'this_week' | 'all';

export interface WindowRange {
  start: string;
  end: string;
  label: string;
}

export function resolveWindowFromAnchor(
  preset: WindowPreset,
  anchorDate: string,
): WindowRange {
  const anchor = parseISO(`${anchorDate}T12:00:00Z`); // noon UTC to avoid DST edge cases
  switch (preset) {
    case '30d':
      return {
        start: format(addDays(anchor, -29), 'yyyy-MM-dd'),
        end: anchorDate,
        label: 'Last 30 days',
      };
    case 'this_week': {
      // Monday of the anchor week
      const dow = anchor.getUTCDay();
      const daysSinceMonday = dow === 0 ? 6 : dow - 1;
      const start = addDays(anchor, -daysSinceMonday);
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: anchorDate,
        label: 'This week',
      };
    }
    case 'all':
      return { start: '1970-01-01', end: anchorDate, label: 'All time' };
    case '7d':
    default:
      return {
        start: format(addDays(anchor, -6), 'yyyy-MM-dd'),
        end: anchorDate,
        label: 'Last 7 days',
      };
  }
}
