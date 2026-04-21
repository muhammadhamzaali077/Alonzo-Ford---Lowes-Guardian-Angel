// Orchestration layer for the manual upload path.
// Ties together: SheetJS parse → per-row existence checks → normalize →
// insertTlog (with supersession + similarity) → deterministic flagging.
// AI classifier runs in the background after the HTTP response returns.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { getAngel } from '../db/queries/angels.js';
import { getIndividual } from '../db/queries/individuals.js';
import { insertTlog } from '../ingestion/insert-tlog.js';
import { parseUploadBuffer, UploadParseError } from '../ingestion/excel-upload.js';
import { normalizeTlogRow, NormalizeError } from '../ingestion/normalize.js';
import { runAiPass, runDeterministicPass } from '../flagging/pipeline.js';
import { logger } from '../lib/logger.js';

export interface UploadSkippedRow {
  row: number;
  reason: string;
}

export interface UploadResult {
  filename: string;
  parsed: number;
  ingested: number;
  superseded: number;
  noop: number;
  skipped: UploadSkippedRow[];
  new_flags: { red: number; yellow: number; missing: number };
  fatal_error?: string;
}

/**
 * Process an uploaded Excel/CSV buffer. Per-row failures are captured in
 * `skipped` with plain-English reasons; the batch always proceeds. File-level
 * fatal errors (unreadable workbook, empty sheet) return a short-circuited
 * result with `fatal_error` set.
 */
export function processUpload(
  filename: string,
  buffer: Buffer,
  db: BetterSqliteDatabase = getDb(),
): UploadResult {
  const result: UploadResult = {
    filename,
    parsed: 0,
    ingested: 0,
    superseded: 0,
    noop: 0,
    skipped: [],
    new_flags: { red: 0, yellow: 0, missing: 0 },
  };

  let rows: Record<string, string>[];
  try {
    rows = parseUploadBuffer(buffer, filename);
  } catch (err) {
    const msg = err instanceof UploadParseError ? err.message : 'Unexpected error while reading the file.';
    return { ...result, fatal_error: msg };
  }
  result.parsed = rows.length;
  if (rows.length === 0) {
    return { ...result, fatal_error: "We couldn't find any rows in this file — is the first sheet empty?" };
  }

  const before = snapshotFlagCounts(db);

  const txn = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const humanRowNum = i + 2; // +1 for header, +1 for 1-indexing

      // Check individual/angel existence up front so "unknown ID" errors get
      // the friendlier settings-pointing message instead of a FK violation.
      if (row.INDIVIDUAL_ID && !getIndividual(row.INDIVIDUAL_ID, db)) {
        result.skipped.push({
          row: humanRowNum,
          reason: `Unknown individual ID ${row.INDIVIDUAL_ID} — add them in Settings first.`,
        });
        continue;
      }
      if (row.CREATED_BY_ID && !getAngel(row.CREATED_BY_ID, db)) {
        result.skipped.push({
          row: humanRowNum,
          reason: `Unknown angel ID ${row.CREATED_BY_ID} — add them in Settings first.`,
        });
        continue;
      }

      try {
        const normalized = normalizeTlogRow(row, humanRowNum);
        const outcome = insertTlog(normalized, db);
        if (outcome.action === 'inserted') result.ingested++;
        else if (outcome.action === 'superseded') result.superseded++;
        else result.noop++;
      } catch (err) {
        result.skipped.push({
          row: humanRowNum,
          reason: humanizeError(err),
        });
      }
    }
  });
  txn();

  // Run deterministic flagging over the (possibly new) T-Logs.
  runDeterministicPass({}, db);

  // Compute the newly-written flag counts as a diff. Approximation because
  // detectMissingNotes is idempotent and might not add new rows on a small
  // upload, but it's a useful summary line.
  const after = snapshotFlagCounts(db);
  result.new_flags = {
    red:     Math.max(0, after.red     - before.red),
    yellow:  Math.max(0, after.yellow  - before.yellow),
    missing: Math.max(0, after.missing - before.missing),
  };

  // AI classifier runs after the response returns. If it fails or the free
  // tier rate-limits, the retry cron picks it up — the user still gets an
  // immediate summary.
  void runAiPass({}, db).catch((err) => {
    logger.error({ err: String(err) }, 'upload: background AI pass failed');
  });

  // Write ops_notice for partial uploads so Adrian sees them on /admin/ops.
  if (result.skipped.length > 0) {
    db.prepare(
      `INSERT INTO ops_notices (category, message, context_json)
       VALUES ('upload_partial', @msg, @ctx)`,
    ).run({
      msg: `Upload "${filename}" completed with ${result.skipped.length} skipped row${result.skipped.length === 1 ? '' : 's'}.`,
      ctx: JSON.stringify({
        filename,
        parsed: result.parsed,
        ingested: result.ingested,
        skipped_count: result.skipped.length,
      }),
    });
  }

  logger.info(
    {
      filename,
      parsed: result.parsed,
      ingested: result.ingested,
      superseded: result.superseded,
      noop: result.noop,
      skipped: result.skipped.length,
    },
    'upload: complete',
  );

  return result;
}

// -------------------------------------------------------------------------------------------------

function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof NormalizeError) {
    // Translate NormalizeError messages into plain English. The originals are
    // already pretty readable; this adds a touch more context for non-technical
    // admins.
    let m;
    if ((m = msg.match(/Missing required column: (\w+)/))) {
      return `Missing column "${m[1]}" — is this a Therap T-Log export?`;
    }
    if ((m = msg.match(/Unknown shift name: "([^"]+)"/))) {
      return `Shift type "${m[1]}" isn't one we recognize (expected Day, Swing, or Overnight).`;
    }
    if ((m = msg.match(/Unknown notification level: "([^"]+)"/))) {
      return `Notification level "${m[1]}" isn't one we recognize (expected Low, Medium, or High).`;
    }
    if ((m = msg.match(/Required field is empty: (\w+)/))) {
      return `Required field "${m[1]}" is empty.`;
    }
    return msg;
  }
  return `Couldn't read this row: ${msg}`;
}

function snapshotFlagCounts(
  db: BetterSqliteDatabase,
): { red: number; yellow: number; missing: number } {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN severity='red' AND source<>'missing_schedule' AND resolution='open' THEN 1 ELSE 0 END) AS red,
         SUM(CASE WHEN severity='yellow' AND resolution='open' THEN 1 ELSE 0 END) AS yellow,
         SUM(CASE WHEN source='missing_schedule' AND resolution='open' THEN 1 ELSE 0 END) AS missing
       FROM flags`,
    )
    .get() as { red: number | null; yellow: number | null; missing: number | null };
  return {
    red: row.red ?? 0,
    yellow: row.yellow ?? 0,
    missing: row.missing ?? 0,
  };
}
