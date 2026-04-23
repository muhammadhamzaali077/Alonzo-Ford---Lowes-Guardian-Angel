// Server-rendered inline SVG trend chart. One line per location, y-axis 0–100%,
// no animation, no JS charting library. Colors are tokens (--ga-chart-1..4)
// consumed via inline `style` so a single token edit re-themes every chart.
//
// Per UI/UX decision #5a: if a future phase proposes recharts, chart.js,
// or uplot, push back — the trend chart is deliberately boring and pure SVG.
//
// Batch 4 upgrades:
//   - 2.5px strokes with rounded caps / joins
//   - Always-visible dots at each data point (grow on hover)
//   - Dashed horizontal gridlines at 25/50/75/100
//   - Subtle vertical gridlines at each date
//   - Legend uses rounded-rectangle swatches, not line segments
//   - Hovering a line or its legend entry dims the other lines (CSS :has)
//   - Chart wrapped in a container so :has() can span SVG ↔ legend

import type { TrendSeries } from '../db/queries/compliance-score.js';
import { escapeHtml } from './layout.js';

// 4-line calm palette (mirrored in :root as --ga-chart-1..4).
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

  // Horizontal gridlines at 25/50/75/100 — dashed + lighter.
  const gridLines = [25, 50, 75, 100]
    .map((pct) => {
      const y = yFor(pct);
      return `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartW}" y2="${y}" style="stroke: var(--ga-border)" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" style="fill: var(--ga-text-muted)">${pct}%</text>`;
    })
    .join('\n');

  // Solid baseline at 0%
  const baseline = `<line x1="${paddingLeft}" y1="${yFor(0)}" x2="${paddingLeft + chartW}" y2="${yFor(0)}" style="stroke: var(--ga-border-strong)" stroke-width="1"/>
  <text x="${paddingLeft - 8}" y="${yFor(0) + 4}" text-anchor="end" font-size="11" style="fill: var(--ga-text-muted)">0%</text>`;

  // Subtle vertical gridlines at every date tick — 1px, very light, behind
  // the data so hover targets still win pointer events.
  const verticalGrid = Array.from({ length: dateCount }, (_, i) => {
    const x = xFor(i).toFixed(1);
    return `<line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${yFor(0)}" style="stroke: var(--ga-border)" stroke-width="1" opacity="0.4" pointer-events="none"/>`;
  }).join('\n      ');

  // Data lines. Each line is a <g.ga-trend-line.ga-trend-line-N> so CSS :has()
  // rules below can target individual lines. The <path> handles hover so a
  // big invisible hit area isn't needed. Per-point <circle> carries SVG <title>
  // for native tooltips AND is wrapped in <a> for click-to-scope.
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
          <circle cx="${cx}" cy="${cy}" r="2.75" style="fill: var(${colorVar})" class="ga-trend-dot" tabindex="0">
            <title>${escapeHtml(s.location_name)} · ${escapeHtml(p.date)} · ${pct}% compliance</title>
          </circle>
        </a>`;
        })
        .join('');
      return `<g class="ga-trend-line ga-trend-line-${idx}">
        <path d="${d}" fill="none" style="stroke: var(${colorVar})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>
        ${dots}
      </g>`;
    })
    .join('\n');

  // X-axis labels: first, middle, last (keeps the axis uncluttered).
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

  // Legend — each entry is a link to the matching location, swatch is a
  // rounded rectangle, class `ga-trend-legend-N` pairs with the line for
  // hover-dim via :has() on the wrapper.
  const legend = series
    .map((s, idx) => {
      const colorVar = LINE_COLOR_VARS[idx % LINE_COLOR_VARS.length];
      return `<li>
      <a href="/location/${encodeURIComponent(s.location_id)}"
         class="ga-trend-legend ga-trend-legend-${idx} inline-flex items-center gap-2 ga-text-muted hover:text-[color:var(--ga-gold-bright)] ga-transition ga-focus rounded px-1 -mx-1 py-0.5">
        <span class="inline-block w-3.5 h-2 rounded-sm" style="background: var(${colorVar})" aria-hidden="true"></span>
        <span>${escapeHtml(s.location_name)}</span>
      </a>
    </li>`;
    })
    .join('');

  // Per-line hover-dim rules. Each line index gets two rules: one for when
  // the line's own dot is hovered, another for when the matching legend
  // entry is hovered. `:has()` matches the wrapper when any descendant
  // matches, so every OTHER line gets dimmed.
  const hoverDimRules = series
    .map((_, idx) => {
      const notSelector = `:not(.ga-trend-line-${idx})`;
      return [
        `.ga-trend-wrap:has(.ga-trend-line-${idx}:hover) .ga-trend-line${notSelector} { opacity: 0.25; }`,
        `.ga-trend-wrap:has(.ga-trend-legend-${idx}:hover) .ga-trend-line${notSelector} { opacity: 0.25; }`,
      ].join('\n');
    })
    .join('\n');

  const svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Compliance trend by location">
  <style>
    .ga-trend-dot  { transition: r 150ms ease-in-out, opacity 150ms ease-in-out; cursor: pointer; }
    .ga-trend-dot:hover,
    .ga-trend-dot:focus { r: 4; }
    .ga-trend-line { transition: opacity 150ms ease-in-out; }
    @media (prefers-reduced-motion: reduce) {
      .ga-trend-dot, .ga-trend-line { transition: none; }
    }
  </style>
  ${verticalGrid}
  ${gridLines}
  ${baseline}
  ${paths}
  ${xLabels}
</svg>`;

  return `<div class="ga-trend-wrap space-y-3">
    <style>
${hoverDimRules}
    </style>
    <div>${svg}</div>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs">${legend}</ul>
    <p class="text-xs ga-text-muted">Tip: hover a point (or a legend item) to see the date and percentage. Click a point to open that location.</p>
  </div>`;
}
