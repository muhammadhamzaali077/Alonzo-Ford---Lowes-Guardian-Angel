// Inline SVG sparkline for the location-list row. Pure server-rendered SVG —
// no JS library, no canvas. Degrades gracefully:
//   - zero points  → centered dashed rule (no data yet)
//   - one point    → a single dot, positioned by value
//   - ≥ two points → polyline + faint area fill + 100%/0% gridlines
//
// Default dimensions (120×32) target the dashboard row. The area fill is
// a separate <path> tied to the same coords, closed at the baseline, at
// 10% opacity — reads as an area chart without overwhelming the stroke.

export interface SparklinePoint {
  date: string;
  pct: number;
}

export interface RenderSparklineOptions {
  width?: number;   // default 120
  height?: number;  // default 32
  /** Accessible label read by screen readers. */
  label?: string;
}

export function renderSparkline(points: SparklinePoint[], opts: RenderSparklineOptions = {}): string {
  const w = opts.width ?? 120;
  const h = opts.height ?? 32;
  const label = opts.label ?? 'Compliance trend';

  if (points.length === 0) {
    // No data line — a centered dashed rule keeps the row's vertical rhythm.
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="No trend data yet" class="inline-block align-middle">
      <line x1="2" y1="${h / 2}" x2="${w - 2}" y2="${h / 2}" style="stroke: var(--ga-border-strong)" stroke-width="1" stroke-dasharray="2 2" />
    </svg>`;
  }

  // Pad so the stroke doesn't clip at the edges. Slightly more vertical pad
  // now that the sparkline is taller — lets dots at 100% or 0% still read
  // with stroke inside the box.
  const padX = 3;
  const padY = 4;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const yFor = (pct: number): number => {
    const clamped = Math.max(0, Math.min(100, pct));
    return padY + innerH * (1 - clamped / 100);
  };

  // 100% and 0% gridlines framing the plot area. Drawn before the data so
  // the line sits on top.
  const gridTop    = yFor(100);
  const gridBottom = yFor(0);
  const gridlines = `
    <line x1="${padX}" y1="${gridTop.toFixed(2)}"    x2="${w - padX}" y2="${gridTop.toFixed(2)}"    style="stroke: var(--ga-border)" stroke-width="1" />
    <line x1="${padX}" y1="${gridBottom.toFixed(2)}" x2="${w - padX}" y2="${gridBottom.toFixed(2)}" style="stroke: var(--ga-border)" stroke-width="1" />`;

  if (points.length === 1) {
    const cx = padX + innerW / 2;
    const cy = yFor(points[0]!.pct);
    const colorVar = severityVar(points[0]!.pct);
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeAttr(label)} — single data point" class="inline-block align-middle">${gridlines}
      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="2.5" style="fill: var(${colorVar})" />
    </svg>`;
  }

  const step = innerW / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padX + i * step,
    y: yFor(p.pct),
  }));

  const linePath  = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  // Close the area path by returning to the baseline under the last point
  // and back to the first point's x at the baseline. 10% fill reads as an
  // area without competing with the stroke.
  const lastX     = coords[coords.length - 1]!.x;
  const firstX    = coords[0]!.x;
  const baselineY = gridBottom;
  const areaPath  = `${linePath} L${lastX.toFixed(2)},${baselineY.toFixed(2)} L${firstX.toFixed(2)},${baselineY.toFixed(2)} Z`;

  // Color based on the LATEST point: green ≥ 95, amber ≥ 85, red otherwise.
  const last = points[points.length - 1]!.pct;
  const colorVar = severityVar(last);

  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeAttr(label)}" class="inline-block align-middle">${gridlines}
    <path d="${areaPath}" style="fill: var(${colorVar})" fill-opacity="0.10" stroke="none" />
    <path d="${linePath}" fill="none" style="stroke: var(${colorVar})" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
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
