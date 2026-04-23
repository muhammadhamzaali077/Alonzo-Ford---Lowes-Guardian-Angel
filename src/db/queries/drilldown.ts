// Drill-down aggregates: per-angel counts within a location, per-individual
// counts within a location+angel, and the list of flagged notes for a triple.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export interface AngelAggregateRow {
  angel_id: string;
  angel_name: string;
  angel_role: 'DSP' | 'Nurse' | 'Manager';
  red_content: number;
  yellow_count: number;
  missing_count: number;
}

export function getAngelAggregatesForLocation(
  locationId: string,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): AngelAggregateRow[] {
  // Show every angel assigned to this location, with flag counts from any
  // flag attributed to them (content flag on a note they authored in window,
  // or a missing-note flag with angel_on_duty_id = them). Angels with no
  // flags in window still appear — "Green — No flags" rollup signals health.
  return db
    .prepare(
      `SELECT a.id AS angel_id, a.name AS angel_name, a.role AS angel_role,
              COALESCE(fx.red_content, 0) AS red_content,
              COALESCE(fx.yellow_count, 0) AS yellow_count,
              COALESCE(fx.missing_count, 0) AS missing_count
         FROM angels a
         LEFT JOIN (
           SELECT f.angel_id,
                  SUM(CASE WHEN f.severity='red' AND f.source<>'missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS red_content,
                  SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) AS yellow_count,
                  SUM(CASE WHEN f.source='missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS missing_count
             FROM flags f
             LEFT JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
            WHERE f.location_id = @locationId
              AND f.resolution = 'open'
              AND COALESCE(f.scheduled_shift_date, t.reported_date) BETWEEN @start AND @end
            GROUP BY f.angel_id
         ) fx ON fx.angel_id = a.id
        WHERE a.location_id = @locationId
          AND a.deleted_at IS NULL
        ORDER BY (COALESCE(fx.red_content, 0) + COALESCE(fx.missing_count, 0)) DESC,
                 COALESCE(fx.yellow_count, 0) DESC,
                 a.name ASC`,
    )
    .all({ locationId, start, end }) as AngelAggregateRow[];
}

export interface IndividualAggregateRow {
  individual_id: string;
  individual_name: string;
  red_content: number;
  yellow_count: number;
  missing_count: number;
}

export function getIndividualAggregatesForAngel(
  locationId: string,
  angelId: string,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): IndividualAggregateRow[] {
  // Start from t_logs this angel authored at this location in the window, join
  // per-T-Log flag aggregates. One row per distinct individual written for.
  return db
    .prepare(
      `SELECT i.id AS individual_id, i.name AS individual_name,
              SUM(CASE WHEN f.severity='red' AND f.source<>'missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS red_content,
              SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) AS yellow_count,
              SUM(CASE WHEN f.source='missing_schedule' AND f.resolution='open' THEN 1 ELSE 0 END) AS missing_count
         FROM t_logs t
         JOIN individuals i ON i.id = t.individual_id
         LEFT JOIN flags f ON f.tlog_id = t.tlog_id AND f.tlog_version = t.version
        WHERE t.is_current = 1
          AND t.program_id = @locationId
          AND t.created_by_id = @angelId
          AND t.reported_date BETWEEN @start AND @end
          AND i.deleted_at IS NULL
        GROUP BY i.id, i.name
        ORDER BY (COALESCE(red_content,0)+COALESCE(missing_count,0)) DESC,
                 COALESCE(yellow_count,0) DESC,
                 i.name ASC`,
    )
    .all({ locationId, angelId, start, end }) as IndividualAggregateRow[];
}

export interface FlaggedNoteRow {
  tlog_id: string;
  tlog_version: number | null;
  reported_date: string | null;
  shift_name: string | null;
  scheduled_shift_date: string | null;
  scheduled_shift_name: string | null;
  severity: 'red' | 'yellow';
  source: 'notification_level' | 'missing_schedule' | 'ai_classifier';
  display_category: string;
  reason: string;
  similarity_score: number | null;
}

export function getFlagsForDrilldown(
  locationId: string,
  angelId: string,
  individualId: string,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): FlaggedNoteRow[] {
  return db
    .prepare(
      `SELECT f.tlog_id, f.tlog_version,
              t.reported_date, t.shift_name, t.similarity_score,
              f.scheduled_shift_date, f.scheduled_shift_name,
              f.severity, f.source, f.display_category, f.reason
         FROM flags f
         LEFT JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
        WHERE f.location_id = @locationId
          AND (f.angel_id = @angelId OR (f.source = 'missing_schedule' AND f.angel_id IS NULL))
          AND f.individual_id = @individualId
          AND f.resolution = 'open'
          AND COALESCE(f.scheduled_shift_date, t.reported_date) BETWEEN @start AND @end
        ORDER BY COALESCE(f.scheduled_shift_date, t.reported_date) DESC, f.id DESC`,
    )
    .all({ locationId, angelId, individualId, start, end }) as FlaggedNoteRow[];
}

export interface MissingFlagRow {
  individual_id: string;
  individual_name: string;
  scheduled_shift_date: string;
  scheduled_shift_name: string;
  reason: string;
}

/**
 * Missing-note flags for a location, used by the location-drill-down page's
 * "Missing notes" section. These flags never carry an `angel_id` (there is
 * no shift author when no note was written), so they don't surface in the
 * per-angel aggregate rollup. Surfaced here so managers can see which
 * date/individual/shift has no submitted documentation.
 */
export function getMissingFlagsForLocation(
  locationId: string,
  start: string,
  end: string,
  db: BetterSqliteDatabase = getDb(),
): MissingFlagRow[] {
  return db
    .prepare(
      `SELECT f.individual_id,
              i.name AS individual_name,
              f.scheduled_shift_date,
              f.scheduled_shift_name,
              f.reason
         FROM flags f
         JOIN individuals i ON i.id = f.individual_id
        WHERE f.location_id = @locationId
          AND f.source = 'missing_schedule'
          AND f.resolution = 'open'
          AND f.scheduled_shift_date BETWEEN @start AND @end
          AND i.deleted_at IS NULL
        ORDER BY f.scheduled_shift_date DESC, i.name ASC`,
    )
    .all({ locationId, start, end }) as MissingFlagRow[];
}

// -------------------------------------------------------------------------------------------------
// Simple name lookups (avoids separate joins in view code)
// -------------------------------------------------------------------------------------------------

export function getLocationMeta(
  id: string,
  db: BetterSqliteDatabase = getDb(),
): { id: string; name: string; type: string } | null {
  const row = db
    .prepare('SELECT id, name, type FROM locations WHERE id = ? AND deleted_at IS NULL')
    .get(id) as { id: string; name: string; type: string } | undefined;
  return row ?? null;
}

export function getAngelMeta(
  id: string,
  db: BetterSqliteDatabase = getDb(),
): { id: string; name: string; role: string } | null {
  const row = db
    .prepare('SELECT id, name, role FROM angels WHERE id = ? AND deleted_at IS NULL')
    .get(id) as { id: string; name: string; role: string } | undefined;
  return row ?? null;
}

export function getIndividualMeta(
  id: string,
  db: BetterSqliteDatabase = getDb(),
): { id: string; name: string } | null {
  const row = db
    .prepare('SELECT id, name FROM individuals WHERE id = ? AND deleted_at IS NULL')
    .get(id) as { id: string; name: string } | undefined;
  return row ?? null;
}
