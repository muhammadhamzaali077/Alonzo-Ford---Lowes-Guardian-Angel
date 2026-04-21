import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type OpsNoticeCategory =
  | 'digest_suppressed'
  | 'classifier_permanent_failure'
  | 'ingestion_gap'
  | 'sftp_failure'
  | 'upload_partial';

export interface OpsNotice {
  id: number;
  created_at: string;
  category: OpsNoticeCategory;
  message: string;
  context_json: string | null;
}

export function listOpsNotices(
  opts: { limit?: number; category?: OpsNoticeCategory } = {},
  db: BetterSqliteDatabase = getDb(),
): OpsNotice[] {
  const limit = opts.limit ?? 50;
  if (opts.category) {
    return db
      .prepare(
        `SELECT * FROM ops_notices WHERE category = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.category, limit) as OpsNotice[];
  }
  return db
    .prepare('SELECT * FROM ops_notices ORDER BY created_at DESC LIMIT ?')
    .all(limit) as OpsNotice[];
}
