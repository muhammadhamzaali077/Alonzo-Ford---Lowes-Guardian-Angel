import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { addDays, format, parseISO } from 'date-fns';
import { getDb } from '../db/client.js';
import { writeFlag } from './write-flag.js';
import {
  expandScheduleOverWindow,
  shiftEndUtc,
  type ExpectedShift,
  type SchedulePattern,
  type ShiftName,
} from '../lib/time.js';

const GRACE_HOURS_DEFAULT = 6;

export interface DetectMissingOptions {
  /** YYYY-MM-DD; default = min(t_logs.reported_date) over is_current=1 rows. */
  windowStart?: string;
  /** YYYY-MM-DD; default = max(t_logs.reported_date). */
  windowEnd?: string;
  /** Hours after scheduled shift end before a gap becomes a missing-note flag. */
  graceHours?: number;
  /** Override of "now" — useful for tests; default = new Date(). */
  now?: Date;
}

export interface DetectMissingResult {
  expected_shifts: number;
  present: number;
  missing_written: number;
  missing_skipped_within_grace: number;
  missing_skipped_existing: number;
  attributed_to_angel: number;
  unattributed: number;
}

/**
 * Detect (individual, scheduled_shift) pairs in the window that have no
 * corresponding current T-Log and write missing_schedule flags for each.
 *
 * Angel attribution — prototype heuristic per research R13:
 *   single DSP at the individual's location → attribute to that DSP
 *   otherwise → angel_id = NULL, dashboard shows "angel: unattributed"
 *
 * TODO(post-prototype): replace the single-DSP lookup with a real
 * shift_assignment(location_id, shift_name, date, angel_id) table once
 * upstream rostering is available. Swap point is `attributeAngel()` below.
 *
 * Idempotent — a flag already existing for
 * (individual_id, scheduled_shift_date, scheduled_shift_name) with
 * source='missing_schedule' is skipped.
 */
export function detectMissingNotes(
  opts: DetectMissingOptions = {},
  db: BetterSqliteDatabase = getDb(),
): DetectMissingResult {
  const window = resolveWindow(opts, db);
  const now = opts.now ?? new Date();
  const graceHours = opts.graceHours ?? GRACE_HOURS_DEFAULT;

  const patterns = db
    .prepare(
      `SELECT individual_id, shift_name, start_time, end_time, days_of_week
         FROM shift_schedule
        WHERE active_from <= @end AND (active_to IS NULL OR active_to >= @start)`,
    )
    .all({ start: window.start, end: window.end }) as SchedulePattern[];

  const expected = expandScheduleOverWindow(patterns, window.start, window.end);

  // Overnight shifts starting on `windowEnd` have reported_date = windowEnd + 1.
  // Extend the t_logs scan by one day so those rows are picked up as present.
  // If the upload introduced a note with a date outside the original fixture
  // window, bounds.e may not have a matching parseISO format — validate.
  const parsedEnd = parseISO(window.end);
  if (Number.isNaN(parsedEnd.getTime())) {
    throw new Error(`detectMissingNotes: could not parse window.end "${window.end}"`);
  }
  const presentEnd = format(addDays(parsedEnd, 1), 'yyyy-MM-dd');
  const presentKeys = new Set(
    (db
      .prepare(
        `SELECT individual_id || ':' || reported_date || ':' || shift_name AS k
           FROM t_logs
          WHERE is_current = 1
            AND reported_date BETWEEN @start AND @presentEnd`,
      )
      .all({ start: window.start, presentEnd }) as Array<{ k: string }>).map((r) => r.k),
  );

  const existingMissingKeys = new Set(
    (db
      .prepare(
        `SELECT individual_id || ':' || scheduled_shift_date || ':' || scheduled_shift_name AS k
           FROM flags
          WHERE source = 'missing_schedule'`,
      )
      .all() as Array<{ k: string }>).map((r) => r.k),
  );

  const individualLocation = new Map(
    (db
      .prepare('SELECT id, location_id FROM individuals WHERE deleted_at IS NULL')
      .all() as Array<{ id: string; location_id: string | null }>).map((r) => [r.id, r.location_id]),
  );

  const locationManager = new Map(
    (db
      .prepare('SELECT id, manager_id FROM locations WHERE deleted_at IS NULL')
      .all() as Array<{ id: string; manager_id: string | null }>).map((r) => [r.id, r.manager_id]),
  );

  const singleDspByLocation = buildSingleDspMap(db);

  const result: DetectMissingResult = {
    expected_shifts: expected.length,
    present: 0,
    missing_written: 0,
    missing_skipped_within_grace: 0,
    missing_skipped_existing: 0,
    attributed_to_angel: 0,
    unattributed: 0,
  };

  const txn = db.transaction(() => {
    for (const shift of expected) {
      const presentKey = `${shift.individual_id}:${shift.expected_reported_date}:${shift.shift_name}`;
      if (presentKeys.has(presentKey)) {
        result.present++;
        continue;
      }

      const graceEnd = shiftEndWithGrace(shift, graceHours);
      if (now < graceEnd) {
        result.missing_skipped_within_grace++;
        continue;
      }

      // scheduled_shift_date is the date the SHIFT STARTS (per data model).
      const missingKey = `${shift.individual_id}:${shift.shift_start_date}:${shift.shift_name}`;
      if (existingMissingKeys.has(missingKey)) {
        result.missing_skipped_existing++;
        continue;
      }

      const location_id = individualLocation.get(shift.individual_id);
      if (!location_id) continue; // orphan individual; skip
      const manager_id = locationManager.get(location_id) ?? null;
      const angel_id = singleDspByLocation.get(location_id) ?? null;

      writeFlag(
        {
          tlog_id: null,
          tlog_version: null,
          individual_id: shift.individual_id,
          location_id,
          manager_id,
          angel_id,
          scheduled_shift_date: shift.shift_start_date,
          scheduled_shift_name: shift.shift_name,
          severity: 'red',
          source: 'missing_schedule',
          display_category: 'missing_note',
          reason: reasonFor(shift, graceHours),
        },
        db,
      );

      result.missing_written++;
      if (angel_id) result.attributed_to_angel++;
      else result.unattributed++;
      existingMissingKeys.add(missingKey);
    }
  });
  txn();

  return result;
}

