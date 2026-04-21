// Pure function: map a parsed CSV/Excel row (Record<string, string>) to the typed
// TLogInsertShape that `insertTlog` consumes. Column-name-mapped (not positional) so
// it survives Therap UI exports shipping columns in different orders.

export interface TLogInsertShape {
  tlog_id: string;
  individual_id: string;
  program_id: string;
  created_by_id: string | null;
  manager_id: string | null;
  reported_date: string;
  reported_time: string | null;
  time_in: string;
  time_out: string;
  shift_name: 'Day' | 'Swing' | 'Overnight';
  notification_level: 'Low' | 'Medium' | 'High';
  type: string;
  summary: string | null;
  description: string;
  status: string;
  acknowledged: 0 | 1;
}

const REQUIRED_COLUMNS = [
  'TLOG_ID',
  'INDIVIDUAL_ID',
  'PROGRAM_ID',
  'REPORTED_DATE',
  'TIME_IN',
  'TIME_OUT',
  'SHIFT_NAME',
  'NOTIFICATION_LEVEL',
  'TYPE',
  'DESCRIPTION',
  'STATUS',
  'ACKNOWLEDGED',
] as const;

const SHIFT_NAMES = new Set<TLogInsertShape['shift_name']>(['Day', 'Swing', 'Overnight']);
const NOTIFICATION_LEVELS = new Set<TLogInsertShape['notification_level']>(['Low', 'Medium', 'High']);

export class NormalizeError extends Error {
  public readonly rowIndex: number | undefined;
  public readonly field: string | undefined;
  constructor(message: string, rowIndex?: number, field?: string) {
    super(message);
    this.name = 'NormalizeError';
    this.rowIndex = rowIndex;
    this.field = field;
  }
}

/**
 * Normalize one CSV/Excel row into a typed insert shape.
 * @throws NormalizeError on missing required columns or invalid enum values.
 */
export function normalizeTlogRow(row: Record<string, string>, rowIndex?: number): TLogInsertShape {
  for (const col of REQUIRED_COLUMNS) {
    if (!(col in row)) {
      throw new NormalizeError(`Missing required column: ${col}`, rowIndex, col);
    }
  }

  const shift = (row.SHIFT_NAME ?? '').trim() as TLogInsertShape['shift_name'];
  if (!SHIFT_NAMES.has(shift)) {
    throw new NormalizeError(
      `Unknown shift name: "${row.SHIFT_NAME}" (expected Day, Swing, or Overnight)`,
      rowIndex,
      'SHIFT_NAME',
    );
  }

  const level = (row.NOTIFICATION_LEVEL ?? '').trim() as TLogInsertShape['notification_level'];
  if (!NOTIFICATION_LEVELS.has(level)) {
    throw new NormalizeError(
      `Unknown notification level: "${row.NOTIFICATION_LEVEL}" (expected Low, Medium, or High)`,
      rowIndex,
      'NOTIFICATION_LEVEL',
    );
  }

  return {
    tlog_id: required(row, 'TLOG_ID', rowIndex),
    individual_id: required(row, 'INDIVIDUAL_ID', rowIndex),
    program_id: required(row, 'PROGRAM_ID', rowIndex),
    created_by_id: optional(row, 'CREATED_BY_ID'),
    manager_id: optional(row, 'MANAGER_ID'),
    reported_date: required(row, 'REPORTED_DATE', rowIndex),
    reported_time: optional(row, 'REPORTED_TIME'),
    time_in: toIsoLocal(required(row, 'TIME_IN', rowIndex)),
    time_out: toIsoLocal(required(row, 'TIME_OUT', rowIndex)),
    shift_name: shift,
    notification_level: level,
    type: required(row, 'TYPE', rowIndex),
    summary: optional(row, 'SUMMARY'),
    description: required(row, 'DESCRIPTION', rowIndex),
    status: (row.STATUS ?? '').trim() || 'Submitted',
    acknowledged: parseBool(row.ACKNOWLEDGED ?? '') ? 1 : 0,
  };
}

function required(row: Record<string, string>, key: string, rowIndex?: number): string {
  const v = row[key];
  if (v === undefined || v === null || v.trim() === '') {
    throw new NormalizeError(`Required field is empty: ${key}`, rowIndex, key);
  }
  return v.trim();
}

function optional(row: Record<string, string>, key: string): string | null {
  const v = row[key];
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

function parseBool(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Convert "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" (ISO-local, no TZ).
 * Fixture timestamps are implicitly America/New_York wall-clock; Phase 3
 * missing-note detection applies ET-aware math against these values.
 */
function toIsoLocal(raw: string): string {
  return raw.includes('T') ? raw : raw.replace(' ', 'T');
}
