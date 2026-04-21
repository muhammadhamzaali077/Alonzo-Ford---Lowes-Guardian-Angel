// Deterministic content-similarity pre-pass (Phase 3.5).
//
// Algorithm: token-set Jaccard. Corpus-free, O(n·k) per note, explainable
// ("95% token overlap with TLOG000016"). See research.md §R2.
//
// Per constitution P5, this runs BEFORE the AI classifier and persists its
// score + top-match pointers on the t_logs row. The AI classifier later reads
// these fields as structured context (Phase 5 — see T043 user-message shape).

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { STOPWORDS } from '../lib/stopwords.js';

export const DEFAULT_WINDOW_SIZE = 20;
export const MATCH_RECORDING_THRESHOLD = 0.5; // only record matches ≥ this in similar_match_tlog_ids
export const MATCH_RECORD_LIMIT = 3; // top N recorded per note

// -------------------------------------------------------------------------------------------------
// Pure functions (no DB, fully unit-testable)
// -------------------------------------------------------------------------------------------------

export function tokenize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = new Set<string>();
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    if (raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  // iterate the smaller set for fewer has() lookups
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) if (large.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

export interface SimilarityMatch {
  tlog_id: string;
  version: number;
  score: number;
}

export interface SimilarityResult {
  max_score: number;
  matches: SimilarityMatch[]; // sorted desc, length ≤ MATCH_RECORD_LIMIT, each ≥ MATCH_RECORDING_THRESHOLD
}

export function computeSimilarity(
  newTokens: Set<string>,
  priorNotes: Array<{ tlog_id: string; version: number; tokens: Set<string> }>,
): SimilarityResult {
  let maxScore = 0;
  const matches: SimilarityMatch[] = [];
  for (const prior of priorNotes) {
    const score = jaccard(newTokens, prior.tokens);
    if (score > maxScore) maxScore = score;
    if (score >= MATCH_RECORDING_THRESHOLD) {
      matches.push({ tlog_id: prior.tlog_id, version: prior.version, score });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { max_score: maxScore, matches: matches.slice(0, MATCH_RECORD_LIMIT) };
}

// -------------------------------------------------------------------------------------------------
// Persistence
// -------------------------------------------------------------------------------------------------

interface PriorNoteRow {
  tlog_id: string;
  version: number;
  description: string;
}

/**
 * Compute and persist similarity for a single (tlog_id, version). Reads the
 * author's most recent `windowSize` prior notes (by reported_date, then tlog_id
 * as a stable tiebreak), strictly earlier than this row. Rows without an author
 * (`created_by_id IS NULL`) are skipped cleanly.
 */
export function computeAndPersistSimilarity(
  tlog_id: string,
  version: number,
  db: BetterSqliteDatabase = getDb(),
  windowSize: number = DEFAULT_WINDOW_SIZE,
): SimilarityResult | null {
  const row = db
    .prepare(
      `SELECT tlog_id, version, created_by_id, reported_date, description
         FROM t_logs
        WHERE tlog_id = ? AND version = ?`,
    )
    .get(tlog_id, version) as
    | { tlog_id: string; version: number; created_by_id: string | null; reported_date: string; description: string }
    | undefined;
  if (!row) return null;
  if (!row.created_by_id) {
    // no author → can't form a per-author window; persist score=0 so we don't re-scan it
    db.prepare('UPDATE t_logs SET similarity_score = 0, similar_match_tlog_ids = NULL WHERE tlog_id = ? AND version = ?')
      .run(tlog_id, version);
    return { max_score: 0, matches: [] };
  }

  const priors = db
    .prepare(
      `SELECT tlog_id, version, description
         FROM t_logs
        WHERE is_current = 1
          AND created_by_id = @author
          AND (
                reported_date < @date
             OR (reported_date = @date AND tlog_id < @tlog_id)
          )
        ORDER BY reported_date DESC, tlog_id DESC
        LIMIT @limit`,
    )
    .all({
      author: row.created_by_id,
      date: row.reported_date,
      tlog_id: row.tlog_id,
      limit: windowSize,
    }) as PriorNoteRow[];

  const newTokens = tokenize(row.description);
  const result = computeSimilarity(
    newTokens,
    priors.map((p) => ({ tlog_id: p.tlog_id, version: p.version, tokens: tokenize(p.description) })),
  );

  db.prepare(
    `UPDATE t_logs
        SET similarity_score = @score,
            similar_match_tlog_ids = @matches
      WHERE tlog_id = @tlog_id AND version = @version`,
  ).run({
    score: result.max_score,
    matches: result.matches.length > 0 ? JSON.stringify(result.matches) : null,
    tlog_id,
    version,
  });

  return result;
}

/**
 * Scan every current T-Log with `similarity_score IS NULL` and compute/persist
 * its score. Used once on a freshly seeded DB (to score the 648 fixture rows)
 * and on any subsequent backfill after a bug fix.
 *
 * Re-running after backfill is a no-op because `similarity_score IS NULL` no
 * longer matches rows we've already scored.
 */
export function backfillSimilarity(
  db: BetterSqliteDatabase = getDb(),
  windowSize: number = DEFAULT_WINDOW_SIZE,
): { processed: number; scored: number } {
  const pending = db
    .prepare(
      `SELECT tlog_id, version
         FROM t_logs
        WHERE is_current = 1 AND similarity_score IS NULL
        ORDER BY reported_date ASC, tlog_id ASC`,
    )
    .all() as Array<{ tlog_id: string; version: number }>;

  let scored = 0;
  // Wrap in a single transaction — ~650 UPDATEs otherwise hammer WAL commits.
  const txn = db.transaction(() => {
    for (const row of pending) {
      const res = computeAndPersistSimilarity(row.tlog_id, row.version, db, windowSize);
      if (res && res.max_score > 0) scored++;
    }
  });
  txn();

  return { processed: pending.length, scored };
}
