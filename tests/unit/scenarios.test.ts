// T123 — scenario transform contracts.
//
// The transforms are pure (Record<string, string>[] → Record<string, string>[])
// so we can validate them without seeding. Pins the guarantees each preset
// should give Alonzo:
//   - quiet     drops all High-priority rows
//   - quiet     drops Jamal's (ANG007) short boilerplate rows
//   - chaotic   drops Sunrise (LOC004) day-shift rows (missing-note amplifier)
//   - chaotic   triples Jamal's output with fresh TLOG_IDs + shifted dates

process.env.OPENROUTER_API_KEY ??= 'sk-or-test';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transformFor, parseScenario, SCENARIOS } from '../../src/admin/scenarios.ts';

function jamal(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    TLOG_ID: 'TLOG_J_001',
    CREATED_BY_ID: 'ANG007',
    NOTIFICATION_LEVEL: 'Low',
    PROGRAM_ID: 'LOC002',
    SHIFT_NAME: 'Day',
    REPORTED_DATE: '2026-03-15',
    REPORTED_TIME: '12:00:00',
    DESCRIPTION: 'Same as yesterday.', // 3 words — would be dropped by quiet
    ...overrides,
  };
}

function sunrise(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    TLOG_ID: 'TLOG_S_001',
    CREATED_BY_ID: 'ANG016',
    NOTIFICATION_LEVEL: 'Low',
    PROGRAM_ID: 'LOC004',
    SHIFT_NAME: 'Day',
    REPORTED_DATE: '2026-04-03',
    REPORTED_TIME: '12:00:00',
    DESCRIPTION: 'Full detail about the day. Activities were varied and engagement was good throughout.',
    ...overrides,
  };
}

function high(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...jamal({ CREATED_BY_ID: 'ANG009', NOTIFICATION_LEVEL: 'High', DESCRIPTION: 'Incident of concern — details here.', ...overrides }) };
}

test('SCENARIOS list has the three expected presets', () => {
  const keys = SCENARIOS.map((s) => s.key).sort();
  assert.deepEqual(keys, ['baseline', 'chaotic', 'quiet']);
});

test('parseScenario accepts the three known keys and rejects everything else', () => {
  assert.equal(parseScenario('baseline'), 'baseline');
  assert.equal(parseScenario('quiet'), 'quiet');
  assert.equal(parseScenario('chaotic'), 'chaotic');
  assert.equal(parseScenario('bogus'), null);
  assert.equal(parseScenario(''), null);
  assert.equal(parseScenario(null), null);
});

test('baseline has no transform (dashboard matches the CSV as-is)', () => {
  assert.equal(transformFor('baseline'), undefined);
});

test('quiet drops every High-priority row', () => {
  const xform = transformFor('quiet')!;
  const input = [
    high({ TLOG_ID: 'T1' }),
    high({ TLOG_ID: 'T2' }),
    jamal({ TLOG_ID: 'T3', DESCRIPTION: 'A much longer note that should survive the quiet filter because it has plenty of words for context.' }),
  ];
  const out = xform(input);
  assert.ok(!out.some((r) => r.NOTIFICATION_LEVEL === 'High'), 'no High rows should survive quiet');
  assert.ok(out.some((r) => r.TLOG_ID === 'T3'));
});

test('quiet drops Jamal\'s short boilerplate even with Low priority', () => {
  const xform = transformFor('quiet')!;
  const out = xform([jamal({ DESCRIPTION: 'Same as yesterday.' })]);
  assert.equal(out.length, 0, 'short Jamal note should be dropped');
});

test('quiet keeps Jamal\'s longer notes', () => {
  const xform = transformFor('quiet')!;
  const longText = 'Sarah K. participated in a supported visit with her sister today. They went to the park and walked around the duck pond; Sarah K. was calm and engaged throughout. No incidents to report.';
  const out = xform([jamal({ DESCRIPTION: longText })]);
  assert.equal(out.length, 1);
});

test('chaotic drops every Sunrise day-shift note (missing-note amplifier)', () => {
  const xform = transformFor('chaotic')!;
  const input = [
    sunrise({ TLOG_ID: 'S1', SHIFT_NAME: 'Day' }),
    sunrise({ TLOG_ID: 'S2', SHIFT_NAME: 'Swing' }),
    sunrise({ TLOG_ID: 'S3', SHIFT_NAME: 'Day' }),
  ];
  const out = xform(input);
  const dayCount = out.filter((r) => r.PROGRAM_ID === 'LOC004' && r.SHIFT_NAME === 'Day').length;
  assert.equal(dayCount, 0, 'no Sunrise day-shift notes should survive');
  assert.ok(out.some((r) => r.TLOG_ID === 'S2'), 'Swing shift at Sunrise still loads');
});

test('chaotic triples Jamal\'s rows with unique TLOG_IDs and shifted dates', () => {
  const xform = transformFor('chaotic')!;
  const input = [jamal({ TLOG_ID: 'J1', REPORTED_DATE: '2026-03-15' })];
  const out = xform(input);
  // 1 original + 2 clones = 3 total
  const jamalRows = out.filter((r) => r.CREATED_BY_ID === 'ANG007');
  assert.equal(jamalRows.length, 3);

  const ids = new Set(jamalRows.map((r) => r.TLOG_ID));
  assert.equal(ids.size, 3, 'cloned TLOG_IDs must be unique');

  const dates = new Set(jamalRows.map((r) => r.REPORTED_DATE));
  assert.equal(dates.size, 3, 'cloned dates must be unique (insertTlog uniqueness depends on this)');
});

test('chaotic keeps non-Jamal, non-Sunrise-day rows untouched', () => {
  const xform = transformFor('chaotic')!;
  const input = [
    { ...jamal({ CREATED_BY_ID: 'ANG001', PROGRAM_ID: 'LOC001', TLOG_ID: 'OTHER_1' }) },
  ];
  const out = xform(input);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.TLOG_ID, 'OTHER_1');
});
