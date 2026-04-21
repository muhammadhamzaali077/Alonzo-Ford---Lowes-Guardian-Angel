// Railway cron: Monday 11:30 UTC (30 min before the weekly digest).
//
// Checks whether any T-Logs were ingested in the past 7 days. If none, writes
// an `ops_notice(category='ingestion_gap', ...)` so the weekly-digest job
// (firing 30 min later) can suppress dispatch and Adrian can see the gap
// on /admin/ops the next morning.

import { pathToFileURL } from 'node:url';
import { closeDb, getDb } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { getAnchorDate } from '../db/queries/last-refresh.js';
import { logger } from '../lib/logger.js';
import { weekWindowsFrom } from '../digest/render.js';

export function runIngestionGapCheck(): { gap: boolean; ingestedCount: number; windowStart: string; windowEnd: string } {
  migrate();
  const db = getDb();
  const anchor = getAnchorDate(db);
  const windows = weekWindowsFrom(anchor);

  const ingested = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM t_logs
        WHERE is_current = 1
          AND ingested_at BETWEEN @start || 'T00:00:00' AND @end || 'T23:59:59'`,
    )
    .get({ start: windows.thisStart, end: windows.thisEnd }) as { n: number }).n;

  if (ingested === 0) {
    db.prepare(
      `INSERT INTO ops_notices (category, message, context_json)
       VALUES ('ingestion_gap', @msg, @ctx)`,
    ).run({
      msg: `No notes ingested between ${windows.thisStart} and ${windows.thisEnd}. Weekly digest will be suppressed.`,
      ctx: JSON.stringify({ window_start: windows.thisStart, window_end: windows.thisEnd }),
    });
    logger.warn({ window: [windows.thisStart, windows.thisEnd] }, 'ingestion-gap-check: zero ingested notes this week');
    return { gap: true, ingestedCount: 0, windowStart: windows.thisStart, windowEnd: windows.thisEnd };
  }

  logger.info({ ingested }, 'ingestion-gap-check: ingestion healthy');
  return { gap: false, ingestedCount: ingested, windowStart: windows.thisStart, windowEnd: windows.thisEnd };
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === cliEntry) {
  try {
    runIngestionGapCheck();
  } catch (err) {
    logger.error({ err: String(err) }, 'ingestion-gap-check: failed');
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}
