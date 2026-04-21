// Reference-count helpers for soft-delete confirmation warnings.
// "This angel has 47 notes. Deactivating will mark the angel as inactive;
// the notes stay."
// Per constitution P6 (immutability): deletes NEVER purge t_logs or flags.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export function countTlogsByAngel(angelId: string, db: BetterSqliteDatabase = getDb()): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM t_logs WHERE is_current = 1 AND created_by_id = ?')
    .get(angelId) as { n: number }).n;
}

export function countTlogsByIndividual(individualId: string, db: BetterSqliteDatabase = getDb()): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM t_logs WHERE is_current = 1 AND individual_id = ?')
    .get(individualId) as { n: number }).n;
}

export function countTlogsAtLocation(locationId: string, db: BetterSqliteDatabase = getDb()): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM t_logs WHERE is_current = 1 AND program_id = ?')
    .get(locationId) as { n: number }).n;
}

export function countAngelsAtLocation(locationId: string, db: BetterSqliteDatabase = getDb()): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM angels WHERE deleted_at IS NULL AND location_id = ?')
    .get(locationId) as { n: number }).n;
}

export function countIndividualsAtLocation(locationId: string, db: BetterSqliteDatabase = getDb()): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM individuals WHERE deleted_at IS NULL AND location_id = ?')
    .get(locationId) as { n: number }).n;
}

export function countLocationsForManager(managerId: string, db: BetterSqliteDatabase = getDb()): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM locations WHERE deleted_at IS NULL AND manager_id = ?')
    .get(managerId) as { n: number }).n;
}
