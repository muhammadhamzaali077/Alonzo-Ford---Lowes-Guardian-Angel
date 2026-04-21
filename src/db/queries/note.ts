// Single-note queries powering the note-detail page and its audit disclosure.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export interface NoteDetailRow {
  tlog_id: string;
  version: number;
  is_current: number;
  individual_id: string;
  individual_name: string;
  program_id: string;
  location_name: string;
  location_type: string;
  created_by_id: string | null;
  angel_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  reported_date: string;
  reported_time: string | null;
  time_in: string;
  time_out: string;
  shift_name: string;
  notification_level: string;
  type: string;
  summary: string | null;
  description: string;
  similarity_score: number | null;
  similar_match_tlog_ids: string | null;
  classifier_status: string | null;
  ingested_at: string;
  superseded_at: string | null;
}

export function getNoteDetail(
  tlogId: string,
  version: number,
  db: BetterSqliteDatabase = getDb(),
): NoteDetailRow | null {
  const row = db
    .prepare(
      `SELECT
         t.tlog_id, t.version, t.is_current,
         t.individual_id, i.name AS individual_name,
         t.program_id, l.name AS location_name, l.type AS location_type,
         t.created_by_id, a.name AS angel_name,
         t.manager_id, m.name AS manager_name,
         t.reported_date, t.reported_time, t.time_in, t.time_out,
         t.shift_name, t.notification_level, t.type, t.summary, t.description,
         t.similarity_score, t.similar_match_tlog_ids,
         t.classifier_status, t.ingested_at, t.superseded_at
       FROM t_logs t
       LEFT JOIN individuals i ON i.id = t.individual_id
       LEFT JOIN locations l ON l.id = t.program_id
       LEFT JOIN angels a ON a.id = t.created_by_id
       LEFT JOIN managers m ON m.id = t.manager_id
       WHERE t.tlog_id = ? AND t.version = ?`,
    )
    .get(tlogId, version) as NoteDetailRow | undefined;
  return row ?? null;
}

export interface NoteFlagRow {
  id: number;
  severity: 'red' | 'yellow';
  source: 'notification_level' | 'missing_schedule' | 'ai_classifier';
  display_category: string;
  rule_id: number | null;
  rule_version: number | null;
  rule_name: string | null;
  reason: string;
  model_name: string | null;
  model_version: string | null;
  prompt_version: number | null;
  created_at: string;
  resolution: string;
}

export function getFlagsForNote(
  tlogId: string,
  version: number,
  db: BetterSqliteDatabase = getDb(),
): NoteFlagRow[] {
  return db
    .prepare(
      `SELECT f.id, f.severity, f.source, f.display_category,
              f.rule_id, f.rule_version, r.name AS rule_name,
              f.reason, f.model_name, f.model_version, f.prompt_version,
              f.created_at, f.resolution
         FROM flags f
         LEFT JOIN rule_config r ON r.id = f.rule_id
        WHERE f.tlog_id = ? AND f.tlog_version = ?
        ORDER BY CASE f.severity WHEN 'red' THEN 0 ELSE 1 END,
                 f.created_at DESC`,
    )
    .all(tlogId, version) as NoteFlagRow[];
}

export function listNoteVersions(
  tlogId: string,
  db: BetterSqliteDatabase = getDb(),
): Array<{ version: number; is_current: number; ingested_at: string; superseded_at: string | null }> {
  return db
    .prepare(
      `SELECT version, is_current, ingested_at, superseded_at
         FROM t_logs WHERE tlog_id = ? ORDER BY version DESC`,
    )
    .all(tlogId) as Array<{ version: number; is_current: number; ingested_at: string; superseded_at: string | null }>;
}
