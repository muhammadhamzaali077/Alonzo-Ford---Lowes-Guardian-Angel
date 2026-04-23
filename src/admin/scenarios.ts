// T123 — Scenario presets. Three different "shapes" of the same synthetic
// fixture, selected by Alonzo during a demo:
//
//   - baseline : the original 648-row fixture, unmodified
//   - quiet    : filtered to mostly-green — drops every High-priority row
//                and the known Jamal copy-paste cluster
//   - chaotic  : amplified — duplicates Jamal's near-identical notes 3x so
//                the copy-paste story pops, and drops the Sunrise day-shifts
//                entirely so Friday missing-note flags multiply
//
// We keep ONE CSV in the tree (fixtures/lga_synthetic_tlogs.csv). Each
// preset is a pure transform over the parsed rows, so adding or tuning a
// preset never touches the fixture or the loader. The selected preset is
// recorded in `app_settings.current_scenario` so cold boots pick it up.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import type { CsvRowTransform } from '../ingestion/tlog-csv-loader.js';
import { logger } from '../lib/logger.js';
import { seedAll } from '../jobs/seed.js';
import { runAiPass, runDeterministicPass } from '../flagging/pipeline.js';
import { prestageDemoFeedback } from './prestage-demo-feedback.js';
import { config } from '../config.js';

export type Scenario = 'baseline' | 'quiet' | 'chaotic';
const VALID_SCENARIOS: readonly Scenario[] = ['baseline', 'quiet', 'chaotic'];

export const SCENARIOS: Array<{
  key: Scenario;
  label: string;
  description: string;
  severityHint: 'good' | 'neutral' | 'bad';
}> = [
  {
    key: 'baseline',
    label: 'Baseline',
    description: 'The original synthetic fixture. Mixed signal — Jamal\'s copy-paste cluster, Sunrise Friday gaps, a couple of genuine incidents.',
    severityHint: 'neutral',
  },
  {
    key: 'quiet',
    label: 'Quiet week',
    description: 'Mostly green. High-priority notes removed and Jamal\'s copy-paste cluster dropped, so compliance lands above 95% for every location.',
    severityHint: 'good',
  },
  {
    key: 'chaotic',
    label: 'Chaotic week',
    description: 'Amplified problems. Jamal\'s copy-paste cluster tripled and Sunrise day-shift notes dropped so Friday missing flags pile up.',
    severityHint: 'bad',
  },
];

// -------------------------------------------------------------------------------------------------
// Persistence
// -------------------------------------------------------------------------------------------------

export function getCurrentScenario(db: BetterSqliteDatabase = getDb()): Scenario {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'current_scenario'")
    .get() as { value: string } | undefined;
  if (row && VALID_SCENARIOS.includes(row.value as Scenario)) {
    return row.value as Scenario;
  }
  return 'baseline';
}

export function setCurrentScenario(s: Scenario, db: BetterSqliteDatabase = getDb()): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('current_scenario', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(s);
}

// -------------------------------------------------------------------------------------------------
// Transforms
// -------------------------------------------------------------------------------------------------

/** Get the CSV row transform for a given scenario. Baseline returns undefined. */
export function transformFor(s: Scenario): CsvRowTransform | undefined {
  if (s === 'baseline') return undefined;
  if (s === 'quiet')    return quietTransform;
  if (s === 'chaotic')  return chaoticTransform;
  return undefined;
}

/**
 * Quiet week — filter out anything that would fire a red flag. Keep only
 * Low-notification notes with enough text to pass the short-note rule,
 * and drop Jamal's copy-paste offenders entirely (his boilerplate template
 * rows are what the similarity pipeline clusters on).
 */
const quietTransform: CsvRowTransform = (rows) => {
  return rows.filter((r) => {
    if (r.NOTIFICATION_LEVEL === 'High') return false;
    // Jamal's (ANG007) boilerplate cluster — skip his shorter notes which
    // are what drive the copy-paste pattern. 15 words catches "Same as
    // yesterday" and the "Shift went well. X ate meals and took meds"
    // template without dropping his legitimate longer notes.
    if (r.CREATED_BY_ID === 'ANG007') {
      const words = (r.DESCRIPTION ?? '').trim().split(/\s+/).filter(Boolean).length;
      if (words < 15) return false;
    }
    return true;
  });
};

