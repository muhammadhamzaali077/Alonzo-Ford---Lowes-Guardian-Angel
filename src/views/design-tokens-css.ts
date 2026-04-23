// Shared design-tokens stylesheet. Consumed by `layout.ts` for every
// authenticated page and by `auth-login.ts` (which renders its own
// <head> and so doesn't get layout.ts's inline <style>).
//
// Every CSS custom property + utility class in the app lives here. If you
// find yourself reaching for a raw hex or Tailwind color class in a view,
// add a token here first and consume it.
//
// See the STABILITY CONTRACT in the CSS comment below for which tokens are
// safe to tune vs. which require a UX decision.

export const DESIGN_TOKENS_STYLE = `<style>
    /* ========================================================================
     * DESIGN TOKENS — single source of truth for color, typography, spacing,
     * elevation, and motion across Guardian Angel.
     *
     * Rule: if you are about to write a raw hex, a Tailwind gray-* / red-* /
     * etc. color class, or a one-off spacing value in a view, stop. Either
     * consume a token from here, or add one here and consume it.
     *
     * ------------------------------------------------------------------------
     * STABILITY CONTRACT — read before editing.
     *
     * PROTECTED (change only with a UX decision):
     *   --ga-bg, --ga-surface                — app chrome color
     *   --ga-red, --ga-amber, --ga-green     — severity meanings
     *   --ga-blue                            — primary accent
     *   --ga-font-sans                       — typography stack
     *   --ga-focus                           — accessibility contract
     *
     * TUNABLE (safe to nudge for polish without a decision):
     *   *-bg, *-border variants of severity  — severity shades
     *   --ga-text, --ga-text-muted,
     *   --ga-text-subtle                     — neutral text tiers
     *   --ga-border, --ga-border-strong      — neutral borders
     *   --ga-shadow-xs, -sm, -md             — elevation
     *   --ga-chart-1..4                      — trend-chart line colors
     *   --ga-space-*                         — spacing step values
     *   --ga-dur, --ga-ease                  — motion timing
     * ====================================================================== */
    :root {
      /* ---- Neutrals ---------------------------------------------------- */
      --ga-bg:            #f8fafc;  /* app background — cool, clinical */
      --ga-surface:       #ffffff;  /* card / panel surface */
      --ga-border:        #e4e7ec;  /* default subdued border on cards + rows */
      --ga-border-strong: #d0d5dd;  /* emphasized container borders */
      --ga-text:          #344054;  /* body copy */
      --ga-text-strong:   #101828;  /* page titles, metric numbers */
      --ga-text-muted:    #667085;  /* captions, metadata, hints */
      --ga-text-subtle:   #98a2b3;  /* placeholder, disabled */

      /* ---- Severity (clinical, not alarm-bell) ------------------------- */
      --ga-red-bg:      #fef3f2;
      --ga-red-border:  #fecdca;
      --ga-red:         #b42318;
      --ga-red-strong:  #912018;

      --ga-amber-bg:     #fffaeb;
      --ga-amber-border: #fedf89;
      --ga-amber:        #b54708;
      --ga-amber-strong: #93370d;

      --ga-green-bg:     #ecfdf3;
      --ga-green-border: #abefc6;
      --ga-green:        #067647;
      --ga-green-strong: #085d3a;

      /* ---- Primary accent (links, primary buttons only) ---------------- */
      --ga-blue:         #2563eb;
      --ga-blue-strong:  #1d4ed8;
      --ga-blue-bg:      #eff6ff;
      --ga-blue-border:  #bfdbfe;

      /* ---- Chart — deliberate 4-color calm palette --------------------- */
      --ga-chart-1: #1d4ed8;  /* blue-700    — primary */
      --ga-chart-2: #475569;  /* slate-600   — neutral */
      --ga-chart-3: #047857;  /* emerald-700 — positive */
      --ga-chart-4: #b45309;  /* amber-700   — warm */

      /* ---- Typography -------------------------------------------------- */
      --ga-font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                      "Helvetica Neue", Arial, "Noto Sans", sans-serif,
                      "Apple Color Emoji", "Segoe UI Emoji";
      --ga-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
                      "Liberation Mono", monospace;

      /* ---- Spacing — 8px base; 4px half-step --------------------------- */
      --ga-space-1:  4px;
      --ga-space-2:  8px;
      --ga-space-3:  12px;
      --ga-space-4:  16px;
      --ga-space-5:  20px;
      --ga-space-6:  24px;
      --ga-space-8:  32px;
      --ga-space-10: 40px;
      --ga-space-12: 48px;

      /* ---- Elevation — three discrete tiers ---------------------------- */
      --ga-shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
      --ga-shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.10);
      --ga-shadow-md: 0 2px 4px rgba(16, 24, 40, 0.06), 0 4px 8px rgba(16, 24, 40, 0.08);

      /* ---- Motion — fast; never flashy --------------------------------- */
      --ga-dur:  150ms;
      --ga-ease: cubic-bezier(0.4, 0, 0.2, 1);

      /* ---- Focus ring — accessibility contract, not a style preference - */
      --ga-focus: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    /* ========================================================================
     * UTILITY CLASSES
     * Semantic names (what it's for), not visual (what it looks like).
     * ====================================================================== */

    /* Backgrounds */
    .ga-bg       { background-color: var(--ga-bg); }
    .ga-surface  { background-color: var(--ga-surface); }

    /* Text tiers */
    .ga-text        { color: var(--ga-text); }
    .ga-text-strong { color: var(--ga-text-strong); }
    .ga-text-muted  { color: var(--ga-text-muted); }
    .ga-text-subtle { color: var(--ga-text-subtle); }

    /* Severity — color + bg + border in one class (compose with "border") */
    .ga-sev-red    { color: var(--ga-red);   background-color: var(--ga-red-bg);   border-color: var(--ga-red-border); }
    .ga-sev-amber  { color: var(--ga-amber); background-color: var(--ga-amber-bg); border-color: var(--ga-amber-border); }
    .ga-sev-green  { color: var(--ga-green); background-color: var(--ga-green-bg); border-color: var(--ga-green-border); }
    .ga-sev-red-dot   { background-color: var(--ga-red); }
    .ga-sev-amber-dot { background-color: var(--ga-amber); }
    .ga-sev-green-dot { background-color: var(--ga-green); }

    /* Typography scale */
    .ga-display  { font-size: 2.25rem;   line-height: 1.1;  font-weight: 700; letter-spacing: -0.02em; color: var(--ga-text-strong); font-variant-numeric: tabular-nums; }
    .ga-h1       { font-size: 1.5rem;    line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; color: var(--ga-text-strong); }
    .ga-h2       { font-size: 1.125rem;  line-height: 1.4;  font-weight: 600; color: var(--ga-text-strong); }
    .ga-body     { font-size: 0.9375rem; line-height: 1.55; color: var(--ga-text); }
    .ga-caption  { font-size: 0.8125rem; line-height: 1.4;  color: var(--ga-text-muted); }
    .ga-micro    { font-size: 0.75rem;   line-height: 1.4;  color: var(--ga-text-muted); letter-spacing: 0.005em; }

    /* Elevation */
    .ga-shadow-xs { box-shadow: var(--ga-shadow-xs); }
    .ga-shadow-sm { box-shadow: var(--ga-shadow-sm); }
    .ga-shadow-md { box-shadow: var(--ga-shadow-md); }

    /* Motion */
    .ga-transition {
      transition-property: background-color, border-color, color, box-shadow, transform, opacity;
      transition-duration: var(--ga-dur);
      transition-timing-function: var(--ga-ease);
    }

    /* ------------------------------------------------------------------------
     * Component-level utilities (compositions of primitives above).
     * ---------------------------------------------------------------------- */

    /* Hero tile — metric card with accent-colored left border, resting
       shadow, subtle lift on hover. Accent color set inline per-tile. */
    .ga-tile      { border: 1px solid var(--ga-border); }
    .ga-tile:hover { box-shadow: var(--ga-shadow-md); transform: translateY(-1px); }

    /* Welcome-style callout — brand-blue vertical accent bar on the left. */
    .ga-panel-welcome {
      position: relative;
      background-color: var(--ga-surface);
      border: 1px solid var(--ga-blue-border);
      border-left: 3px solid var(--ga-blue);
      border-radius: 6px;
    }

    /* Round icon-button — 32×32 minimum hit target. */
    .ga-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      min-width: 32px;
      border-radius: 9999px;
      color: var(--ga-text-muted);
      background-color: transparent;
    }
    .ga-icon-btn:hover { background-color: #f1f5f9; color: var(--ga-text); }
    .ga-icon-btn:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }

    /* Clickable list row. */
    .ga-row {
      cursor: pointer;
      color: inherit;
      text-decoration: none;
      border-bottom: 1px solid var(--ga-border);
    }
    .ga-row:last-child { border-bottom: none; }
    .ga-row:hover      { background-color: var(--ga-bg); }
    .ga-row:focus-visible {
      background-color: var(--ga-bg);
      outline: 2px solid transparent;
      box-shadow: inset 0 0 0 2px var(--ga-blue);
    }

    /* ------------------------------------------------------------------------
     * Buttons. Three variants (primary / secondary / ghost) on a shared base.
     * 44px min hit target, 150ms transition, soft-blue focus ring, 1px press.
     * ---------------------------------------------------------------------- */
    .ga-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      line-height: 1;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: background-color var(--ga-dur) var(--ga-ease),
                  border-color var(--ga-dur) var(--ga-ease),
                  color var(--ga-dur) var(--ga-ease),
                  box-shadow var(--ga-dur) var(--ga-ease),
                  transform var(--ga-dur) var(--ga-ease);
    }
    .ga-btn:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }
    .ga-btn:active        { transform: translateY(1px); }
    .ga-btn[disabled], .ga-btn[aria-disabled="true"] { opacity: 0.6; pointer-events: none; }

    .ga-btn-primary {
      background-color: var(--ga-blue);
      color: #ffffff;
      border-color: var(--ga-blue);
    }
    .ga-btn-primary:hover {
      background-color: var(--ga-blue-strong);
      border-color: var(--ga-blue-strong);
    }

    .ga-btn-secondary {
      background-color: var(--ga-surface);
      color: var(--ga-text);
      border-color: var(--ga-border-strong);
    }
    .ga-btn-secondary:hover {
      background-color: var(--ga-bg);
      border-color: var(--ga-text-subtle);
      box-shadow: var(--ga-shadow-sm);
    }

    .ga-btn-ghost {
      background-color: transparent;
      color: var(--ga-text);
    }
    .ga-btn-ghost:hover {
      background-color: var(--ga-bg);
      color: var(--ga-text-strong);
    }

    /* Links — smooth underline animation via background-size trick. */
    .ga-link {
      color: var(--ga-blue);
      text-decoration: none;
      background-image: linear-gradient(currentColor, currentColor);
      background-position: 0 100%;
      background-repeat: no-repeat;
      background-size: 0% 1px;
      transition: background-size var(--ga-dur) var(--ga-ease),
                  color var(--ga-dur) var(--ga-ease);
      padding-bottom: 1px;
    }
    .ga-link:hover { color: var(--ga-blue-strong); background-size: 100% 1px; }
    .ga-link:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); border-radius: 2px; }

    /* Focus ring — composable; applies to any element that opts in. */
    .ga-focus:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }

    /* Form controls — delegate to tokens so inputs match buttons. */
    .ga-input {
      display: block;
      width: 100%;
      padding: 9px 12px;
      font-size: 14px;
      line-height: 1.4;
      color: var(--ga-text);
      background-color: var(--ga-surface);
      border: 1px solid var(--ga-border-strong);
      border-radius: 6px;
      transition: border-color var(--ga-dur) var(--ga-ease),
                  box-shadow var(--ga-dur) var(--ga-ease);
    }
    .ga-input::placeholder { color: var(--ga-text-subtle); }
    .ga-input:hover   { border-color: var(--ga-text-subtle); }
    .ga-input:focus, .ga-input:focus-visible {
      outline: none;
      border-color: var(--ga-blue);
      box-shadow: var(--ga-focus);
    }

    /* ========================================================================
     * PRE-EXISTING UTILITIES
     * ====================================================================== */

    /* tabular-nums for aligned columns */
    .tnum { font-variant-numeric: tabular-nums; }

    /* htmx-indicator visibility */
    .ga-indicator { display: none; }
    .htmx-request .ga-indicator,
    .htmx-request.ga-indicator { display: block; }
    .htmx-request .ga-indicator[data-inline],
    .htmx-request.ga-indicator[data-inline] { display: inline-block; }

    /* Skeleton shimmer */
    .ga-shimmer {
      background-color: var(--ga-border);
      background-image: linear-gradient(90deg, var(--ga-border) 0%, var(--ga-border-strong) 50%, var(--ga-border) 100%);
      background-size: 200% 100%;
      animation: ga-shimmer 1.4s ease-in-out infinite;
      border-radius: 6px;
    }
    @keyframes ga-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* In-flight dim state */
    .htmx-request[data-dim-while-loading] { opacity: 0.55; pointer-events: none; }

    /* App-wide base — font stack */
    html, body { font-family: var(--ga-font-sans); }

    /* Respect reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .ga-shimmer { animation: none !important; background-image: none !important; }
      .ga-link { background-size: 0% 1px; }
      .ga-link:hover { background-size: 100% 1px; text-decoration: underline; }
    }
  </style>`;
