import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../client.js';

export type ShiftName = 'Day' | 'Swing' | 'Overnight';

export interface ShiftScheduleRow {
  id: number;
  individual_id: string;
  individual_name: string;
  shift_name: ShiftName;
  start_time: string;
  end_time: string;
  days_of_week: string;
  active_from: string;
  active_to: string | null;
}

export interface ShiftScheduleInput {
  id?: number;
  individual_id: string;
  shift_name: ShiftName;
  start_time: string;
  end_time: string;
  days_of_week: string;
  active_from?: string;
  active_to?: string | null;
}

export function listShiftSchedules(db: BetterSqliteDatabase = getDb()): ShiftScheduleRow[] {
  return db
    .prepare(
      `SELECT s.id, s.individual_id, i.name AS individual_name,
              s.shift_name, s.start_time, s.end_time, s.days_of_week,
              s.active_from, s.active_to
         FROM shift_schedule s
         JOIN individuals i ON i.id = s.individual_id
        WHERE i.deleted_at IS NULL
        ORDER BY i.name, s.shift_name`,
    )
    .all() as ShiftScheduleRow[];
}

export function getShiftSchedule(
  id: number,
  db: BetterSqliteDatabase = getDb(),
): ShiftScheduleRow | null {
  const row = db
    .prepare(
      `SELECT s.id, s.individual_id, i.name AS individual_name,
              s.shift_name, s.start_time, s.end_time, s.days_of_week,
              s.active_from, s.active_to
         FROM shift_schedule s
         JOIN individuals i ON i.id = s.individual_id
        WHERE s.id = ?`,
    )
    .get(id) as ShiftScheduleRow | undefined;
  return row ?? null;
}

export function upsertShiftSchedule(
  input: ShiftScheduleInput,
  db: BetterSqliteDatabase = getDb(),
): number {
  if (input.id) {
    db.prepare(
      `UPDATE shift_schedule
          SET individual_id = @individual_id,
              shift_name = @shift_name,
              start_time = @start_time,
              end_time = @end_time,
              days_of_week = @days_of_week,
              active_to = @active_to
        WHERE id = @id`,
    ).run({
      id: input.id,
      individual_id: input.individual_id,
      shift_name: input.shift_name,
      start_time: input.start_time,
      end_time: input.end_time,
      days_of_week: input.days_of_week,
      active_to: input.active_to ?? null,
    });
    return input.id;
  }
  const info = db
    .prepare(
      `INSERT INTO shift_schedule (individual_id, shift_name, start_time, end_time, days_of_week, active_from, active_to)
       VALUES (@individual_id, @shift_name, @start_time, @end_time, @days_of_week, @active_from, @active_to)`,
    )
    .run({
      individual_id: input.individual_id,
      shift_name: input.shift_name,
      start_time: input.start_time,
      end_time: input.end_time,
      days_of_week: input.days_of_week,
      active_from: input.active_from ?? '2026-01-01',
      active_to: input.active_to ?? null,
    });
  return info.lastInsertRowid as number;
}

export function deleteShiftSchedule(id: number, db: BetterSqliteDatabase = getDb()): boolean {
  const info = db.prepare('DELETE FROM shift_schedule WHERE id = ?').run(id);
  return info.changes > 0;
}
