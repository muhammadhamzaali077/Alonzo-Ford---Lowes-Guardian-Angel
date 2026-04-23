// Home-page log stream — recent T-Logs with their current severity signal.
//
// Per REQ-2 (Batch 1.6 enrichment): the home page's primary scroll surface
// is a dense stream of the most recent T-Log entries. Unflagged rows still
// appear (with severity "green") so the stream reads as "work happening,"
// not "only the bad stuff." Filters applied on the dashboard cascade in —
// severity and shift are honored; the window (date range) is respected via
// `start`/`end`. Scope (location / manager) is applied by the caller via
// the `scopedLocationIds` array, same pattern as other queries in here.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type LogStreamSeverity = 'red' | 'yellow' | 'green';

export interface LogStreamRow {
  tlog_id: string;
  tlog_version: number;
  reported_date: string;
  reported_time: string | null;
  shift_name: string;
  angel_id: string | null;
  angel_name: string | null;
  individual_id: string;
  individual_name: string;
  location_id: string;
  location_name: string;
  severity: LogStreamSeverity;
  /**
   * Highest-precedence flag source for this note, if any. Maps to
   * flags.display_category values. NULL for unflagged (green) notes.
   */
  display_category: string | null;
  /** Short preview of the note body — first ~200 chars pre-truncation. */
  note_preview: string;
  ingested_at: string;
}

export interface LogStreamFilters {
  /** One of 'all' | 'red' | 'yellow' | 'missing' | 'clean'. */
  severity?: string;
  /** One of 'all' | 'Day' | 'Swing' | 'Overnight'. */
  shift?: string;
}

export interface LogStreamParams {
  start: string;               // inclusive YYYY-MM-DD
  end: string;                 // inclusive YYYY-MM-DD
  limit: number;               // page size (T-Logs)
  offset: number;              // for "Show more" pagination
  filters?: LogStreamFilters;
  /** Optional scope — if provided, only T-Logs for these locations return. */
  scopedLocationIds?: readonly string[];
}

export interface LogStreamPage {
  rows: LogStreamRow[];
  total: number;
}

/**
 * Return one page of log-stream rows and the total count of rows matching
 * the current filter (used by the "Showing X of Y" counter and to decide
 * whether to render the "Show more" button).
 */
export function getRecentLogRows(
  params: LogStreamParams,
  db: BetterSqliteDatabase = getDb(),
): LogStreamPage {
  const { start, end, limit, offset, filters = {}, scopedLocationIds } = params;

  // Scope clause: empty scopedLocationIds → leadership ("all locations");
  // a single-element array → one location's feed; etc. A zero-length
  // explicit array (when the caller has computed scope but has no
  // locations to show) should return nothing rather than everything.
  const hasScope = Array.isArray(scopedLocationIds);
  const scopePlaceholders = hasScope
    ? scopedLocationIds!.map((_, i) => `@loc${i}`).join(', ')
    : '';
  const scopeClause = hasScope
    ? scopedLocationIds!.length > 0
      ? `AND t.program_id IN (${scopePlaceholders})`
      : 'AND 1 = 0'
    : '';

  // Severity filter: applies to the derived per-note severity. The CASE
  // expression below picks the highest-precedence flag per note (red >
  // yellow > green), so the outer HAVING filter reads naturally.
  let severityFilterClause = '';
  const sevFilter = filters.severity ?? 'all';
  if (sevFilter === 'red') {
    severityFilterClause = 'AND derived_severity = \'red\'';
  } else if (sevFilter === 'yellow') {
    severityFilterClause = 'AND derived_severity = \'yellow\'';
  } else if (sevFilter === 'missing') {
    severityFilterClause = 'AND display_category = \'missing_note\'';
  } else if (sevFilter === 'clean') {
    severityFilterClause = 'AND derived_severity = \'green\'';
  }

  // Shift filter: applies to t.shift_name directly.
  const shiftFilter = filters.shift ?? 'all';
  const shiftClause =
    shiftFilter !== 'all' ? 'AND t.shift_name = @shiftFilter' : '';

  // The main query projects one row per current T-Log. We LEFT JOIN flags
  // and pick the worst severity (red > yellow > none) via a correlated
  // subselect. Sorting by reported_date DESC, reported_time DESC —
  // newest-first — matches the "live feed" framing.
  const sql = `
    SELECT
      t.tlog_id,
      t.version AS tlog_version,
      t.reported_date,
      t.reported_time,
      t.shift_name,
      t.created_by_id AS angel_id,
      a.name AS angel_name,
      t.individual_id,
      i.name AS individual_name,
      t.program_id AS location_id,
      l.name AS location_name,
      COALESCE(
        (SELECT CASE
                  WHEN SUM(CASE WHEN f.severity='red' AND f.resolution='open' THEN 1 ELSE 0 END) > 0 THEN 'red'
                  WHEN SUM(CASE WHEN f.severity='yellow' AND f.resolution='open' THEN 1 ELSE 0 END) > 0 THEN 'yellow'
                  ELSE 'green'
                END
           FROM flags f
          WHERE f.tlog_id = t.tlog_id AND f.tlog_version = t.version),
        'green'
      ) AS derived_severity,
      (SELECT f.display_category
         FROM flags f
        WHERE f.tlog_id = t.tlog_id AND f.tlog_version = t.version AND f.resolution = 'open'
        ORDER BY CASE f.severity WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END
        LIMIT 1
      ) AS display_category,
      SUBSTR(t.description, 1, 200) AS note_preview,
      t.ingested_at
    FROM t_logs t
    JOIN individuals i ON i.id = t.individual_id
    JOIN locations l ON l.id = t.program_id
    LEFT JOIN angels a ON a.id = t.created_by_id
    WHERE t.is_current = 1
      AND t.reported_date BETWEEN @start AND @end
      ${scopeClause}
      ${shiftClause}
  `;

  const filteredSql = `
    SELECT * FROM (${sql}) AS inner
    WHERE 1 = 1
    ${severityFilterClause}
    ORDER BY reported_date DESC, COALESCE(reported_time, '23:59') DESC, ingested_at DESC
    LIMIT @limit OFFSET @offset
  `;

  const countSql = `
    SELECT COUNT(*) AS n FROM (${sql}) AS inner
    WHERE 1 = 1 ${severityFilterClause}
  `;

  const bindings: Record<string, unknown> = {
    start,
    end,
    limit,
    offset,
    shiftFilter,
  };
  if (hasScope) {
    scopedLocationIds!.forEach((id, i) => {
      bindings[`loc${i}`] = id;
    });
  }

  const rows = db.prepare(filteredSql).all(bindings) as LogStreamRow[];
  const { n } = db.prepare(countSql).get(bindings) as { n: number };
  return { rows, total: n };
}
