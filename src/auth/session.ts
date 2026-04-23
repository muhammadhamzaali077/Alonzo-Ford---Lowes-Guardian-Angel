// Session management for the prototype auth path.
//
// Scheme: random 32-byte hex session id stored server-side in `user_sessions`
// and set as an HttpOnly cookie. Stateless JWT was ruled out because the
// prototype already has a DB and server-side logout semantics are nice to
// have. Swap point for Better Auth per research R4 lives in this file.

import { randomBytes } from 'node:crypto';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getCookie, setCookie, deleteCookie as honoDeleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { getDb } from '../db/client.js';
import type { UserRole } from '../views/layout.js';

export const SESSION_COOKIE_NAME = 'ga_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface CreateSessionInput {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export function createSession(
  input: CreateSessionInput,
  db: BetterSqliteDatabase = getDb(),
): { id: string; expiresAt: string } {
  const id = randomBytes(24).toString('hex'); // 48 chars, ~192 bits
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  db.prepare(
    `INSERT INTO user_sessions (id, user_id, expires_at, ip, user_agent)
     VALUES (@id, @userId, @expiresAt, @ip, @userAgent)`,
  ).run({
    id,
    userId: input.userId,
    expiresAt,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id, expiresAt };
}

export function getSessionUser(
  sessionId: string,
  db: BetterSqliteDatabase = getDb(),
): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, s.expires_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
          AND s.expires_at > datetime('now')`,
    )
    .get(sessionId) as { id: string; email: string; name: string; role: string; expires_at: string } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? row.email,
    role: row.role as UserRole,
  };
}

export function deleteSession(sessionId: string, db: BetterSqliteDatabase = getDb()): void {
  db.prepare('DELETE FROM user_sessions WHERE id = ?').run(sessionId);
}

/**
 * Lookup helper shared by the demo-credentials path and the Google OAuth
 * callback. Returns null when the email isn't provisioned — provisioning
 * is deliberately manual (seed script / Settings), not self-signup.
 */
export function getUserByEmail(
  email: string,
  db: BetterSqliteDatabase = getDb(),
): SessionUser | null {
  const row = db
    .prepare('SELECT id, email, name, role FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as
    | { id: string; email: string; name: string | null; role: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? row.email,
    role: row.role as SessionUser['role'],
  };
}

export function purgeExpiredSessions(db: BetterSqliteDatabase = getDb()): number {
  const info = db.prepare("DELETE FROM user_sessions WHERE expires_at <= datetime('now')").run();
  return info.changes;
}

// ---- Cookie helpers ------------------------------------------------------------------------------

export function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: c.req.url.startsWith('https'),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

export function clearSessionCookie(c: Context): void {
  honoDeleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}
