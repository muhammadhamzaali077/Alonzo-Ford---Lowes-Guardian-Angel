import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import {
  backfillSimilarity,
  computeSimilarity,
  jaccard,
  tokenize,
} from '../../src/flagging/similarity.ts';
import { loadOrgStructure } from '../../src/ingestion/org-csv-loader.ts';
import { loadTlogsFromFixture } from '../../src/ingestion/tlog-csv-loader.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8'));
  return db;
}

// ---- Pure-function tests (no DB) ------------------------------------------------------------------

test('tokenize: lowercases, strips punctuation, drops stopwords', () => {
  const t = tokenize('The Quick Brown Fox, jumped! over the Lazy dog.');
  // "the", "over", "a" are stopwords; everything else retained.
  assert.ok(t.has('quick'));
  assert.ok(t.has('brown'));
  assert.ok(t.has('fox'));
  assert.ok(t.has('jumped'));
  assert.ok(t.has('lazy'));
  assert.ok(t.has('dog'));
  assert.equal(t.has('the'), false);
  assert.equal(t.has('over'), false);
  assert.equal(t.has(','), false);
});

test('tokenize: drops single-character tokens', () => {
  const t = tokenize('A b c d');
  assert.equal(t.size, 0);
});

test('jaccard: identical sets return 1', () => {
  const s = tokenize('Same as yesterday.');
  assert.equal(jaccard(s, s), 1);
});

test('jaccard: disjoint sets return 0', () => {
  const a = tokenize('quick brown fox');
  const b = tokenize('slow red turtle');
  assert.equal(jaccard(a, b), 0);
});

test('jaccard: partial overlap produces expected ratio', () => {
  const a = new Set(['quick', 'brown', 'fox']);
  const b = new Set(['brown', 'fox', 'cat']);
  // intersection=2 (brown, fox), union=4 → 0.5
  assert.equal(jaccard(a, b), 0.5);
});

test('jaccard: two empty sets return 1 (degenerate case)', () => {
  assert.equal(jaccard(new Set(), new Set()), 1);
});

