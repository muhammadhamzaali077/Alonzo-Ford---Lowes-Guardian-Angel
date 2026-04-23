// T097 — Acceptance gate: Jamal copy-paste cluster surfaces on Riverside drill-down.
//
// Demo-critical assertion. Synthetic fixture `fixtures/lga_synthetic_tlogs.csv`
// plants ANG007 (Jamal Roberts) at LOC002 (Riverside) with 35 near-identical
// notes — the "aha" moment for Alonzo. This test runs the full pipeline,
// then asserts:
//
//   1. Jamal has the highest `ai_classifier` flag count among Riverside angels.
//   2. Jamal's angel-drill-down page lists at least 8 flags whose reason text
//      cites near-identical content (the copy-paste signal).
//
// Network: the AI classifier's `fetch` is stubbed with a deterministic fake
// OpenRouter responder so this is hermetic. The fake uses `similarity_max_score`
// from the prompt payload to decide red vs. green — same signal the real model
// leans on, so the test reflects production behavior.

// IMPORTANT: set required env BEFORE any repo module is imported. `config.ts`
// lazy-parses process.env on first property access; the imports below will
// trigger that on the first proxied read.
process.env.OPENROUTER_API_KEY ??= 'sk-or-test';
process.env.OPENROUTER_MODEL ??= 'test/fake-classifier';
process.env.DEMO_LOGIN_PASSWORD ??= 'demo';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.PROTOTYPE_MODE ??= 'false';
process.env.LOG_LEVEL ??= 'error';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each test file runs in its own process (node --test behavior), so a
// per-file temp DB is hermetic.
const tmpDir = mkdtempSync(join(tmpdir(), 'ga-jamal-'));
process.env.DATABASE_PATH = join(tmpDir, 'test.db');

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { seedAll } from '../../src/jobs/seed.ts';
import { runFullPipeline } from '../../src/flagging/pipeline.ts';
import { getDb, closeDb } from '../../src/db/client.ts';
import {
  getAngelAggregatesForLocation,
  getLocationMeta,
  getMissingFlagsForLocation,
} from '../../src/db/queries/drilldown.ts';
import { renderLocationView } from '../../src/views/drilldown.ts';

// -------------------------------------------------------------------------------------------------
// Fake OpenRouter responder
// -------------------------------------------------------------------------------------------------

interface PromptPayload {
  similarity_max_score: number | null;
  similar_match_count: number;
  notification_level: 'Low' | 'Medium' | 'High';
  description: string;
}

/** Deterministic fake classifier. Mirrors the production rule shape enough to
 *  surface Jamal's demo pattern without falsing on routine repetitive content
 *  (e.g. "Vitals WNL: BP 122/78" which legitimately repeats shift to shift).
 *
 *  Signals used — same ones the real OpenRouter prompt receives:
 *    - similarity_max_score  : how close is this note to its top prior match
 *    - similar_match_count   : how many prior notes were flagged as near-dupes
 *    - description           : the raw note text (word count is a proxy for
 *                              "is this boilerplate or real documentation?")
 *
 *  Rules (evaluated in order, first match wins):
 *    1. Short note (<20 words) AND high similarity (≥0.85) → RED copy-paste.
 *       This is Jamal's pattern: "Same as yesterday.", "Shift went well. X
 *       ate meals and took meds. No issues." — boilerplate with no content.
 *    2. Extremely short note (<8 words) regardless of similarity → YELLOW
 *       insufficient detail.
 *    3. High similarity but longer text → GREEN. Routine vitals/med-admin
 *       notes are allowed to repeat.
 */
function classify(payload: PromptPayload): { severity: 'green' | 'yellow' | 'red'; reason: string } {
  const sim = payload.similarity_max_score ?? 0;
  const wordCount = payload.description.trim().split(/\s+/).filter(Boolean).length;

  if (sim >= 0.85 && wordCount < 20) {
    return {
      severity: 'red',
      reason: `Near-identical content to ${payload.similar_match_count} prior note(s); boilerplate with no shift-specific detail.`,
    };
  }
  if (wordCount < 8) {
    return { severity: 'yellow', reason: 'Shift note is very short; insufficient detail for a documentation record.' };
  }
  return { severity: 'green', reason: 'no issues identified' };
}

const originalFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('openrouter.ai/api/v1/chat/completions')) {
      // pass through for anything unexpected
      return originalFetch(input as never, init);
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages: Array<{ role: string; content: string }> };
    const user = body.messages.find((m) => m.role === 'user');
    const payload = user ? (JSON.parse(user.content) as PromptPayload) : ({} as PromptPayload);
    const verdict = classify(payload);
    return new Response(
      JSON.stringify({
        model: 'test/fake-classifier',
        choices: [{ message: { content: JSON.stringify(verdict) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  closeDb();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// -------------------------------------------------------------------------------------------------
// Acceptance gate
// -------------------------------------------------------------------------------------------------

test('Jamal copy-paste cluster: ANG007 is the top AI offender on Riverside', async () => {
  const counts = seedAll();
  assert.ok(counts.t_logs >= 600, `expected synthetic fixture to load ~648 T-Logs, got ${counts.t_logs}`);

  const pipelineResult = await runFullPipeline();
  assert.ok(
    pipelineResult.ai.classified_ok > 0,
    `AI pass did nothing (classified_ok=0, errored=${pipelineResult.ai.errored}); fake fetch may not be wired in`,
  );

  const db = getDb();
  const ranked = db
    .prepare(
      `SELECT a.id AS angel_id, a.name AS angel_name,
              SUM(CASE WHEN f.source='ai_classifier' AND f.resolution='open' THEN 1 ELSE 0 END) AS ai_count
         FROM angels a
         LEFT JOIN flags f ON f.angel_id = a.id AND f.location_id = 'LOC002'
        WHERE a.location_id = 'LOC002' AND a.deleted_at IS NULL
        GROUP BY a.id, a.name
        ORDER BY ai_count DESC, a.name ASC`,
    )
    .all() as Array<{ angel_id: string; angel_name: string; ai_count: number }>;

  assert.ok(ranked.length > 0, 'no angels found at LOC002');
  const top = ranked[0]!;
  assert.equal(
    top.angel_id,
    'ANG007',
    `expected ANG007 (Jamal) to top Riverside AI flags, got ${top.angel_name} (${top.angel_id}) with ${top.ai_count} flags. Ranking: ${JSON.stringify(ranked)}`,
  );
  assert.ok(top.ai_count >= 8, `Jamal should have ≥ 8 AI flags, got ${top.ai_count}`);
});

test('Jamal angel page surfaces ≥ 8 near-identical content flags', () => {
  const db = getDb();

  // Same query the angel drill-down page is composed from, narrowed to Jamal.
  const nearIdenticalFlags = db
    .prepare(
      `SELECT reason FROM flags
        WHERE angel_id = 'ANG007'
          AND source = 'ai_classifier'
          AND resolution = 'open'
          AND reason LIKE '%near-identical content to%'`,
    )
    .all() as Array<{ reason: string }>;

  assert.ok(
    nearIdenticalFlags.length >= 8,
    `expected ≥ 8 "near-identical content to…" flags for Jamal, got ${nearIdenticalFlags.length}.\n` +
      (nearIdenticalFlags.length > 0 ? `Sample reason: ${nearIdenticalFlags[0]!.reason}` : ''),
  );

  // And at least one reason cites the prior-note count inline ("… 2 prior note(s) …" etc.),
  // which is the textual signal managers spot-read on the drill-down.
  assert.ok(
    nearIdenticalFlags.some((f) => /\d+\s+prior note/.test(f.reason)),
    'expected at least one near-identical-content reason to cite a numeric prior-note count',
  );
});

test('Riverside location page renders Jamal in angel list with flag counts', () => {
  const db = getDb();
  const loc = getLocationMeta('LOC002', db);
  assert.ok(loc, 'LOC002 should exist');

  // Use a window that spans the fixture (fixture runs 2026-03-15..2026-04-13-ish).
  const start = '2026-03-01';
  const end = '2026-04-30';
  const angels = getAngelAggregatesForLocation('LOC002', start, end, db);
  const missingFlags = getMissingFlagsForLocation('LOC002', start, end, db);

  const html = renderLocationView({
    location: { id: loc.id, name: loc.name, type: loc.type },
    angels,
    missingFlags,
    window: { start, end, label: 'Mar 1–Apr 30', preset: '30d' } as never,
  });

  assert.ok(html.includes('Jamal'), 'Jamal should appear on Riverside location page');
  assert.ok(html.includes('Riverside'), 'Riverside heading should render');

  // Jamal's tile should show at least a red count since we just wrote many red flags.
  // Find the <li> that contains his name and verify it shows "red" or "yellow" in the counts cell.
  const jamalMatch = html.match(/<li>[\s\S]*?Jamal[\s\S]*?<\/li>/);
  assert.ok(jamalMatch, 'expected a <li> containing Jamal');
  assert.ok(
    /\d+\s+(red|yellow)/.test(jamalMatch[0]),
    `Jamal's row should show red/yellow flag count; got: ${jamalMatch[0].slice(0, 300)}`,
  );
});
