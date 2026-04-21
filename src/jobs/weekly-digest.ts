// Railway cron: Monday 12:00 UTC = 08:00 ET.
//
// For each active digest_recipient:
//   1. Skip + write ops_notice('digest_suppressed') if the recipient's scope
//      has zero ingested notes in the window (per T087 / FR-024).
//   2. renderDigest(recipient, anchorDate) → HTML
//   3. sendDigest(digest) → in prototype, stored in preview store; in
//      production, dispatched via Resend.
//
// The /digest/preview page invokes this same function on every load so the
// user never sees stale previews.

import { pathToFileURL } from 'node:url';
import { closeDb, getDb } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { getAnchorDate } from '../db/queries/last-refresh.js';
import { listRecipients, type DigestRecipient } from '../db/queries/recipients.js';
import { getDigestCounts } from '../db/queries/digest.js';
import { renderDigest, weekWindowsFrom } from '../digest/render.js';
import { sendDigest } from '../digest/send.js';
import { previewStore } from '../digest/preview-store.js';
import { logger } from '../lib/logger.js';

export interface WeeklyDigestResult {
  window_start: string;
  window_end: string;
  recipients: number;
  sent: number;
  suppressed: number;
  errors: number;
}

/**
 * Regenerate digests for every active recipient. Clears the preview store
 * first so a stale recipient whose row was deleted between runs doesn't
 * linger on the preview page.
 */
export async function runWeeklyDigest(): Promise<WeeklyDigestResult> {
  migrate();
  const db = getDb();
  const anchor = getAnchorDate(db);
  const windows = weekWindowsFrom(anchor);

  previewStore.clear();

  const recipients = listRecipients(db).filter((r) => r.is_active === 1);

  const result: WeeklyDigestResult = {
    window_start: windows.thisStart,
    window_end: windows.thisEnd,
    recipients: recipients.length,
    sent: 0,
    suppressed: 0,
    errors: 0,
  };

  for (const recipient of recipients) {
    try {
      if (shouldSuppress(recipient, windows.thisStart, windows.thisEnd, db)) {
        result.suppressed++;
        continue;
      }
      const rendered = renderDigest(recipient, anchor, db);
      await sendDigest(rendered);
      result.sent++;
    } catch (err) {
      logger.error(
        { recipient: recipient.email, err: String(err) },
        'weekly-digest: recipient failed',
      );
      result.errors++;
    }
  }

  logger.info(result, 'weekly-digest: complete');
  return result;
}

/** Zero-note suppression check (T087 / FR-024). */
function shouldSuppress(
  recipient: DigestRecipient,
  start: string,
  end: string,
  db: import('better-sqlite3').Database,
): boolean {
  const counts = getDigestCounts(recipient.scope, start, end, db);
  if (counts.expected === 0 && counts.submitted_not_red === 0 && counts.red === 0 && counts.yellow === 0 && counts.missing === 0) {
    db.prepare(
      `INSERT INTO ops_notices (category, message, context_json)
       VALUES ('digest_suppressed', @msg, @ctx)`,
    ).run({
      msg: `Weekly email skipped for ${recipient.email} (scope: ${recipient.scope}) — zero ingested notes between ${start} and ${end}.`,
      ctx: JSON.stringify({
        recipient_id: recipient.id,
        email: recipient.email,
        scope: recipient.scope,
        window_start: start,
        window_end: end,
      }),
    });
    logger.warn(
      { recipient: recipient.email, scope: recipient.scope, window: [start, end] },
      'weekly-digest: suppressed (no notes in window)',
    );
    return true;
  }
  return false;
}

const cliEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === cliEntry) {
  runWeeklyDigest()
    .catch((err) => {
      logger.error({ err: String(err) }, 'weekly-digest: failed');
      process.exitCode = 1;
    })
    .finally(() => {
      closeDb();
    });
}
