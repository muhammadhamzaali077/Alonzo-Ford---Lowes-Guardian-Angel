import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { seedDefaultRules } from '../../src/rules/seed-rules.ts';
import { editRule } from '../../src/rules/rules-admin.ts';
import { buildSystemPrompt, buildUserMessage, loadActiveRules } from '../../src/rules/rule-loader.ts';
import { DEFAULT_RULES } from '../../src/rules/default-rules.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8'));
  seedDefaultRules(db);
  return db;
}

test('loadActiveRules returns all 5 default rules', () => {
  const db = freshDb();
  const rules = loadActiveRules(db);
  assert.equal(rules.length, 5);
});

test('buildSystemPrompt contains every active rule\'s name and description', () => {
  const db = freshDb();
  const rules = loadActiveRules(db);
  const prompt = buildSystemPrompt(rules);
  for (const r of rules) {
    assert.ok(prompt.includes(r.name), `prompt missing rule name: "${r.name}"`);
    assert.ok(prompt.includes(r.description), `prompt missing rule description for ${r.rule_key}`);
    assert.ok(prompt.includes(r.prompt_template), `prompt missing prompt_template for ${r.rule_key}`);
    assert.ok(prompt.includes(`${r.rule_key} v${r.version}`), `prompt missing rule-key/version tag for ${r.rule_key}`);
  }
});

test('buildSystemPrompt embeds rule config_json when non-empty', () => {
  const db = freshDb();
  const rules = loadActiveRules(db);
  const prompt = buildSystemPrompt(rules);
  // copy_paste has {similarity_threshold, window_size}
  assert.ok(prompt.includes('similarity_threshold'));
  assert.ok(prompt.includes('window_size'));
  // short_note has {residential_min_words, day_program_min_words}
  assert.ok(prompt.includes('residential_min_words'));
  assert.ok(prompt.includes('day_program_min_words'));
});

test('buildSystemPrompt requires the response JSON schema', () => {
  const db = freshDb();
  const prompt = buildSystemPrompt(loadActiveRules(db));
  assert.ok(prompt.includes('"severity"'));
  assert.ok(prompt.includes('"reason"'));
  // Reason length cap documented in the prompt
  assert.ok(/240/.test(prompt));
});

test('buildSystemPrompt reflects the CURRENT active version after an edit', () => {
  const db = freshDb();
  editRule('copy_paste', { description: 'A custom description added by Elaina.' }, 'u1', db);
  const prompt = buildSystemPrompt(loadActiveRules(db));
  assert.ok(prompt.includes('A custom description added by Elaina.'));
  assert.ok(prompt.includes('copy_paste v2'));
  // The v1 description from DEFAULT_RULES[0] should NOT appear in the now-current prompt
  const seedRule = DEFAULT_RULES.find((r) => r.rule_key === 'copy_paste')!;
  assert.equal(prompt.includes(seedRule.description), false, 'stale v1 description leaked into current prompt');
});

test('buildUserMessage serializes the T-Log context as JSON', () => {
  const msg = buildUserMessage({
    type: 'Notes',
    summary: 'same as yesterday',
    notification_level: 'Low',
    shift_name: 'Swing',
    location_type: 'group_home',
    similarity_max_score: 1.0,
    similar_match_count: 3,
    matched_prior_note_excerpt: 'Same as yesterday.',
    description: 'Same as yesterday.',
  });
  const parsed = JSON.parse(msg);
  assert.equal(parsed.notification_level, 'Low');
  assert.equal(parsed.similarity_max_score, 1);
  assert.equal(parsed.description, 'Same as yesterday.');
});
