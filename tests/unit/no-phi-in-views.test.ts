// T104 — static grep for PHI leaks in server-rendered views.
//
// Constitution P2: PHI must never be embedded in places that leave the
// `<body>` text flow — specifically, inline `<script>` blocks (interpreted
// as JS, so a stray quote in a note description can break parsing or
// leak into window globals) and `data-*` attributes (inspectable via the
// DOM, often scraped by analytics libs, and harder for reviewers to spot).
//
// "Banned PHI fields" = the same keys that `src/lib/logger.ts`'s `scrubPhi`
// redacts: description, summary, reason, individual_name, note_text.
//
// The test walks every file under `src/views/` and fails if it finds a
// template expression that concatenates any banned field inside a
// `<script>` body or inside a `data-*` attribute value.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/views');

const BANNED_FIELDS = ['description', 'summary', 'reason', 'individual_name', 'note_text'] as const;

// Fields inside a `.flag`/`.f`/etc. accessor: `${f.reason}`, `${flag.description}`, etc.
// We match on the bare field name preceded by `.` (member access) or `{` / `(` (argument)
// or `$` (start of template expression) to keep false positives tolerable.
function buildFieldAccessPattern(field: string): RegExp {
  // Matches .field or ${field or (field or ,field or =field with word-boundary after
  return new RegExp(`[.\\s{(,=]${field}\\b`, 'g');
}

function collectViewFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectViewFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Find ranges in the file that are inside an inline <script> body.
// Returns [start, end] offsets (exclusive end). Handles src="…"-only script
// tags (no body) by yielding nothing.
function scriptBodyRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const openRe = /<script\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(text)) !== null) {
    // `<script src="…"></script>` — the body is empty; skip any single-tag form.
    const openTag = m[0];
    const bodyStart = m.index + openTag.length;
    const closeIdx = text.indexOf('</script>', bodyStart);
    if (closeIdx === -1) continue;
    if (closeIdx === bodyStart) continue; // empty body
    ranges.push([bodyStart, closeIdx]);
  }
  return ranges;
}

// Find ranges inside `data-*="…"` attribute values.
function dataAttrRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // data-foo="…" or data-foo='…'
  const re = /\bdata-[a-z][a-z0-9-]*\s*=\s*(["'])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const quote = m[1]!;
    const valueStart = m.index + m[0].length;
    const valueEnd = text.indexOf(quote, valueStart);
    if (valueEnd === -1) continue;
    ranges.push([valueStart, valueEnd]);
  }
  return ranges;
}

function offsetInAnyRange(offset: number, ranges: Array<[number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (offset >= start && offset < end) return true;
  }
  return false;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

test('no banned PHI field is concatenated inside a <script> body across src/views/**/*.ts', () => {
  const files = collectViewFiles(VIEWS_DIR);
  const hits: string[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const scriptRanges = scriptBodyRanges(text);
    if (scriptRanges.length === 0) continue;

    for (const field of BANNED_FIELDS) {
      const pattern = buildFieldAccessPattern(field);
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const idx = m.index + 1; // skip leading delimiter
        if (offsetInAnyRange(idx, scriptRanges)) {
          hits.push(`${file}:${lineOf(text, idx)} — field "${field}" appears inside a <script> body`);
        }
      }
    }
  }

  assert.deepEqual(
    hits,
    [],
    `Banned PHI field appears inside an inline <script> body. Fix by moving the data out of <script> (e.g., render it as plain text in <body>, or serialize after server-side redaction).\nHits:\n  ${hits.join('\n  ')}`,
  );
});

test('no banned PHI field is concatenated inside a data-* attribute across src/views/**/*.ts', () => {
  const files = collectViewFiles(VIEWS_DIR);
  const hits: string[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const attrRanges = dataAttrRanges(text);
    if (attrRanges.length === 0) continue;

    for (const field of BANNED_FIELDS) {
      const pattern = buildFieldAccessPattern(field);
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const idx = m.index + 1;
        if (offsetInAnyRange(idx, attrRanges)) {
          hits.push(`${file}:${lineOf(text, idx)} — field "${field}" appears inside a data-* attribute`);
        }
      }
    }
  }

  assert.deepEqual(
    hits,
    [],
    `Banned PHI field appears inside a data-* attribute. Fix by rendering the value as plain text, not a serialized attribute.\nHits:\n  ${hits.join('\n  ')}`,
  );
});

test('sanity: at least one view file was scanned (guards against empty-dir false-pass)', () => {
  const files = collectViewFiles(VIEWS_DIR);
  assert.ok(files.length >= 5, `expected at least 5 view files under src/views, found ${files.length}`);
});
