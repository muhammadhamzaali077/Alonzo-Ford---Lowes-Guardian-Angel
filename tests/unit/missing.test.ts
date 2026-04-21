import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import { detectMissingNotes } from '../../src/flagging/missing.ts';
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
  return db;
}

function seedIndividualWithDayProgramSchedule(db: BetterSqliteDatabase): void {
  upsertManager({ id: 'MGR004', name: 'Elena' }, db);
  upsertLocation({ id: 'LOC004', name: 'Sunrise', type: 'day_program', manager_id: 'MGR004' }, db);
  upsertIndividual({ id: 'IND011', name: 'Nicole F.', location_id: 'LOC004' }, db);
  // Day program: Day shift 09:00-15:00, weekdays only
  db.prepare(
    `INSERT INTO shift_schedule (individual_id, shift_name, start_time, end_time, days_of_week, active_from)
     VALUES (?, 'Day', '09:00', '15:00', 'mon,tue,wed,thu,fri', '2026-03-01')`,
  ).run('IND011');
}

function tlog(o: Partial<TLogInsertShape>): TLogInsertShape {
  return {
    tlog_id: 'X',
    individual_id: 'IND011',
    program_id: 'LOC004',
    created_by_id: null,
    manager_id: 'MGR004',
    reported_date: '2026-03-16',
    reported_time: '14:00:00',
    time_in: '2026-03-16T09:00:00',
    time_out: '2026-03-16T15:00:00',
    shift_name: 'Day',
    notification_level: 'Low',
    type: 'Notes',
    summary: null,
    description: 'present',
    status: 'Submitted',
    acknowledged: 0,
    ...o,
  };
}

