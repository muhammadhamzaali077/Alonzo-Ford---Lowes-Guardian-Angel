import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';

export interface Rule {
  id: number;
  rule_key: string;
  version: number;
  is_active: number;                 // 0 | 1
  name: string;
  description: string;
  prompt_template: string;
  config_json: string;               // JSON text
  created_at: string;
  created_by: string | null;
}

export interface RuleEditFields {
  name?: string;
  description?: string;
  prompt_template?: string;
  config_json?: object | string;     // accept either; serialized on write
}

export function getActiveRule(
  ruleKey: string,
  db: BetterSqliteDatabase = getDb(),
): Rule | null {
  const row = db
    .prepare('SELECT * FROM rule_config WHERE rule_key = ? AND is_active = 1')
    .get(ruleKey) as Rule | undefined;
  return row ?? null;
}

export function listActiveRules(db: BetterSqliteDatabase = getDb()): Rule[] {
  return db
    .prepare('SELECT * FROM rule_config WHERE is_active = 1 ORDER BY rule_key')
    .all() as Rule[];
}

export function listRuleHistory(
  ruleKey: string,
  db: BetterSqliteDatabase = getDb(),
): Rule[] {
  return db
    .prepare('SELECT * FROM rule_config WHERE rule_key = ? ORDER BY version DESC')
    .all(ruleKey) as Rule[];
}

/**
 * Edit a rule. Creates a new rule_config row with version = prev.version + 1
 * and is_active = 1, and flips the prior active row to is_active = 0.
 *
 * Throws if no active rule exists for `ruleKey` (create via seedDefaultRules
 * first, or extend the admin UI to create new rule keys).
 */
export function editRule(
  ruleKey: string,
  fields: RuleEditFields,
  userId: string | null,
  db: BetterSqliteDatabase = getDb(),
): Rule {
  const result = db.transaction((): Rule => {
    const current = getActiveRule(ruleKey, db);
    if (!current) {
      throw new Error(`editRule: no active rule for rule_key="${ruleKey}"`);
    }

    const newName = fields.name ?? current.name;
    const newDescription = fields.description ?? current.description;
    const newPromptTemplate = fields.prompt_template ?? current.prompt_template;
    const newConfigJson = serializeConfigJson(fields.config_json, current.config_json);
    const newVersion = current.version + 1;

    db.prepare('UPDATE rule_config SET is_active = 0 WHERE id = ?').run(current.id);

    const info = db
      .prepare(
        `INSERT INTO rule_config (rule_key, version, is_active, name, description, prompt_template, config_json, created_by)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      )
      .run(ruleKey, newVersion, newName, newDescription, newPromptTemplate, newConfigJson, userId);

    return db.prepare('SELECT * FROM rule_config WHERE id = ?').get(info.lastInsertRowid) as Rule;
  })();
  return result;
}

/**
 * Revert a rule to the content of a prior version. Never flips an old row's
 * is_active back on — always creates a new version row (= max_version + 1)
 * carrying the prior version's content, and flips the current active off.
 * Preserves the full audit trail.
 */
export function revertRule(
  ruleKey: string,
  versionToRestore: number,
  userId: string | null,
  db: BetterSqliteDatabase = getDb(),
): Rule {
  const result = db.transaction((): Rule => {
    const target = db
      .prepare('SELECT * FROM rule_config WHERE rule_key = ? AND version = ?')
      .get(ruleKey, versionToRestore) as Rule | undefined;
    if (!target) {
      throw new Error(`revertRule: no version ${versionToRestore} for rule_key="${ruleKey}"`);
    }

    const maxRow = db
      .prepare('SELECT MAX(version) AS v FROM rule_config WHERE rule_key = ?')
      .get(ruleKey) as { v: number | null };
    const newVersion = (maxRow.v ?? 0) + 1;

    db.prepare('UPDATE rule_config SET is_active = 0 WHERE rule_key = ? AND is_active = 1').run(ruleKey);

    const info = db
      .prepare(
        `INSERT INTO rule_config (rule_key, version, is_active, name, description, prompt_template, config_json, created_by)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      )
      .run(
        ruleKey,
        newVersion,
        target.name,
        target.description,
        target.prompt_template,
        target.config_json,
        userId,
      );

    return db.prepare('SELECT * FROM rule_config WHERE id = ?').get(info.lastInsertRowid) as Rule;
  })();
  return result;
}

function serializeConfigJson(raw: object | string | undefined, fallback: string): string {
  if (raw === undefined) return fallback;
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw);
}
