import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { seedDefaultRules } from '../../src/rules/seed-rules.ts';
import {
  editRule,
  getActiveRule,
  listActiveRules,
  listRuleHistory,
  revertRule,
} from '../../src/rules/rules-admin.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8'));
  seedDefaultRules(db);
  return db;
}

test('seedDefaultRules inserts 5 active rules on a fresh DB', () => {
  const db = freshDb();
  const active = listActiveRules(db);
  assert.equal(active.length, 5);
  const keys = active.map((r) => r.rule_key).sort();
  assert.deepEqual(keys, [
    'copy_paste',
    'incident_language',
    'medication_refusal',
    'short_note',
    'vague_content',
  ]);
  for (const r of active) {
    assert.equal(r.version, 1);
    assert.equal(r.is_active, 1);
  }
});

test('seedDefaultRules is idempotent — second invocation inserts 0', () => {
  const db = freshDb();
  const second = seedDefaultRules(db);
  assert.equal(second, 0);
  assert.equal(listActiveRules(db).length, 5);
});

test('editRule bumps version and flips prior active off', () => {
  const db = freshDb();
  const before = getActiveRule('copy_paste', db);
  assert.ok(before);
  assert.equal(before.version, 1);

  const after = editRule(
    'copy_paste',
    { description: 'Tightened copy-paste wording.', config_json: { similarity_threshold: 0.75, window_size: 15 } },
    'user_elaina',
    db,
  );
  assert.equal(after.version, 2);
  assert.equal(after.is_active, 1);
  assert.equal(after.description, 'Tightened copy-paste wording.');
  assert.equal(after.created_by, 'user_elaina');

  // Prior active is now inactive
  const prior = db
    .prepare('SELECT is_active FROM rule_config WHERE rule_key = ? AND version = 1')
    .get('copy_paste') as { is_active: number };
  assert.equal(prior.is_active, 0);

  // Exactly one is_active=1 per rule_key (belt + suspenders; schema doesn't enforce this itself)
  const activeCount = db
    .prepare('SELECT COUNT(*) AS c FROM rule_config WHERE rule_key = ? AND is_active = 1')
    .get('copy_paste') as { c: number };
  assert.equal(activeCount.c, 1);
});

test('editRule preserves fields not explicitly overridden', () => {
  const db = freshDb();
  const v1 = getActiveRule('short_note', db)!;
  const v2 = editRule('short_note', { description: 'Only changing description.' }, null, db);
  assert.equal(v2.name, v1.name);
  assert.equal(v2.prompt_template, v1.prompt_template);
  assert.equal(v2.config_json, v1.config_json);
  assert.equal(v2.description, 'Only changing description.');
});

test('revertRule creates a NEW version row (never flips an old one back on)', () => {
  const db = freshDb();
  // edit → v2
  editRule('copy_paste', { description: 'v2 desc', config_json: { similarity_threshold: 0.75 } }, 'u1', db);
  // revert to v1 → v3 (copy of v1's content)
  const v3 = revertRule('copy_paste', 1, 'u2', db);
  assert.equal(v3.version, 3);
  assert.equal(v3.is_active, 1);

  const history = listRuleHistory('copy_paste', db);
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((r) => [r.version, r.is_active]),
    [[3, 1], [2, 0], [1, 0]],
  );

  // v3's content matches v1's
  const v1 = history[2]!;
  assert.equal(v3.description, v1.description);
  assert.equal(v3.prompt_template, v1.prompt_template);
  assert.equal(v3.config_json, v1.config_json);
  // But v3 has a different created_by (the reverter)
  assert.equal(v3.created_by, 'u2');
  assert.equal(v1.created_by, null); // seed row
});

test('revertRule throws when the target version does not exist', () => {
  const db = freshDb();
  assert.throws(() => revertRule('copy_paste', 99, null, db), /no version 99/);
});

test('editRule throws when the rule_key has no active rule', () => {
  const db = freshDb();
  assert.throws(() => editRule('nonexistent_rule', { name: 'X' }, null, db), /no active rule/);
});

test('editRule accepts config_json as either object or string', () => {
  const db = freshDb();
  const asObject = editRule('copy_paste', { config_json: { similarity_threshold: 0.8 } }, null, db);
  assert.equal(asObject.config_json, JSON.stringify({ similarity_threshold: 0.8 }));
  const asString = editRule('copy_paste', { config_json: '{"raw":true}' }, null, db);
  assert.equal(asString.config_json, '{"raw":true}');
});
