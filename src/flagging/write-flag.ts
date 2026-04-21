import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';

export type FlagSource = 'notification_level' | 'missing_schedule' | 'ai_classifier';
export type FlagSeverity = 'yellow' | 'red';
export type DisplayCategory =
  | 'missing_note'
  | 'high_priority'
  | 'medium_priority'
  | 'pattern_detected'
  | 'system_review';

const ALLOWED_SOURCES: ReadonlySet<FlagSource> = new Set([
  'notification_level',
  'missing_schedule',
  'ai_classifier',
]);

const ALLOWED_DISPLAY_CATEGORIES: ReadonlySet<DisplayCategory> = new Set([
  'missing_note',
  'high_priority',
  'medium_priority',
  'pattern_detected',
  'system_review',
]);

export interface WriteFlagInput {
  tlog_id?: string | null;
  tlog_version?: number | null;
  individual_id: string;
  location_id: string;
  manager_id?: string | null;
  angel_id?: string | null;
  scheduled_shift_date?: string | null;
  scheduled_shift_name?: string | null;
  severity: FlagSeverity;
  source: FlagSource;
  display_category: DisplayCategory;
  rule_id?: number | null;
  rule_version?: number | null;
  reason: string;
  model_name?: string | null;
  model_version?: string | null;
  prompt_version?: number | null;
}

/**
 * Insert a flag row. Validates `source`, `severity`, and `display_category`
 * enums in TypeScript so a bad value surfaces before hitting the DB's CHECK
 * constraints. Returns the new flag's id.
 *
 * Constitution v1.0.1 locks `source` to the three values above. `display_category`
 * is set explicitly by the caller (never derived from `reason` prose per the
 * UI/UX sign-off on 2026-04-21).
 */
export function writeFlag(input: WriteFlagInput, db: BetterSqliteDatabase = getDb()): number {
  if (!ALLOWED_SOURCES.has(input.source)) {
    throw new Error(`writeFlag: invalid source "${input.source}" (allowed: notification_level, missing_schedule, ai_classifier)`);
  }
  if (input.severity !== 'yellow' && input.severity !== 'red') {
    throw new Error(`writeFlag: invalid severity "${input.severity}" (allowed: yellow, red)`);
  }
  if (!ALLOWED_DISPLAY_CATEGORIES.has(input.display_category)) {
    throw new Error(`writeFlag: invalid display_category "${input.display_category}"`);
  }
  if (input.source === 'missing_schedule' && input.tlog_id != null) {
    throw new Error('writeFlag: missing_schedule flags must have tlog_id = null');
  }
  if (input.source !== 'missing_schedule' && !input.tlog_id) {
    throw new Error(`writeFlag: non-missing sources require a tlog_id (source=${input.source})`);
  }

  const info = db
    .prepare(
      `INSERT INTO flags (
        tlog_id, tlog_version, individual_id, location_id, manager_id, angel_id,
        scheduled_shift_date, scheduled_shift_name,
        severity, source, display_category,
        rule_id, rule_version, reason,
        model_name, model_version, prompt_version
      ) VALUES (
        @tlog_id, @tlog_version, @individual_id, @location_id, @manager_id, @angel_id,
        @scheduled_shift_date, @scheduled_shift_name,
        @severity, @source, @display_category,
        @rule_id, @rule_version, @reason,
        @model_name, @model_version, @prompt_version
      )`,
    )
    .run({
      tlog_id: input.tlog_id ?? null,
      tlog_version: input.tlog_version ?? null,
      individual_id: input.individual_id,
      location_id: input.location_id,
      manager_id: input.manager_id ?? null,
      angel_id: input.angel_id ?? null,
      scheduled_shift_date: input.scheduled_shift_date ?? null,
      scheduled_shift_name: input.scheduled_shift_name ?? null,
      severity: input.severity,
      source: input.source,
      display_category: input.display_category,
      rule_id: input.rule_id ?? null,
      rule_version: input.rule_version ?? null,
      reason: input.reason,
      model_name: input.model_name ?? null,
      model_version: input.model_version ?? null,
      prompt_version: input.prompt_version ?? null,
    });

  return info.lastInsertRowid as number;
}
