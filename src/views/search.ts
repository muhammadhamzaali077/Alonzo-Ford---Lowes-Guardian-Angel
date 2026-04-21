import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { escapeHtml } from './layout.js';

export interface SearchHit {
  tlog_id: string;
  version: number;
  program_id: string;
  location_name: string;
  angel_name: string | null;
  individual_name: string;
  reported_date: string;
  excerpt: string;
}

export function searchNotes(q: string, limit: number = 20, db: BetterSqliteDatabase = getDb()): SearchHit[] {
  const needle = `%${q.trim().toLowerCase()}%`;
  return db
    .prepare(
      `SELECT t.tlog_id, t.version, t.program_id,
              l.name AS location_name,
              a.name AS angel_name,
              i.name AS individual_name,
              t.reported_date,
              substr(t.description, 1, 200) AS excerpt
         FROM t_logs t
         LEFT JOIN locations l ON l.id = t.program_id
         LEFT JOIN angels a ON a.id = t.created_by_id
         LEFT JOIN individuals i ON i.id = t.individual_id
        WHERE t.is_current = 1
          AND (LOWER(t.description) LIKE @needle OR LOWER(t.summary) LIKE @needle)
        ORDER BY t.reported_date DESC, t.tlog_id DESC
        LIMIT @limit`,
    )
    .all({ needle, limit }) as SearchHit[];
}

export function renderSearchResults(q: string, hits: SearchHit[]): string {
  if (!q.trim()) {
    return `<p class="text-sm text-gray-500">Type at least one character to search.</p>`;
  }
  if (hits.length === 0) {
    return `<p class="text-sm text-gray-500">No notes match "${escapeHtml(q)}".</p>`;
  }
  return `<ul class="divide-y divide-gray-200 bg-white border border-gray-200 rounded-md">
${hits
  .map(
    (h) => `<li>
  <a href="/note/${encodeURIComponent(h.tlog_id)}/${encodeURIComponent(String(h.version))}" class="block px-5 py-3 hover:bg-gray-50 focus:outline-none focus:bg-gray-50">
    <div class="text-xs text-gray-500">${escapeHtml(h.reported_date)} · ${escapeHtml(h.location_name)} · ${escapeHtml(h.angel_name ?? 'Unknown angel')} · ${escapeHtml(h.individual_name)}</div>
    <p class="mt-1 text-sm text-gray-900">${escapeHtml(h.excerpt)}</p>
  </a>
</li>`,
  )
  .join('')}
</ul>`;
}