test('no shifts expected outside window → no flags', () => {
  const db = freshDb();
  seedIndividualWithDayProgramSchedule(db);
  // Window is Sat+Sun only — day program pattern is weekdays-only, so zero expected.
  const res = detectMissingNotes(
    {
      windowStart: '2026-03-21',
      windowEnd: '2026-03-22',
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(res.expected_shifts, 0);
  assert.equal(res.missing_written, 0);
});

test('all expected shifts present → zero missing flags', () => {
  const db = freshDb();
  seedIndividualWithDayProgramSchedule(db);
  // Mon–Fri 3/16–3/20, 5 t_logs for IND011
  for (const d of ['2026-03-16','2026-03-17','2026-03-18','2026-03-19','2026-03-20']) {
    insertTlog(
      tlog({
        tlog_id: `TLOG_${d}`,
        reported_date: d,
        time_in: `${d}T09:00:00`,
        time_out: `${d}T15:00:00`,
      }),
      db,
    );
  }
  const res = detectMissingNotes(
    {
      windowStart: '2026-03-16',
      windowEnd: '2026-03-20',
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(res.expected_shifts, 5);
  assert.equal(res.present, 5);
  assert.equal(res.missing_written, 0);
});

test('gap with single-DSP location attributes the flag to that angel', () => {
  const db = freshDb();
  seedIndividualWithDayProgramSchedule(db);
  // Exactly one DSP at Sunrise → flag attributes to them per R13
  upsertAngel({ id: 'ANG_SOLO', name: 'Solo DSP', role: 'DSP', location_id: 'LOC004' }, db);

  // No T-Logs → every weekday is missing
  const res = detectMissingNotes(
    {
      windowStart: '2026-03-16',
      windowEnd: '2026-03-18',  // Mon+Tue+Wed
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(res.expected_shifts, 3);
  assert.equal(res.missing_written, 3);
  assert.equal(res.attributed_to_angel, 3);
  assert.equal(res.unattributed, 0);

  const flags = db
    .prepare("SELECT severity, source, display_category, angel_id, scheduled_shift_name, scheduled_shift_date FROM flags WHERE source='missing_schedule' ORDER BY scheduled_shift_date")
    .all() as Array<{
      severity: string; source: string; display_category: string;
      angel_id: string | null; scheduled_shift_name: string; scheduled_shift_date: string;
    }>;
  assert.equal(flags.length, 3);
  for (const f of flags) {
    assert.equal(f.severity, 'red');
    assert.equal(f.source, 'missing_schedule');
    assert.equal(f.display_category, 'missing_note');
    assert.equal(f.angel_id, 'ANG_SOLO');
    assert.equal(f.scheduled_shift_name, 'Day');
  }
});

test('gap with multiple DSPs at location leaves angel_id null (unattributed)', () => {
  const db = freshDb();
  seedIndividualWithDayProgramSchedule(db);
  upsertAngel({ id: 'ANG_A', name: 'DSP A', role: 'DSP', location_id: 'LOC004' }, db);
  upsertAngel({ id: 'ANG_B', name: 'DSP B', role: 'DSP', location_id: 'LOC004' }, db);

  const res = detectMissingNotes(
    {
      windowStart: '2026-03-16',
      windowEnd: '2026-03-16',  // single Monday
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(res.expected_shifts, 1);
  assert.equal(res.missing_written, 1);
  assert.equal(res.attributed_to_angel, 0);
  assert.equal(res.unattributed, 1);

  const flag = db.prepare("SELECT angel_id, manager_id FROM flags WHERE source='missing_schedule'").get() as {
    angel_id: string | null; manager_id: string | null;
  };
  assert.equal(flag.angel_id, null);
  assert.equal(flag.manager_id, 'MGR004'); // manager always attributed
});

test('grace window blocks flags within 6 hours of shift end', () => {
  const db = freshDb();
  seedIndividualWithDayProgramSchedule(db);
  upsertAngel({ id: 'ANG_SOLO', name: 'Solo', role: 'DSP', location_id: 'LOC004' }, db);

  // "now" is 3 hours after the 3/16 15:00 ET shift end — still within 6h grace.
  // 3/16 15:00 ET = 3/16 19:00 UTC. now = 3/16 22:00 UTC.
  const res = detectMissingNotes(
    {
      windowStart: '2026-03-16',
      windowEnd: '2026-03-16',
      graceHours: 6,
      now: new Date('2026-03-16T22:00:00Z'),
    },
    db,
  );
  assert.equal(res.expected_shifts, 1);
  assert.equal(res.missing_written, 0);
  assert.equal(res.missing_skipped_within_grace, 1);
});

test('detector is idempotent — re-running skips already-flagged gaps', () => {
  const db = freshDb();
  seedIndividualWithDayProgramSchedule(db);
  upsertAngel({ id: 'ANG_SOLO', name: 'Solo', role: 'DSP', location_id: 'LOC004' }, db);

  const first = detectMissingNotes(
    {
      windowStart: '2026-03-16',
      windowEnd: '2026-03-18',
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(first.missing_written, 3);

  const second = detectMissingNotes(
    {
      windowStart: '2026-03-16',
      windowEnd: '2026-03-18',
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(second.missing_written, 0);
  assert.equal(second.missing_skipped_existing, 3);

  const total = (db.prepare("SELECT COUNT(*) AS c FROM flags WHERE source='missing_schedule'").get() as { c: number }).c;
  assert.equal(total, 3);
});

test('group_home Overnight shift — reported_date is next day, not shift-start day', () => {
  const db = freshDb();
  upsertManager({ id: 'MGR002', name: 'Marcus' }, db);
  upsertLocation({ id: 'LOC002', name: 'Riverside', type: 'group_home', manager_id: 'MGR002' }, db);
  upsertIndividual({ id: 'IND004', name: 'Sarah K.', location_id: 'LOC002' }, db);
  upsertAngel({ id: 'ANG006', name: 'Shanice', role: 'DSP', location_id: 'LOC002' }, db);
  db.prepare(
    "INSERT INTO shift_schedule (individual_id, shift_name, start_time, end_time, days_of_week, active_from) VALUES (?, 'Overnight', '23:00', '07:00', 'mon,tue,wed,thu,fri,sat,sun', '2026-03-01')",
  ).run('IND004');

  // Overnight shift starting 3/15 23:00 ends 3/16 07:00 → reported_date should be 3/16
  insertTlog(
    {
      tlog_id: 'TLOG_ON_PRESENT',
      individual_id: 'IND004',
      program_id: 'LOC002',
      created_by_id: 'ANG006',
      manager_id: 'MGR002',
      reported_date: '2026-03-16',
      reported_time: '07:30:00',
      time_in: '2026-03-15T23:00:00',
      time_out: '2026-03-16T07:00:00',
      shift_name: 'Overnight',
      notification_level: 'Low',
      type: 'Notes',
      summary: null,
      description: 'all quiet',
      status: 'Submitted',
      acknowledged: 0,
    },
    db,
  );

  const res = detectMissingNotes(
    {
      windowStart: '2026-03-15',
      windowEnd: '2026-03-15',  // only the Overnight that STARTS on 3/15
      now: new Date('2026-05-01T00:00:00Z'),
    },
    db,
  );
  assert.equal(res.expected_shifts, 1);
  assert.equal(res.present, 1);
  assert.equal(res.missing_written, 0);
});
