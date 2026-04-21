import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { detectNotificationLevelFlags } from '../../src/flagging/notification-level.ts';
import { insertTlog } from '../../src/ingestion/insert-tlog.ts';
import { upsertLocation } from '../../src/db/queries/locations.ts';
import { upsertIndividual } from '../../src/db/queries/individuals.ts';
import { upsertAngel } from '../../src/db/queries/angels.ts';
import { upsertManager } from '../../src/db/queries/managers.ts';
import type { TLogInsertShape } from '../../src/ingestion/normalize.ts';

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

function tlog(overrides: Partial<TLogInsertShape>): TLogInsertShape {
  return {
    tlog_id: 'TLOG_X',
    individual_id: 'IND001',
    program_id: 'LOC001',
    created_by_id: 'ANG001',
    manager_id: 'MGR001',
    reported_date: '2026-03-15',
    reported_time: '15:00:00',
    time_in: '2026-03-15T07:00:00',
    time_out: '2026-03-15T15:00:00',
    shift_name: 'Day',
    notification_level: 'Low',
    type: 'Notes',
    summary: null,
    description: 'uneventful',
    status: 'Submitted',
    acknowledged: 0,
    ...overrides,
  };
}

test('Low notification_level produces no flag', () => {
  const db = freshDb();
  insertTlog(tlog({ tlog_id: 'TLOG1', notification_level: 'Low' }), db);
  const res = detectNotificationLevelFlags(db);
  assert.equal(res.scanned, 0); // Low is filtered out of the scan set
  const count = (db.prepare('SELECT COUNT(*) AS c FROM flags').get() as { c: number }).c;
  assert.equal(count, 0);
});

test('Medium notification_level produces one yellow flag with display_category=medium_priority', () => {
  const db = freshDb();
  insertTlog(tlog({ tlog_id: 'TLOG2', notification_level: 'Medium' }), db);
  const res = detectNotificationLevelFlags(db);
  assert.equal(res.scanned, 1);
  assert.equal(res.yellow, 1);
  assert.equal(res.red, 0);

  const flag = db.prepare('SELECT * FROM flags').get() as {
    severity: string; source: string; display_category: string; tlog_id: string; tlog_version: number;
    angel_id: string | null; manager_id: string | null; reason: string;
  };
  assert.equal(flag.severity, 'yellow');
  assert.equal(flag.source, 'notification_level');
  assert.equal(flag.display_category, 'medium_priority');
  assert.equal(flag.tlog_id, 'TLOG2');
  assert.equal(flag.tlog_version, 1);
  assert.equal(flag.angel_id, 'ANG001');
  assert.equal(flag.manager_id, 'MGR001');
  assert.match(flag.reason, /Medium/);
});

test('High notification_level produces one red flag with display_category=high_priority', () => {
  const db = freshDb();
  insertTlog(tlog({ tlog_id: 'TLOG3', notification_level: 'High', type: 'Behavior' }), db);
  const res = detectNotificationLevelFlags(db);
  assert.equal(res.red, 1);
  assert.equal(res.yellow, 0);

  const flag = db.prepare('SELECT * FROM flags').get() as {
    severity: string; display_category: string; reason: string;
  };
  assert.equal(flag.severity, 'red');
  assert.equal(flag.display_category, 'high_priority');
  assert.match(flag.reason, /High/);
});

test('detector is idempotent — second run writes zero new flags', () => {
  const db = freshDb();
  insertTlog(tlog({ tlog_id: 'TLOG4', notification_level: 'High' }), db);
  insertTlog(tlog({ tlog_id: 'TLOG5', notification_level: 'Medium' }), db);
  detectNotificationLevelFlags(db);
  const second = detectNotificationLevelFlags(db);
  assert.equal(second.red, 0);
  assert.equal(second.yellow, 0);
  assert.equal(second.skipped_existing, 2);

  const total = (db.prepare('SELECT COUNT(*) AS c FROM flags').get() as { c: number }).c;
  assert.equal(total, 2);
});

test('mixed Low/Medium/High batch produces the right counts', () => {
  const db = freshDb();
  insertTlog(tlog({ tlog_id: 'T_LO', notification_level: 'Low' }), db);
  insertTlog(tlog({ tlog_id: 'T_ME', notification_level: 'Medium' }), db);
  insertTlog(tlog({ tlog_id: 'T_HI', notification_level: 'High' }), db);
  const res = detectNotificationLevelFlags(db);
  assert.equal(res.scanned, 2); // Low not scanned
  assert.equal(res.red, 1);
  assert.equal(res.yellow, 1);
  assert.equal(res.skipped_existing, 0);
});
