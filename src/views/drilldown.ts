// Location → angel → individual drill-down views. All three levels share the
// same pattern: breadcrumb, page heading, list of next-level items with
// rollup pills and flag counts.

import type { AngelAggregateRow, FlaggedNoteRow, IndividualAggregateRow, MissingFlagRow } from '../db/queries/drilldown.js';
import type { WindowRange } from '../lib/time.js';
import { escapeHtml } from './layout.js';
import { rollupPill, renderBreadcrumb, displayCategoryLabel, type DisplayCategory } from './ui.js';
import { contextualHelp } from './contextual-help.js';

export interface LocationViewData {
  location: { id: string; name: string; type: string };
  angels: AngelAggregateRow[];
  missingFlags: MissingFlagRow[];
  window: WindowRange;
}

export function renderLocationView(data: LocationViewData): string {
  const crumb = renderBreadcrumb([
    { label: 'Dashboard', href: '/' },
    { label: data.location.name },
  ]);

  const listHtml =
    data.angels.length === 0
      ? `<p class="mt-3 text-sm ga-surface-cream p-5">No angels assigned to this location yet.</p>`
      : `<ul class="mt-3 ga-surface-cream">
${data.angels
  .map((a) => {
    const counts = flagCountsCell(a.red_content, a.yellow_count, a.missing_count);
    return `<li>
  <a href="/location/${encodeURIComponent(data.location.id)}/angel/${encodeURIComponent(a.angel_id)}" class="flex items-center justify-between px-5 py-4 gap-3 ga-cream-row-hover ga-focus min-h-[44px]">
    <div class="flex items-center gap-3 min-w-0">
      ${rollupPill(a.red_content, a.yellow_count, a.missing_count)}
      <span class="text-sm font-medium ga-text-strong truncate">${escapeHtml(a.angel_name)}</span>
      <span class="hidden sm:inline text-xs ga-text-muted">${escapeHtml(a.angel_role)}</span>
    </div>
    <span class="text-sm ga-text tnum shrink-0">${escapeHtml(counts)}</span>
  </a>
</li>`;
  })
  .join('')}
</ul>`;

  const missingHtml = renderMissingFlagsSection(data.missingFlags);

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold ga-text-strong">${escapeHtml(data.location.name)}</h1>
    <p class="mt-1 text-sm ga-text">${escapeHtml(data.window.label)}</p>
  </div>
  <h2 class="mt-6 text-lg font-medium ga-text-strong">Angels at this location</h2>
  ${listHtml}
  ${missingHtml}
  ${contextualHelp('location')}
</section>`;
}

function renderMissingFlagsSection(missing: MissingFlagRow[]): string {
  if (missing.length === 0) return '';
  const items = missing
    .map((m) => {
      const date = formatDateWithWeekday(m.scheduled_shift_date);
      return `<li class="px-5 py-3 flex items-center justify-between gap-3 min-h-[44px]">
    <div class="min-w-0">
      <div class="text-sm font-medium ga-text-strong">${escapeHtml(m.individual_name)}</div>
      <div class="text-xs ga-text">${escapeHtml(date)} · ${escapeHtml(m.scheduled_shift_name)} shift</div>
    </div>
    <span class="shrink-0 inline-flex items-center gap-1 rounded-md ga-sev-red px-2 py-1 text-xs font-medium" style="border: 1px solid var(--ga-red-border);">Missing note</span>
  </li>`;
    })
    .join('');

  return `<h2 class="mt-8 text-lg font-medium ga-text-strong">Missing notes</h2>
  <p class="mt-1 text-sm ga-text">${missing.length} shift${missing.length === 1 ? '' : 's'} with no submitted documentation in this period.</p>
  <ul class="mt-3 ga-surface-cream">${items}</ul>`;
}

function formatDateWithWeekday(isoDate: string): string {
  // Expect YYYY-MM-DD. Build a Date at noon UTC so the weekday doesn't tip
  // across midnight on import-time machines far from UTC.
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${isoDate}`;
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
      ? `<p class="mt-3 text-sm ga-surface-cream p-5">This angel hasn't written any notes in this period.</p>`
      : `<ul class="mt-3 ga-surface-cream">
${data.individuals
  .map((i) => {
    const counts = flagCountsCell(i.red_content, i.yellow_count, i.missing_count);
    return `<li>
  <a href="/location/${encodeURIComponent(data.location.id)}/angel/${encodeURIComponent(data.angel.id)}/individual/${encodeURIComponent(i.individual_id)}" class="flex items-center justify-between px-5 py-4 gap-3 ga-cream-row-hover ga-focus min-h-[44px]">
    <div class="flex items-center gap-3 min-w-0">
      ${rollupPill(i.red_content, i.yellow_count, i.missing_count)}
      <span class="text-sm font-medium ga-text-strong truncate">${escapeHtml(i.individual_name)}</span>
    </div>
    <span class="text-sm ga-text tnum shrink-0">${escapeHtml(counts)}</span>
  </a>
</li>`;
  })
  .join('')}
</ul>`;

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold ga-text-strong">${escapeHtml(data.angel.name)}</h1>
    <p class="mt-1 text-sm ga-text">${escapeHtml(data.angel.role)} · ${escapeHtml(data.location.name)} · ${escapeHtml(data.window.label)}</p>
  </div>
  <h2 class="mt-6 text-lg font-medium ga-text-strong">Individuals this angel wrote for</h2>
  ${listHtml}
  ${contextualHelp('angel')}
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
      ? `<p class="mt-3 text-sm ga-surface-cream p-5">No flagged notes in this period. Everything looks clean.</p>`
      : `<ul class="mt-3 ga-surface-cream">
${data.flags
  .map((f) => {
    const date = f.reported_date ?? f.scheduled_shift_date ?? '';
    const shift = f.shift_name ?? f.scheduled_shift_name ?? '';
    const pill =
      f.severity === 'red'
        ? rollupPill(1, 0, 0)
        : rollupPill(0, 1, 0);
    const categoryLabel = displayCategoryLabel(f.display_category as DisplayCategory);
    const hasNote = Boolean(f.tlog_id && f.tlog_version);
    // Missing-schedule flags have no note to link to (that's the point).
    // Render them as a static card so there's no clickable affordance —
    // previously they were anchor-wrapped with href="#" which looked
    // interactive and navigated to a dead anchor. Flags that DO have an
    // underlying note stay as links to /note/:tlog/:version.
    const inner = `<div class="flex items-center gap-3 flex-wrap">
      ${pill}
      <span class="text-xs font-medium ga-text">${escapeHtml(categoryLabel)}</span>
      <span class="text-xs ga-text-muted">${escapeHtml(date)}${shift ? ' · ' + escapeHtml(shift) : ''}</span>
      ${hasNote ? '' : '<span class="ml-auto text-xs ga-text-subtle">no note was submitted</span>'}
    </div>
    <p class="mt-2 text-sm ga-text-strong">${escapeHtml(f.reason)}</p>`;
    if (hasNote) {
      const link = `/note/${encodeURIComponent(f.tlog_id!)}/${encodeURIComponent(String(f.tlog_version))}`;
      return `<li><a href="${link}" class="block px-5 py-4 ga-cream-row-hover ga-focus">${inner}</a></li>`;
    }
    return `<li><div class="block px-5 py-4">${inner}</div></li>`;
  })
  .join('')}
</ul>`;

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold ga-text-strong">${escapeHtml(data.individual.name)}</h1>
    <p class="mt-1 text-sm ga-text">${escapeHtml(data.location.name)} · notes by ${escapeHtml(data.angel.name)} · ${escapeHtml(data.window.label)}</p>
  </div>
  <h2 class="mt-6 text-lg font-medium ga-text-strong">Flagged notes</h2>
  ${listHtml}
  ${contextualHelp('individual')}
</section>`;
}

function flagCountsCell(red: number, yellow: number, missing: number): string {
  const parts: string[] = [];
  if (red > 0) parts.push(`${red} red`);
  if (yellow > 0) parts.push(`${yellow} yellow`);
  if (missing > 0) parts.push(`${missing} missing`);
  return parts.length === 0 ? 'No flags' : parts.join(' · ');
}