/**
 * Chaotic week — amplify the two hero patterns. Triple Jamal's cluster so
 * the copy-paste signal is impossible to miss; drop every Sunrise (LOC004)
 * day-shift note so missing-note flags pile up.
 */
const chaoticTransform: CsvRowTransform = (rows) => {
  const out: Record<string, string>[] = [];
  let cloneCounter = 0;

  for (const r of rows) {
    // Drop every Sunrise day-shift note. The schedule still says one was
    // expected, so missing-note detection fires for each.
    if (r.PROGRAM_ID === 'LOC004' && r.SHIFT_NAME === 'Day') continue;

    out.push(r);

    // For Jamal's near-identical notes, add two more copies with shifted
    // TLOG_IDs and reported_date so similarity clustering grows.
    if (r.CREATED_BY_ID === 'ANG007') {
      for (let k = 0; k < 2; k++) {
        const clone = { ...r };
        cloneCounter++;
        clone.TLOG_ID = `TLOG_CH${String(cloneCounter).padStart(5, '0')}`;
        // Advance reported_date by a few days per clone so the unique
        // partial index (tlog_id, is_current) never collides.
        clone.REPORTED_DATE = shiftDate(r.REPORTED_DATE ?? '', k + 1);
        clone.REPORTED_TIME = r.REPORTED_TIME ?? '';
        out.push(clone);
      }
    }
  }
  return out;
};

function shiftDate(iso: string, days: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// -------------------------------------------------------------------------------------------------
// Apply (wipe + reseed with the preset's transform)
// -------------------------------------------------------------------------------------------------

// Same wipe order as reset-demo.ts. Kept inline so scenario switches don't
// depend on the reset-demo module's public surface staying stable.
const WIPE_ORDER = [
  'flag_feedback',
  'flags',
  'classifier_usage',
  'ops_notices',
  't_logs',
  'shift_schedule',
  'user_location_scope',
  'digest_recipients',
  'individuals',
  'angels',
  'locations',
  'managers',
  'rule_config',
] as const;

export interface ApplyScenarioResult {
  scenario: Scenario;
  t_logs: number;
  locations: number;
  angels: number;
  individuals: number;
}

export async function applyScenario(
  scenario: Scenario,
  db: BetterSqliteDatabase = getDb(),
): Promise<ApplyScenarioResult> {
  logger.info({ scenario }, 'apply scenario: wiping');
  const wipe = db.transaction(() => {
    for (const t of WIPE_ORDER) db.prepare(`DELETE FROM ${t}`).run();
  });
  wipe();

  const counts = seedAll({ tlogTransform: transformFor(scenario) });
  setCurrentScenario(scenario, db);

  // Run the flagging pipeline inline so the dashboard renders populated
  // immediately after the POST completes. Without this the user sees an
  // empty dashboard after every scenario switch and has to wait for a
  // server restart. Deterministic pass is synchronous + fast; the AI pass
  // under PROTOTYPE_STUB_CLASSIFIER runs in ~300ms for ~650 notes so it's
  // safe to await here. If a real (network) classifier is wired up, this
  // call becomes the bottleneck and should be moved back to fire-and-forget
  // with a "flags refreshing..." banner on the dashboard.
  const det = runDeterministicPass({}, db);
  const ai = await runAiPass({}, db);

  // Re-seed the demo thumbs-up — the wipe cleared flag_feedback, and we
  // want the "1" counter to stay consistent across scenario switches.
  if (config.PROTOTYPE_STUB_CLASSIFIER) {
    prestageDemoFeedback(db);
  }

  logger.info(
    {
      scenario,
      t_logs: counts.t_logs,
      det_red: det.notification_level.red,
      det_yellow: det.notification_level.yellow,
      det_missing: det.missing.missing_written,
      ai_red: ai.classified_red,
      ai_yellow: ai.classified_yellow,
    },
    'apply scenario: complete',
  );

  return {
    scenario,
    t_logs: counts.t_logs,
    locations: counts.locations,
    angels: counts.angels,
    individuals: counts.individuals,
  };
}

export function parseScenario(raw: string | null | undefined): Scenario | null {
  if (!raw) return null;
  return VALID_SCENARIOS.includes(raw as Scenario) ? (raw as Scenario) : null;
}
