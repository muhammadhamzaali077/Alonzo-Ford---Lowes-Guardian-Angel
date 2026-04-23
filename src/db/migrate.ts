import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from './client.js';
import { logger } from '../lib/logger.js';

const CURRENT_SCHEMA_VERSION = 4; // v4: Phase 14 Tier 3 added flag_feedback + app_settings (idempotent via IF NOT EXISTS)

/**
 * Apply any missing schema versions to the DB. Idempotent.
 *
 * v1: the full schema from src/db/schema.sql (all tables + indexes).
 * Future versions would add `case 2:` branches that alter from v1.
 */
export function migrate(db: BetterSqliteDatabase = getDb()): void {
  ensureSchemaVersionsTable(db);
  const applied = currentVersion(db);
  if (applied >= CURRENT_SCHEMA_VERSION) {
    logger.info({ version: applied }, 'db schema up to date');
    return;
  }

  const sql = readSchemaSql();
  const txn = db.transaction(() => {
    db.exec(sql);
    for (let v = applied + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      db.prepare('INSERT OR IGNORE INTO schema_versions (version) VALUES (?)').run(v);
    }
  });
  txn();

  logger.info({ from: applied, to: CURRENT_SCHEMA_VERSION }, 'db schema migrated');
}

function ensureSchemaVersionsTable(db: BetterSqliteDatabase): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
}

function currentVersion(db: BetterSqliteDatabase): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_versions').get() as { v: number | null };
  return row.v ?? 0;
}

function readSchemaSql(): string {
  // Resolve src/db/schema.sql relative to this module (works under tsx and under compiled dist/).
  const here = dirname(fileURLToPath(import.meta.url));
  // Under `tsx`, __dirname resolves to src/db. Under compiled `dist/db`, same structure.
  // schema.sql is shipped alongside the compiled JS (we copy it at build time, see below).
  // In dev tsx mode the source file is directly here.
  const candidates = [
    resolve(here, 'schema.sql'),
    resolve(here, '../../src/db/schema.sql'),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      // try next
    }
  }
  throw new Error(`Could not locate schema.sql in: ${candidates.join(', ')}`);
}
