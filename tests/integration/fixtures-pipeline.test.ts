// T100 — Full-fixture smoke test tying T037 + T097 + T098 together.
//
// The hero demo narrative in `specs/001-compliance-monitor/quickstart.md`
// assumes a few things stay true end-to-end on the synthetic fixture:
//
//   1. `seedAll()` loads ~648 T-Logs across 4 locations, 20 angels,
//      12 individuals, 4 managers — the "30-day" synthetic window.
//   2. The deterministic pass plants missing-note flags, most notably the
//      Sunrise Day Program Friday gaps (T098's pattern).
//   3. The AI pass tops out with Jamal (ANG007) at Riverside (T097's
//      pattern), above all other LOC002 angels.
//   4. Every location yields a non-negative compliance score readable
//      without inventing joins at the view layer.
//
// This is deliberately a shallow-but-broad test. Deep per-flag assertions
// live in the dedicated jamal-cluster and sunrise-fridays files. This one
// exists so a regression that breaks the whole pipeline (a bad migration,
// a wiring mistake between deterministic → AI, a silently-dropped seed
// step) gets caught by *one* failing test rather than splintered across
// many.

process.env.OPENROUTER_API_KEY ??= 'sk-or-test';
process.env.OPENROUTER_MODEL ??= 'test/fake-classifier';
process.env.DEMO_LOGIN_PASSWORD ??= 'demo';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.PROTOTYPE_MODE ??= 'false';
process.env.LOG_LEVEL ??= 'error';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ga-pipeline-smoke-'));
process.env.DATABASE_PATH = join(tmpDir, 'test.db');

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { seedAll } from '../../src/jobs/seed.ts';
import { runFullPipeline } from '../../src/flagging/pipeline.ts';
import { getDb, closeDb } from '../../src/db/client.ts';

interface PromptPayload {
  similarity_max_score: number | null;
  similar_match_count: number;
  description: string;
}

function classify(payload: PromptPayload): { severity: 'green' | 'yellow' | 'red'; reason: string } {
  const sim = payload.similarity_max_score ?? 0;
  const wordCount = payload.description.trim().split(/\s+/).filter(Boolean).length;
  if (sim >= 0.85 && wordCount < 20) {
    return {
      severity: 'red',
      reason: `Near-identical content to ${payload.similar_match_count} prior note(s); boilerplate.`,
    };
  }
  if (wordCount < 8) return { severity: 'yellow', reason: 'Shift note too short.' };
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
  await runFullPipeline();
});

after(() => {
  globalThis.fetch = originalFetch;
  closeDb();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('seed shape matches the fixture contract (30-day synthetic corpus)', () => {
  const db = getDb();
  const locations = (db.prepare('SELECT COUNT(*) AS c FROM locations').get() as { c: number }).c;
  const angels = (db.prepare('SELECT COUNT(*) AS c FROM angels').get() as { c: number }).c;
  const individuals = (db.prepare('SELECT COUNT(*) AS c FROM individuals').get() as { c: number }).c;
  const managers = (db.prepare('SELECT COUNT(*) AS c FROM managers').get() as { c: number }).c;
  const tlogs = (db.prepare('SELECT COUNT(*) AS c FROM t_logs WHERE is_current=1').get() as { c: number }).c;

  assert.equal(locations, 4, `expected 4 locations, got ${locations}`);
  assert.equal(managers, 4, `expected 4 managers, got ${managers}`);
  assert.equal(angels, 20, `expected 20 angels, got ${angels}`);
  assert.equal(individuals, 12, `expected 12 individuals, got ${individuals}`);
  assert.ok(tlogs >= 600, `expected ~648 current T-Logs, got ${tlogs}`);
});

test('deterministic + AI passes both produce flags — nothing ran as a no-op', () => {
  const db = getDb();
  const bySource = db
    .prepare("SELECT source, COUNT(*) AS c FROM flags WHERE resolution='open' GROUP BY source")
    .all() as Array<{ source: string; c: number }>;
  const map = new Map(bySource.map((r) => [r.source, r.c]));

  assert.ok((map.get('notification_level') ?? 0) > 0, 'notification_level pass produced no flags');
  assert.ok((map.get('missing_schedule') ?? 0) > 0, 'missing_schedule pass produced no flags');
  assert.ok((map.get('ai_classifier') ?? 0) > 0, 'AI pass produced no flags — classifier may not be wired');
});

test('T097 smoke: Jamal (ANG007) tops Riverside AI flag count', () => {
  const db = getDb();
  const top = db
    .prepare(
      `SELECT angel_id, COUNT(*) AS c
         FROM flags
        WHERE source='ai_classifier' AND resolution='open' AND location_id='LOC002'
        GROUP BY angel_id ORDER BY c DESC LIMIT 1`,
    )
    .get() as { angel_id: string | null; c: number } | undefined;
  assert.ok(top, 'no AI flags at LOC002');
  assert.equal(top.angel_id, 'ANG007', `expected Jamal (ANG007) to top LOC002 AI flags, got ${top.angel_id}`);
});

test('T098 smoke: Sunrise Friday gaps are all present', () => {
  const db = getDb();
  const expected: Array<[string, string]> = [
    ['IND012', '2026-03-27'],
    ['IND008', '2026-04-03'],
    ['IND011', '2026-04-10'],
  ];
  for (const [ind, date] of expected) {
    const row = db
      .prepare(
        "SELECT 1 FROM flags WHERE source='missing_schedule' AND location_id='LOC004' AND individual_id=? AND scheduled_shift_date=? AND resolution='open'",
      )
      .get(ind, date);
    assert.ok(row, `missing Sunrise Friday flag absent for ${ind} on ${date}`);
  }
});

test('every location has at least one flag attached (no black-hole locations)', () => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.id, l.name,
              (SELECT COUNT(*) FROM flags f WHERE f.location_id = l.id AND f.resolution='open') AS flag_count
         FROM locations l WHERE l.deleted_at IS NULL`,
    )
    .all() as Array<{ id: string; name: string; flag_count: number }>;
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.ok(r.flag_count > 0, `location ${r.id} (${r.name}) has zero flags — fixture or wiring broken`);
  }
});
