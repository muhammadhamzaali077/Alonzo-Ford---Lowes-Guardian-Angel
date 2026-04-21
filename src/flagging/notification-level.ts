import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { writeFlag } from './write-flag.js';

export interface DetectNotificationLevelResult {
  scanned: number;
  red: number;
  yellow: number;
  skipped_existing: number;
}

/**
 * Scan current T-Logs and write deterministic flags based on Therap's
 * notification_level field. Idempotent — a T-Log already flagged with
 * source='notification_level' is skipped.
 *
 *   High   → red    + display_category='high_priority'
 *   Medium → yellow + display_category='medium_priority'
 *   Low    → no flag
 *
 * This is pass #2 of the Phase-5 pipeline (after missing-note, before similarity
 * + AI). Invoking it standalone is fine — ordering is enforced at the pipeline
 * level, not here.
 */
export function detectNotificationLevelFlags(
  db: BetterSqliteDatabase = getDb(),
): DetectNotificationLevelResult {
  const rows = db
    .prepare(
      `SELECT tlog_id, version, individual_id, program_id AS location_id, created_by_id, manager_id,
              notification_level, type
         FROM t_logs
        WHERE is_current = 1 AND notification_level IN ('High','Medium')`,
    )
    .all() as Array<{
    tlog_id: string;
    version: number;
    individual_id: string;
    location_id: string;
    created_by_id: string | null;
    manager_id: string | null;
    notification_level: 'High' | 'Medium';
    type: string;
  }>;

  const existing = new Set(
    (db
      .prepare("SELECT tlog_id || ':' || tlog_version AS k FROM flags WHERE source = 'notification_level'")
      .all() as Array<{ k: string }>).map((r) => r.k),
  );

  const result: DetectNotificationLevelResult = { scanned: rows.length, red: 0, yellow: 0, skipped_existing: 0 };

  const txn = db.transaction(() => {
    for (const row of rows) {
      const key = `${row.tlog_id}:${row.version}`;
      if (existing.has(key)) {
        result.skipped_existing++;
        continue;
      }

      const severity = row.notification_level === 'High' ? 'red' : 'yellow';
      const display_category = row.notification_level === 'High' ? 'high_priority' : 'medium_priority';
      const reason =
        row.notification_level === 'High'
          ? `Therap notification level: High (${row.type}).`
          : `Therap notification level: Medium (${row.type}).`;

      writeFlag(
        {
          tlog_id: row.tlog_id,
          tlog_version: row.version,
          individual_id: row.individual_id,
          location_id: row.location_id,
          manager_id: row.manager_id ?? null,
          angel_id: row.created_by_id ?? null,
          severity,
          source: 'notification_level',
          display_category,
          reason,
        },
        db,
      );
      if (severity === 'red') result.red++;
      else result.yellow++;
    }
  });
  txn();

  return result;
}
