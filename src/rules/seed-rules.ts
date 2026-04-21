import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { DEFAULT_RULES } from './default-rules.js';

/**
 * Insert DEFAULT_RULES as version=1, is_active=1 rows.
 * Idempotent per rule_key: if any row already exists for a given key, that
 * rule is skipped (edits made via the admin screen are preserved).
 */
export function seedDefaultRules(db: BetterSqliteDatabase = getDb()): number {
  const existingKeys = new Set(
    (db
      .prepare('SELECT DISTINCT rule_key FROM rule_config')
      .all() as Array<{ rule_key: string }>).map((r) => r.rule_key),
  );

  const insert = db.prepare(
    `INSERT INTO rule_config (rule_key, version, is_active, name, description, prompt_template, config_json, created_by)
     VALUES (?, 1, 1, ?, ?, ?, ?, NULL)`,
  );

  let inserted = 0;
  const txn = db.transaction(() => {
    for (const rule of DEFAULT_RULES) {
      if (existingKeys.has(rule.rule_key)) continue;
      insert.run(
        rule.rule_key,
        rule.name,
        rule.description,
        rule.prompt_template,
        JSON.stringify(rule.config_json),
      );
      inserted++;
    }
  });
  txn();

  if (inserted > 0) {
    logger.info({ inserted }, 'default rules seeded');
  } else {
    logger.info('default rules already seeded; skipping');
  }
  return inserted;
}
