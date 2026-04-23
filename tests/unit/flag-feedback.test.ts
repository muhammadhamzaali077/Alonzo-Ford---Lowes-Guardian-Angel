// T124 — flag_feedback query contract.
//
// Pins the UPSERT semantics: one row per (flag, user), re-voting updates
// in place rather than creating duplicates; cross-user votes coexist;
// counts aggregate across users.

process.env.OPENROUTER_API_KEY ??= 'sk-or-test';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { getFeedbackCounts, getUserFeedback, upsertFeedback } from '../../src/db/queries/flag-feedback.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8'));

  // Minimal fixtures to satisfy FKs on flags + users + flag_feedback.
  db.prepare("INSERT INTO managers (id, name) VALUES ('MGR_TEST', 'Test Mgr')").run();
  db.prepare("INSERT INTO locations (id, name, type, manager_id) VALUES ('LOC_TEST', 'Test Location', 'group_home', 'MGR_TEST')").run();
  db.prepare("INSERT INTO individuals (id, name, location_id) VALUES ('IND_TEST', 'Test Individual', 'LOC_TEST')").run();
  db.prepare("INSERT INTO users (id, email, role) VALUES ('user-A', 'a@test.local', 'leadership')").run();
  db.prepare("INSERT INTO users (id, email, role) VALUES ('user-B', 'b@test.local', 'manager')").run();

  // One real flag to attach feedback to. tlog_id / tlog_version left NULL
  // so the composite FK to t_logs doesn't fire — we only need a flag row
  // here, not a full note chain.
  db.prepare(
    `INSERT INTO flags (individual_id, location_id, severity, source, display_category, reason)
     VALUES ('IND_TEST', 'LOC_TEST', 'red', 'ai_classifier', 'pattern_detected', 'near-identical content to prior note')`,
  ).run();

  return db;
}

function flagId(db: BetterSqliteDatabase): number {
  return (db.prepare('SELECT id FROM flags LIMIT 1').get() as { id: number }).id;
}

test('first upsert inserts a row', () => {
  const db = freshDb();
  const id = flagId(db);
  const row = upsertFeedback({ flag_id: id, user_id: 'user-A', verdict: 'up' }, db);
  assert.equal(row.flag_id, id);
  assert.equal(row.user_id, 'user-A');
  assert.equal(row.verdict, 'up');
  assert.equal(row.note, null);
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS c FROM flag_feedback').get() as { c: number }).c,
    1,
  );
});

test('same user re-voting opposite verdict replaces in place (no duplicate rows)', () => {
  const db = freshDb();
  const id = flagId(db);
  upsertFeedback({ flag_id: id, user_id: 'user-A', verdict: 'up' }, db);
  upsertFeedback({ flag_id: id, user_id: 'user-A', verdict: 'down', note: 'changed my mind' }, db);

  const rows = db.prepare('SELECT user_id, verdict, note FROM flag_feedback').all() as Array<{ user_id: string; verdict: string; note: string | null }>;
  assert.equal(rows.length, 1, 'expected a single row after toggling verdict');
  assert.equal(rows[0]!.verdict, 'down');
  assert.equal(rows[0]!.note, 'changed my mind');
});

test('different users on the same flag coexist (two rows)', () => {
  const db = freshDb();
  const id = flagId(db);
  upsertFeedback({ flag_id: id, user_id: 'user-A', verdict: 'up' }, db);
  upsertFeedback({ flag_id: id, user_id: 'user-B', verdict: 'down' }, db);

  const counts = getFeedbackCounts(id, db);
  assert.equal(counts.up, 1);
  assert.equal(counts.down, 1);
});

test('getUserFeedback returns null when nothing exists', () => {
  const db = freshDb();
  const id = flagId(db);
  assert.equal(getUserFeedback(id, 'user-A', db), null);
});

test('getUserFeedback returns the caller\'s own verdict only', () => {
  const db = freshDb();
  const id = flagId(db);
  upsertFeedback({ flag_id: id, user_id: 'user-A', verdict: 'up' }, db);
  upsertFeedback({ flag_id: id, user_id: 'user-B', verdict: 'down' }, db);

  const aSees = getUserFeedback(id, 'user-A', db);
  const bSees = getUserFeedback(id, 'user-B', db);
  assert.ok(aSees && aSees.verdict === 'up');
  assert.ok(bSees && bSees.verdict === 'down');
});

test('verdict CHECK constraint rejects bogus values', () => {
  const db = freshDb();
  const id = flagId(db);
  assert.throws(() => {
    db.prepare("INSERT INTO flag_feedback (flag_id, user_id, verdict) VALUES (?, 'user-A', 'maybe')").run(id);
  }, /CHECK constraint failed|verdict/i);
});

test('deleting the flag cascades and removes feedback rows', () => {
  const db = freshDb();
  const id = flagId(db);
  upsertFeedback({ flag_id: id, user_id: 'user-A', verdict: 'up' }, db);
  upsertFeedback({ flag_id: id, user_id: 'user-B', verdict: 'down' }, db);

  db.prepare('DELETE FROM flags WHERE id = ?').run(id);
  const remaining = (db.prepare('SELECT COUNT(*) AS c FROM flag_feedback').get() as { c: number }).c;
  assert.equal(remaining, 0);
});
