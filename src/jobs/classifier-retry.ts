// npm run job:retry  (also: Railway cron */15 * * * *)
//
// Re-runs the AI classifier for every T-Log currently marked
// classifier_status='retry' with attempt_count < 3. Success paths write the
// appropriate flag and flip status to 'ok'. On a 3rd consecutive failure the
// pipeline marks the row `permanent_failure` and writes an
// ops_notices(category='classifier_permanent_failure', ...) row so Adrian can
// see the coverage gap on `/admin/ops`.
//
// The worker is a thin wrapper — all retry/permanent-failure logic lives in
// runAiPass (pipeline.ts). Calling it on each cron tick is what drives
// attempts from 1 → 2 → 3 over time.

import { pathToFileURL } from 'node:url';
import { closeDb } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { runAiPass } from '../flagging/pipeline.js';
import { logger } from '../lib/logger.js';

export async function runClassifierRetry(): Promise<void> {
  migrate(); // idempotent; ensures schema exists if the worker boots before the web service
  logger.info('classifier-retry: starting');
  const result = await runAiPass();
  logger.info(
    {
      scanned: result.scanned,
      classified_ok: result.classified_ok,
      errored: result.errored,
      permanent_failures: result.permanent_failures,
      wall_clock_ms: result.wall_clock_ms,
    },
    'classifier-retry: complete',
  );
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === cliEntry) {
  runClassifierRetry()
    .catch((err) => {
      logger.error({ err: String(err) }, 'classifier-retry: failed');
      process.exitCode = 1;
    })
    .finally(() => {
      closeDb();
    });
}
