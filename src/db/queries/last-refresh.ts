import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';
import { config } from '../../config.js';
import { humanizeSince } from '../../lib/time.js';

/**
 * Max(ingested_at) across current T-Logs — the raw "newest ingest" timestamp.
 * Returns null on an empty DB.
 */
export function getLastIngestedAt(db: BetterSqliteDatabase = getDb()): string | null {
  const row = db
    .prepare('SELECT MAX(ingested_at) AS t FROM t_logs WHERE is_current = 1')
    .get() as { t: string | null };
  return row.t;
}

/**
 * Humanized freshness label for the header's "Data current as of..." bar.
 *
 * In production this is just `humanizeSince(getLastIngestedAt())`. In
 * PROTOTYPE_MODE we floor the rendered age at "a few hours ago" so a demo
 * run days after the fixture was seeded doesn't show a misleading "3 days
 * ago" string — the synthetic data is always "current" for demo purposes.
 * The real ingested_at column is untouched; this is strictly a label clamp.
 */
export function getFreshnessLabel(now: Date = new Date(), db: BetterSqliteDatabase = getDb()): string {
  const raw = getLastIngestedAt(db);
  if (!raw) return 'never';
  if (config.PROTOTYPE_MODE) {
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const withTz = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
    const then = new Date(withTz);
    const ageMs = now.getTime() - then.getTime();
    // 6 hours: stable threshold chosen to span an office day. If the demo
    // was seeded within the last 6 hours the natural "N minutes / N hours
    // ago" string is truthful; beyond that we clamp to avoid staleness.
    if (Number.isNaN(ageMs) || ageMs > 6 * 60 * 60 * 1000) {
      return '3 hours ago';
    }
  }
  return humanizeSince(raw, now);
}

/**
 * Anchor date for "Last N days" windows — latest reported_date in the fixture.
 * Defaults to wall-clock today when the DB has no T-Logs. Per UI/UX decision
 * #5 (option a): default windows are anchored to max(reported_date), not today.
 */
export function getAnchorDate(db: BetterSqliteDatabase = getDb()): string {
  const row = db
    .prepare('SELECT MAX(reported_date) AS d FROM t_logs WHERE is_current = 1')
    .get() as { d: string | null };
  return row.d ?? new Date().toISOString().slice(0, 10);
}