// -------------------------------------------------------------------------------------------------

function resolveWindow(
  opts: DetectMissingOptions,
  db: BetterSqliteDatabase,
): { start: string; end: string } {
  if (opts.windowStart && opts.windowEnd) {
    return { start: opts.windowStart, end: opts.windowEnd };
  }
  const bounds = db
    .prepare('SELECT MIN(reported_date) AS s, MAX(reported_date) AS e FROM t_logs WHERE is_current = 1')
    .get() as { s: string | null; e: string | null };
  const start = opts.windowStart ?? bounds.s ?? new Date().toISOString().slice(0, 10);
  const end = opts.windowEnd ?? bounds.e ?? new Date().toISOString().slice(0, 10);
  return { start, end };
}

function shiftEndWithGrace(shift: ExpectedShift, graceHours: number): Date {
  const end = shiftEndUtc(shift.shift_start_date, shift.start_time_local, shift.end_time_local);
  return new Date(end.getTime() + graceHours * 3600 * 1000);
}

/**
 * For each location, return the location's single DSP if and only if exactly one
 * DSP is assigned. Otherwise the map omits the location (→ unattributed flags).
 * See R13 for rationale.
 */
function buildSingleDspMap(db: BetterSqliteDatabase): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT location_id, id
         FROM angels
        WHERE deleted_at IS NULL AND role = 'DSP' AND location_id IS NOT NULL`,
    )
    .all() as Array<{ location_id: string; id: string }>;
  const bucket = new Map<string, string[]>();
  for (const r of rows) {
    const arr = bucket.get(r.location_id) ?? [];
    arr.push(r.id);
    bucket.set(r.location_id, arr);
  }
  const out = new Map<string, string>();
  for (const [loc, angels] of bucket) {
    if (angels.length === 1) out.set(loc, angels[0]!);
  }
  return out;
}

function reasonFor(shift: ExpectedShift, graceHours: number): string {
  const friendlyShift =
    shift.shift_name === 'Day'       ? 'Day shift' :
    shift.shift_name === 'Swing'     ? 'Swing shift' :
    /* Overnight */                    'Overnight shift';
  const times = `${shift.start_time_local}–${shift.end_time_local} ET`;
  return `No note submitted for ${friendlyShift} (${times}) on ${shift.shift_start_date}. Grace window closed ${graceHours} hours after shift end.`;
}

// Resolve `ShiftName` for the exported type without importing just for the re-export.
export type { ShiftName };
