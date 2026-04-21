// Q3/B compliance-score: (submitted_not_red / expected) × 100.
// Yellow counts as compliant; any red (deterministic / missing / AI-escalated)
// reduces the score. Used by the tiles, the per-location trend, and the
// digest's week-over-week line.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';
import { expandScheduleOverWindow, type SchedulePattern } from '../../lib/time.js';

export interface ComplianceScore {
  submitted_not_red: number;
  expected: number;
  pct: number;
}

export function getComplianceScore(
  locationId: string,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): ComplianceScore {
  const patterns = db
    .prepare(
      `SELECT s.individual_id, s.shift_name, s.start_time, s.end_time, s.days_of_week
         FROM shift_schedule s
         JOIN individuals i ON i.id = s.individual_id
        WHERE i.location_id = @locationId
          AND i.deleted_at IS NULL
          AND s.active_from <= @end
          AND (s.active_to IS NULL OR s.active_to >= @start)`,
    )
    .all({ locationId, start, end }) as SchedulePattern[];

  const expected = expandScheduleOverWindow(patterns, start, end).length;

  const submitted_not_red = (db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM t_logs t
        WHERE t.is_current = 1
          AND t.program_id = @locationId
          AND t.reported_date BETWEEN @start AND @end
          AND NOT EXISTS (
            SELECT 1 FROM flags f
             WHERE f.tlog_id = t.tlog_id AND f.tlog_version = t.version
               AND f.severity = 'red' AND f.resolution = 'open'
          )`,
    )
    .get({ locationId, start, end }) as { n: number }).n;

  const pct = expected === 0 ? 100 : Math.min(100, Math.max(0, (submitted_not_red / expected) * 100));
  return { submitted_not_red, expected, pct };
}

/**
 * Per-location daily compliance-score time-series for the trend chart.
 * Returns one series per location; each series has a {date, pct} point for
 * every day in [start, end].
 */
export interface TrendSeries {
  location_id: string;
  location_name: string;
  points: Array<{ date: string; pct: number }>;
}

export function getComplianceTrend(
  locationIds: readonly string[],
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): TrendSeries[] {
  const out: TrendSeries[] = [];
  for (const locId of locationIds) {
    const loc = db.prepare('SELECT id, name FROM locations WHERE id = ?').get(locId) as
      | { id: string; name: string }
      | undefined;
    if (!loc) continue;
    const points: Array<{ date: string; pct: number }> = [];
    const dates = eachDate(start, end);
    for (const date of dates) {
      const { pct } = getComplianceScore(locId, date, date, db);
      points.push({ date, pct });
    }
    out.push({ location_id: loc.id, location_name: loc.name, points });
  }
  return out;
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const startMs = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const endMs = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  for (let ms = startMs; ms <= endMs; ms += 24 * 3600 * 1000) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
}
