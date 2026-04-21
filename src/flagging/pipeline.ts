// Full flagging pipeline orchestration.
//
// Order (constitution P5, locked):
//   1. Missing-note pass        (deterministic, no LLM)
//   2. Notification-level pass  (deterministic, no LLM)
//   3. Similarity pre-pass      (deterministic; runs inline during insertTlog
//                                and in backfillSimilarity when needed)
//   4. AI classifier pass       (per-note OpenRouter call, concurrency-capped)
//
// The AI pass SKIPS any T-Log that already has an open red deterministic flag
// (source = 'notification_level' or 'missing_schedule'). It MAY escalate a
// deterministic yellow to red by writing a new 'ai_classifier' flag alongside.
// It NEVER modifies existing flag rows.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { classifierLimit } from '../lib/concurrency.js';
import { logger } from '../lib/logger.js';
import { classifyNote, type ClassifierResult } from './classifier.js';
import { recordClassifierCall } from './classifier-usage.js';
import { detectMissingNotes, type DetectMissingOptions, type DetectMissingResult } from './missing.js';
import { detectNotificationLevelFlags, type DetectNotificationLevelResult } from './notification-level.js';
import { writeFlag, type DisplayCategory } from './write-flag.js';
import {
  buildSystemPrompt,
  buildUserMessage,
  loadActiveRules,
  type ClassifierPromptInput,
} from '../rules/rule-loader.js';
import type { Rule } from '../rules/rules-admin.js';

// -------------------------------------------------------------------------------------------------
// Deterministic passes (no network, no LLM)
// -------------------------------------------------------------------------------------------------

export interface DeterministicPassResult {
  notification_level: DetectNotificationLevelResult;
  missing: DetectMissingResult;
}

export function runDeterministicPass(
  missingOpts: DetectMissingOptions = {},
  db: BetterSqliteDatabase = getDb(),
): DeterministicPassResult {
  const missing = detectMissingNotes(missingOpts, db);
  const notification_level = detectNotificationLevelFlags(db);
  return { notification_level, missing };
}

// -------------------------------------------------------------------------------------------------
// AI classifier pass
// -------------------------------------------------------------------------------------------------

export interface RunAiPassOptions {
  /** Optional reported_date window. Default = no filter (all pending rows). */
  windowStart?: string;
  windowEnd?: string;
  /**
   * If true, re-classify even notes already marked classifier_status='ok'.
   * Used by the rule-edit re-run flow.
   */
  force?: boolean;
}

export interface AiPassResult {
  scanned: number;
  classified_ok: number;
  classified_green: number;
  classified_yellow: number;
  classified_red: number;
  escalated_to_red: number; // yellow deterministic → red AI
  errored: number;
  permanent_failures: number;
  wall_clock_ms: number;
}

export interface PendingRow {
  tlog_id: string;
  version: number;
  individual_id: string;
  location_id: string;
  created_by_id: string | null;
  manager_id: string | null;
  type: string;
  summary: string | null;
  notification_level: 'Low' | 'Medium' | 'High';
  shift_name: 'Day' | 'Swing' | 'Overnight';
  similarity_score: number | null;
  similar_match_tlog_ids: string | null;
  description: string;
  location_type: 'group_home' | 'host_home' | 'day_program';
  classifier_attempt_count: number;
  has_open_red_det: number; // 0 | 1 — any open red deterministic flag on this (tlog_id, version)
}

export async function runAiPass(
  opts: RunAiPassOptions = {},
  db: BetterSqliteDatabase = getDb(),
): Promise<AiPassResult> {
  const started = Date.now();
  const activeRules = loadActiveRules(db);
  const systemPrompt = buildSystemPrompt(activeRules);
  const rulePromptVersion = activeRuleVersion(activeRules);
  const similarityThreshold = copyPasteThreshold(activeRules);

  const rows = loadPendingRows(opts, db);

  logger.info(
    { scanned: rows.length, force: Boolean(opts.force), model: process.env.OPENROUTER_MODEL ?? null },
    'ai pass: starting',
  );

  const result: AiPassResult = {
    scanned: rows.length,
    classified_ok: 0,
    classified_green: 0,
    classified_yellow: 0,
    classified_red: 0,
    escalated_to_red: 0,
    errored: 0,
    permanent_failures: 0,
    wall_clock_ms: 0,
  };

  await Promise.all(
    rows.map((row) =>
      classifierLimit(async () => {
        const promptInput = buildPromptInput(row, db);
        const outcome = await classifyNote({
          systemPrompt,
          userMessage: buildUserMessage(promptInput),
          tlogIdForLog: row.tlog_id,
        });

        if (outcome.ok) {
          recordClassifierCall(outcome.input_tokens, outcome.output_tokens, false, db);
          applyOkOutcome(row, outcome, similarityThreshold, rulePromptVersion, result, db);
        } else {
          recordClassifierCall(0, 0, true, db);
          applyErrorOutcome(row, outcome, result, db);
        }
      }),
    ),
  );

  result.wall_clock_ms = Date.now() - started;
  logger.info(result, 'ai pass: complete');
  return result;
}

