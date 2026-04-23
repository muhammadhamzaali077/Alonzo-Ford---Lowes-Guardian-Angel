// Dashboard top-level view. Four tiles, locations list, trend chart, filter
// disclosure + "Preview this week's email" anchor (per UI/UX decision #3).

import type { LocationRow, OverallCountsWithPrior } from '../db/queries/dashboard.js';
import type { TrendSeries } from '../db/queries/compliance-score.js';
import type { WindowRange } from '../lib/time.js';
import { escapeHtml } from './layout.js';
import { rollupPill, locationTypeLabel } from './ui.js';
import { renderTrendChart } from './trend-chart.js';
import { renderSparkline, type SparklinePoint } from './sparkline.js';
import { contextualHelp } from './contextual-help.js';

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
  // T120 — visible filter-chip bar above the tiles. Clicks drop you
  // into the severity/shift filter via query string; the filter-disclosure
  // form below is still there for date-range selection.
  const filteredLocations = applyDashboardFilters(data.locations, data.filters);
  return `
<section>
  ${data.showWelcome ? renderWelcomePanel() : ''}
  ${renderTitleRow(data)}
  ${renderChipBar(data.filters, windowPresetFromLabel(data.window.label))}
  ${renderFilter(data)}
  ${renderTiles(data.overall)}
  ${renderLocationsList(filteredLocations, data.sparklines, data.filters, data.locations.length)}
  ${renderTrendSection(data.trend)}
  ${contextualHelp('dashboard')}
</section>
${renderMobileFilterScrollScript()}
`;
}

/**
 * Apply the current severity/shift filter to the location rows rendered in
 * the list. Shift filtering is a no-op here (flag counts are shift-agnostic
 * at this aggregate level) but kept in the signature so the chip accepts
 * the param without breaking — a future query refinement can honor it.
 */
function applyDashboardFilters(locations: LocationRow[], filters: DashboardViewData['filters']): LocationRow[] {
  const sev = filters.severity;
  if (!sev || sev === 'all') return locations;
  return locations.filter((l) => {
    if (sev === 'red')     return l.red_content > 0;
    if (sev === 'yellow')  return l.yellow_count > 0;
    if (sev === 'missing') return l.missing_count > 0;
    return true;
  });
}

function windowPresetFromLabel(label: string): string {
  // Map the human label `resolveWindowFromAnchor` produces back to the
  // query-param value. If the label isn't one we recognize (an arbitrary
  // range from a future enhancement), fall through to the default '7d'.
  if (label === 'Last 30 days') return '30d';
  if (label === 'This week') return 'this_week';
  if (label === 'All time') return 'all';
  return '7d';
}

function renderChipBar(filters: DashboardViewData['filters'], windowPreset: string): string {
  const sev = filters.severity ?? 'all';
  const shift = filters.shift ?? 'all';
  const baseParams = (overrides: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    if (windowPreset && windowPreset !== '7d') params.set('window', windowPreset);
    if ((overrides.severity ?? sev) !== 'all') params.set('severity', overrides.severity ?? sev);
    if ((overrides.shift ?? shift) !== 'all') params.set('shift', overrides.shift ?? shift);
    // Allow callers to explicitly clear a single dimension by passing 'all'.
    if (overrides.severity === 'all') params.delete('severity');
    if (overrides.shift === 'all') params.delete('shift');
    const s = params.toString();
    return s ? '/?' + s : '/';
  };
  const chip = (label: string, href: string, active: boolean): string => {
    const cls = active
      ? 'inline-flex items-center gap-1.5 rounded-full border border-blue-600 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700'
      : 'inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs ga-text hover:bg-gray-50 hover:border-gray-400';
    return `<a href="${href}" class="${cls}">${escapeHtml(label)}</a>`;
  };
  const hasAny = sev !== 'all' || shift !== 'all';
  return `<div class="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
    <span class="text-xs ga-text-muted mr-1">Show:</span>
    ${chip('All flags', baseParams({ severity: 'all' }), sev === 'all')}
    ${chip('Red only', baseParams({ severity: 'red' }), sev === 'red')}
    ${chip('Yellow only', baseParams({ severity: 'yellow' }), sev === 'yellow')}
    ${chip('Missing only', baseParams({ severity: 'missing' }), sev === 'missing')}
    <span class="mx-2 h-4 w-px bg-gray-300" aria-hidden="true"></span>
    ${chip('All shifts', baseParams({ shift: 'all' }), shift === 'all')}
    ${chip('Day', baseParams({ shift: 'Day' }), shift === 'Day')}
    ${chip('Swing', baseParams({ shift: 'Swing' }), shift === 'Swing')}
    ${chip('Overnight', baseParams({ shift: 'Overnight' }), shift === 'Overnight')}
    ${hasAny ? `<a href="/" class="ml-1 text-xs ga-text-muted hover:text-blue-600 underline">Clear</a>` : ''}
  </div>`;
}

