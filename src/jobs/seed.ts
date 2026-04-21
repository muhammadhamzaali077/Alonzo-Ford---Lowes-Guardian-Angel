/**
 * npm run seed
 *
 * Idempotent bootstrap:
 *   1. apply DB schema migrations
 *   2. load org structure from fixtures (locations, angels, individuals, managers)
 *   3. seed shift schedules per location type
 *   4. load 648 T-Log rows from the synthetic fixture
 *
 * Later phases extend this with: default rules, flagging pipeline, demo users,
 * digest recipients, user_location_scope seeding (Anthony King pattern).
 */

import { pathToFileURL } from 'node:url';
import { migrate } from '../db/migrate.js';
import { loadOrgStructure } from '../ingestion/org-csv-loader.js';
import { seedShiftSchedules } from '../db/seed-schedules.js';
import { loadTlogsFromFixture } from '../ingestion/tlog-csv-loader.js';
import { backfillSimilarity } from '../flagging/similarity.js';
import { seedDefaultRules } from '../rules/seed-rules.js';
import { seedUsers } from './seed-users.js';
import { closeDb, getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';

export interface SeedCounts {
  locations: number;
  angels: number;
  individuals: number;
  managers: number;
  shift_schedule: number;
  t_logs: number;
  rule_config_active: number;
  users: number;
}

function countRows(): SeedCounts {
  const db = getDb();
  return {
    locations:          (db.prepare('SELECT COUNT(*) AS c FROM locations').get()      as { c: number }).c,
    angels:             (db.prepare('SELECT COUNT(*) AS c FROM angels').get()         as { c: number }).c,
    individuals:        (db.prepare('SELECT COUNT(*) AS c FROM individuals').get()    as { c: number }).c,
    managers:           (db.prepare('SELECT COUNT(*) AS c FROM managers').get()       as { c: number }).c,
    shift_schedule:     (db.prepare('SELECT COUNT(*) AS c FROM shift_schedule').get() as { c: number }).c,
    t_logs:             (db.prepare('SELECT COUNT(*) AS c FROM t_logs WHERE is_current = 1').get() as { c: number }).c,
    rule_config_active: (db.prepare('SELECT COUNT(*) AS c FROM rule_config WHERE is_active = 1').get() as { c: number }).c,
    users:              (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c,
  };
}

/** Run the full seed sequence regardless of current DB state. Each step is idempotent. */
export function seedAll(): SeedCounts {
  migrate();
  seedDefaultRules();
  loadOrgStructure();
  seedShiftSchedules();
  seedUsers(); // requires locations to exist (FK on user_location_scope)
  loadTlogsFromFixture();
  // Backfill similarity for any rows that lack a score (e.g., rows inserted
  // before the Phase 3.5 inline hook landed). New rows get scored inline via
  // insertTlog, so this is usually a no-op.
  backfillSimilarity();
  return countRows();
}

/**
 * Seed only when the DB has no current T-Logs. Used at server boot in prototype mode
 * to auto-populate a brand-new deployment without requiring the operator to run
 * `npm run seed` as a separate step (spec FR-001).
 *
 * Returns true if seeding ran, false if the DB already had data.
 */
export function seedIfEmpty(): boolean {
  migrate();
  const count = (getDb().prepare('SELECT COUNT(*) AS c FROM t_logs').get() as { c: number }).c;
  if (count > 0) return false;
  seedDefaultRules();
  loadOrgStructure();
  seedShiftSchedules();
  seedUsers();
  loadTlogsFromFixture();
  backfillSimilarity();
  return true;
}

// CLI entry — only executed when the module is the top-level entrypoint.
const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === cliEntry) {
  try {
    logger.info('seed: starting');
    const counts = seedAll();
    logger.info({ counts }, 'seed: complete');
  } catch (err) {
    logger.error({ err: String(err) }, 'seed: failed');
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}