// -------------------------------------------------------------------------------------------------

export async function runFullPipeline(
  opts: { missing?: DetectMissingOptions; ai?: RunAiPassOptions } = {},
  db: BetterSqliteDatabase = getDb(),
): Promise<{ deterministic: DeterministicPassResult; ai: AiPassResult }> {
  const deterministic = runDeterministicPass(opts.missing ?? {}, db);
  const ai = await runAiPass(opts.ai ?? {}, db);
  return { deterministic, ai };
}

// -------------------------------------------------------------------------------------------------
// Rule re-run (Phase 7)
// -------------------------------------------------------------------------------------------------

export interface RerunOnWindowResult {
  ai: AiPassResult;
  superseded_flags: number;
}

/**
 * Re-run the AI classifier for notes in [windowStart, windowEnd].
 *
 *   1. Mark all open `ai_classifier` flags in window as `superseded_by_rerun`.
 *      Deterministic flags (notification_level, missing_schedule) are untouched
 *      because they don't depend on rule content.
 *   2. Reset `classifier_status` back to 'pending' for every current T-Log in
 *      window so `runAiPass` re-classifies them.
 *   3. Run `runAiPass({windowStart, windowEnd, force: true})` — writes fresh
 *      `ai_classifier` flags reflecting the current active rule set.
 */
export async function rerunOnWindow(
  windowStart: string,
  windowEnd: string,
  db: BetterSqliteDatabase = getDb(),
): Promise<RerunOnWindowResult> {
  const superseded = db.transaction(() => {
    const updateFlags = db.prepare(
      `UPDATE flags
          SET resolution = 'superseded_by_rerun',
              resolved_at = datetime('now')
        WHERE source = 'ai_classifier'
          AND resolution = 'open'
          AND tlog_id IN (
            SELECT tlog_id FROM t_logs
             WHERE is_current = 1 AND reported_date BETWEEN @start AND @end
          )`,
    ).run({ start: windowStart, end: windowEnd });

    db.prepare(
      `UPDATE t_logs
          SET classifier_status = 'pending',
              classifier_error_code = NULL,
              classifier_attempt_count = 0,
              classifier_last_attempt_at = NULL
        WHERE is_current = 1 AND reported_date BETWEEN @start AND @end`,
    ).run({ start: windowStart, end: windowEnd });

    return updateFlags.changes;
  })();

  const ai = await runAiPass({ windowStart, windowEnd, force: true }, db);
  return { ai, superseded_flags: superseded };
}

// -------------------------------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------------------------------

function loadPendingRows(opts: RunAiPassOptions, db: BetterSqliteDatabase): PendingRow[] {
  const where: string[] = ['t.is_current = 1'];
  const params: Record<string, unknown> = {};

  if (!opts.force) {
    where.push("(t.classifier_status IS NULL OR t.classifier_status IN ('pending','retry'))");
    where.push('t.classifier_attempt_count < 3');
  }
  if (opts.windowStart) {
    where.push('t.reported_date >= @windowStart');
    params.windowStart = opts.windowStart;
  }
  if (opts.windowEnd) {
    where.push('t.reported_date <= @windowEnd');
    params.windowEnd = opts.windowEnd;
  }

  const sql = `
    SELECT
      t.tlog_id, t.version, t.individual_id, t.program_id AS location_id,
      t.created_by_id, t.manager_id, t.type, t.summary,
      t.notification_level, t.shift_name,
      t.similarity_score, t.similar_match_tlog_ids, t.description,
      t.classifier_attempt_count,
      l.type AS location_type,
      CASE WHEN EXISTS (
        SELECT 1 FROM flags f
         WHERE f.tlog_id = t.tlog_id AND f.tlog_version = t.version
           AND f.severity = 'red' AND f.resolution = 'open'
           AND f.source IN ('notification_level','missing_schedule')
      ) THEN 1 ELSE 0 END AS has_open_red_det
    FROM t_logs t
    JOIN locations l ON l.id = t.program_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.reported_date, t.tlog_id
  `;

  const rows = db.prepare(sql).all(params) as PendingRow[];
  // Filter in app code (has_open_red_det = 1 means skip) so we keep the SELECT simple.
  return rows.filter((r) => r.has_open_red_det === 0);
}

function buildPromptInput(row: PendingRow, db: BetterSqliteDatabase): ClassifierPromptInput {
  let similar_match_count = 0;
  let matched_prior_note_excerpt: string | null = null;

  if (row.similar_match_tlog_ids) {
    try {
      const matches = JSON.parse(row.similar_match_tlog_ids) as Array<{ tlog_id: string; version: number; score: number }>;
      similar_match_count = matches.length;
      if (matches.length > 0) {
        const top = matches[0]!;
        const excerpt = db
          .prepare('SELECT description FROM t_logs WHERE tlog_id = ? AND version = ?')
          .get(top.tlog_id, top.version) as { description: string } | undefined;
        if (excerpt) matched_prior_note_excerpt = excerpt.description.slice(0, 200);
      }
    } catch {
      // malformed JSON — skip
    }
  }

  return {
    type: row.type,
    summary: row.summary,
    notification_level: row.notification_level,
    shift_name: row.shift_name,
    location_type: row.location_type,
    similarity_max_score: row.similarity_score,
    similar_match_count,
    matched_prior_note_excerpt,
    description: row.description,
  };
}

