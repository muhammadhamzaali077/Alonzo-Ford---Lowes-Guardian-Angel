// T124 / demo-readiness — pre-stage one thumbs-up so the counter on
// Jamal's first copy-paste flag renders non-zero out of the box. Called
// from two places:
//   - server.ts boot, after the first AI pass completes
//   - admin/scenarios.ts applyScenario, after reseed + flagging passes
// Second call handles the case where switching scenarios wipes
// flag_feedback and otherwise resets the counter back to 0.
//
// Idempotent: UPSERT on (flag_id, user_id). No-ops silently if the target
// flag or user doesn't exist yet.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';

export function prestageDemoFeedback(db: BetterSqliteDatabase = getDb()): void {
  try {
    const alonzo = db
      .prepare("SELECT id FROM users WHERE email = 'alonzo@lowesguardianangel.com'")
      .get() as { id: string } | undefined;
    if (!alonzo) return;

    const flag = db
      .prepare(
        `SELECT id FROM flags
          WHERE source = 'ai_classifier'
            AND severity = 'red'
            AND angel_id = 'ANG007'
            AND resolution = 'open'
            AND reason LIKE '%Near-identical content%'
          ORDER BY id ASC
          LIMIT 1`,
      )
      .get() as { id: number } | undefined;
    if (!flag) return;

    db.prepare(
      `INSERT INTO flag_feedback (flag_id, user_id, verdict) VALUES (?, ?, 'up')
         ON CONFLICT(flag_id, user_id) DO NOTHING`,
    ).run(flag.id, alonzo.id);
    logger.info({ flag_id: flag.id }, 'pre-staged demo thumbs-up on Jamal cluster flag');
  } catch (err) {
    logger.warn({ err: String(err) }, 'prestageDemoFeedback failed (non-fatal)');
  }
}
