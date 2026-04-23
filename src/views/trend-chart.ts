// Server-rendered inline SVG trend chart. One line per location, y-axis 0–100%,
// faint gridlines at 25/50/75/100, no animation, no JS charting library.
//
// Per UI/UX decision #5a: if Phase 6 or later proposes recharts, chart.js,
// or uplot, push back — the trend chart is deliberately boring and pure SVG.

import type { TrendSeries } from '../db/queries/compliance-score.js';
import { escapeHtml } from './layout.js';

// 4-line calm palette (design-tokens.ts mirrors these as --ga-chart-1..4).
// If a future layout renders >4 locations, extend this list and the tokens
// together, keeping the "no neon, no brand accent" constraint.
const LINE_COLOR_VARS = [
  '--ga-chart-1', // deep blue — primary
  '--ga-chart-2', // slate    — neutral
  '--ga-chart-3', // emerald  — positive
  '--ga-chart-4', // amber    — warm
];

export interface TrendChartOptions {
  widthPx?: number;  // default 720; chart scales to container width via viewBox
  heightPx?: number; // default 240
}

export function renderTrendChart(series: TrendSeries[], opts: TrendChartOptions = {}): string {
  const width = opts.widthPx ?? 720;
  const height = opts.heightPx ?? 240;
  const paddingLeft = 40;  // y-axis labels
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 32; // x-axis date labels

  if (series.length === 0 || series[0]!.points.length === 0) {
    return `<div class="flex items-center justify-center h-56 text-sm ga-text-muted">No trend data for this period.</div>`;
  }

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const dateCount = series[0]!.points.length;

  const xFor = (i: number): number => {
    if (dateCount === 1) return paddingLeft + chartW / 2;
    return paddingLeft + (i * chartW) / (dateCount - 1);
  };
  const yFor = (pct: number): number => paddingTop + chartH - (pct / 100) * chartH;

  // Gridlines at 25/50/75/100 — use tokens for stroke + label color.
  const gridLines = [25, 50, 75, 100]
    .map((pct) => {
      const y = yFor(pct);
      return `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartW}" y2="${y}" style="stroke: var(--ga-border)" stroke-width="1"/>
      <text x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" style="fill: var(--ga-text-muted)">${pct}%</text>`;
    })
    .join('\n');

  // Baseline at 0%
  const baseline = `<line x1="${paddingLeft}" y1="${yFor(0)}" x2="${paddingLeft + chartW}" y2="${yFor(0)}" style="stroke: var(--ga-border-strong)" stroke-width="1"/>
  <text x="${paddingLeft - 8}" y="${yFor(0) + 4}" text-anchor="end" font-size="11" style="fill: var(--ga-text-muted)">0%</text>`;

  // Data lines. Each line gets its own <g> with:
  //   - the path itself (unstyled pointer-events: none so it can't steal hover)
  //   - per-point hoverable <circle> with SVG <title> for native tooltips
  //   - the circle is clickable and navigates to /location/:id (T119
  //     click-to-scope) — server-side nav, no JS handler needed.
  //
  // Colors reference CSS custom properties via inline `style` so a single
  // token edit in layout.ts re-themes every chart on the next paint.
  const paths = series
    .map((s, idx) => {
      const colorVar = LINE_COLOR_VARS[idx % LINE_COLOR_VARS.length];
      const d = s.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.pct).toFixed(1)}`)
        .join(' ');
      const locHref = `/location/${encodeURIComponent(s.location_id)}`;
      const dots = s.points
        .map((p, i) => {
          const cx = xFor(i).toFixed(1);
          const cy = yFor(p.pct).toFixed(1);
          const pct = Math.round(p.pct);
          return `<a href="${locHref}" aria-label="${escapeHtml(s.location_name)} — ${pct}% compliance on ${escapeHtml(p.date)}">
          <circle cx="${cx}" cy="${cy}" r="3.5" style="fill: var(${colorVar})" opacity="0" class="ga-trend-dot" tabindex="0">
            <title>${escapeHtml(s.location_name)} · ${escapeHtml(p.date)} · ${pct}% compliance</title>
          </circle>
        </a>`;
        })
        .join('');
      return `<g>
        <path d="${d}" fill="none" style="stroke: var(${colorVar})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>
        ${dots}
      </g>`;
    })
    .join('\n');

  // X-axis labels: first, middle, last
  const firstDate = series[0]!.points[0]!.date;
  const lastDate = series[0]!.points[dateCount - 1]!.date;
  const midIdx = Math.floor((dateCount - 1) / 2);
  const midDate = series[0]!.points[midIdx]!.date;
  const xLabels = [
    { x: xFor(0), anchor: 'start', text: firstDate },
    { x: xFor(midIdx), anchor: 'middle', text: midDate },
    { x: xFor(dateCount - 1), anchor: 'end', text: lastDate },
  ]
    .map((l) => `<text x="${l.x}" y="${height - 12}" text-anchor="${l.anchor}" font-size="11" style="fill: var(--ga-text-muted)">${escapeHtml(l.text)}</text>`)
    .join('\n');

  // Legend below chart — each entry is a link to the corresponding location
  // so users can get to the drill-down from the chart label too.
  const legend = series
    .map((s, idx) => {
      const colorVar = LINE_COLOR_VARS[idx % LINE_COLOR_VARS.length];
      return `<li>
      <a href="/location/${encodeURIComponent(s.location_id)}"
         class="inline-flex items-center gap-1.5 ga-text-muted hover:text-[color:var(--ga-blue-strong)] ga-transition focus:outline-none focus:ring-2 focus:ring-blue-600 rounded">
        <span class="inline-block w-3 h-[2px]" style="background: var(${colorVar})"></span>
        <span>${escapeHtml(s.location_name)}</span>
      </a>
    </li>`;
    })
    .join('');

  const svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Compliance trend by location">
  <style>
    .ga-trend-dot { transition: opacity 150ms ease-in-out; cursor: pointer; }
    .ga-trend-dot:hover, .ga-trend-dot:focus { opacity: 1 !important; }
    svg:hover .ga-trend-dot { opacity: 0.35; }
    @media (prefers-reduced-motion: reduce) { .ga-trend-dot { transition: none; } }
  </style>
  ${gridLines}
  ${baseline}
  ${paths}
  ${xLabels}
</svg>`;

  return `<div class="space-y-3">
    <div>${svg}</div>
    <ul class="flex flex-wrap gap-x-5 gap-y-1 text-xs ga-text-muted">${legend}</ul>
    <p class="text-xs ga-text-muted">Tip: hover a point to see the date and compliance percentage, click to open that location.</p>
  </div>`;
}
