import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export interface Manager {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ManagerInput {
  id: string;
  name: string;
  email?: string | null;
}

export function listManagers(
  opts: { includeDeleted?: boolean } = {},
  db: BetterSqliteDatabase = getDb(),
): Manager[] {
  const where = opts.includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT * FROM managers ${where} ORDER BY name`).all() as Manager[];
}

export function getManager(id: string, db: BetterSqliteDatabase = getDb()): Manager | null {
  const row = db.prepare('SELECT * FROM managers WHERE id = ?').get(id) as Manager | undefined;
  return row ?? null;
}

export function upsertManager(input: ManagerInput, db: BetterSqliteDatabase = getDb()): Manager {
  db.prepare(
    `INSERT INTO managers (id, name, email)
     VALUES (@id, @name, @email)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       updated_at = datetime('now')`,
  ).run({
    id: input.id,
    name: input.name,
    email: input.email ?? null,
  });
  const row = getManager(input.id, db);
  if (!row) throw new Error(`upsertManager: row not found after upsert for id=${input.id}`);
  return row;
}
