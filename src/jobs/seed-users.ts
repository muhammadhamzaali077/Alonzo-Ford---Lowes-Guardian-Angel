// Seed authenticated users + user_location_scope rows.
//
// Users: demo (leadership convenience), alonzo+elaina (leadership),
// adrian (admin), plus four managers scoped to their home location.
//
// Anthony King is scoped single-location per Phase 11 decision #4 (the
// transcript reference to Anthony "doing for host homes what the managers
// should be doing for group homes" reads as him being the host-home
// oversight template, not a multi-location manager). The plural-location
// user_location_scope architecture stays for future flexibility (e.g.,
// Elaina covering multiple locations temporarily).
//
// Every seeded user is idempotent via ON CONFLICT DO NOTHING.
//
// FK-safety: this function is called TWICE in the boot path — once near
// the top of server.ts (before loadOrgStructure) and once again inside
// seedAll()'s chain (after locations are loaded). On a fresh DB the first
// call runs against empty locations / empty users tables; the scope and
// digest-recipient inserts use INSERT ... SELECT ... WHERE EXISTS so
// missing FK targets result in a silent 0-row insert rather than an FK
// violation that rolls back the whole transaction. The second call fills
// in the rows that the first call skipped. This is the fix for the
// Railway crash-loop (audit 2026-04-23 post-demo): without the WHERE
// EXISTS guards a fresh deploy crashed during the first seedUsers().

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'leadership' | 'manager' | 'demo';
  scopeLocations: string[]; // only used for role=manager
}

const SEED_USERS: SeedUser[] = [
  { id: 'u_demo',    email: 'demo@lowesguardianangel.com',    name: 'Demo User',      role: 'demo',       scopeLocations: [] },
  { id: 'u_alonzo',  email: 'alonzo@lowesguardianangel.com',  name: 'Alonzo Ford',    role: 'leadership', scopeLocations: [] },
  { id: 'u_elaina',  email: 'elaina@lowesguardianangel.com',  name: 'Elaina Ford',    role: 'leadership', scopeLocations: [] },
  { id: 'u_adrian',  email: 'adrian@lowesguardianangel.com',  name: 'Adrian (EA)',    role: 'admin',      scopeLocations: [] },
  { id: 'u_vivian',  email: 'vivian@lowesguardianangel.com',  name: 'Vivian Daniels', role: 'manager',    scopeLocations: ['LOC001'] },
  { id: 'u_marcus',  email: 'marcus@lowesguardianangel.com',  name: 'Marcus Thompson', role: 'manager',   scopeLocations: ['LOC002'] },
  { id: 'u_anthony', email: 'anthony@lowesguardianangel.com', name: 'Anthony King',   role: 'manager',    scopeLocations: ['LOC003'] },
  { id: 'u_elena',   email: 'elena@lowesguardianangel.com',   name: 'Elena Ruiz',     role: 'manager',    scopeLocations: ['LOC004'] },
];

export function seedUsers(db: BetterSqliteDatabase = getDb()): number {
  const insertUser = db.prepare(
    `INSERT INTO users (id, email, name, role)
     VALUES (@id, @email, @name, @role)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       role = excluded.role,
       updated_at = datetime('now')`,
  );

  // FK-safe: INSERT ... SELECT ... WHERE EXISTS returns 0 rows when the
  // location or user doesn't exist yet, rather than failing the FK check
  // and rolling back the whole transaction. Essential on fresh DBs where
  // this function may run before loadOrgStructure creates the locations.
  const insertScope = db.prepare(
    `INSERT INTO user_location_scope (user_id, location_id)
     SELECT @user_id, @location_id
      WHERE EXISTS (SELECT 1 FROM users     WHERE id = @user_id)
        AND EXISTS (SELECT 1 FROM locations WHERE id = @location_id)
     ON CONFLICT(user_id, location_id) DO NOTHING`,
  );

  // Default digest recipients — Alonzo + Elaina (all-locations leadership)
  // and the four managers scoped to their home location. Previously this
  // was manual setup via the admin UI, so reset-demo / scenario switches
  // left /digest/preview showing "No recipients yet". Seeding here keeps
  // the preview populated across reseeds.
  //
  // FK-safe: user_id REFERENCES users(id). The EXISTS guard on users
  // means this is a no-op if the users table is empty at call time.
  const insertRecipient = db.prepare(
    `INSERT INTO digest_recipients (user_id, email, scope, cadence, day_of_week, hour_et, is_active)
     SELECT @user_id, @email, @scope, 'weekly', 1, 8, 1
      WHERE EXISTS (SELECT 1 FROM users WHERE id = @user_id)
        AND NOT EXISTS (SELECT 1 FROM digest_recipients WHERE email = @email AND scope = @scope)`,
  );
  const DEFAULT_RECIPIENTS: Array<{ user_id: string; email: string; scope: string }> = [
    { user_id: 'u_alonzo', email: 'alonzo@lowesguardianangel.com', scope: 'all' },
    { user_id: 'u_elaina', email: 'elaina@lowesguardianangel.com', scope: 'all' },
    { user_id: 'u_vivian', email: 'vivian@lowesguardianangel.com', scope: 'LOC001' },
    { user_id: 'u_marcus', email: 'marcus@lowesguardianangel.com', scope: 'LOC002' },
    { user_id: 'u_anthony', email: 'anthony@lowesguardianangel.com', scope: 'LOC003' },
    { user_id: 'u_elena',  email: 'elena@lowesguardianangel.com',  scope: 'LOC004' },
  ];

  let users = 0;
  let scopes = 0;
  let scopesSkipped = 0;
  let recipients = 0;
  let recipientsSkipped = 0;
  try {
    const txn = db.transaction(() => {
      for (const u of SEED_USERS) {
        insertUser.run({ id: u.id, email: u.email, name: u.name, role: u.role });
        users++;
        for (const locationId of u.scopeLocations) {
          const info = insertScope.run({ user_id: u.id, location_id: locationId });
          if (info.changes > 0) scopes++;
          else scopesSkipped++;
        }
      }
      for (const r of DEFAULT_RECIPIENTS) {
        const info = insertRecipient.run(r);
        if (info.changes > 0) recipients++;
        else recipientsSkipped++;
      }
    });
    txn();
  } catch (err) {
    // Defense in depth: if anything in the txn throws despite the WHERE
    // EXISTS guards, log loud and continue so the rest of boot (flagging
    // pass, HTTP listener, health checks) still comes up. Partial seed
    // is survivable; a crash-loop is not.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'seedUsers: transaction failed — continuing with partial seed',
    );
  }

  logger.info(
    { users, scopes, scopes_skipped: scopesSkipped, recipients, recipients_skipped: recipientsSkipped },
    'users seeded',
  );
  if (scopesSkipped > 0 || recipientsSkipped > 0) {
    logger.warn(
      { scopes_skipped: scopesSkipped, recipients_skipped: recipientsSkipped },
      'seedUsers: some rows skipped because their FK targets did not exist; a later seed pass should fill them in',
    );
  }
  return users;
}
