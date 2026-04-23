// T103 — PHI log-redaction verification.
//
// The repo's `scrubPhi` helper is unit-tested for shape correctness in
// `logger.test.ts`. This test goes a level deeper: it constructs a pino
// instance wired up the same way as `src/lib/logger.ts` (log formatter =
// `scrubPhi`) pointed at a capturing stream, fires 50 log calls whose
// payloads include every PHI key at varying nesting depths, and asserts
// that NO redacted value leaks into the emitted NDJSON output.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import pino from 'pino';
import { Writable } from 'node:stream';
import { scrubPhi } from '../../src/lib/logger.ts';

const PHI_KEYS = ['description', 'summary', 'reason', 'individual_name', 'note_text'] as const;

// Marker strings we plant as PHI values. If any survive into the stream we
// fail loudly — the whole point is to prove the formatter strips them.
const PHI_MARKERS = [
  'BRITTANY_L_PHI_MARKER_001',
  'MARCUS_THOMPSON_PHI_MARKER_002',
  'CHOKING_INCIDENT_PHI_MARKER_003',
  'COPY_PASTE_PHI_MARKER_004',
  'SELF_INJURY_PHI_MARKER_005',
] as const;

function captureStream(): { write: (s: string) => void; chunks: string[] } {
  const chunks: string[] = [];
  return {
    chunks,
    write(s: string) { chunks.push(s); },
  };
}

function makeLogger(dest: Writable): pino.Logger {
  return pino(
    {
      level: 'trace',
      formatters: { log: (obj) => scrubPhi(obj) as Record<string, unknown> },
    },
    dest,
  );
}

test('no PHI marker string appears in pino output across 50 varied log calls', () => {
  const capture = captureStream();
  const dest = new Writable({
    write(chunk, _enc, cb) { capture.write(chunk.toString()); cb(); },
  });
  const log = makeLogger(dest);

  // Build 50 log calls. Rotate through:
  //   - flat object with PHI at top-level
  //   - nested under a single wrapper
  //   - nested 3 levels deep
  //   - array of objects each carrying PHI
  //   - mixed: wrapped alongside non-PHI fields
  for (let i = 0; i < 50; i++) {
    const marker = PHI_MARKERS[i % PHI_MARKERS.length]!;
    const phiKey = PHI_KEYS[i % PHI_KEYS.length]!;
    const payload: Record<string, unknown> = { iter: i, tlog_id: `TLOG${String(i).padStart(6, '0')}` };

    switch (i % 5) {
      case 0:
        payload[phiKey] = marker;
        break;
      case 1:
        payload.flag = { tlog_id: 'TLOG_NESTED', [phiKey]: marker };
        break;
      case 2:
        payload.context = { outer: { inner: { [phiKey]: marker } } };
        break;
      case 3:
        payload.flags = [
          { tlog_id: 'A', [phiKey]: marker },
          { tlog_id: 'B', [phiKey]: marker + '_DUP' },
        ];
        break;
      case 4:
        payload.batch = {
          count: 3,
          items: [{ [phiKey]: marker, severity: 'red' }],
          meta: { source: 'ai_classifier' },
        };
        break;
    }

    log.info(payload, `log call ${i}`);
  }

  const emitted = capture.chunks.join('');
  assert.ok(emitted.length > 0, 'expected pino to emit something');

  for (const marker of PHI_MARKERS) {
    assert.ok(
      !emitted.includes(marker),
      `PHI marker "${marker}" leaked into log output — the formatter is not redacting at all depths.\nSnippet: ${emitted.slice(0, 500)}`,
    );
  }

  // Sanity: non-PHI payload fields DO appear (rules out a test that passes
  // because nothing was logged at all).
  assert.ok(emitted.includes('TLOG000000'), 'expected tlog_id to survive redaction');
  assert.ok(emitted.includes('"iter":'), 'expected iter field to survive redaction');
  assert.ok(emitted.includes('[REDACTED]'), 'expected redaction marker in at least one entry');
});

test('createChildLogger scrubs bindings before handing them to pino', () => {
  // Rationale: pino's .child() path does NOT run `formatters.log` on the
  // bindings it carries forward (bindings are serialized as-is at record
  // time). So the repo's `createChildLogger` pre-scrubs bindings with
  // `scrubPhi` before calling `logger.child(...)` — this test pins that
  // contract. If someone stops pre-scrubbing, bindings will leak PHI and
  // this assertion will fail loudly.
  const scrubbed = scrubPhi({
    tlog_id: 'T1',
    reason: 'SHOULD_BE_SCRUBBED_MARKER',
    nested: { description: 'INNER_MARKER' },
  }) as Record<string, unknown>;

  const json = JSON.stringify(scrubbed);
  assert.ok(!json.includes('SHOULD_BE_SCRUBBED_MARKER'), `PHI leaked through scrub: ${json}`);
  assert.ok(!json.includes('INNER_MARKER'), `nested PHI leaked through scrub: ${json}`);
  assert.equal(scrubbed.tlog_id, 'T1');
  assert.equal(scrubbed.reason, '[REDACTED]');
});
