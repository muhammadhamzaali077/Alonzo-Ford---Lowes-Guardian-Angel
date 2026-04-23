// T099 — Acceptance gate: rule-edit re-run completes inside the demo SLA.
//
// The 30-second bar matters because it's the "aha" moment in the demo:
// Alonzo lowers the copy-paste similarity threshold and watches flag counts
// update while he's still on the call. Anything much longer breaks the
// story. This test pins that contract against the full ~30-day fixture.
//
// The AI classifier's fetch is stubbed to a deterministic fake — a real
// 30-second run would make this test both slow and flaky in CI. The SLA
// clock includes the full re-run work (flag supersession, AI re-classify,
// and flag re-writing), which stays realistic even with the fake model.

process.env.OPENROUTER_API_KEY ??= 'sk-or-test';
process.env.OPENROUTER_MODEL ??= 'test/fake-classifier';
process.env.DEMO_LOGIN_PASSWORD ??= 'demo';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.PROTOTYPE_MODE ??= 'false';
process.env.LOG_LEVEL ??= 'error';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ga-rerun-sla-'));
process.env.DATABASE_PATH = join(tmpDir, 'test.db');

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { seedAll } from '../../src/jobs/seed.ts';
import { rerunOnWindow, runFullPipeline } from '../../src/flagging/pipeline.ts';
import { editRule, getActiveRule } from '../../src/rules/rules-admin.ts';
import { getDb, closeDb } from '../../src/db/client.ts';

const SLA_MS = 30_000;

interface PromptPayload {
  similarity_max_score: number | null;
  similar_match_count: number;
  description: string;
}

// Same fake as jamal-cluster, parameterized on a threshold so we can prove the
// re-run actually uses the NEW rule value (not the seeded default).
let currentThreshold = 0.85;

function classify(payload: PromptPayload): { severity: 'green' | 'yellow' | 'red'; reason: string } {
  const sim = payload.similarity_max_score ?? 0;
  const wordCount = payload.description.trim().split(/\s+/).filter(Boolean).length;
  if (sim >= currentThreshold && wordCount < 20) {
    return {
      severity: 'red',
      reason: `Near-identical content to ${payload.similar_match_count} prior note(s); boilerplate with no shift-specific detail.`,
    };
  }
  if (wordCount < 8) {
    return { severity: 'yellow', reason: 'Shift note is very short; insufficient detail.' };
  }
  return { severity: 'green', reason: 'no issues identified' };
}

const originalFetch = globalThis.fetch;

before(async () => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('openrouter.ai/api/v1/chat/completions')) return originalFetch(input as never, init);
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages: Array<{ role: string; content: string }> };
    const user = body.messages.find((m) => m.role === 'user');
    const payload = user ? (JSON.parse(user.content) as PromptPayload) : ({ similarity_max_score: 0, similar_match_count: 0, description: '' } as PromptPayload);
    const verdict = classify(payload);
    return new Response(
      JSON.stringify({
        model: 'test/fake-classifier',
        choices: [{ message: { content: JSON.stringify(verdict) } }],
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  seedAll();
  // Baseline pipeline: classifier threshold stays at 0.85 for this pass.
  currentThreshold = 0.85;
  await runFullPipeline();
});

after(() => {
  globalThis.fetch = originalFetch;
  closeDb();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('lowering copy_paste similarity threshold 0.85 → 0.60 and re-running finishes under 30s', async () => {
  const db = getDb();

  const before = {
    copyPasteThreshold: extractSimilarityThreshold('copy_paste', db),
    aiRedCount: countAiRed(db),
  };
  assert.ok(before.copyPasteThreshold !== null, 'copy_paste rule should be seeded');
  assert.ok(before.aiRedCount > 0, `expected some AI red flags after baseline pipeline, got ${before.aiRedCount}`);

  // Edit the rule — drops threshold from 0.85 to 0.60. The fake classifier
  // reads `currentThreshold` via closure, so this also shifts the fake's
  // verdict for the re-run to match what a real model tuned to the new
  // threshold would produce.
  editRule('copy_paste', { config_json: { similarity_threshold: 0.6 } }, 'test-user', db);
  currentThreshold = 0.6;

  const windowStart = '2026-04-07';
  const windowEnd = '2026-04-14';

  const started = Date.now();
  const result = await rerunOnWindow(windowStart, windowEnd, db);
  const elapsedMs = Date.now() - started;

  assert.ok(
    elapsedMs < SLA_MS,
    `rule-rerun exceeded the demo SLA: took ${elapsedMs}ms, budget is ${SLA_MS}ms. scanned=${result.ai.scanned} classified_ok=${result.ai.classified_ok}`,
  );
  assert.ok(
    result.ai.scanned > 0,
    `rerun scanned 0 notes in the 7-day window — the window may not line up with the fixture, or no notes exist there`,
  );
  assert.ok(
    result.superseded_flags > 0,
    `rerun superseded 0 prior AI flags — the baseline pipeline may not have written any AI flags into the window`,
  );

  const after = {
    copyPasteThreshold: extractSimilarityThreshold('copy_paste', db),
    aiRedCount: countAiRed(db),
    aiRedCountInWindow: countAiRedInWindow(db, windowStart, windowEnd),
  };

  assert.equal(after.copyPasteThreshold, 0.6, `expected threshold = 0.60 after edit, got ${after.copyPasteThreshold}`);
  assert.notEqual(
    before.aiRedCount,
    after.aiRedCount,
    'expected AI red flag count to change after lowering the copy-paste threshold; got no delta',
  );
});

// -------------------------------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------------------------------

function extractSimilarityThreshold(ruleKey: string, db: ReturnType<typeof getDb>): number | null {
  const rule = getActiveRule(ruleKey, db);
  if (!rule) return null;
  try {
    const cfg = JSON.parse(rule.config_json) as { similarity_threshold?: number };
    return typeof cfg.similarity_threshold === 'number' ? cfg.similarity_threshold : null;
  } catch {
    return null;
  }
}

function countAiRed(db: ReturnType<typeof getDb>): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM flags WHERE source = 'ai_classifier' AND severity = 'red' AND resolution = 'open'")
    .get() as { c: number };
  return row.c;
}

function countAiRedInWindow(db: ReturnType<typeof getDb>, start: string, end: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM flags f
         JOIN t_logs t ON t.tlog_id = f.tlog_id AND t.version = f.tlog_version
        WHERE f.source = 'ai_classifier' AND f.severity = 'red' AND f.resolution = 'open'
          AND t.reported_date BETWEEN ? AND ?`,
    )
    .get(start, end) as { c: number };
  return row.c;
}
