import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { upsertLocation, type LocationType } from '../db/queries/locations.js';
import { upsertAngel, type AngelRole } from '../db/queries/angels.js';
import { upsertIndividual } from '../db/queries/individuals.js';
import { upsertManager } from '../db/queries/managers.js';
import { logger } from '../lib/logger.js';

export interface LoadOrgResult {
  locations: number;
  angels: number;
  individuals: number;
  managers: number;
}

/**
 * Seed `locations`, `angels`, `individuals`, and `managers` from the fixtures.
 *
 *   - `fixtures/lga_org_structure.csv` → locations + angels + individuals
 *     (schema: record_type, id, name, parent_id, role_or_type, manager_id)
 *
 *   - `fixtures/lga_synthetic_tlogs.csv` → managers derived from distinct
 *     (MANAGER_ID, MANAGER_NAME) pairs (the org CSV doesn't ship manager rows).
 *
 * Idempotent: every insert uses ON CONFLICT DO UPDATE. Running twice is safe.
 */
export function loadOrgStructure(db: BetterSqliteDatabase = getDb()): LoadOrgResult {
  const orgPath = resolveFixture('lga_org_structure.csv');
  const tlogPath = resolveFixture('lga_synthetic_tlogs.csv');

  const counts: LoadOrgResult = { locations: 0, angels: 0, individuals: 0, managers: 0 };

  const txn = db.transaction(() => {
    // Derive managers from the T-Log CSV first — locations reference manager_id.
    const managerRows = deriveManagersFromTlogCsv(tlogPath);
    for (const m of managerRows) {
      upsertManager(m, db);
      counts.managers++;
    }

    // Parse org CSV and upsert in type order so FKs resolve.
    const orgRows = parseOrgCsv(orgPath);
    for (const row of orgRows) {
      if (row.record_type !== 'location') continue;
      upsertLocation(
        {
          id: row.id,
          name: row.name,
          type: row.role_or_type as LocationType,
          manager_id: row.manager_id || null,
        },
        db,
      );
      counts.locations++;
    }
    for (const row of orgRows) {
      if (row.record_type !== 'angel') continue;
      upsertAngel(
        {
          id: row.id,
          name: row.name,
          role: normalizeAngelRole(row.role_or_type),
          location_id: row.parent_id || null,
        },
        db,
      );
      counts.angels++;
    }
    for (const row of orgRows) {
      if (row.record_type !== 'individual') continue;
      upsertIndividual(
        {
          id: row.id,
          name: row.name,
          location_id: row.parent_id || null,
          dob: null,
        },
        db,
      );
      counts.individuals++;
    }
  });
  txn();

  logger.info(counts, 'org structure loaded');
  return counts;
}

// ---- internals -----------------------------------------------------------------------------------

interface OrgRow {
  record_type: 'location' | 'angel' | 'individual';
  id: string;
  name: string;
  parent_id: string;
  role_or_type: string;
  manager_id: string;
}

function parseOrgCsv(path: string): OrgRow[] {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]!);
  const requiredCols = ['record_type', 'id', 'name', 'parent_id', 'role_or_type', 'manager_id'];
  for (const col of requiredCols) {
    if (!header.includes(col)) {
      throw new Error(`Org CSV missing required column: ${col}. Got: ${header.join(', ')}`);
    }
  }
  const idx = Object.fromEntries(header.map((c, i) => [c, i])) as Record<string, number>;
  const rows: OrgRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const rt = cells[idx.record_type!]!;
    if (rt !== 'location' && rt !== 'angel' && rt !== 'individual') continue;
    rows.push({
      record_type: rt,
      id: cells[idx.id!]!,
      name: cells[idx.name!]!,
      parent_id: cells[idx.parent_id!] ?? '',
      role_or_type: cells[idx.role_or_type!] ?? '',
      manager_id: cells[idx.manager_id!] ?? '',
    });
  }
  return rows;
}

function deriveManagersFromTlogCsv(path: string): { id: string; name: string }[] {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]!);
  const mgrIdIdx = header.indexOf('MANAGER_ID');
  const mgrNameIdx = header.indexOf('MANAGER_NAME');
  if (mgrIdIdx === -1 || mgrNameIdx === -1) {
    throw new Error(`T-Log CSV missing MANAGER_ID / MANAGER_NAME columns. Got: ${header.join(', ')}`);
  }
  const seen = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const id = cells[mgrIdIdx];
    const name = cells[mgrNameIdx];
    if (id && name && !seen.has(id)) {
      seen.set(id, name);
    }
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}

/**
 * CSV parser that handles the subset we need: comma delimiters, optional double-quote wrapping,
 * and escaped quotes inside quoted fields (RFC 4180 minimum). T-Log rows contain quotes around
 * fields with embedded commas (see TLOG000005 etc.).
 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function normalizeAngelRole(raw: string): AngelRole {
  // Fixture uses 'DSP' and 'Nurse' verbatim; keep that mapping.
  const r = raw.trim();
  if (r === 'DSP') return 'DSP';
  if (r === 'Nurse') return 'Nurse';
  if (r === 'Manager') return 'Manager';
  // Be strict — fixture shouldn't produce anything else.
  throw new Error(`Unknown angel role in fixture: ${raw}`);
}

function resolveFixture(filename: string): string {
  // Try the repo root from the compiled location (dist/ingestion → ../../fixtures)
  // and from the source location (src/ingestion → ../../fixtures).
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../fixtures', filename),
    resolve(process.cwd(), 'fixtures', filename),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Fixture not found: ${filename} (tried: ${candidates.join(', ')})`);
}
