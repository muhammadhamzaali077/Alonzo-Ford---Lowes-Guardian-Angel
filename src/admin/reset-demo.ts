// T126 — Reset Demo Data. Wipes all prototype data and re-runs seedAll().
//
// Preserves:
//   - users, user_sessions (otherwise the caller's own login would vanish)
//   - schema_versions (migration bookkeeping)
//
// Gated on PROTOTYPE_MODE=true at the route layer — this function is a
// destructive admin action and MUST NOT ship to production without a
// stronger gate (and probably a different name). Keep it here so the demo
// path is one click away but the production path never touches it.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { seedAll, type SeedCounts } from '../jobs/seed.js';
import { logger } from '../lib/logger.js';

// Order matters: child tables first so FK constraints don't fail mid-wipe.
// user_location_scope is a "child" of both users and locations; we wipe it
// before locations go, then let seedUsers re-insert it.
const WIPE_ORDER = [
  'flag_feedback',
  'flags',
  'classifier_usage',
  'ops_notices',
  't_logs',
  'shift_schedule',
  'user_location_scope',
  'digest_recipients',
  'individuals',
  'angels',
  'locations',
  'managers',
  'rule_config',
] as const;

export function resetDemoData(db: BetterSqliteDatabase = getDb()): SeedCounts {
  logger.info({ tables: WIPE_ORDER.length }, 'reset demo data: wiping');
  const wipe = db.transaction(() => {
    for (const table of WIPE_ORDER) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });
  wipe();

  // seedAll re-applies migrations + re-seeds everything idempotently. Users
  // and sessions weren't touched, so the caller stays logged in.
  const counts = seedAll();
  logger.info({ counts }, 'reset demo data: reseed complete');
  return counts;
}
