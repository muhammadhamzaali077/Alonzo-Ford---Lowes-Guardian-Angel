import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { computeAndPersistSimilarity } from '../flagging/similarity.js';
import type { TLogInsertShape } from './normalize.js';

export type InsertTlogAction = 'inserted' | 'superseded' | 'noop';

export interface InsertTlogResult {
  action: InsertTlogAction;
  tlog_id: string;
  version: number;
}

const INSERT_SQL = `
  INSERT INTO t_logs (
    tlog_id, version, is_current,
    individual_id, program_id, created_by_id, manager_id,
    reported_date, reported_time, time_in, time_out,
    shift_name, notification_level, type, summary, description,
    status, acknowledged, classifier_status
  ) VALUES (
    @tlog_id, @version, 1,
    @individual_id, @program_id, @created_by_id, @manager_id,
    @reported_date, @reported_time, @time_in, @time_out,
    @shift_name, @notification_level, @type, @summary, @description,
    @status, @acknowledged, 'pending'
  )
`;

/**
 * Idempotent upsert for T-Logs with Therap supersession semantics.
 *
 *   new tlog_id                                   → insert version=1, is_current=1, classifier_status=pending
 *   existing + identical description              → noop (no new row)
 *   existing + different description              → supersede:
 *                                                    flip prior row's is_current=0, superseded_at=now,
 *                                                    insert new row with version = prev + 1
 *
 * Wrapped in a transaction so the `is_current` unique partial index never sees a
 * torn state.
 */
export function insertTlog(
  row: TLogInsertShape,
  db: BetterSqliteDatabase = getDb(),
): InsertTlogResult {
  const txn = db.transaction((): InsertTlogResult => {
    const existing = db
      .prepare(
        'SELECT version, description FROM t_logs WHERE tlog_id = ? AND is_current = 1',
      )
      .get(row.tlog_id) as { version: number; description: string } | undefined;

    if (!existing) {
      db.prepare(INSERT_SQL).run({ ...row, version: 1 });
      return { action: 'inserted', tlog_id: row.tlog_id, version: 1 };
    }

    if (existing.description === row.description) {
      return { action: 'noop', tlog_id: row.tlog_id, version: existing.version };
    }

    db.prepare(
      "UPDATE t_logs SET is_current = 0, superseded_at = datetime('now') WHERE tlog_id = ? AND version = ?",
    ).run(row.tlog_id, existing.version);

    const nextVersion = existing.version + 1;
    db.prepare(INSERT_SQL).run({ ...row, version: nextVersion });
    return { action: 'superseded', tlog_id: row.tlog_id, version: nextVersion };
  });

  const result = txn();

  // Phase 3.5 similarity pre-pass — runs outside the insert transaction so the
  // new row is visible to the prior-notes query (UPDATEs from the pass still hit
  // the DB atomically via computeAndPersistSimilarity's internal UPDATE).
  // No-op when the insert was a noop (similarity already persisted on prior version).
  if (result.action !== 'noop') {
    computeAndPersistSimilarity(result.tlog_id, result.version, db);
  }

  return result;
}
