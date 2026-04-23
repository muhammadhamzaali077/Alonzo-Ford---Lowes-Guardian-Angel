// T124 — flag_feedback queries. Thumbs-up/down on flag cards, stored
// server-side per Principle X. UPSERT on (flag_id, user_id) so re-clicking
// replaces the prior verdict rather than piling up history.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type FeedbackVerdict = 'up' | 'down';

export interface FlagFeedbackRow {
  flag_id: number;
  user_id: string;
  verdict: FeedbackVerdict;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertFeedbackInput {
  flag_id: number;
  user_id: string;
  verdict: FeedbackVerdict;
  note?: string | null;
}

/**
 * Write or replace a user's verdict on a flag. Returns the resulting row.
 * Same user + same verdict on same flag → noop; same user + different
 * verdict → verdict updated in place; same flag + different user → second
 * row inserted.
 */
export function upsertFeedback(
  input: UpsertFeedbackInput,
  db: BetterSqliteDatabase = getDb(),
): FlagFeedbackRow {
  db.prepare(
    `INSERT INTO flag_feedback (flag_id, user_id, verdict, note)
          VALUES (@flag_id, @user_id, @verdict, @note)
       ON CONFLICT(flag_id, user_id) DO UPDATE SET
            verdict    = excluded.verdict,
            note       = excluded.note,
            updated_at = datetime('now')`,
  ).run({
    flag_id: input.flag_id,
    user_id: input.user_id,
    verdict: input.verdict,
    note: input.note ?? null,
  });

  return db
    .prepare('SELECT flag_id, user_id, verdict, note, created_at, updated_at FROM flag_feedback WHERE flag_id = ? AND user_id = ?')
    .get(input.flag_id, input.user_id) as FlagFeedbackRow;
}

/** Look up the calling user's current verdict for a flag, if any. */
export function getUserFeedback(
  flag_id: number,
  user_id: string,
  db: BetterSqliteDatabase = getDb(),
): FlagFeedbackRow | null {
  const row = db
    .prepare('SELECT flag_id, user_id, verdict, note, created_at, updated_at FROM flag_feedback WHERE flag_id = ? AND user_id = ?')
    .get(flag_id, user_id) as FlagFeedbackRow | undefined;
  return row ?? null;
}

export interface FeedbackCounts {
  up: number;
  down: number;
}

/** Aggregate verdict counts across all users for a single flag. */
export function getFeedbackCounts(
  flag_id: number,
  db: BetterSqliteDatabase = getDb(),
): FeedbackCounts {
  const rows = db
    .prepare("SELECT verdict, COUNT(*) AS c FROM flag_feedback WHERE flag_id = ? GROUP BY verdict")
    .all(flag_id) as Array<{ verdict: FeedbackVerdict; c: number }>;
  const result: FeedbackCounts = { up: 0, down: 0 };
  for (const r of rows) result[r.verdict] = r.c;
  return result;
}
