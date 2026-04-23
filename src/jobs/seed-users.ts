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

  const insertScope = db.prepare(
    `INSERT INTO user_location_scope (user_id, location_id)
     VALUES (@user_id, @location_id)
     ON CONFLICT(user_id, location_id) DO NOTHING`,
  );

  // Default digest recipients — Alonzo + Elaina (all-locations leadership)
  // and the four managers scoped to their home location. Previously this
  // was manual setup via the admin UI, so reset-demo / scenario switches
  // left /digest/preview showing "No recipients yet". Seeding here keeps
  // the preview populated across reseeds.
  const insertRecipient = db.prepare(
    `INSERT INTO digest_recipients (user_id, email, scope, cadence, day_of_week, hour_et, is_active)
     SELECT @user_id, @email, @scope, 'weekly', 1, 8, 1
      WHERE NOT EXISTS (SELECT 1 FROM digest_recipients WHERE email = @email AND scope = @scope)`,
  );
  const DEFAULT_RECIPIENTS: Array<{ user_id: string; email: string; scope: string }> = [
    { user_id: 'u_alonzo', email: 'alonzo@lowesguardianangel.com', scope: 'all' },
    { user_id: 'u_elaina', email: 'elaina@lowesguardianangel.com', scope: 'all' },
    { user_id: 'u_vivian', email: 'vivian@lowesguardianangel.com', scope: 'LOC001' },
    { user_id: 'u_marcus', email: 'marcus@lowesguardianangel.com', scope: 'LOC002' },
    { user_id: 'u_anthony', email: 'anthony@lowesguardianangel.com', scope: 'LOC003' },
    { user_id: 'u_elena',  email: 'elena@lowesguardianangel.com',  scope: 'LOC004' },
  ];

  let inserted = 0;
  const txn = db.transaction(() => {
    for (const u of SEED_USERS) {
      insertUser.run({ id: u.id, email: u.email, name: u.name, role: u.role });
      for (const locationId of u.scopeLocations) {
        insertScope.run({ user_id: u.id, location_id: locationId });
      }
      inserted++;
    }
    for (const r of DEFAULT_RECIPIENTS) {
      insertRecipient.run(r);
    }
  });
  txn();

  logger.info({ users: inserted }, 'users seeded');
  return inserted;
}
