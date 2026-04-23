// Tiny inline SVG sparkline — same technique as trend-chart.ts, scaled to fit
// inside a location-list row. Pure server-rendered SVG, no JS library.
//
// Renders an ~84×20 compliance-%-over-time mini-line. Degrades gracefully:
//   - zero points  → a faint dashed rule (no data yet)
//   - one point    → a single dot, positioned by value
//   - ≥ two points → polyline normalized to [0,100] pct on Y

export interface SparklinePoint {
  date: string;
  pct: number;
}

export interface RenderSparklineOptions {
  width?: number;   // default 84
  height?: number;  // default 20
  /** Accessible label read by screen readers. */
  label?: string;
}

export function renderSparkline(points: SparklinePoint[], opts: RenderSparklineOptions = {}): string {
  const w = opts.width ?? 84;
  const h = opts.height ?? 20;
  const label = opts.label ?? 'Compliance trend';

  if (points.length === 0) {
    // No data line — a centered dashed rule keeps the row's vertical rhythm.
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="No trend data yet" class="inline-block align-middle">
      <line x1="2" y1="${h / 2}" x2="${w - 2}" y2="${h / 2}" style="stroke: var(--ga-border-strong)" stroke-width="1" stroke-dasharray="2 2" />
    </svg>`;
  }

  // Pad so the stroke doesn't clip at the edges.
  const pad = 2;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const yFor = (pct: number): number => {
    const clamped = Math.max(0, Math.min(100, pct));
    return pad + innerH * (1 - clamped / 100);
  };

  if (points.length === 1) {
    const cx = pad + innerW / 2;
    const cy = yFor(points[0]!.pct);
    const colorVar = severityVar(points[0]!.pct);
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeAttr(label)} — single data point" class="inline-block align-middle">
      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="2" style="fill: var(${colorVar})" />
    </svg>`;
  }

  const step = innerW / (points.length - 1);
  const coords = points.map((p, i) => `${(pad + i * step).toFixed(2)},${yFor(p.pct).toFixed(2)}`);

  // Color based on the LATEST point: green ≥ 95, amber ≥ 85, red otherwise.
  const last = points[points.length - 1]!.pct;
  const colorVar = severityVar(last);

  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeAttr(label)}" class="inline-block align-middle">
    <polyline fill="none" style="stroke: var(${colorVar})" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" points="${coords.join(' ')}" />
  </svg>`;
}

/** Pick the design-token CSS custom-property that matches a compliance-%. */
function severityVar(pct: number): string {
  if (pct >= 95) return '--ga-green';
  if (pct >= 85) return '--ga-amber';
  return '--ga-red';
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
