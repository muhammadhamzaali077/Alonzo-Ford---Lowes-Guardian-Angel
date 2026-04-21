import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { config } from '../config.js';

let instance: BetterSqliteDatabase | undefined;

/**
 * Returns the singleton better-sqlite3 connection. Created on first call;
 * subsequent calls return the same instance.
 *
 * Behaviors applied on first open:
 *   - WAL mode (concurrent readers during writes)
 *   - foreign_keys = ON (REFERENCES clauses enforced)
 *   - busy_timeout = 5s
 */
export function getDb(): BetterSqliteDatabase {
  if (instance) return instance;
  instance = new Database(config.DATABASE_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('busy_timeout = 5000');
  return instance;
}

/** Test helper — returns a fresh in-memory DB. Never used at runtime. */
export function createInMemoryDb(): BetterSqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Closes the singleton (used at process shutdown or in tests). */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = undefined;
  }
}
