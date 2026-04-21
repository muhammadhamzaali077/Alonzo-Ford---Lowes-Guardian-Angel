import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrubPhi } from '../../src/lib/logger.ts';

test('scrubPhi redacts top-level PHI keys', () => {
  const input = {
    tlog_id: 'TLOG000016',
    description: 'Same as yesterday.',
    summary: 'repeat',
    reason: 'copy paste detected',
    individual_name: 'Brittany L.',
    note_text: 'anything',
  };
  const out = scrubPhi(input) as Record<string, unknown>;
  assert.equal(out.tlog_id, 'TLOG000016');
  assert.equal(out.description, '[REDACTED]');
  assert.equal(out.summary, '[REDACTED]');
  assert.equal(out.reason, '[REDACTED]');
  assert.equal(out.individual_name, '[REDACTED]');
  assert.equal(out.note_text, '[REDACTED]');
});

test('scrubPhi recurses into nested objects', () => {
  const input = { flag: { tlog_id: 'TLOG000016', reason: 'redact me' } };
  const out = scrubPhi(input) as { flag: Record<string, unknown> };
  assert.equal(out.flag.tlog_id, 'TLOG000016');
  assert.equal(out.flag.reason, '[REDACTED]');
});

test('scrubPhi redacts inside arrays', () => {
  const input = { flags: [{ tlog_id: 'TLOG000016', reason: 'redact' }] };
  const out = scrubPhi(input) as { flags: Array<Record<string, unknown>> };
  const first = out.flags[0];
  assert.ok(first);
  assert.equal(first.reason, '[REDACTED]');
  assert.equal(first.tlog_id, 'TLOG000016');
});

test('scrubPhi leaves non-PHI values untouched', () => {
  const input = { tlog_id: 'x', count: 7, active: true, tags: ['a', 'b'] };
  const out = scrubPhi(input) as Record<string, unknown>;
  assert.equal(out.tlog_id, 'x');
  assert.equal(out.count, 7);
  assert.equal(out.active, true);
  assert.deepEqual(out.tags, ['a', 'b']);
});

test('scrubPhi passes through primitives and nulls', () => {
  assert.equal(scrubPhi('hello'), 'hello');
  assert.equal(scrubPhi(42), 42);
  assert.equal(scrubPhi(null), null);
  assert.equal(scrubPhi(undefined), undefined);
});
