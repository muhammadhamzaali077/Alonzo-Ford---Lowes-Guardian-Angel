import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInMemoryDb } from '../../src/db/client.ts';
import { getLocation, listLocations, softDeleteLocation, upsertLocation } from '../../src/db/queries/locations.ts';
import { getAngel, listAngels, upsertAngel } from '../../src/db/queries/angels.ts';
import { getIndividual, listIndividuals, upsertIndividual } from '../../src/db/queries/individuals.ts';
import { getManager, listManagers, upsertManager } from '../../src/db/queries/managers.ts';

function freshDb() {
  const db = createInMemoryDb();
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(resolve(here, '../../src/db/schema.sql'), 'utf-8');
  db.exec(sql);
  return db;
}

test('locations CRUD + soft delete', () => {
  const db = freshDb();
  upsertManager({ id: 'MGR001', name: 'Vivian Daniels' }, db);
  const loc = upsertLocation({ id: 'LOC001', name: 'Peachtree Group Home', type: 'group_home', manager_id: 'MGR001' }, db);
  assert.equal(loc.id, 'LOC001');
  assert.equal(loc.manager_id, 'MGR001');
  assert.equal(loc.deleted_at, null);

  assert.equal(getLocation('LOC001', db)?.name, 'Peachtree Group Home');
  assert.equal(getLocation('LOCXXX', db), null);

  // Update via upsert
  upsertLocation({ id: 'LOC001', name: 'Peachtree GH', type: 'group_home' }, db);
  assert.equal(getLocation('LOC001', db)?.name, 'Peachtree GH');
  assert.equal(getLocation('LOC001', db)?.manager_id, null);

  assert.equal(listLocations({}, db).length, 1);
  assert.equal(softDeleteLocation('LOC001', db), true);
  assert.equal(listLocations({}, db).length, 0);
  assert.equal(listLocations({ includeDeleted: true }, db).length, 1);
  // Second soft delete is a no-op (already deleted)
  assert.equal(softDeleteLocation('LOC001', db), false);
});

test('angels CRUD with filters', () => {
  const db = freshDb();
  upsertLocation({ id: 'LOC002', name: 'Riverside', type: 'group_home' }, db);
  upsertAngel({ id: 'ANG007', name: 'Jamal Roberts', role: 'DSP', location_id: 'LOC002' }, db);
  upsertAngel({ id: 'ANG010', name: 'Nurse Chen', role: 'Nurse', location_id: 'LOC002' }, db);
  assert.equal(getAngel('ANG007', db)?.name, 'Jamal Roberts');
  assert.equal(listAngels({ locationId: 'LOC002' }, db).length, 2);
  assert.equal(listAngels({ role: 'DSP' }, db).length, 1);
  assert.equal(listAngels({ role: 'Nurse' }, db).length, 1);
  assert.equal(listAngels({ locationId: 'LOCXXX' }, db).length, 0);
});

test('individuals CRUD', () => {
  const db = freshDb();
  upsertLocation({ id: 'LOC002', name: 'Riverside', type: 'group_home' }, db);
  upsertIndividual({ id: 'IND006', name: 'Brittany L.', location_id: 'LOC002' }, db);
  assert.equal(getIndividual('IND006', db)?.name, 'Brittany L.');
  assert.equal(listIndividuals({ locationId: 'LOC002' }, db).length, 1);
});

test('managers upsert', () => {
  const db = freshDb();
  upsertManager({ id: 'MGR002', name: 'Marcus Thompson' }, db);
  upsertManager({ id: 'MGR002', name: 'Marcus T.', email: 'marcus@lowesguardianangel.com' }, db);
  const m = getManager('MGR002', db);
  assert.equal(m?.name, 'Marcus T.');
  assert.equal(m?.email, 'marcus@lowesguardianangel.com');
  assert.equal(listManagers({}, db).length, 1);
});
