import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { insertTlog } from '../../src/ingestion/insert-tlog.ts';
import { upsertLocation } from '../../src/db/queries/locations.ts';
import { upsertIndividual } from '../../src/db/queries/individuals.ts';
import { upsertAngel } from '../../src/db/queries/angels.ts';
import { upsertManager } from '../../src/db/queries/managers.ts';
import type { TLogInsertShape } from '../../src/ingestion/normalize.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8');
  db.exec(sql);
  upsertManager({ id: 'MGR002', name: 'Marcus Thompson' }, db);
  upsertLocation({ id: 'LOC002', name: 'Riverside', type: 'group_home', manager_id: 'MGR002' }, db);
  upsertIndividual({ id: 'IND006', name: 'Brittany L.', location_id: 'LOC002' }, db);
  upsertAngel({ id: 'ANG007', name: 'Jamal Roberts', role: 'DSP', location_id: 'LOC002' }, db);
  return db;
}

function baseRow(overrides: Partial<TLogInsertShape> = {}): TLogInsertShape {
  return {
    tlog_id: 'TLOG000016',
    individual_id: 'IND006',
    program_id: 'LOC002',
    created_by_id: 'ANG007',
    manager_id: 'MGR002',
    reported_date: '2026-03-15',
    reported_time: '23:09:00',
    time_in: '2026-03-15T15:00:00',
    time_out: '2026-03-15T23:00:00',
    shift_name: 'Swing',
    notification_level: 'Low',
    type: 'Notes',
    summary: 'same as yesterday',
    description: 'Same as yesterday.',
    status: 'Submitted',
    acknowledged: 0,
    ...overrides,
  };
}

test('first insert creates version=1, is_current=1, classifier_status=pending', () => {
  const db = freshDb();
  const res = insertTlog(baseRow(), db);
  assert.equal(res.action, 'inserted');
  assert.equal(res.version, 1);

  const rows = db.prepare('SELECT * FROM t_logs WHERE tlog_id = ? ORDER BY version').all('TLOG000016') as Array<{
    version: number;
    is_current: number;
    classifier_status: string;
    superseded_at: string | null;
  }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.version, 1);
  assert.equal(rows[0]!.is_current, 1);
  assert.equal(rows[0]!.classifier_status, 'pending');
  assert.equal(rows[0]!.superseded_at, null);
});

test('re-insert with identical description is a noop', () => {
  const db = freshDb();
  insertTlog(baseRow(), db);
  const res = insertTlog(baseRow(), db);
  assert.equal(res.action, 'noop');
  assert.equal(res.version, 1);

  const count = (db.prepare('SELECT COUNT(*) AS c FROM t_logs WHERE tlog_id = ?').get('TLOG000016') as { c: number }).c;
  assert.equal(count, 1);
});

test('re-insert with different description supersedes prior version', () => {
  const db = freshDb();
  insertTlog(baseRow({ description: 'Same as yesterday.' }), db);
  const res = insertTlog(baseRow({ description: 'Brittany L. had a good shift.' }), db);
  assert.equal(res.action, 'superseded');
  assert.equal(res.version, 2);

  const rows = db
    .prepare('SELECT version, is_current, description, superseded_at FROM t_logs WHERE tlog_id = ? ORDER BY version')
    .all('TLOG000016') as Array<{ version: number; is_current: number; description: string; superseded_at: string | null }>;

  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.version, 1);
  assert.equal(rows[0]!.is_current, 0);
  assert.ok(rows[0]!.superseded_at, 'prior version must have superseded_at set');
  assert.equal(rows[0]!.description, 'Same as yesterday.');
  assert.equal(rows[1]!.version, 2);
  assert.equal(rows[1]!.is_current, 1);
  assert.equal(rows[1]!.superseded_at, null);
  assert.equal(rows[1]!.description, 'Brittany L. had a good shift.');
});

test('unique partial index enforces at most one current version per tlog_id', () => {
  const db = freshDb();
  insertTlog(baseRow(), db);

  // Attempt a manual violation: insert a second is_current=1 row for the same tlog_id.
  assert.throws(
    () => {
      db.prepare(`
        INSERT INTO t_logs (
          tlog_id, version, is_current,
          individual_id, program_id, created_by_id, manager_id,
          reported_date, time_in, time_out,
          shift_name, notification_level, type, description,
          status, acknowledged
        ) VALUES (
          'TLOG000016', 99, 1,
          'IND006', 'LOC002', 'ANG007', 'MGR002',
          '2026-03-15', '2026-03-15T15:00:00', '2026-03-15T23:00:00',
          'Swing', 'Low', 'Notes', 'attempted violation',
          'Submitted', 0
        )
      `).run();
    },
    /UNIQUE constraint failed/,
  );
});

test('three-version history is preserved when content changes twice', () => {
  const db = freshDb();
  insertTlog(baseRow({ description: 'v1 text' }), db);
  insertTlog(baseRow({ description: 'v2 text' }), db);
  insertTlog(baseRow({ description: 'v3 text' }), db);

  const rows = db
    .prepare('SELECT version, is_current FROM t_logs WHERE tlog_id = ? ORDER BY version')
    .all('TLOG000016') as Array<{ version: number; is_current: number }>;

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => [r.version, r.is_current]),
    [[1, 0], [2, 0], [3, 1]],
  );
});
