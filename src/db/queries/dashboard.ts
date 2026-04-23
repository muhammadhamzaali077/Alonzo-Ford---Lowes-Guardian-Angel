// Aggregates for the dashboard, its drill-downs, and the trend chart.
//
// Queries combine flag counts with t_log counts while respecting scope
// (`scope.locations` is 'all' or an array of location_ids).

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type LocationScope = 'all' | readonly string[];

export interface DashboardFilters {
  severity?: 'all' | 'red' | 'yellow' | 'missing';
  shift?: 'all' | 'Day' | 'Swing' | 'Overnight';
  locationId?: string | null;
  managerId?: string | null;
  individualId?: string | null;
  search?: string | null;
}

export interface LocationRow {
  location_id: string;
  location_name: string;
  location_type: 'group_home' | 'host_home' | 'day_program';
  manager_id: string | null;
  manager_name: string | null;
  red_content: number;     // red flags where source != missing_schedule
  yellow_count: number;
  missing_count: number;
  submitted_not_red: number;
  expected_shifts: number;
}

export interface OverallCounts {
  red: number;          // includes missing
  yellow: number;
  missing: number;
  compliance_pct: number;
  total_submitted: number;
  total_expected: number;
}

export interface OverallCountsWithPrior extends OverallCounts {
  prior: OverallCounts;
}

/**
 * The scope is applied as a list of allowed location_ids. Callers pass
 * `scope.locations` from the request-scope middleware. 'all' means no filter.
 */
function locationScopeSql(scope: LocationScope, alias: string): {
  sql: string;
  params: Record<string, string>;
} {
  if (scope === 'all') return { sql: '1=1', params: {} };
  if (scope.length === 0) return { sql: '0=1', params: {} };
  const params: Record<string, string> = {};
  const placeholders = scope.map((id, i) => {
    const key = `loc${i}`;
    params[key] = id;
    return `@${key}`;
  });
  return { sql: `${alias} IN (${placeholders.join(',')})`, params };
}

/**
 * Per-location roll-up rows over a window, scope-filtered.
 * Results are sorted with most-concerning locations first.
 */
export function getLocationAggregates(
  scope: LocationScope,
  start: string,
  end: string,
  filters: DashboardFilters = {},
  db: BetterSqliteDatabase = getDb(),
): LocationRow[] {
  const locScope = locationScopeSql(scope, 'l.id');

  // Flags effective_date = scheduled_shift_date (missing) or t_log.reported_date.
  const flagsQ = `
    SELECT f.location_id,
           SUM(CASE WHEN f.severity='red' AND f.source<>'missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS red_content,
           SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) AS yellow_count,
           SUM(CASE WHEN f.source='missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS missing_count
      FROM flags f
      LEFT JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
     WHERE COALESCE(f.scheduled_shift_date, t.reported_date) BETWEEN @start AND @end
     GROUP BY f.location_id
  `;

  const submittedQ = `
    SELECT t.program_id AS location_id,
           COUNT(*) AS submitted_not_red
      FROM t_logs t
     WHERE t.is_current = 1
       AND t.reported_date BETWEEN @start AND @end
       AND NOT EXISTS (
         SELECT 1 FROM flags f2
          WHERE f2.tlog_id = t.tlog_id AND f2.tlog_version = t.version
            AND f2.severity = 'red' AND f2.resolution = 'open'
       )
     GROUP BY t.program_id
  `;

  const expectedQ = `
    SELECT i.location_id,
           COUNT(*) AS expected_shifts
      FROM shift_schedule s
      JOIN individuals i ON i.id = s.individual_id
     WHERE i.deleted_at IS NULL
     GROUP BY i.location_id
  `;
  // note: not time-windowed — we multiply by window-days below. Keeping it
  // simple for v1; a fully accurate window-aware expected count lives in
  // lib/time.ts expandScheduleOverWindow() and is used by the
  // compliance-score query. For the dashboard tiles we use this coarse
  // denominator because it matches what the detector treats as "expected".

  const sql = `
    SELECT l.id AS location_id, l.name AS location_name, l.type AS location_type,
           l.manager_id, m.name AS manager_name,
           COALESCE(fx.red_content, 0) AS red_content,
           COALESCE(fx.yellow_count, 0) AS yellow_count,
           COALESCE(fx.missing_count, 0) AS missing_count,
           COALESCE(sx.submitted_not_red, 0) AS submitted_not_red,
           COALESCE(ex.expected_shifts, 0) AS expected_shifts
      FROM locations l
      LEFT JOIN managers m ON m.id = l.manager_id
      LEFT JOIN (${flagsQ}) fx ON fx.location_id = l.id
      LEFT JOIN (${submittedQ}) sx ON sx.location_id = l.id
      LEFT JOIN (${expectedQ}) ex ON ex.location_id = l.id
     WHERE l.deleted_at IS NULL AND ${locScope.sql}
     ORDER BY (COALESCE(fx.red_content, 0) + COALESCE(fx.missing_count, 0)) DESC,
              COALESCE(fx.yellow_count, 0) DESC,
              l.name ASC
  `;

  return db.prepare(sql).all({ start, end, ...locScope.params }) as LocationRow[];
}

export function getOverallCounts(
  scope: LocationScope,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): OverallCounts {
  const rows = getLocationAggregates(scope, start, end, {}, db);
  const red = rows.reduce((a, r) => a + r.red_content + r.missing_count, 0);
  const yellow = rows.reduce((a, r) => a + r.yellow_count, 0);
  const missing = rows.reduce((a, r) => a + r.missing_count, 0);
  const total_submitted = rows.reduce((a, r) => a + r.submitted_not_red, 0);
  // Expected over window: we derive from actual shift_schedule rows × days-in-window.
  // expected_shifts from the query is "shifts per day pattern" across locations.
  // This is imprecise vs. the exact per-day expansion — acceptable for tile-level.
  const daysInWindow = Math.max(1, daysBetween(start, end));
  const total_expected = rows.reduce((a, r) => a + r.expected_shifts, 0) * daysInWindow;
  // A more correct compliance computation is getComplianceScore() in compliance-score.ts;
  // for the overall tile we sum expected × window and divide.
  const compliance_pct = total_expected === 0 ? 100 : (total_submitted / total_expected) * 100;
  return {
    red,
    yellow,
    missing,
    compliance_pct: clampPct(compliance_pct),
    total_submitted,
    total_expected,
  };
}

function daysBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return Math.floor((e - s) / (24 * 3600 * 1000)) + 1;
}

/**
 * Returns the [priorStart, priorEnd] pair of dates that is "the same length
 * immediately before" [start, end]. Used for WoW delta computation on the
 * hero tiles.
 */
export function priorWindow(start: string, end: string): { start: string; end: string } {
  const days = daysBetween(start, end);
  const dayMs = 24 * 3600 * 1000;
  const startMs = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const priorEnd = new Date(startMs - dayMs).toISOString().slice(0, 10);
  const priorStart = new Date(startMs - days * dayMs).toISOString().slice(0, 10);
  return { start: priorStart, end: priorEnd };
}

/** Like `getOverallCounts` but also returns counts for the equal-length prior window. */
export function getOverallCountsWithPrior(
  scope: LocationScope,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): OverallCountsWithPrior {
  const current = getOverallCounts(scope, start, end, db);
  const pw = priorWindow(start, end);
  const prior = getOverallCounts(scope, pw.start, pw.end, db);
  return { ...current, prior };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
