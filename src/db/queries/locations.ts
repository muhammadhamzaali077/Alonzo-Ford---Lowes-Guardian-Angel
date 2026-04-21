import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type LocationType = 'group_home' | 'host_home' | 'day_program';

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocationInput {
  id: string;
  name: string;
  type: LocationType;
  manager_id?: string | null;
}

export function listLocations(opts: { includeDeleted?: boolean } = {}, db: BetterSqliteDatabase = getDb()): Location[] {
  const where = opts.includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT * FROM locations ${where} ORDER BY name`).all() as Location[];
}

export function getLocation(id: string, db: BetterSqliteDatabase = getDb()): Location | null {
  const row = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as Location | undefined;
  return row ?? null;
}

export function upsertLocation(input: LocationInput, db: BetterSqliteDatabase = getDb()): Location {
  db.prepare(
    `INSERT INTO locations (id, name, type, manager_id)
     VALUES (@id, @name, @type, @manager_id)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       manager_id = excluded.manager_id,
       updated_at = datetime('now')`,
  ).run({
    id: input.id,
    name: input.name,
    type: input.type,
    manager_id: input.manager_id ?? null,
  });
  const row = getLocation(input.id, db);
  if (!row) throw new Error(`upsertLocation: row not found after upsert for id=${input.id}`);
  return row;
}

export function softDeleteLocation(id: string, db: BetterSqliteDatabase = getDb()): boolean {
  const info = db
    .prepare("UPDATE locations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(id);
  return info.changes > 0;
}
