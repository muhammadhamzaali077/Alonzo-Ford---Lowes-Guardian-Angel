import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { applyErrorOutcome, type AiPassResult, type PendingRow } from '../../src/flagging/pipeline.ts';
import { upsertLocation } from '../../src/db/queries/locations.ts';
import { upsertIndividual } from '../../src/db/queries/individuals.ts';
import { upsertAngel } from '../../src/db/queries/angels.ts';
import { upsertManager } from '../../src/db/queries/managers.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8'));
  upsertManager({ id: 'MGR001', name: 'Vivian' }, db);
  upsertLocation({ id: 'LOC001', name: 'Peachtree', type: 'group_home', manager_id: 'MGR001' }, db);
  upsertIndividual({ id: 'IND001', name: 'John D.', location_id: 'LOC001' }, db);
  upsertAngel({ id: 'ANG001', name: 'Keisha', role: 'DSP', location_id: 'LOC001' }, db);
  return db;
}

function seedTlogWithAttemptCount(db: BetterSqliteDatabase, attemptCount: number): void {
  db.prepare(`
    INSERT INTO t_logs (
      tlog_id, version, is_current,
      individual_id, program_id, created_by_id, manager_id,
      reported_date, time_in, time_out,
      shift_name, notification_level, type, description,
      status, acknowledged,
      classifier_status, classifier_attempt_count, similarity_score
    ) VALUES (
      'TLOG_T', 1, 1,
      'IND001', 'LOC001', 'ANG001', 'MGR001',
      '2026-03-15', '2026-03-15T07:00:00', '2026-03-15T15:00:00',
      'Day', 'Low', 'Notes', 'uneventful',
      'Submitted', 0,
      'retry', ?, 0.3
    )
  `).run(attemptCount);
}

function makeRow(attemptCount: number): PendingRow {
  return {
    tlog_id: 'TLOG_T',
    version: 1,
    individual_id: 'IND001',
    location_id: 'LOC001',
    created_by_id: 'ANG001',
    manager_id: 'MGR001',
    type: 'Notes',
    summary: null,
    notification_level: 'Low',
    shift_name: 'Day',
    similarity_score: 0.3,
    similar_match_tlog_ids: null,
    description: 'uneventful',
    location_type: 'group_home',
    classifier_attempt_count: attemptCount,
    has_open_red_det: 0,
  };
}

function makeResult(): AiPassResult {
  return {
    scanned: 0,
    classified_ok: 0,
    classified_green: 0,
    classified_yellow: 0,
    classified_red: 0,
    escalated_to_red: 0,
    errored: 0,
    permanent_failures: 0,
    wall_clock_ms: 0,
  };
}

test('attempt 1 failure → status=retry, attempt_count=1, no ops_notice', () => {
  const db = freshDb();
  seedTlogWithAttemptCount(db, 0);
  const result = makeResult();

  applyErrorOutcome(
    makeRow(0),
    { ok: false, error_code: '429', message: 'rate limited' },
    result,
    db,
  );

  const row = db.prepare('SELECT * FROM t_logs WHERE tlog_id=?').get('TLOG_T') as {
    classifier_status: string; classifier_error_code: string; classifier_attempt_count: number;
  };
  assert.equal(row.classifier_status, 'retry');
  assert.equal(row.classifier_error_code, '429');
  assert.equal(row.classifier_attempt_count, 1);
  assert.equal(result.errored, 1);
  assert.equal(result.permanent_failures, 0);

  const notices = db.prepare('SELECT COUNT(*) AS c FROM ops_notices').get() as { c: number };
  assert.equal(notices.c, 0);
});

test('attempt 3 failure → status=permanent_failure + ops_notice written', () => {
  const db = freshDb();
  seedTlogWithAttemptCount(db, 2);
  const result = makeResult();

  applyErrorOutcome(
    makeRow(2),
    { ok: false, error_code: '429', message: 'rate limited (final)' },
    result,
    db,
  );

  const row = db.prepare('SELECT * FROM t_logs WHERE tlog_id=?').get('TLOG_T') as {
    classifier_status: string; classifier_attempt_count: number;
  };
  assert.equal(row.classifier_status, 'permanent_failure');
  assert.equal(row.classifier_attempt_count, 3);
  assert.equal(result.permanent_failures, 1);

  const notices = db
    .prepare("SELECT category, message, context_json FROM ops_notices WHERE category='classifier_permanent_failure'")
    .all() as Array<{ category: string; message: string; context_json: string }>;
  assert.equal(notices.length, 1);
  assert.match(notices[0]!.message, /TLOG_T/);
  assert.match(notices[0]!.message, /3 attempts/);
  const ctx = JSON.parse(notices[0]!.context_json);
  assert.equal(ctx.tlog_id, 'TLOG_T');
  assert.equal(ctx.version, 1);
  assert.equal(ctx.last_error_code, '429');
});

test('ops_notice context_json never contains note description', () => {
  const db = freshDb();
  seedTlogWithAttemptCount(db, 2);
  const result = makeResult();

  applyErrorOutcome(
    makeRow(2),
    { ok: false, error_code: 'schema_violation', message: 'bad JSON' },
    result,
    db,
  );

  const notice = db
    .prepare("SELECT message, context_json FROM ops_notices WHERE category='classifier_permanent_failure'")
    .get() as { message: string; context_json: string };

  // P2: no PHI keys in ops_notices
  const combined = notice.message + ' ' + notice.context_json;
  for (const forbidden of ['description', 'summary', 'uneventful', 'note_text']) {
    assert.equal(combined.toLowerCase().includes(forbidden.toLowerCase()), false, `forbidden key "${forbidden}" leaked into ops_notice`);
  }
});