function renderWelcomePanel(): string {
  return `<aside id="welcome-panel" class="ga-panel-welcome mb-6 p-5 sm:p-6">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="ga-h2">Welcome to Guardian Angel</h2>
      <p class="mt-2 ga-body">This is the compliance dashboard for Lowe's Guardian Angel. Red, yellow, and green flags cover missing shift notes and content that falls outside your rules. Everything on this screen is synthetic demo data — click any location to drill down, or open <a href="/rules" class="ga-link">Rules</a> to tune how flags are generated.</p>
    </div>
    <button type="button"
            hx-post="/ui/welcome/dismiss"
            hx-target="#welcome-panel"
            hx-swap="outerHTML"
            aria-label="Dismiss welcome message"
            class="ga-icon-btn ga-transition shrink-0 -mt-1 -mr-1 ga-focus">
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
    <h1 class="ga-h1">Dashboard</h1>
    <p class="mt-1 ga-caption">${escapeHtml(data.window.label)} · ${scopeLabel}</p>
  </div>
  <a href="/digest/preview" class="ga-btn ga-btn-secondary">
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
  <summary class="ga-btn ga-btn-secondary cursor-pointer select-none list-none" style="padding-left: 12px; padding-right: 12px;">
    <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h14M6 10h8M9 15h2"/>
    </svg>
    Filter
  </summary>
  <form method="get" action="/" class="mt-3 ga-surface rounded-md p-4 space-y-4" style="border: 1px solid var(--ga-border);">
    <div>
      <label for="f-window" class="block text-sm font-medium ga-text-strong">Date range</label>
      <select id="f-window" name="window" class="mt-1 block w-full rounded-md px-3 py-2 text-base ga-focus ga-transition" style="border: 1px solid var(--ga-border-strong); background-color: var(--ga-surface); color: var(--ga-text);">
        ${presets.map((p) => `<option value="${p.value}" ${presetSelected(p.value)}>${escapeHtml(p.label)}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium ga-text-strong">Severity</label>
      <div class="mt-1 flex flex-wrap gap-2">
        ${renderSeverityChip('all', 'All', data.filters.severity)}
        ${renderSeverityChip('red', 'Red', data.filters.severity)}
        ${renderSeverityChip('yellow', 'Yellow', data.filters.severity)}
        ${renderSeverityChip('missing', 'Missing', data.filters.severity)}
      </div>
    </div>
    <div class="flex gap-2 pt-2" style="border-top: 1px solid var(--ga-border);">
      <button type="submit" class="ga-btn ga-btn-primary">Apply</button>
      <a href="/" class="ga-btn ga-btn-ghost">Reset</a>
    </div>
  </form>
</details>`;
}

function renderSeverityChip(value: string, label: string, selected: string | undefined): string {
  const active = (selected ?? 'all') === value;
  const classes = active
    ? 'px-3 min-h-[44px] rounded-md border border-blue-600 bg-blue-50 text-blue-700 text-sm font-medium'
    : 'px-3 min-h-[44px] rounded-md border border-gray-300 bg-white ga-text text-sm hover:bg-gray-50';
  return `<label class="${classes} inline-flex items-center cursor-pointer">
  <input type="radio" name="severity" value="${value}" ${active ? 'checked' : ''} class="sr-only">${escapeHtml(label)}
</label>`;
}

function renderTiles(o: OverallCountsWithPrior): string {
  // Accent — 2px left border in the metric's severity color (no icons, per
  // UI/UX constraints). Each tile carries a `tone` that picks the accent
  // token; compliance uses `green` as its positive-metric marker.
  return `<div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
  ${tile({ label: 'Red',        tone: 'red',    current: o.red,            prior: o.prior.red,            higherIsWorse: true })}
  ${tile({ label: 'Yellow',     tone: 'amber',  current: o.yellow,         prior: o.prior.yellow,         higherIsWorse: true })}
  ${tile({ label: 'Missing',    tone: 'red',    current: o.missing,        prior: o.prior.missing,        higherIsWorse: true })}
  ${tile({ label: 'Compliance', tone: 'green',  current: o.compliance_pct, prior: o.prior.compliance_pct, higherIsWorse: false, unit: '%', decimals: 1, complianceArrow: true })}
</div>`;
}

type TileTone = 'red' | 'amber' | 'green';

interface TileProps {
  label: string;
  tone: TileTone;
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

  // Left accent: 2px border-left in the metric's severity color. Achieved via
  // an inline style pulling from --ga-red / --ga-amber / --ga-green so the
  // tile picks up any future token re-tune for free.
  const accentVar = p.tone === 'red' ? '--ga-red' : p.tone === 'amber' ? '--ga-amber' : '--ga-green';
  const accentStyle = `border-left: 2px solid var(${accentVar});`;

  return `<div class="ga-tile ga-surface rounded-md ga-shadow-sm ga-transition" style="${accentStyle}">
  <div class="p-5 sm:p-6">
    <div class="flex items-start justify-between gap-3">
      <div class="ga-display"
           data-count-to="${escapeHtml(countTo)}"
           data-count-unit="${escapeHtml(unit)}"
           data-count-decimals="${decimals}"
           aria-label="${escapeHtml(p.label)}: ${escapeHtml(displayFinal + unit)}">${escapeHtml(displayFinal + unit)}</div>
      ${arrow}
    </div>
    <div class="mt-2 ga-caption">${escapeHtml(p.label)}</div>
    <div class="mt-1">${deltaHtml}</div>
  </div>
</div>`;
}

function renderDelta(p: TileProps): string {
  const diff = p.current - p.prior;
  if (!Number.isFinite(diff) || Math.abs(diff) < (p.decimals && p.decimals > 0 ? 0.05 : 0.5)) {
    return `<span class="text-xs ga-text-muted" title="No change vs. prior period">— vs last period</span>`;
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
    return `<svg class="w-5 h-5 ga-text-subtle" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true" title="Flat vs. last period">
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

function renderLocationsList(
  rows: LocationRow[],
  sparklines: Map<string, SparklinePoint[]>,
  filters: DashboardViewData['filters'] = {},
  totalUnfiltered?: number,
): string {
  if (rows.length === 0) {
    // Distinguish "no locations exist" from "filter hid everything".
    const filteredToNothing =
      (filters.severity && filters.severity !== 'all') ||
      (filters.shift && filters.shift !== 'all');
    if (filteredToNothing && (totalUnfiltered ?? 0) > 0) {
      return `<h2 class="mt-8 text-lg font-medium ga-text-strong">Locations this week</h2>
<p class="mt-3 text-sm ga-text-muted bg-white border border-gray-200 rounded-md p-5">No locations match the current filter. <a href="/" class="text-blue-600 hover:underline">Clear filter</a>.</p>`;
    }
    return `<h2 class="mt-8 text-lg font-medium ga-text-strong">Locations this week</h2>
<p class="mt-3 text-sm ga-text-muted bg-white border border-gray-200 rounded-md p-5">No locations configured yet. Add one in Settings.</p>`;
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
  <a href="/location/${encodeURIComponent(r.location_id)}" class="ga-row flex items-center px-5 py-4 gap-4 min-h-[56px] ga-transition ga-focus">
    <div class="flex items-center gap-3 min-w-0 flex-1">
      ${rollupPill(r.red_content, r.yellow_count, r.missing_count)}
      <span class="text-sm font-medium ga-text-strong truncate">${escapeHtml(r.location_name)}</span>
      <span class="hidden sm:inline text-xs ga-text-muted">${escapeHtml(locationTypeLabel(r.location_type))}</span>
    </div>
    <span class="hidden sm:inline-flex items-center shrink-0" aria-hidden="true">${sparkHtml}</span>
    <span class="text-sm ga-text tnum shrink-0 w-[9rem] text-right">${escapeHtml(countsOrEmpty)}</span>
  </a>
</li>`;
    })
    .join('');

  return `<h2 class="mt-10 ga-h2">Locations this week</h2>
<ul class="mt-3 ga-surface rounded-md overflow-hidden" style="border: 1px solid var(--ga-border);">${rowsHtml}</ul>`;
}

function renderTrendSection(trend: TrendSeries[]): string {
  return `<div class="mt-10">
  <h2 class="ga-h2">Compliance trend</h2>
  <p class="mt-1 ga-caption">Daily compliance score by location, last 7 days.</p>
</div>
<div class="mt-3 ga-surface rounded-md p-5 sm:p-6" style="border: 1px solid var(--ga-border);">
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
