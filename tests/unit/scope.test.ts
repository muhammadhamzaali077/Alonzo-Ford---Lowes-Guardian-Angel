// Ensure config validation passes before any test touches the lazy config
// proxy. Must run before `validateCredentials` is invoked (tests only access
// config inside function bodies, so setting here is early enough).
process.env.OPENROUTER_API_KEY ??= 'sk-or-test';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/client.ts';
import {
  canEditRules,
  canEditSettings,
  hasAccess,
  isLocationInScope,
  resolveScope,
} from '../../src/auth/scope.ts';
import { upsertLocation } from '../../src/db/queries/locations.ts';
import { upsertManager } from '../../src/db/queries/managers.ts';
import { createSession, getSessionUser } from '../../src/auth/session.ts';
import { validateCredentials } from '../../src/auth/login.ts';
import { seedUsers } from '../../src/jobs/seed-users.ts';

function freshDb(): BetterSqliteDatabase {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8'));
  // Locations must exist before we can seed the manager user_location_scope rows
  upsertManager({ id: 'MGR001', name: 'Vivian Daniels' }, db);
  upsertManager({ id: 'MGR002', name: 'Marcus Thompson' }, db);
  upsertManager({ id: 'MGR003', name: 'Anthony King' }, db);
  upsertManager({ id: 'MGR004', name: 'Elena Ruiz' }, db);
  upsertLocation({ id: 'LOC001', name: 'Peachtree', type: 'group_home', manager_id: 'MGR001' }, db);
  upsertLocation({ id: 'LOC002', name: 'Riverside', type: 'group_home', manager_id: 'MGR002' }, db);
  upsertLocation({ id: 'LOC003', name: 'Oakwood',   type: 'host_home',  manager_id: 'MGR003' }, db);
  upsertLocation({ id: 'LOC004', name: 'Sunrise',   type: 'day_program', manager_id: 'MGR004' }, db);
  seedUsers(db);
  return db;
}

function userByEmail(email: string, db: BetterSqliteDatabase) {
  return db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email) as
    | { id: string; email: string; name: string; role: string }
    | undefined;
}

test('leadership (Alonzo) resolves to locations=all', () => {
  const db = freshDb();
  const u = userByEmail('alonzo@lowesguardianangel.com', db)!;
  const scope = resolveScope(
    { id: u.id, email: u.email, name: u.name, role: u.role as 'leadership' },
    db,
  );
  assert.equal(scope.locations, 'all');
  assert.equal(isLocationInScope(scope, 'LOC001'), true);
  assert.equal(isLocationInScope(scope, 'LOC004'), true);
  assert.equal(canEditRules(scope), true);
  assert.equal(canEditSettings(scope), true);
});

test('admin (Adrian) resolves to locations=all + both edit permissions', () => {
  const db = freshDb();
  const u = userByEmail('adrian@lowesguardianangel.com', db)!;
  const scope = resolveScope(
    { id: u.id, email: u.email, name: u.name, role: u.role as 'admin' },
    db,
  );
  assert.equal(scope.locations, 'all');
  assert.equal(canEditSettings(scope), true);
  assert.equal(canEditRules(scope), true);
});

test('manager (Vivian) resolves to [LOC001] — single-location', () => {
  const db = freshDb();
  const u = userByEmail('vivian@lowesguardianangel.com', db)!;
  const scope = resolveScope(
    { id: u.id, email: u.email, name: u.name, role: u.role as 'manager' },
    db,
  );
  assert.deepEqual(scope.locations, ['LOC001']);
  assert.equal(isLocationInScope(scope, 'LOC001'), true);
  assert.equal(isLocationInScope(scope, 'LOC002'), false);
  assert.equal(isLocationInScope(scope, 'LOC003'), false);
  assert.equal(isLocationInScope(scope, 'LOC004'), false);
});

test('manager (Anthony) resolves to [LOC003] — single-location per decision #4', () => {
  const db = freshDb();
  const u = userByEmail('anthony@lowesguardianangel.com', db)!;
  const scope = resolveScope(
    { id: u.id, email: u.email, name: u.name, role: u.role as 'manager' },
    db,
  );
  assert.deepEqual(scope.locations, ['LOC003']);
  assert.equal(isLocationInScope(scope, 'LOC003'), true);
  assert.equal(isLocationInScope(scope, 'LOC001'), false);
});

test('manager role does NOT have edit permissions on rules or settings', () => {
  const db = freshDb();
  const u = userByEmail('marcus@lowesguardianangel.com', db)!;
  const scope = resolveScope(
    { id: u.id, email: u.email, name: u.name, role: u.role as 'manager' },
    db,
  );
  assert.equal(canEditRules(scope), false);
  assert.equal(canEditSettings(scope), false);
  assert.equal(hasAccess(scope), true); // manager still has dashboard access
});

test('validateCredentials rejects unknown email even with correct password', () => {
  const db = freshDb();
  const outcome = validateCredentials('nobody@example.com', 'demo', db);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, 'invalid_credentials');
});

test('validateCredentials rejects correct email with wrong password', () => {
  const db = freshDb();
  const outcome = validateCredentials('alonzo@lowesguardianangel.com', 'wrong', db);
  assert.equal(outcome.ok, false);
});

test('validateCredentials accepts correct email + demo password', () => {
  const db = freshDb();
  const outcome = validateCredentials('alonzo@lowesguardianangel.com', 'demo', db);
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.user.role, 'leadership');
    assert.equal(outcome.user.email, 'alonzo@lowesguardianangel.com');
  }
});

test('session lifecycle: create → get → delete', () => {
  const db = freshDb();
  const u = userByEmail('vivian@lowesguardianangel.com', db)!;
  const { id } = createSession({ userId: u.id }, db);
  assert.equal(typeof id, 'string');
  assert.ok(id.length >= 32);

  const session = getSessionUser(id, db);
  assert.ok(session);
  assert.equal(session.email, 'vivian@lowesguardianangel.com');
  assert.equal(session.role, 'manager');

  // Delete and verify it's gone
  db.prepare('DELETE FROM user_sessions WHERE id = ?').run(id);
  assert.equal(getSessionUser(id, db), null);
});

test('expired sessions return null', () => {
  const db = freshDb();
  const u = userByEmail('vivian@lowesguardianangel.com', db)!;
  // Insert a session manually with an expired timestamp
  db.prepare(
    `INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '-1 hour'))`,
  ).run('expired_session', u.id);
  assert.equal(getSessionUser('expired_session', db), null);
});

test('unattributed angel scope (role not manager) means all-locations', () => {
  const db = freshDb();
  const u = userByEmail('demo@lowesguardianangel.com', db)!;
  const scope = resolveScope(
    { id: u.id, email: u.email, name: u.name, role: u.role as 'demo' },
    db,
  );
  assert.equal(scope.locations, 'all');
});
