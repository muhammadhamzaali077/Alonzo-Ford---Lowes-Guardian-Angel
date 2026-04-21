import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export interface Individual {
  id: string;
  name: string;
  location_id: string | null;
  dob: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface IndividualInput {
  id: string;
  name: string;
  location_id?: string | null;
  dob?: string | null;
}

export function listIndividuals(
  opts: { locationId?: string; includeDeleted?: boolean } = {},
  db: BetterSqliteDatabase = getDb(),
): Individual[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (!opts.includeDeleted) clauses.push('deleted_at IS NULL');
  if (opts.locationId) {
    clauses.push('location_id = @locationId');
    params.locationId = opts.locationId;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM individuals ${where} ORDER BY name`).all(params) as Individual[];
}

export function getIndividual(id: string, db: BetterSqliteDatabase = getDb()): Individual | null {
  const row = db.prepare('SELECT * FROM individuals WHERE id = ?').get(id) as Individual | undefined;
  return row ?? null;
}

export function upsertIndividual(input: IndividualInput, db: BetterSqliteDatabase = getDb()): Individual {
  db.prepare(
    `INSERT INTO individuals (id, name, location_id, dob)
     VALUES (@id, @name, @location_id, @dob)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       location_id = excluded.location_id,
       dob = excluded.dob,
       updated_at = datetime('now')`,
  ).run({
    id: input.id,
    name: input.name,
    location_id: input.location_id ?? null,
    dob: input.dob ?? null,
  });
  const row = getIndividual(input.id, db);
  if (!row) throw new Error(`upsertIndividual: row not found after upsert for id=${input.id}`);
  return row;
}

export function softDeleteIndividual(id: string, db: BetterSqliteDatabase = getDb()): boolean {
  const info = db
    .prepare("UPDATE individuals SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(id);
  return info.changes > 0;
}
