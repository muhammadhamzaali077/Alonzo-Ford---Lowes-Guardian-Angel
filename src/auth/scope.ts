// Request-scope middleware — real session version (Phase 11).
//
// Replaces the hardcoded demo stub. Flow:
//   1. Read session cookie.
//   2. Look up the session in user_sessions (DB-backed, not stateless).
//   3. Resolve the user's role + locations:
//      - leadership / admin / demo → locations = 'all'
//      - manager                   → locations = rows from user_location_scope
//   4. Attach to `c.set('scope', ...)` for handlers to read.
//
// Unauthenticated requests: the middleware does NOT force a redirect here —
// it just leaves `c.var.scope` unset. Route handlers (see server.ts) decide
// whether to redirect to /auth/login or return 401/403. This keeps auth
// routes (/auth/login, /auth/login/demo) usable without a session.

import type { Context, Next } from 'hono';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import type { LocationScope } from '../db/queries/dashboard.js';
import type { UserRole } from '../views/layout.js';
import { getSessionUser, readSessionCookie, type SessionUser } from './session.js';

export interface RequestScope {
  user: SessionUser;
  locations: LocationScope;
}

export async function scopeMiddleware(c: Context, next: Next): Promise<void> {
  const sessionId = readSessionCookie(c);
  if (sessionId) {
    const user = getSessionUser(sessionId);
    if (user) {
      c.set('scope', resolveScope(user));
    }
  }
  await next();
}

/** Returns the scope object for an already-known user (used by login + tests). */
export function resolveScope(
  user: SessionUser,
  db: BetterSqliteDatabase = getDb(),
): RequestScope {
  return {
    user,
    locations: resolveLocations(user, db),
  };
}

function resolveLocations(user: SessionUser, db: BetterSqliteDatabase): LocationScope {
  if (user.role === 'leadership' || user.role === 'admin' || user.role === 'demo') {
    return 'all';
  }
  // manager — lookup user_location_scope
  const rows = db
    .prepare('SELECT location_id FROM user_location_scope WHERE user_id = ?')
    .all(user.id) as Array<{ location_id: string }>;
  return rows.map((r) => r.location_id);
}

export function getScope(c: Context): RequestScope | null {
  const raw = c.get('scope');
  return (raw as RequestScope | undefined) ?? null;
}

/** True when the user has at least read access (leadership/admin/demo/manager with ≥1 location). */
export function hasAccess(scope: RequestScope | null): boolean {
  if (!scope) return false;
  if (scope.locations === 'all') return true;
  return scope.locations.length > 0;
}

/** True when the user can read admin surfaces (Settings + Rules). */
export function canEditRules(scope: RequestScope | null): boolean {
  if (!scope) return false;
  return ['leadership', 'admin', 'demo'].includes(scope.user.role);
}

export function canEditSettings(scope: RequestScope | null): boolean {
  if (!scope) return false;
  // Prototype: leadership + demo also see Settings so demos aren't blocked.
  // Production tightens to admin-only — flip this once real admins are seeded.
  return ['admin', 'leadership', 'demo'].includes(scope.user.role);
}

/** True when the user's scope covers this location. */
export function isLocationInScope(scope: RequestScope | null, locationId: string): boolean {
  if (!scope) return false;
  if (scope.locations === 'all') return true;
  return scope.locations.includes(locationId);
}
