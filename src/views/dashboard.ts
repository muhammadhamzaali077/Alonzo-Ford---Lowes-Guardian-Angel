// Dashboard top-level view. Four tiles, locations list, trend chart, filter
// disclosure + "Preview this week's email" anchor (per UI/UX decision #3).

import type { LocationRow, OverallCountsWithPrior } from '../db/queries/dashboard.js';
import type { TrendSeries } from '../db/queries/compliance-score.js';
import type { WindowRange } from '../lib/time.js';
import { escapeHtml } from './layout.js';
import { rollupPill, locationTypeLabel } from './ui.js';
import { renderTrendChart } from './trend-chart.js';
import { renderSparkline, type SparklinePoint } from './sparkline.js';

export interface DashboardViewData {
  window: WindowRange;
  overall: OverallCountsWithPrior;
  locations: LocationRow[];
  trend: TrendSeries[];
  /** Map of location_id → series for the sparkline in its row. */
  sparklines: Map<string, SparklinePoint[]>;
  filters: {
    start?: string;
    end?: string;
    severity?: string;
    shift?: string;
    locationId?: string;
  };
  /** True when the user hasn't dismissed the welcome card (cookie unset). */
  showWelcome: boolean;
}

export function renderDashboard(data: DashboardViewData): string {
  return `
<section>
  ${data.showWelcome ? renderWelcomePanel() : ''}
  ${renderTitleRow(data)}
  ${renderFilter(data)}
  ${renderTiles(data.overall)}
  ${renderLocationsList(data.locations, data.sparklines)}
  ${renderTrendSection(data.trend)}
</section>
${renderMobileFilterScrollScript()}
`;
}

function renderWelcomePanel(): string {
  return `<aside id="welcome-panel" class="mb-4 bg-white border border-blue-200 rounded-md p-4 sm:p-5">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-base font-semibold text-gray-900">Welcome to Guardian Angel</h2>
      <p class="mt-1 text-sm text-gray-700">This is the compliance dashboard for Lowe's Guardian Angel. Red, yellow, and green flags cover missing shift notes and content that falls outside your rules. Everything on this screen is synthetic demo data — click any location to drill down, or open <a href="/rules" class="text-blue-600 hover:underline">Rules</a> to tune how flags are generated.</p>
    </div>
    <button type="button"
            hx-post="/ui/welcome/dismiss"
            hx-target="#welcome-panel"
            hx-swap="outerHTML"
            aria-label="Dismiss welcome message"
            class="shrink-0 inline-flex items-center justify-center min-h-[32px] min-w-[32px] -mt-1 -mr-1 p-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5l10 10M15 5L5 15"/>
      </svg>
      <span class="sr-only">Dismiss</span>
    </button>
  </div>
</aside>`;
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

function renderTiles(o: OverallCountsWithPrior): string {
  return `<div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
  ${tile({ label: 'Red',        current: o.red,            prior: o.prior.red,        higherIsWorse: true })}
  ${tile({ label: 'Yellow',     current: o.yellow,         prior: o.prior.yellow,     higherIsWorse: true })}
  ${tile({ label: 'Missing',    current: o.missing,        prior: o.prior.missing,    higherIsWorse: true })}
  ${tile({ label: 'Compliance', current: o.compliance_pct, prior: o.prior.compliance_pct, higherIsWorse: false, unit: '%', decimals: 1, complianceArrow: true })}
</div>`;
}

interface TileProps {
  label: string;
  current: number;
  prior: number;
  /** Flags go up = bad; compliance goes up = good. Colors the delta accordingly. */
  higherIsWorse: boolean;
  unit?: string;
  decimals?: number;
  complianceArrow?: boolean;
}

function tile(p: TileProps): string {
  const decimals = p.decimals ?? 0;
  const unit = p.unit ?? '';
  const displayFinal = decimals > 0 ? p.current.toFixed(decimals) : String(Math.round(p.current));
  // Hook for the count-up script in layout.ts. It reads data-count-to and
  // animates the textContent from 0 → target over ~700ms on first paint.
  const countTo = decimals > 0 ? p.current.toFixed(decimals) : String(Math.round(p.current));

  const deltaHtml = renderDelta(p);
  const arrow = p.complianceArrow ? renderComplianceArrow(p.current - p.prior) : '';

  return `<div class="bg-white border border-gray-200 rounded-md p-5">
  <div class="flex items-baseline gap-2">
    <div class="text-3xl font-semibold tnum text-gray-900"
         data-count-to="${escapeHtml(countTo)}"
         data-count-unit="${escapeHtml(unit)}"
         data-count-decimals="${decimals}"
         aria-label="${escapeHtml(p.label)}: ${escapeHtml(displayFinal + unit)}">${escapeHtml(displayFinal + unit)}</div>
    ${arrow}
  </div>
  <div class="mt-1 flex items-baseline justify-between gap-2">
    <div class="text-sm text-gray-600">${escapeHtml(p.label)}</div>
    ${deltaHtml}
  </div>
</div>`;
}

function renderDelta(p: TileProps): string {
  const diff = p.current - p.prior;
  if (!Number.isFinite(diff) || Math.abs(diff) < (p.decimals && p.decimals > 0 ? 0.05 : 0.5)) {
    return `<span class="text-xs text-gray-500" title="No change vs. prior period">— vs last period</span>`;
  }
  const isWorse = p.higherIsWorse ? diff > 0 : diff < 0;
  const color = isWorse ? 'text-red-700' : 'text-green-700';
  const sign = diff > 0 ? '+' : '−';
  const mag = p.decimals && p.decimals > 0 ? Math.abs(diff).toFixed(p.decimals) : String(Math.round(Math.abs(diff)));
  const unit = p.unit ?? '';
  return `<span class="text-xs font-medium ${color} tnum" title="Change vs. prior equal-length period">${sign}${escapeHtml(mag + unit)} vs last period</span>`;
}

function renderComplianceArrow(delta: number): string {
  // Compliance is a percentage; ignore tiny wobble.
  if (Math.abs(delta) < 0.1) {
    return `<svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true" title="Flat vs. last period">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 10h12"/>
    </svg>`;
  }
  if (delta > 0) {
    return `<svg class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true" title="Up vs. last period">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 16V4M5 9l5-5 5 5"/>
    </svg>`;
  }
  return `<svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true" title="Down vs. last period">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 4v12M5 11l5 5 5-5"/>
  </svg>`;
}

function renderLocationsList(rows: LocationRow[], sparklines: Map<string, SparklinePoint[]>): string {
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
      const sparkPoints = sparklines.get(r.location_id) ?? [];
      const sparkHtml = renderSparkline(sparkPoints, { label: `${r.location_name} compliance trend` });
      return `<li>
  <a href="/location/${encodeURIComponent(r.location_id)}" class="flex items-center justify-between px-5 py-4 gap-3 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 min-h-[44px]">
    <div class="flex items-center gap-3 min-w-0">
      ${rollupPill(r.red_content, r.yellow_count, r.missing_count)}
      <span class="text-sm font-medium text-gray-900 truncate">${escapeHtml(r.location_name)}</span>
      <span class="hidden sm:inline text-xs text-gray-500">${escapeHtml(locationTypeLabel(r.location_type))}</span>
    </div>
    <div class="flex items-center gap-3 shrink-0">
      <span class="hidden sm:inline" aria-hidden="true">${sparkHtml}</span>
      <span class="text-sm text-gray-600 tnum">${escapeHtml(countsOrEmpty)}</span>
    </div>
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
