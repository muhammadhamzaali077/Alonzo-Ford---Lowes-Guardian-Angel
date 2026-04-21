import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

/**
 * Max(ingested_at) across current T-Logs — drives the "Data current as of ..."
 * bar in the layout. Returns null on an empty DB.
 */
export function getLastIngestedAt(db: BetterSqliteDatabase = getDb()): string | null {
  const row = db
    .prepare('SELECT MAX(ingested_at) AS t FROM t_logs WHERE is_current = 1')
    .get() as { t: string | null };
  return row.t;
}

/**
 * Anchor date for "Last N days" windows — latest reported_date in the fixture.
 * Defaults to wall-clock today when the DB has no T-Logs. Per UI/UX decision
 * #5 (option a): default windows are anchored to max(reported_date), not today.
 */
export function getAnchorDate(db: BetterSqliteDatabase = getDb()): string {
  const row = db
    .prepare('SELECT MAX(reported_date) AS d FROM t_logs WHERE is_current = 1')
    .get() as { d: string | null };
  return row.d ?? new Date().toISOString().slice(0, 10);
}
