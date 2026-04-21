// Credential validation for the prototype demo-login path.
//
// Every seeded user (demo + 4 managers + admin) shares the same
// DEMO_LOGIN_PASSWORD from the env. That's intentional for the prototype
// demo — it lets the presenter flip roles instantly without juggling
// credentials. Per constitution P3 this path is a first-class demo feature.
//
// Production-mode boot-time guard (src/config.ts::assertDemoPasswordSafety)
// ensures this never ships publicly with the default "demo" password.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { config } from '../config.js';
import { getDb } from '../db/client.js';
import type { SessionUser } from './session.js';

export type LoginOutcome =
  | { ok: true; user: SessionUser }
  | { ok: false; error: 'invalid_credentials' | 'user_inactive' };

/**
 * Validate an email + password against the seeded user table. Currently a
 * shared-password scheme for the prototype; production will either wire
 * Google SSO (see google.ts) or per-user bcrypt via Better Auth.
 */
export function validateCredentials(
  email: string,
  password: string,
  db: BetterSqliteDatabase = getDb(),
): LoginOutcome {
  if (password !== config.DEMO_LOGIN_PASSWORD) {
    return { ok: false, error: 'invalid_credentials' };
  }
  const row = db
    .prepare('SELECT id, email, name, role FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as { id: string; email: string; name: string | null; role: string } | undefined;
  if (!row) {
    return { ok: false, error: 'invalid_credentials' };
  }
  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      name: row.name ?? row.email,
      role: row.role as SessionUser['role'],
    },
  };
}
