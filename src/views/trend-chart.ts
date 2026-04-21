// Server-rendered inline SVG trend chart. One line per location, y-axis 0–100%,
// faint gridlines at 25/50/75/100, no animation, no JS charting library.
//
// Per UI/UX decision #5a: if Phase 6 or later proposes recharts, chart.js,
// or uplot, push back — the trend chart is deliberately boring and pure SVG.

import type { TrendSeries } from '../db/queries/compliance-score.js';
import { escapeHtml } from './layout.js';

const LINE_COLORS = [
  '#2563eb', // blue-600 — primary accent
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
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
    return `<div class="flex items-center justify-center h-56 text-sm text-gray-500">No trend data for this period.</div>`;
  }

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const dateCount = series[0]!.points.length;

  const xFor = (i: number): number => {
    if (dateCount === 1) return paddingLeft + chartW / 2;
    return paddingLeft + (i * chartW) / (dateCount - 1);
  };
  const yFor = (pct: number): number => paddingTop + chartH - (pct / 100) * chartH;

  // Gridlines at 25/50/75/100
  const gridLines = [25, 50, 75, 100]
    .map((pct) => {
      const y = yFor(pct);
      return `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${pct}%</text>`;
    })
    .join('\n');

  // Baseline at 0%
  const baseline = `<line x1="${paddingLeft}" y1="${yFor(0)}" x2="${paddingLeft + chartW}" y2="${yFor(0)}" stroke="#d1d5db" stroke-width="1"/>
  <text x="${paddingLeft - 8}" y="${yFor(0) + 4}" text-anchor="end" font-size="11" fill="#6b7280">0%</text>`;

  // Data lines + legend
  const paths = series
    .map((s, idx) => {
      const color = LINE_COLORS[idx % LINE_COLORS.length];
      const d = s.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.pct).toFixed(1)}`)
        .join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
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
    .map((l) => `<text x="${l.x}" y="${height - 12}" text-anchor="${l.anchor}" font-size="11" fill="#6b7280">${escapeHtml(l.text)}</text>`)
    .join('\n');

  // Legend below chart
  const legend = series
    .map((s, idx) => {
      const color = LINE_COLORS[idx % LINE_COLORS.length];
      return `<li class="inline-flex items-center gap-1.5">
      <span class="inline-block w-3 h-[2px]" style="background:${color}"></span>
      <span>${escapeHtml(s.location_name)}</span>
    </li>`;
    })
    .join('');

  const svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Compliance trend by location">
  ${gridLines}
  ${baseline}
  ${paths}
  ${xLabels}
</svg>`;

  return `<div class="space-y-3">
    <div>${svg}</div>
    <ul class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">${legend}</ul>
  </div>`;
}
