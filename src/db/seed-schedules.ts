import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from './client.js';
import { listIndividuals } from './queries/individuals.js';
import { listLocations } from './queries/locations.js';
import { logger } from '../lib/logger.js';

/**
 * Per-location-type default shift patterns (local ET times).
 * Matches data-model.md §shift_schedule seed defaults.
 */
const ALL_WEEK = 'mon,tue,wed,thu,fri,sat,sun';
const WEEKDAYS = 'mon,tue,wed,thu,fri';

interface ShiftPattern {
  shift_name: 'Day' | 'Swing' | 'Overnight';
  start_time: string;
  end_time: string;
  days_of_week: string;
}

const PATTERNS_BY_LOCATION_TYPE: Record<string, ShiftPattern[]> = {
  group_home: [
    { shift_name: 'Day',       start_time: '07:00', end_time: '15:00', days_of_week: ALL_WEEK },
    { shift_name: 'Swing',     start_time: '15:00', end_time: '23:00', days_of_week: ALL_WEEK },
    { shift_name: 'Overnight', start_time: '23:00', end_time: '07:00', days_of_week: ALL_WEEK },
  ],
  host_home: [
    { shift_name: 'Day',       start_time: '08:00', end_time: '20:00', days_of_week: ALL_WEEK },
  ],
  day_program: [
    { shift_name: 'Day',       start_time: '09:00', end_time: '15:00', days_of_week: WEEKDAYS },
  ],
};

export function seedShiftSchedules(db: BetterSqliteDatabase = getDb()): number {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM shift_schedule').get() as { c: number };
  if (existing.c > 0) {
    logger.info({ existing: existing.c }, 'shift_schedule already populated; skipping seed');
    return 0;
  }

  const locations = listLocations({}, db);
  const locationsById = new Map(locations.map((l) => [l.id, l]));
  const individuals = listIndividuals({}, db);

  // Seed active_from earlier than the oldest fixture T-Log (2026-03-15) so the
  // shift_schedule window query matches historical data. Production schedules
  // will set active_from at creation time.
  const insert = db.prepare(
    `INSERT INTO shift_schedule (individual_id, shift_name, start_time, end_time, days_of_week, active_from)
     VALUES (@individual_id, @shift_name, @start_time, @end_time, @days_of_week, '2026-01-01')`,
  );

  let inserted = 0;
  const txn = db.transaction(() => {
    for (const individual of individuals) {
      if (!individual.location_id) continue;
      const loc = locationsById.get(individual.location_id);
      if (!loc) continue;
      const patterns = PATTERNS_BY_LOCATION_TYPE[loc.type] ?? [];
      for (const pattern of patterns) {
        insert.run({
          individual_id: individual.id,
          shift_name: pattern.shift_name,
          start_time: pattern.start_time,
          end_time: pattern.end_time,
          days_of_week: pattern.days_of_week,
        });
        inserted++;
      }
    }
  });
  txn();

  logger.info({ inserted }, 'shift_schedule seeded');
  return inserted;
}
