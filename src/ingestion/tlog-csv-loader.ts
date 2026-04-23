import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { insertTlog } from './insert-tlog.js';
import { normalizeTlogRow } from './normalize.js';
import { logger } from '../lib/logger.js';

export interface LoadTlogsResult {
  parsed: number;
  inserted: number;
  superseded: number;
  noop: number;
  skipped: Array<{ row: number; reason: string }>;
}

/**
 * Parse `fixtures/lga_synthetic_tlogs.csv` and insert every row through the
 * normalize → insertTlog pipeline. Idempotent end-to-end:
 *   - first run on an empty `t_logs` table → all rows inserted
 *   - re-running with identical content → every row noop
 *   - re-running after a content change → affected rows superseded
 *
 * A per-row failure (unknown enum, missing required field) is captured in
 * `skipped` but does NOT fail the batch (spec FR-003).
 */
/**
 * Optional row transformer — lets scenario presets (T123) filter / amplify
 * the baseline fixture without writing separate CSV files. Receives the
 * parsed rows and returns the rows to actually load.
 */
export type CsvRowTransform = (rows: Record<string, string>[]) => Record<string, string>[];

export function loadTlogsFromFixture(
  db: BetterSqliteDatabase = getDb(),
  transform?: CsvRowTransform,
): LoadTlogsResult {
  const path = resolveFixture('lga_synthetic_tlogs.csv');
  const parsed = parseCsv(readFileSync(path, 'utf-8'));
  const rawRows = transform ? transform(parsed) : parsed;

  const result: LoadTlogsResult = {
    parsed: rawRows.length,
    inserted: 0,
    superseded: 0,
    noop: 0,
    skipped: [],
  };

  const txn = db.transaction(() => {
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      const csvRowNumber = i + 2; // +1 for 1-based, +1 for header
      try {
        const normalized = normalizeTlogRow(row, csvRowNumber);
        const outcome = insertTlog(normalized, db);
        if (outcome.action === 'inserted') result.inserted++;
        else if (outcome.action === 'superseded') result.superseded++;
        else result.noop++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        result.skipped.push({ row: csvRowNumber, reason });
      }
    }
  });
  txn();

  logger.info(
    {
      parsed: result.parsed,
      inserted: result.inserted,
      superseded: result.superseded,
      noop: result.noop,
      skipped: result.skipped.length,
    },
    'tlogs loaded',
  );
  return result;
}

// -------------------------------------------------------------------------------------------------

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]!);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]!] = cells[c] ?? '';
    }
    out.push(obj);
  }
  return out;
}

/**
 * RFC-4180-minimum parser: handles comma delimiters, optional double-quote
 * wrapping, and escaped quotes inside quoted fields. Fixture rows with embedded
 * commas in the description (e.g. TLOG000005) require this.
 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function resolveFixture(filename: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../fixtures', filename),
    resolve(process.cwd(), 'fixtures', filename),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Fixture not found: ${filename} (tried: ${candidates.join(', ')})`);
}
