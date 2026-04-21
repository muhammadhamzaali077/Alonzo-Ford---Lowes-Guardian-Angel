// Queries that power the weekly digest. Scope is either 'all' or a specific
// location_id — matches DigestRecipient.scope.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type DigestScope = 'all' | string;

function scopeClause(scope: DigestScope): { sql: string; params: Record<string, string> } {
  if (scope === 'all') return { sql: '1=1', params: {} };
  return { sql: 'f.location_id = @scope', params: { scope } };
}

export interface FlagCounts {
  red: number;      // content red (excludes missing)
  yellow: number;
  missing: number;
  submitted_not_red: number;
  expected: number;
  compliance_pct: number;
}

export function getDigestCounts(
  scope: DigestScope,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): FlagCounts {
  const sc = scopeClause(scope);
  const scopeTlogs = scope === 'all' ? '1=1' : 't.program_id = @scope';
  const scopeSchedule = scope === 'all' ? '1=1' : 'i.location_id = @scope';

  const flagRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN f.severity='red' AND f.source<>'missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS red,
         SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) AS yellow,
         SUM(CASE WHEN f.source='missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS missing
       FROM flags f
       LEFT JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
       WHERE ${sc.sql}
         AND COALESCE(f.scheduled_shift_date, t.reported_date) BETWEEN @start AND @end`,
    )
    .get({ ...sc.params, start, end }) as { red: number | null; yellow: number | null; missing: number | null };

  const submitted = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM t_logs t
        WHERE t.is_current = 1 AND ${scopeTlogs}
          AND t.reported_date BETWEEN @start AND @end
          AND NOT EXISTS (
            SELECT 1 FROM flags f2
             WHERE f2.tlog_id = t.tlog_id AND f2.tlog_version = t.version
               AND f2.severity = 'red' AND f2.resolution = 'open'
          )`,
    )
    .get({ ...sc.params, start, end }) as { n: number }).n;

  // Approximate expected per day with shift_schedule rows in scope
  const shiftsPerDay = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM shift_schedule s
         JOIN individuals i ON i.id = s.individual_id
        WHERE i.deleted_at IS NULL AND ${scopeSchedule}
          AND s.active_from <= @end AND (s.active_to IS NULL OR s.active_to >= @start)`,
    )
    .get({ ...sc.params, start, end }) as { n: number }).n;

  const days = daysBetween(start, end);
  const expected = shiftsPerDay * days;
  const pct = expected === 0 ? 100 : Math.min(100, Math.max(0, (submitted / expected) * 100));

  return {
    red:      flagRow.red ?? 0,
    yellow:   flagRow.yellow ?? 0,
    missing:  flagRow.missing ?? 0,
    submitted_not_red: submitted,
    expected,
    compliance_pct: pct,
  };
}

export interface TopLocation {
  location_id: string;
  location_name: string;
  red: number;
  yellow: number;
  missing: number;
}

export function getTopLocations(
  scope: DigestScope,
  start: string,
  end: string,
  limit: number = 3,
  db: BetterSqliteDatabase = getDb(),
): TopLocation[] {
  // Only meaningful for scope='all' — per-location scope has a single location.
  if (scope !== 'all') return [];
  return db
    .prepare(
      `SELECT l.id AS location_id, l.name AS location_name,
              SUM(CASE WHEN f.severity='red' AND f.source<>'missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS red,
              SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) AS yellow,
              SUM(CASE WHEN f.source='missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS missing
         FROM locations l
         LEFT JOIN flags f ON f.location_id = l.id AND f.resolution = 'open'
         LEFT JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
        WHERE l.deleted_at IS NULL
          AND (f.id IS NULL OR COALESCE(f.scheduled_shift_date, t.reported_date) BETWEEN @start AND @end)
        GROUP BY l.id, l.name
       HAVING (red + missing + yellow) > 0
        ORDER BY (red + missing) DESC, yellow DESC
        LIMIT @limit`,
    )
    .all({ start, end, limit }) as TopLocation[];
}

export interface TopAngel {
  angel_id: string;
  angel_name: string;
  location_id: string;
  location_name: string;
  red: number;
  yellow: number;
  missing: number;
}

export function getTopAngels(
  scope: DigestScope,
  start: string,
  end: string,
  limit: number = 5,
  db: BetterSqliteDatabase = getDb(),
): TopAngel[] {
  const sc = scopeClause(scope);
  return db
    .prepare(
      `SELECT a.id AS angel_id, a.name AS angel_name,
              l.id AS location_id, l.name AS location_name,
              SUM(CASE WHEN f.severity='red' AND f.source<>'missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS red,
              SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) AS yellow,
              SUM(CASE WHEN f.source='missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS missing
         FROM flags f
         JOIN angels a ON a.id = f.angel_id
         JOIN locations l ON l.id = f.location_id
         LEFT JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
        WHERE ${sc.sql}
          AND f.resolution = 'open'
          AND COALESCE(f.scheduled_shift_date, t.reported_date) BETWEEN @start AND @end
        GROUP BY a.id, a.name, l.id, l.name
        ORDER BY (red + missing) DESC, yellow DESC
        LIMIT @limit`,
    )
    .all({ ...sc.params, start, end, limit }) as TopAngel[];
}

export interface MissingByIndividual {
  individual_id: string;
  individual_name: string;
  location_id: string;
  location_name: string;
  scheduled_shift_date: string;
  scheduled_shift_name: string;
}

export function getMissingNotesList(
  scope: DigestScope,
  start: string,
  end: string,
  limit: number = 10,
  db: BetterSqliteDatabase = getDb(),
): MissingByIndividual[] {
  const sc = scopeClause(scope);
  return db
    .prepare(
      `SELECT i.id AS individual_id, i.name AS individual_name,
              l.id AS location_id, l.name AS location_name,
              f.scheduled_shift_date, f.scheduled_shift_name
         FROM flags f
         JOIN individuals i ON i.id = f.individual_id
         JOIN locations l ON l.id = f.location_id
        WHERE f.source = 'missing_schedule'
          AND f.resolution = 'open'
          AND ${sc.sql}
          AND f.scheduled_shift_date BETWEEN @start AND @end
        ORDER BY f.scheduled_shift_date DESC
        LIMIT @limit`,
    )
    .all({ ...sc.params, start, end, limit }) as MissingByIndividual[];
}

function daysBetween(start: string, end: string): number {
  const s = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)));
  const e = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
  return Math.floor((e - s) / (24 * 3600 * 1000)) + 1;
}
