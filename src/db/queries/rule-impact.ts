// Cheap, deterministic preview-impact estimators for the rule editor.
//
// Only rules with a deterministic computation get a live preview:
//
//   - copy_paste  → already-computed `similarity_score` on t_logs
//   - short_note  → word count of description, location-type-aware
//
// LLM-evaluated rules (vague_content, medication_refusal, incident_language)
// CANNOT be previewed without re-running the classifier, which is expensive
// and out-of-scope for a typing-feedback control. The view surfaces a
// "Live preview not available" stub for those.
//
// The window is "last N days of data" — anchored to max(reported_date) in
// t_logs so a demo database whose newest row is 2026-04-14 still reports
// meaningful counts even when the calendar clock is weeks ahead.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';
import { getAnchorDate } from './last-refresh.js';

export interface ImpactPreview {
  count: number;
  window_start: string;
  window_end: string;
  total_in_window: number;
}

function resolveWindow(db: BetterSqliteDatabase, days: number): { start: string; end: string } {
  const end = getAnchorDate(db);
  const endMs = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  const startMs = endMs - (days - 1) * 24 * 3600 * 1000;
  const start = new Date(startMs).toISOString().slice(0, 10);
  return { start, end };
}

export function previewCopyPaste(
  opts: { similarityThreshold: number; windowDays?: number },
  db: BetterSqliteDatabase = getDb(),
): ImpactPreview {
  const days = opts.windowDays ?? 30;
  const w = resolveWindow(db, days);
  const total = (db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM t_logs
        WHERE is_current = 1
          AND reported_date BETWEEN @start AND @end`,
    )
    .get(w) as { n: number }).n;
  const count = (db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM t_logs
        WHERE is_current = 1
          AND similarity_score IS NOT NULL
          AND similarity_score >= @threshold
          AND reported_date BETWEEN @start AND @end`,
    )
    .get({ threshold: opts.similarityThreshold, start: w.start, end: w.end }) as { n: number }).n;
  return { count, window_start: w.start, window_end: w.end, total_in_window: total };
}

export function previewShortNote(
  opts: { residentialMinWords: number; dayProgramMinWords: number; windowDays?: number },
  db: BetterSqliteDatabase = getDb(),
): ImpactPreview {
  const days = opts.windowDays ?? 30;
  const w = resolveWindow(db, days);

  // Load descriptions + location type. 648 rows × a few hundred chars is trivial.
  // We count words in JS (whitespace split) rather than faking it in SQL.
  const rows = db
    .prepare(
      `SELECT t.description, l.type AS location_type
         FROM t_logs t
         JOIN locations l ON l.id = t.program_id
        WHERE t.is_current = 1
          AND t.reported_date BETWEEN @start AND @end`,
    )
    .all(w) as Array<{ description: string; location_type: 'group_home' | 'host_home' | 'day_program' }>;

  let count = 0;
  for (const r of rows) {
    const words = r.description.trim().split(/\s+/).filter(Boolean).length;
    const threshold = r.location_type === 'day_program' ? opts.dayProgramMinWords : opts.residentialMinWords;
    if (words < threshold) count++;
  }

  return { count, window_start: w.start, window_end: w.end, total_in_window: rows.length };
}
