import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';

/**
 * Record one classifier call's token cost on today's row in classifier_usage.
 * Per constitution P2: NEVER stores note text or classifier reasoning here.
 * IDs and aggregate numbers only.
 */
export function recordClassifierCall(
  inputTokens: number,
  outputTokens: number,
  isError: boolean,
  db: BetterSqliteDatabase = getDb(),
): void {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO classifier_usage (date, total_calls, total_input_tokens, total_output_tokens, total_errors)
     VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       total_calls = total_calls + 1,
       total_input_tokens = total_input_tokens + excluded.total_input_tokens,
       total_output_tokens = total_output_tokens + excluded.total_output_tokens,
       total_errors = total_errors + excluded.total_errors`,
  ).run(today, inputTokens, outputTokens, isError ? 1 : 0);
}

export interface TodayUsage {
  date: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_errors: number;
}

export function getTodayUsage(db: BetterSqliteDatabase = getDb()): TodayUsage | null {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT * FROM classifier_usage WHERE date = ?').get(today) as TodayUsage | undefined;
  return row ?? null;
}
