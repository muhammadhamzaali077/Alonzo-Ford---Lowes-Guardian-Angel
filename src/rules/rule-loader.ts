// THE ONLY MODULE that reads `rule_config.prompt_template`.
//
// Per constitution P4: classifier prompts are never hardcoded string literals
// in handlers, cron jobs, or anywhere outside this file. If you need prompt
// text, import from here.
//
// Every Phase 5 classifier call goes:
//   loadActiveRules(db) → Rule[]
//   buildSystemPrompt(rules) → string (the system-message content)
//   buildUserMessage(tlogContext) → string (the user-message content)

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { listActiveRules, type Rule } from './rules-admin.js';

export interface ClassifierPromptInput {
  type: string;
  summary: string | null;
  notification_level: 'Low' | 'Medium' | 'High';
  shift_name: string;
  location_type: 'group_home' | 'host_home' | 'day_program';
  similarity_max_score: number | null;
  similar_match_count: number;
  matched_prior_note_excerpt: string | null;
  description: string;
}

export function loadActiveRules(db: BetterSqliteDatabase = getDb()): Rule[] {
  return listActiveRules(db);
}

/**
 * Assemble the classifier's system message from the active rule set.
 * Every rule name, description, and prompt_template is concatenated.
 */
export function buildSystemPrompt(rules: Rule[]): string {
  const preamble = `You are a compliance reviewer for Lowe's Guardian Angel (LGA), a Georgia IDD care provider. LGA staff ("angels") document shifts as T-Logs in Therap. You classify each T-Log into a single severity and provide a brief reason.

Output requirements:
  - Respond with a single JSON object matching the schema {"severity": "green"|"yellow"|"red", "reason": string}
  - "reason" MUST be ≤ 240 characters and refer to specific aspects of the note
  - Return the HIGHEST severity any rule below fires at (red > yellow > green)
  - If no rule fires, return {"severity":"green","reason":"no issues identified"}
  - Do not downgrade a note that Therap has already marked notification_level=High

Rules (evaluate every rule against the note):`;

  const rulesText = rules
    .map((r) => {
      let configBlock = '';
      try {
        const parsed = JSON.parse(r.config_json);
        if (parsed && Object.keys(parsed).length > 0) {
          configBlock = `\nConfiguration: ${JSON.stringify(parsed)}`;
        }
      } catch {
        // malformed config_json — surface in the prompt for human debugging
        configBlock = `\nConfiguration (raw): ${r.config_json}`;
      }
      return `\n\n## ${r.name} (${r.rule_key} v${r.version})\n${r.description}\n\nApplication: ${r.prompt_template}${configBlock}`;
    })
    .join('');

  return preamble + rulesText;
}

/**
 * Serialize the T-Log context the classifier reads. Deliberately JSON so the
 * model knows exactly which fields it has. Note text is the only free-text
 * field; everything else is structured.
 */
export function buildUserMessage(input: ClassifierPromptInput): string {
  return JSON.stringify(input);
}