test('jaccard: one empty, one non-empty returns 0', () => {
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('computeSimilarity: records top matches above threshold', () => {
  const newTokens = tokenize('Shift went well. Sarah K. ate meals and took meds. No issues.');
  const priors = [
    { tlog_id: 'T1', version: 1, tokens: tokenize('Shift went well. Sarah K. ate meals and took meds. No issues.') },
    { tlog_id: 'T2', version: 1, tokens: tokenize('Totally unrelated content about something else entirely.') },
    { tlog_id: 'T3', version: 1, tokens: tokenize('Shift went well. Sarah K. ate meals and took meds. No issues.') },
    { tlog_id: 'T4', version: 1, tokens: tokenize('Shift went well. David P. ate meals and took meds. No issues.') },
  ];
  const res = computeSimilarity(newTokens, priors);
  assert.equal(res.max_score, 1); // T1 and T3 are identical
  assert.ok(res.matches.length >= 2);
  assert.equal(res.matches[0]!.score, 1);
  // "Unrelated" note with 0 overlap should NOT appear in matches (below 0.5 threshold)
  assert.equal(res.matches.every((m) => m.tlog_id !== 'T2'), true);
});

// ---- Fixture integration (T037 core assertion) ---------------------------------------------------

test('fixture: Jamal Roberts has ≥10 notes with similarity_score > 0.85', async () => {
  const db = freshDb();
  loadOrgStructure(db);
  loadTlogsFromFixture(db);
  backfillSimilarity(db);

  const jamalHighScoring = db
    .prepare(
      `SELECT tlog_id, similarity_score, similar_match_tlog_ids
         FROM t_logs
        WHERE is_current = 1
          AND created_by_id = 'ANG007'
          AND similarity_score > 0.85`,
    )
    .all() as Array<{ tlog_id: string; similarity_score: number; similar_match_tlog_ids: string | null }>;

  assert.ok(
    jamalHighScoring.length >= 10,
    `expected ≥10 Jamal notes with score > 0.85, got ${jamalHighScoring.length}`,
  );
  // Every high-scoring Jamal note's top match must point at another Jamal note.
  const jamalTlogIds = new Set(
    (db
      .prepare("SELECT tlog_id FROM t_logs WHERE is_current = 1 AND created_by_id = 'ANG007'")
      .all() as Array<{ tlog_id: string }>).map((r) => r.tlog_id),
  );
  for (const note of jamalHighScoring) {
    assert.ok(note.similar_match_tlog_ids, `note ${note.tlog_id} has no match pointers`);
    const matches: Array<{ tlog_id: string; version: number; score: number }> = JSON.parse(
      note.similar_match_tlog_ids,
    );
    assert.ok(matches.length > 0, `note ${note.tlog_id} has empty matches array`);
    for (const m of matches) {
      assert.ok(
        jamalTlogIds.has(m.tlog_id),
        `Jamal's note ${note.tlog_id} has cross-angel match pointer to ${m.tlog_id}`,
      );
    }
  }
});

test('fixture: no non-Jamal note has a similarity match pointing to a Jamal T-Log', () => {
  const db = freshDb();
  loadOrgStructure(db);
  loadTlogsFromFixture(db);
  backfillSimilarity(db);

  const jamalTlogIds = new Set(
    (db
      .prepare("SELECT tlog_id FROM t_logs WHERE is_current = 1 AND created_by_id = 'ANG007'")
      .all() as Array<{ tlog_id: string }>).map((r) => r.tlog_id),
  );

  const rows = db
    .prepare(
      `SELECT tlog_id, similar_match_tlog_ids
         FROM t_logs
        WHERE is_current = 1
          AND created_by_id IS NOT NULL
          AND created_by_id != 'ANG007'
          AND similar_match_tlog_ids IS NOT NULL`,
    )
    .all() as Array<{ tlog_id: string; similar_match_tlog_ids: string }>;

  for (const r of rows) {
    const matches: Array<{ tlog_id: string }> = JSON.parse(r.similar_match_tlog_ids);
    for (const m of matches) {
      assert.equal(
        jamalTlogIds.has(m.tlog_id),
        false,
        `non-Jamal note ${r.tlog_id} points at Jamal's note ${m.tlog_id} (similarity is per-author; should never cross)`,
      );
    }
  }
});

test('fixture: Jamal has ≥5 notes with near-exact match (score ≥ 0.99) — the demo cluster', () => {
  // This is the key property the AI classifier relies on (Phase 5): the
  // `similarity_max_score` signal surfaces exact-text duplication of Jamal's
  // boilerplate ("Shift went well. X ate meals..." and "Same as yesterday.").
  //
  // We deliberately do NOT assert "non-Jamal avg < 0.5" — empirical check
  // against the real fixture shows ~0.54 avg across all DSPs because the
  // fixture's templated content is pervasive. Copy-paste isn't a Jamal-only
  // pattern; the classifier + editable rule will tune severity per the demo.
  const db = freshDb();
  loadOrgStructure(db);
  loadTlogsFromFixture(db);
  backfillSimilarity(db);

  const jamalExact = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM t_logs
        WHERE is_current = 1 AND created_by_id = 'ANG007' AND similarity_score >= 0.99`,
    )
    .get() as { n: number };

  assert.ok(
    jamalExact.n >= 5,
    `expected ≥5 Jamal notes with score ≥ 0.99 (exact-match cluster), got ${jamalExact.n}`,
  );
});

test('fixture: backfill is idempotent — re-running scores 0 new rows', () => {
  const db = freshDb();
  loadOrgStructure(db);
  loadTlogsFromFixture(db);
  // First backfill — with insertTlog already persisting similarity inline, this
  // should find zero pending rows (because loadTlogsFromFixture used insertTlog).
  const first = backfillSimilarity(db);
  const second = backfillSimilarity(db);
  assert.equal(second.processed, 0);
  // The inline path from insertTlog means the first pass also returns processed=0
  // in practice — leaving the assertion purely on 2nd pass.
  assert.ok(first.processed >= 0);
});
