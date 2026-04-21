// Parse a Therap UI Excel or CSV export into normalized row objects.
//
// .xlsx goes through SheetJS with `cellDates: true` so date cells come back
// as JS Date objects that we format to ISO "YYYY-MM-DD[THH:MM:SS]" strings —
// this avoids the "2026-04-20" → "4/20/26" locale-reformat path SheetJS
// hits when left to its own devices.
//
// .csv bypasses SheetJS entirely — it applies its own aggressive "is this
// a date?" coercion on CSV cells, returning Excel serial numbers for text
// that looks ISO. We use a small RFC-4180-minimum parser (same as the
// fixture loader) which keeps the text verbatim.

import * as XLSX from 'xlsx';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class UploadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadParseError';
  }
}

export function parseUploadBuffer(
  buffer: Buffer,
  filename: string = '',
): Record<string, string>[] {
  const isCsv = /\.csv$/i.test(filename) || looksLikeCsv(buffer);
  return isCsv ? parseCsvBuffer(buffer) : parseXlsxBuffer(buffer);
}

// -------------------------------------------------------------------------------------------------
// XLSX path — SheetJS with date-as-Date
// -------------------------------------------------------------------------------------------------

function parseXlsxBuffer(buffer: Buffer): Record<string, string>[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new UploadParseError(
      `Couldn't read the file — is it a valid Excel export? (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new UploadParseError('This spreadsheet has no sheets.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new UploadParseError('First sheet could not be read.');

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: '',
  });

  return rawRows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = coerceCell(v);
    }
    return out;
  });
}

function coerceCell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    // Excel datetime cells → split date/time. Use local-time components to
    // preserve what the spreadsheet displayed (Excel stores unzoned wall clock).
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    const hh = v.getHours();
    const mm = v.getMinutes();
    const ss = v.getSeconds();
    const dateStr = `${y}-${m}-${d}`;
    if (hh === 0 && mm === 0 && ss === 0) return dateStr;
    return `${dateStr} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  return String(v);
}

// -------------------------------------------------------------------------------------------------
// CSV path — RFC-4180-minimum parser (same as fixtures loader)
// -------------------------------------------------------------------------------------------------

function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  const raw = buffer.toString('utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]!);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]!] = cells[c] ?? '';
    out.push(obj);
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === ',') { cells.push(cur); cur = ''; }
    else if (ch === '"' && cur.length === 0) inQuotes = true;
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/** Byte-sniff: CSVs have no magic number; look for an xlsx ZIP header. */
function looksLikeCsv(buffer: Buffer): boolean {
  if (buffer.length < 4) return true;
  // XLSX is a ZIP → starts with "PK\x03\x04"
  return !(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04);
}
