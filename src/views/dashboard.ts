// Dashboard top-level view. Four tiles, locations list, trend chart, filter
// disclosure + "Preview this week's email" anchor (per UI/UX decision #3).

import type { LocationRow, OverallCounts } from '../db/queries/dashboard.js';
import type { TrendSeries } from '../db/queries/compliance-score.js';
import type { WindowRange } from '../lib/time.js';
import { escapeHtml } from './layout.js';
import { rollupPill, locationTypeLabel } from './ui.js';
import { renderTrendChart } from './trend-chart.js';

export interface DashboardViewData {
  window: WindowRange;
  overall: OverallCounts;
  locations: LocationRow[];
  trend: TrendSeries[];
  filters: {
    start?: string;
    end?: string;
    severity?: string;
    shift?: string;
    locationId?: string;
  };
}

export function renderDashboard(data: DashboardViewData): string {
  return `
<section>
  ${renderTitleRow(data)}
  ${renderFilter(data)}
  ${renderTiles(data.overall)}
  ${renderLocationsList(data.locations)}
  ${renderTrendSection(data.trend)}
</section>
${renderMobileFilterScrollScript()}
`;
}

function renderTitleRow(data: DashboardViewData): string {
  const scopeLabel = 'All locations'; // Phase 11 will swap to user.role-aware label
  return `<div class="flex items-start justify-between gap-4 flex-wrap">
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Dashboard</h1>
    <p class="mt-1 text-sm text-gray-600">${escapeHtml(data.window.label)} · ${scopeLabel}</p>
  </div>
  <a href="/digest/preview" class="inline-flex items-center justify-center min-h-[44px] px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-900 hover:bg-gray-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600">
    Preview this week's email
  </a>
</div>`;
}

function renderFilter(data: DashboardViewData): string {
  const presets: Array<{ value: string; label: string }> = [
    { value: '7d',        label: 'Last 7 days' },
    { value: 'this_week', label: 'This week' },
    { value: '30d',       label: 'Last 30 days' },
    { value: 'all',       label: 'All time' },
  ];
  const presetSelected = (val: string): string =>
    data.window.label ===
    (presets.find((p) => p.value === val)?.label ?? '')
      ? 'selected'
      : '';

  return `<details id="filter-disclosure" class="mt-4 scroll-mt-24 text-sm">
  <summary class="cursor-pointer select-none inline-flex items-center gap-1.5 text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 rounded py-2 px-1 -my-2 -mx-1 min-h-[44px]">
    <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h14M6 10h8M9 15h2"/>
    </svg>
    Filter
  </summary>
  <form method="get" action="/" class="mt-3 bg-white border border-gray-200 rounded-md p-4 space-y-4">
    <div>
      <label for="f-window" class="block text-sm font-medium text-gray-900">Date range</label>
      <select id="f-window" name="window" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
        ${presets.map((p) => `<option value="${p.value}" ${presetSelected(p.value)}>${escapeHtml(p.label)}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-900">Severity</label>
      <div class="mt-1 flex flex-wrap gap-2">
        ${renderSeverityChip('all', 'All', data.filters.severity)}
        ${renderSeverityChip('red', 'Red', data.filters.severity)}
        ${renderSeverityChip('yellow', 'Yellow', data.filters.severity)}
        ${renderSeverityChip('missing', 'Missing', data.filters.severity)}
      </div>
    </div>
    <div class="flex gap-2 pt-2 border-t border-gray-200">
      <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Apply</button>
      <a href="/" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Reset</a>
    </div>
  </form>
</details>`;
}

function renderSeverityChip(value: string, label: string, selected: string | undefined): string {
  const active = (selected ?? 'all') === value;
  const classes = active
    ? 'px-3 min-h-[44px] rounded-md border border-blue-600 bg-blue-50 text-blue-700 text-sm font-medium'
    : 'px-3 min-h-[44px] rounded-md border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50';
  return `<label class="${classes} inline-flex items-center cursor-pointer">
  <input type="radio" name="severity" value="${value}" ${active ? 'checked' : ''} class="sr-only">${escapeHtml(label)}
</label>`;
}

function renderTiles(o: OverallCounts): string {
  return `<div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
  ${tile(String(o.red), 'Red')}
  ${tile(String(o.yellow), 'Yellow')}
  ${tile(String(o.missing), 'Missing')}
  ${tile(`${o.compliance_pct.toFixed(1)}%`, 'Compliance')}
</div>`;
}

function tile(value: string, label: string): string {
  return `<div class="bg-white border border-gray-200 rounded-md p-5">
  <div class="text-3xl font-semibold tnum text-gray-900">${escapeHtml(value)}</div>
  <div class="mt-1 text-sm text-gray-600">${escapeHtml(label)}</div>
</div>`;
}

function renderLocationsList(rows: LocationRow[]): string {
  if (rows.length === 0) {
    return `<h2 class="mt-8 text-lg font-medium text-gray-900">Locations this week</h2>
<p class="mt-3 text-sm text-gray-500 bg-white border border-gray-200 rounded-md p-5">No locations configured yet. Add one in Settings.</p>`;
  }

  const rowsHtml = rows
    .map((r) => {
      const counts = [
        r.red_content > 0 ? `${r.red_content} red` : '',
        r.yellow_count > 0 ? `${r.yellow_count} yellow` : '',
        r.missing_count > 0 ? `${r.missing_count} missing` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const countsOrEmpty = counts || 'No flags';
      return `<li>
  <a href="/location/${encodeURIComponent(r.location_id)}" class="flex items-center justify-between px-5 py-4 gap-3 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 min-h-[44px]">
    <div class="flex items-center gap-3 min-w-0">
      ${rollupPill(r.red_content, r.yellow_count, r.missing_count)}
      <span class="text-sm font-medium text-gray-900 truncate">${escapeHtml(r.location_name)}</span>
      <span class="hidden sm:inline text-xs text-gray-500">${escapeHtml(locationTypeLabel(r.location_type))}</span>
    </div>
    <span class="text-sm text-gray-600 tnum shrink-0">${escapeHtml(countsOrEmpty)}</span>
  </a>
</li>`;
    })
    .join('');

  return `<h2 class="mt-8 text-lg font-medium text-gray-900">Locations this week</h2>
<ul class="mt-3 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">${rowsHtml}</ul>`;
}

function renderTrendSection(trend: TrendSeries[]): string {
  return `<h2 class="mt-8 text-lg font-medium text-gray-900">Compliance trend</h2>
<div class="mt-3 bg-white border border-gray-200 rounded-md p-5">
  ${renderTrendChart(trend)}
</div>`;
}

/** Runs once at page bottom; mobile-only scroll-into-view for the filter disclosure. */
function renderMobileFilterScrollScript(): string {
  return `<script>
(function () {
  document.addEventListener('toggle', function (e) {
    var el = e.target;
    if (!(el instanceof HTMLDetailsElement)) return;
    if (el.id !== 'filter-disclosure') return;
    if (!el.open) return;
    if (window.innerWidth >= 768) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, true);
})();
</script>`;
}
