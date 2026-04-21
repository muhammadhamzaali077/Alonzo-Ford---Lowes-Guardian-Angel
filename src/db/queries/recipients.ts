import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export interface DigestRecipient {
  id: number;
  user_id: string | null;
  email: string;
  scope: string;       // 'all' or a location_id
  cadence: string;     // 'weekly'
  day_of_week: number; // 0–6
  hour_et: number;     // 0–23
  is_active: number;   // 0|1
  created_at: string;
}

export interface DigestRecipientInput {
  id?: number;
  email: string;
  scope: string;
  cadence?: string;
  day_of_week?: number;
  hour_et?: number;
  is_active?: number;
}

export function listRecipients(db: BetterSqliteDatabase = getDb()): DigestRecipient[] {
  return db
    .prepare('SELECT * FROM digest_recipients ORDER BY is_active DESC, scope, email')
    .all() as DigestRecipient[];
}

export function getRecipient(
  id: number,
  db: BetterSqliteDatabase = getDb(),
): DigestRecipient | null {
  const row = db.prepare('SELECT * FROM digest_recipients WHERE id = ?').get(id) as DigestRecipient | undefined;
  return row ?? null;
}

export function upsertRecipient(
  input: DigestRecipientInput,
  db: BetterSqliteDatabase = getDb(),
): number {
  if (input.id) {
    db.prepare(
      `UPDATE digest_recipients
          SET email = @email, scope = @scope, cadence = @cadence,
              day_of_week = @day_of_week, hour_et = @hour_et, is_active = @is_active
        WHERE id = @id`,
    ).run({
      id: input.id,
      email: input.email,
      scope: input.scope,
      cadence: input.cadence ?? 'weekly',
      day_of_week: input.day_of_week ?? 1,
      hour_et: input.hour_et ?? 8,
      is_active: input.is_active ?? 1,
    });
    return input.id;
  }
  const info = db
    .prepare(
      `INSERT INTO digest_recipients (email, scope, cadence, day_of_week, hour_et, is_active)
       VALUES (@email, @scope, @cadence, @day_of_week, @hour_et, @is_active)`,
    )
    .run({
      email: input.email,
      scope: input.scope,
      cadence: input.cadence ?? 'weekly',
      day_of_week: input.day_of_week ?? 1,
      hour_et: input.hour_et ?? 8,
      is_active: input.is_active ?? 1,
    });
  return info.lastInsertRowid as number;
}

export function deleteRecipient(id: number, db: BetterSqliteDatabase = getDb()): boolean {
  const info = db.prepare('DELETE FROM digest_recipients WHERE id = ?').run(id);
  return info.changes > 0;
}