function applyOkOutcome(
  row: PendingRow,
  outcome: { verdict: { severity: 'green' | 'yellow' | 'red'; reason: string }; model: string },
  similarityThreshold: number,
  rulePromptVersion: number,
  result: AiPassResult,
  db: BetterSqliteDatabase,
): void {
  // Mark the T-Log as ok'd by the classifier, independent of whether a flag is written.
  db.prepare(
    "UPDATE t_logs SET classifier_status='ok', classifier_error_code=NULL, classifier_attempt_count = classifier_attempt_count + 1, classifier_last_attempt_at=datetime('now') WHERE tlog_id=? AND version=?",
  ).run(row.tlog_id, row.version);

  result.classified_ok++;

  const sev = outcome.verdict.severity;
  if (sev === 'green') {
    result.classified_green++;
    return;
  }

  // AI-escalate policy: an ai_classifier flag is always written when severity != green.
  // If a deterministic yellow exists and AI says red → escalate (write ai_classifier red alongside).
  // If AI says yellow and no deterministic flag exists → write ai_classifier yellow.
  // Constitution P5: AI can never write a flag that contradicts (downgrades) a deterministic one —
  // but since we skip rows with deterministic RED before even calling the AI, the only possible
  // interaction is yellow → red escalation. Never the other direction.

  const display_category = sev === 'red' && aboveThreshold(row.similarity_score, similarityThreshold)
    ? 'pattern_detected' as DisplayCategory
    : 'system_review' as DisplayCategory;

  writeFlag(
    {
      tlog_id: row.tlog_id,
      tlog_version: row.version,
      individual_id: row.individual_id,
      location_id: row.location_id,
      manager_id: row.manager_id,
      angel_id: row.created_by_id,
      severity: sev,
      source: 'ai_classifier',
      display_category,
      rule_id: null,
      rule_version: rulePromptVersion,
      reason: outcome.verdict.reason,
      model_name: outcome.model,
      model_version: outcome.model,
      prompt_version: rulePromptVersion,
    },
    db,
  );

  if (sev === 'red') {
    result.classified_red++;
    if (row.notification_level === 'Medium') {
      // Medium → deterministic yellow already exists; this is an escalation.
      result.escalated_to_red++;
    }
  } else {
    result.classified_yellow++;
  }
}

/**
 * Exported for unit testing. Called from inside `runAiPass` for each failed
 * classifier outcome. Also exported so Phase 5.5's retry worker and a unit
 * test can simulate "attempt 3 → permanent_failure + ops_notice" without
 * hitting the OpenRouter API.
 */
export function applyErrorOutcome(
  row: PendingRow,
  outcome: ClassifierResult & { ok: false },
  result: AiPassResult,
  db: BetterSqliteDatabase,
): void {
  // Bump attempt count, record status.
  const newAttemptCount = row.classifier_attempt_count + 1;
  const permanent = newAttemptCount >= 3;
  db.prepare(
    `UPDATE t_logs
        SET classifier_status = CASE WHEN @permanent = 1 THEN 'permanent_failure' ELSE 'retry' END,
            classifier_error_code = @code,
            classifier_attempt_count = @count,
            classifier_last_attempt_at = datetime('now')
      WHERE tlog_id = @tlog_id AND version = @version`,
  ).run({
    tlog_id: row.tlog_id,
    version: row.version,
    code: outcome.error_code,
    count: newAttemptCount,
    permanent: permanent ? 1 : 0,
  });

  result.errored++;
  if (permanent) {
    result.permanent_failures++;
    db.prepare(
      `INSERT INTO ops_notices (category, message, context_json)
       VALUES ('classifier_permanent_failure', @message, @context)`,
    ).run({
      message: `${row.tlog_id} v${row.version}: classifier failed after 3 attempts (last error ${outcome.error_code})`,
      context: JSON.stringify({
        tlog_id: row.tlog_id,
        version: row.version,
        last_error_code: outcome.error_code,
      }),
    });
  }
}

function aboveThreshold(score: number | null, threshold: number): boolean {
  return score != null && score >= threshold;
}

function copyPasteThreshold(rules: Rule[]): number {
  const cp = rules.find((r) => r.rule_key === 'copy_paste');
  if (!cp) return 0.85;
  try {
    const cfg = JSON.parse(cp.config_json) as { similarity_threshold?: number };
    return typeof cfg.similarity_threshold === 'number' ? cfg.similarity_threshold : 0.85;
  } catch {
    return 0.85;
  }
}

function activeRuleVersion(rules: Rule[]): number {
  // Use the MAX version across active rules as the "prompt_version" signature.
  // A rule edit bumps one rule's version; re-runs see a fresh max.
  return rules.reduce((max, r) => (r.version > max ? r.version : max), 1);
}
