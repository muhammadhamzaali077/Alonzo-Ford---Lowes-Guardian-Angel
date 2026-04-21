// Location → angel → individual drill-down views. All three levels share the
// same pattern: breadcrumb, page heading, list of next-level items with
// rollup pills and flag counts.

import type { AngelAggregateRow, FlaggedNoteRow, IndividualAggregateRow } from '../db/queries/drilldown.js';
import type { WindowRange } from '../lib/time.js';
import { escapeHtml } from './layout.js';
import { rollupPill, renderBreadcrumb, displayCategoryLabel, type DisplayCategory } from './ui.js';

export interface LocationViewData {
  location: { id: string; name: string; type: string };
  angels: AngelAggregateRow[];
  window: WindowRange;
}

export function renderLocationView(data: LocationViewData): string {
  const crumb = renderBreadcrumb([
    { label: 'Dashboard', href: '/' },
    { label: data.location.name },
  ]);

  const listHtml =
    data.angels.length === 0
      ? `<p class="mt-3 text-sm text-gray-500 bg-white border border-gray-200 rounded-md p-5">No angels assigned to this location yet.</p>`
      : `<ul class="mt-3 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
${data.angels
  .map((a) => {
    const counts = flagCountsCell(a.red_content, a.yellow_count, a.missing_count);
    return `<li>
  <a href="/location/${encodeURIComponent(data.location.id)}/angel/${encodeURIComponent(a.angel_id)}" class="flex items-center justify-between px-5 py-4 gap-3 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 min-h-[44px]">
    <div class="flex items-center gap-3 min-w-0">
      ${rollupPill(a.red_content, a.yellow_count, a.missing_count)}
      <span class="text-sm font-medium text-gray-900 truncate">${escapeHtml(a.angel_name)}</span>
      <span class="hidden sm:inline text-xs text-gray-500">${escapeHtml(a.angel_role)}</span>
    </div>
    <span class="text-sm text-gray-600 tnum shrink-0">${escapeHtml(counts)}</span>
  </a>
</li>`;
  })
  .join('')}
</ul>`;

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold text-gray-900">${escapeHtml(data.location.name)}</h1>
    <p class="mt-1 text-sm text-gray-600">${escapeHtml(data.window.label)}</p>
  </div>
  <h2 class="mt-6 text-lg font-medium text-gray-900">Angels at this location</h2>
  ${listHtml}
</section>`;
}

export interface AngelViewData {
  location: { id: string; name: string };
  angel: { id: string; name: string; role: string };
  individuals: IndividualAggregateRow[];
  window: WindowRange;
}

export function renderAngelView(data: AngelViewData): string {
  const crumb = renderBreadcrumb([
    { label: 'Dashboard', href: '/' },
    { label: data.location.name, href: `/location/${encodeURIComponent(data.location.id)}` },
    { label: data.angel.name },
  ]);

  const listHtml =
    data.individuals.length === 0
      ? `<p class="mt-3 text-sm text-gray-500 bg-white border border-gray-200 rounded-md p-5">This angel hasn't written any notes in this period.</p>`
      : `<ul class="mt-3 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
${data.individuals
  .map((i) => {
    const counts = flagCountsCell(i.red_content, i.yellow_count, i.missing_count);
    return `<li>
  <a href="/location/${encodeURIComponent(data.location.id)}/angel/${encodeURIComponent(data.angel.id)}/individual/${encodeURIComponent(i.individual_id)}" class="flex items-center justify-between px-5 py-4 gap-3 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 min-h-[44px]">
    <div class="flex items-center gap-3 min-w-0">
      ${rollupPill(i.red_content, i.yellow_count, i.missing_count)}
      <span class="text-sm font-medium text-gray-900 truncate">${escapeHtml(i.individual_name)}</span>
    </div>
    <span class="text-sm text-gray-600 tnum shrink-0">${escapeHtml(counts)}</span>
  </a>
</li>`;
  })
  .join('')}
</ul>`;

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold text-gray-900">${escapeHtml(data.angel.name)}</h1>
    <p class="mt-1 text-sm text-gray-600">${escapeHtml(data.angel.role)} · ${escapeHtml(data.location.name)} · ${escapeHtml(data.window.label)}</p>
  </div>
  <h2 class="mt-6 text-lg font-medium text-gray-900">Individuals this angel wrote for</h2>
  ${listHtml}
</section>`;
}

export interface IndividualViewData {
  location: { id: string; name: string };
  angel: { id: string; name: string };
  individual: { id: string; name: string };
  flags: FlaggedNoteRow[];
  window: WindowRange;
}

export function renderIndividualView(data: IndividualViewData): string {
  const crumb = renderBreadcrumb([
    { label: 'Dashboard', href: '/' },
    { label: data.location.name, href: `/location/${encodeURIComponent(data.location.id)}` },
    { label: data.angel.name, href: `/location/${encodeURIComponent(data.location.id)}/angel/${encodeURIComponent(data.angel.id)}` },
    { label: data.individual.name },
  ]);

  const listHtml =
    data.flags.length === 0
      ? `<p class="mt-3 text-sm text-gray-500 bg-white border border-gray-200 rounded-md p-5">No flagged notes in this period. Everything looks clean.</p>`
      : `<ul class="mt-3 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
${data.flags
  .map((f) => {
    const date = f.reported_date ?? f.scheduled_shift_date ?? '';
    const shift = f.shift_name ?? f.scheduled_shift_name ?? '';
    const link =
      f.tlog_id && f.tlog_version
        ? `/note/${encodeURIComponent(f.tlog_id)}/${encodeURIComponent(String(f.tlog_version))}`
        : '#';
    const pill =
      f.severity === 'red'
        ? rollupPill(1, 0, 0)
        : rollupPill(0, 1, 0);
    const categoryLabel = displayCategoryLabel(f.display_category as DisplayCategory);
    return `<li>
  <a href="${link}" class="block px-5 py-4 hover:bg-gray-50 focus:outline-none focus:bg-gray-50">
    <div class="flex items-center gap-3 flex-wrap">
      ${pill}
      <span class="text-xs font-medium text-gray-700">${escapeHtml(categoryLabel)}</span>
      <span class="text-xs text-gray-500">${escapeHtml(date)}${shift ? ' · ' + escapeHtml(shift) : ''}</span>
    </div>
    <p class="mt-2 text-sm text-gray-900">${escapeHtml(f.reason)}</p>
  </a>
</li>`;
  })
  .join('')}
</ul>`;

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold text-gray-900">${escapeHtml(data.individual.name)}</h1>
    <p class="mt-1 text-sm text-gray-600">${escapeHtml(data.location.name)} · notes by ${escapeHtml(data.angel.name)} · ${escapeHtml(data.window.label)}</p>
  </div>
  <h2 class="mt-6 text-lg font-medium text-gray-900">Flagged notes</h2>
  ${listHtml}
</section>`;
}

function flagCountsCell(red: number, yellow: number, missing: number): string {
  const parts: string[] = [];
  if (red > 0) parts.push(`${red} red`);
  if (yellow > 0) parts.push(`${yellow} yellow`);
  if (missing > 0) parts.push(`${missing} missing`);
  return parts.length === 0 ? 'No flags' : parts.join(' · ');
}
