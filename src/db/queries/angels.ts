import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type AngelRole = 'DSP' | 'Nurse' | 'Manager';

export interface Angel {
  id: string;
  name: string;
  role: AngelRole;
  location_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AngelInput {
  id: string;
  name: string;
  role: AngelRole;
  location_id?: string | null;
}

export function listAngels(
  opts: { locationId?: string; role?: AngelRole; includeDeleted?: boolean } = {},
  db: BetterSqliteDatabase = getDb(),
): Angel[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (!opts.includeDeleted) clauses.push('deleted_at IS NULL');
  if (opts.locationId) {
    clauses.push('location_id = @locationId');
    params.locationId = opts.locationId;
  }
  if (opts.role) {
    clauses.push('role = @role');
    params.role = opts.role;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM angels ${where} ORDER BY name`).all(params) as Angel[];
}

export function getAngel(id: string, db: BetterSqliteDatabase = getDb()): Angel | null {
  const row = db.prepare('SELECT * FROM angels WHERE id = ?').get(id) as Angel | undefined;
  return row ?? null;
}

export function upsertAngel(input: AngelInput, db: BetterSqliteDatabase = getDb()): Angel {
  db.prepare(
    `INSERT INTO angels (id, name, role, location_id)
     VALUES (@id, @name, @role, @location_id)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       role = excluded.role,
       location_id = excluded.location_id,
       updated_at = datetime('now')`,
  ).run({
    id: input.id,
    name: input.name,
    role: input.role,
    location_id: input.location_id ?? null,
  });
  const row = getAngel(input.id, db);
  if (!row) throw new Error(`upsertAngel: row not found after upsert for id=${input.id}`);
  return row;
}

export function softDeleteAngel(id: string, db: BetterSqliteDatabase = getDb()): boolean {
  const info = db
    .prepare("UPDATE angels SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(id);
  return info.changes > 0;
}
