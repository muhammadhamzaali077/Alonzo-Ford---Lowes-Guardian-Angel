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
//
// NOTE: This stylesheet was rewritten for the LGA brand direction on
// 2026-04-23 (afternoon) per the Decisions log amendment. The prior
// "state auditor" light-theme palette (slate bg + clinical severities +
// blue accent) is retired. Current theme: dark navy surface, gold
// accent, saturated severities, Inter typography. If you're onboarding
// after this change, read the Decisions log entry under commit 59723f3
// before editing anything.

export const DESIGN_TOKENS_STYLE = `<style>
    /* ========================================================================
     * DESIGN TOKENS — LGA brand direction (post-demo, 2026-04-23)
     *
     * Rule: if you're about to write a raw hex, a Tailwind color class, or a
     * one-off spacing value in a view, stop. Either consume a token from
     * here, or add one here and consume it.
     *
     * ------------------------------------------------------------------------
     * STABILITY CONTRACT — read before editing.
     *
     * PROTECTED (change only with a UX or brand decision):
     *   --ga-bg, --ga-surface, --ga-surface-elevated   — the navy stack
     *   --ga-gold (and relatives)                      — the brand accent
     *   --ga-red, --ga-amber, --ga-green               — severity meanings
     *   --ga-text-strong, --ga-text, --ga-text-muted,
     *   --ga-text-subtle                               — text hierarchy
     *   --ga-font-sans                                 — typography stack
     *   --ga-focus                                     — accessibility contract
     *   --ga-space-*                                   — base spacing grid
     *
     * TUNABLE (safe to nudge for polish without a decision meeting):
     *   *-bright, *-dim variants of gold               — accent brightness
     *   *-bg, *-border variants of severity + gold     — tint strength
     *   --ga-shadow-xs, -sm, -md                       — elevation
     *   --ga-glow-gold                                 — gold glow intensity
     *   --ga-radius-sm, -md, -lg                       — corner rounding
     *   --ga-dur-fast, --ga-dur, --ga-dur-slow, --ga-ease — motion timing
     *   --ga-log-row-*                                 — log-stream row accents
     *   --ga-size-*                                    — typography scale
     *   --ga-cream, --ga-cream-*                       — light-inset surfaces (Batch 1.5)
     *   --ga-text-on-light*                            — text for cream surfaces (Batch 1.5)
     * ====================================================================== */
    :root {
      /* ---- Surfaces (deep navy stack) ---------------------------- */
      --ga-bg:                 #0a1532;  /* page background — deepest navy */
      --ga-surface:            #1a2547;  /* cards, panels — one step up */
      --ga-surface-elevated:   #242e52;  /* hover / active surfaces */
      --ga-surface-subtle:     rgba(255, 255, 255, 0.04);  /* row hover tint */

      /* ---- Cream light-inset surfaces (Batch 1.5) -----------------
         Stark white (#ffffff) on deep navy felt clinical and broke brand
         continuity with the LGA marketing site's warm neutral sections.
         Use these instead of bg-white anywhere a light inset is needed for
         dense content (rules list, digest envelope body, scenario confirm).
         Primary text on dark navy is still --ga-text-strong (#ffffff). */
      --ga-cream:              #eae7dc;  /* LGA brand neutral — warm bone */
      --ga-cream-soft:         #f2efe7;  /* lighter — subtle elevated areas */
      --ga-cream-dim:          #d8d4c6;  /* darker — borders/dividers on cream */

      /* ---- Borders (low-contrast on navy) ------------------------ */
      --ga-border:             rgba(255, 255, 255, 0.08);
      --ga-border-strong:      rgba(255, 255, 255, 0.16);
      --ga-border-accent:      rgba(232, 181, 60, 0.35);  /* gold at 35% — for brand touches */

      /* ---- Text (white → cream → lavender-gray) ------------------ */
      --ga-text-strong:        #ffffff;  /* page titles, hero numbers */
      --ga-text:               #e8eaf0;  /* body copy, readable default */
      --ga-text-muted:         #a0a8c0;  /* captions, metadata */
      --ga-text-subtle:        #6b7299;  /* disabled, placeholder */

      /* ---- Text on light/cream surfaces (Batch 1.5) ---------------
         The text-muted/subtle tokens above are tuned for dark navy and
         bleed out to near-invisible on cream. Inside any .ga-surface-cream
         container, descendant ga-text-* classes cascade to these on-light
         variants automatically (see .ga-surface-cream rules below). Brand
         continuity: on-light primary matches --ga-surface (#1a2547) exactly.
         Contrast: #1a2547 on #eae7dc ≈ 11.2:1 (WCAG AAA). */
      --ga-text-on-light:        #1a2547;  /* primary on cream */
      --ga-text-on-light-muted:  #4a5580;  /* muted on cream */
      --ga-text-on-light-subtle: #6b7299;  /* tertiary on cream */

      /* ---- Brand accent (gold) ----------------------------------- */
      --ga-gold:               #e8b53c;  /* primary accent — CTAs, logo halo, highlights */
      --ga-gold-bright:        #f5c547;  /* hover step */
      --ga-gold-dim:           #b8901f;  /* pressed / muted */
      --ga-gold-bg:            rgba(232, 181, 60, 0.10);  /* soft gold wash */
      --ga-gold-border:        rgba(232, 181, 60, 0.40);

      /* Legacy blue tokens retired as of the brand amendment. They stay
         aliased to gold so any stragglers in the view layer don't crash;
         a lint sweep in later batches replaces all .ga-blue-* usage. */
      --ga-blue:               var(--ga-gold);
      --ga-blue-strong:        var(--ga-gold-bright);
      --ga-blue-bg:            var(--ga-gold-bg);
      --ga-blue-border:        var(--ga-gold-border);

      /* ---- Severity (modern saturated — tuned for dark surfaces) - */
      --ga-red:                #ef4444;  /* vivid red, reads well on navy */
      --ga-red-bright:         #f87171;  /* hover / emphasis */
      --ga-red-strong:         #dc2626;  /* pressed / deeper */
      --ga-red-bg:             rgba(239, 68, 68, 0.12);
      --ga-red-border:         rgba(239, 68, 68, 0.35);

      --ga-amber:              #f59e0b;  /* warm amber */
      --ga-amber-bright:       #fbbf24;
      --ga-amber-strong:       #d97706;
      --ga-amber-bg:           rgba(245, 158, 11, 0.12);
      --ga-amber-border:       rgba(245, 158, 11, 0.35);

      --ga-green:              #10b981;  /* vibrant emerald */
      --ga-green-bright:       #34d399;
      --ga-green-strong:       #059669;
      --ga-green-bg:           rgba(16, 185, 129, 0.12);
      --ga-green-border:       rgba(16, 185, 129, 0.35);

      /* ---- Log-stream severity row treatments (home-page feature) -
         Deliberately-quiet 6% tints; full rows tinted would cumulate
         visually if pushed harder. The 4px left border carries the
         signal, the tint is a supporting whisper. */
      --ga-log-row-red:        4px solid #ef4444;
      --ga-log-row-amber:      4px solid #f59e0b;
      --ga-log-row-green:      4px solid #10b981;
      --ga-log-row-bg-red:     rgba(239, 68, 68, 0.06);
      --ga-log-row-bg-amber:   rgba(245, 158, 11, 0.06);
      --ga-log-row-bg-green:   rgba(16, 185, 129, 0.06);

      /* ---- Chart — line palette tuned for dark surfaces ---------- */
      --ga-chart-1: #e8b53c;  /* brand gold          — primary line */
      --ga-chart-2: #60a5fa;  /* cool blue           — contrast */
      --ga-chart-3: #34d399;  /* bright emerald      — positive */
      --ga-chart-4: #f87171;  /* bright red          — caution */

      /* ---- Typography -------------------------------------------- */
      /* Inter via Google Fonts — authorized 2026-04-23 per brand
         amendment. Load link lives in layout.ts + auth-login.ts <head>. */
      --ga-font-sans:          'Inter', ui-sans-serif, system-ui, -apple-system,
                               'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      --ga-font-mono:          ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

      --ga-size-display:       2.75rem;   /* 44px — hero numbers */
      --ga-size-h1:            1.75rem;   /* 28px — page titles */
      --ga-size-h2:            1.25rem;   /* 20px — section titles */
      --ga-size-h3:            1rem;      /* 16px — card titles */
      --ga-size-body:          0.9375rem; /* 15px — body default */
      --ga-size-caption:       0.8125rem; /* 13px */
      --ga-size-micro:         0.75rem;   /* 12px */

      /* ---- Spacing — 4px base grid ------------------------------- */
      --ga-space-1:  4px;  --ga-space-2:  8px;  --ga-space-3:  12px;
      --ga-space-4:  16px; --ga-space-5:  20px; --ga-space-6:  24px;
      --ga-space-8:  32px; --ga-space-10: 40px; --ga-space-12: 48px;

      /* ---- Elevation — shadows tuned for dark backgrounds -------- */
      --ga-shadow-xs:          0 1px 2px rgba(0, 0, 0, 0.35);
      --ga-shadow-sm:          0 2px 4px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.40);
      --ga-shadow-md:          0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.45);
      --ga-glow-gold:          0 0 0 1px rgba(232, 181, 60, 0.25), 0 4px 16px rgba(232, 181, 60, 0.18);

      /* ---- Radius ------------------------------------------------ */
      --ga-radius-sm:          6px;
      --ga-radius-md:          10px;
      --ga-radius-lg:          14px;
      --ga-radius-pill:        999px;

      /* ---- Motion ------------------------------------------------ */
      --ga-dur-fast:           150ms;
      --ga-dur:                200ms;
      --ga-dur-slow:           400ms;
      --ga-ease:               cubic-bezier(0.16, 1, 0.3, 1);  /* smooth out-expo */

      /* ---- Focus ring — gold on dark reads clearly --------------- */
      --ga-focus:              0 0 0 3px rgba(232, 181, 60, 0.35);
    }

    /* ========================================================================
     * UTILITY CLASSES
     * Semantic names (what it's for), not visual (what it looks like).
     * Class names unchanged from the prior theme so view markup doesn't
     * churn — only the values behind them shift.
     * ====================================================================== */

    /* Backgrounds */
    .ga-bg       { background-color: var(--ga-bg); }
    .ga-surface  { background-color: var(--ga-surface); }
    .ga-surface-elevated { background-color: var(--ga-surface-elevated); }

    /* Cream light-inset surface (Batch 1.5). Drop-in replacement for
       bg-white + border-gray-200: warm bone background + cream border +
       default radius. Cascades text color onto descendants so any
       ga-text-* class inside it flips to the on-light variant without
       having to touch every child's class attribute. */
    .ga-surface-cream {
      background-color: var(--ga-cream);
      color: var(--ga-text-on-light);
      border: 1px solid var(--ga-cream-dim);
      border-radius: var(--ga-radius-md);
    }
    .ga-surface-cream-soft {
      background-color: var(--ga-cream-soft);
      color: var(--ga-text-on-light);
      border: 1px solid var(--ga-cream-dim);
      border-radius: var(--ga-radius-md);
    }
    /* Cascade: any ga-text-* INSIDE a cream surface flips to on-light. */
    .ga-surface-cream .ga-text,
    .ga-surface-cream-soft .ga-text              { color: var(--ga-text-on-light); }
    .ga-surface-cream .ga-text-strong,
    .ga-surface-cream-soft .ga-text-strong       { color: var(--ga-text-on-light); }
    .ga-surface-cream .ga-text-muted,
    .ga-surface-cream-soft .ga-text-muted        { color: var(--ga-text-on-light-muted); }
    .ga-surface-cream .ga-text-subtle,
    .ga-surface-cream-soft .ga-text-subtle       { color: var(--ga-text-on-light-subtle); }
    /* Dividers inside cream lists use the dim cream, not white-alpha. */
    .ga-surface-cream hr,
    .ga-surface-cream-soft hr                    { border-color: var(--ga-cream-dim); }
    /* Auto-divider for <ul class="ga-surface-cream"> row lists. */
    ul.ga-surface-cream > li + li                { border-top: 1px solid var(--ga-cream-dim); }
    /* Row hover — gentle cream-soft wash for clickable rows inside cream. */
    .ga-cream-row-hover:hover,
    .ga-cream-row-hover:focus                    { background-color: var(--ga-cream-soft); outline: none; }
    /* Links stay gold but drop to the -dim variant for contrast on cream. */
    .ga-surface-cream .ga-link,
    .ga-surface-cream-soft .ga-link              { color: var(--ga-gold-dim); }
    .ga-surface-cream .ga-link:hover,
    .ga-surface-cream-soft .ga-link:hover        { color: var(--ga-gold); }

    /* Text tiers — on dark surfaces (default). */
    .ga-text        { color: var(--ga-text); }
    .ga-text-strong { color: var(--ga-text-strong); }
    .ga-text-muted  { color: var(--ga-text-muted); }
    .ga-text-subtle { color: var(--ga-text-subtle); }

    /* Opt-in text tiers for when you're composing manually on cream. */
    .ga-text-on-light        { color: var(--ga-text-on-light); }
    .ga-text-on-light-muted  { color: var(--ga-text-on-light-muted); }
    .ga-text-on-light-subtle { color: var(--ga-text-on-light-subtle); }

    /* Severity — color + bg + border in one class (compose with "border") */
    .ga-sev-red    { color: var(--ga-red);   background-color: var(--ga-red-bg);   border-color: var(--ga-red-border); }
    .ga-sev-amber  { color: var(--ga-amber); background-color: var(--ga-amber-bg); border-color: var(--ga-amber-border); }
    .ga-sev-green  { color: var(--ga-green); background-color: var(--ga-green-bg); border-color: var(--ga-green-border); }
    .ga-sev-red-dot   { background-color: var(--ga-red); }
    .ga-sev-amber-dot { background-color: var(--ga-amber); }
    .ga-sev-green-dot { background-color: var(--ga-green); }

    /* Typography scale */
    .ga-display  { font-size: var(--ga-size-display); line-height: 1.05; font-weight: 650; letter-spacing: -0.02em; color: var(--ga-text-strong); font-variant-numeric: tabular-nums; }
    .ga-h1       { font-size: var(--ga-size-h1);      line-height: 1.2;  font-weight: 600; letter-spacing: -0.02em; color: var(--ga-text-strong); }
    .ga-h2       { font-size: var(--ga-size-h2);      line-height: 1.35; font-weight: 600; letter-spacing: -0.01em; color: var(--ga-text-strong); }
    .ga-h3       { font-size: var(--ga-size-h3);      line-height: 1.4;  font-weight: 600; color: var(--ga-text-strong); }
    .ga-body     { font-size: var(--ga-size-body);    line-height: 1.55; color: var(--ga-text); }
    .ga-caption  { font-size: var(--ga-size-caption); line-height: 1.45; color: var(--ga-text-muted); }
    .ga-micro    { font-size: var(--ga-size-micro);   line-height: 1.45; color: var(--ga-text-muted); letter-spacing: 0.02em; font-weight: 500; text-transform: uppercase; }

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

    /* Hero tile — metric card with accent-colored left border. */
    .ga-tile {
      background-color: var(--ga-surface);
      border: 1px solid var(--ga-border);
      border-radius: var(--ga-radius-md);
    }
    .ga-tile:hover {
      background-color: var(--ga-surface-elevated);
      box-shadow: var(--ga-shadow-md);
      transform: translateY(-2px);
    }

    /* Welcome-style callout — gold accent bar replaces former blue. */
    .ga-panel-welcome {
      position: relative;
      background-color: var(--ga-surface);
      border: 1px solid var(--ga-border);
      border-left: 3px solid var(--ga-gold);
      border-radius: var(--ga-radius-md);
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
    .ga-icon-btn:hover { background-color: var(--ga-surface-subtle); color: var(--ga-text); }
    .ga-icon-btn:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }

    /* Clickable list row. */
    .ga-row {
      cursor: pointer;
      color: inherit;
      text-decoration: none;
      border-bottom: 1px solid var(--ga-border);
    }
    .ga-row:last-child { border-bottom: none; }
    .ga-row:hover      { background-color: var(--ga-surface-subtle); }
    .ga-row:focus-visible {
      background-color: var(--ga-surface-subtle);
      outline: 2px solid transparent;
      box-shadow: inset 0 0 0 2px var(--ga-gold);
    }

    /* Filter chips (Batch 1.5). Replaces former blue active / white
       inactive treatment with gold on dark navy. Compose as
       "ga-chip" (base) + "ga-chip-active" OR nothing (inactive). */
    .ga-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 0 12px;
      border-radius: var(--ga-radius-pill);
      border: 1px solid var(--ga-border);
      background-color: transparent;
      color: var(--ga-text-muted);
      font-size: var(--ga-size-micro);
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: background-color var(--ga-dur-fast) var(--ga-ease),
                  border-color var(--ga-dur-fast) var(--ga-ease),
                  color var(--ga-dur-fast) var(--ga-ease);
    }
    .ga-chip:hover {
      border-color: var(--ga-border-strong);
      color: var(--ga-text);
    }
    .ga-chip-active {
      background-color: var(--ga-gold-bg);
      border-color: var(--ga-gold-border);
      color: var(--ga-gold-bright);
    }
    .ga-chip-active:hover {
      border-color: var(--ga-gold);
      color: var(--ga-gold-bright);
    }
    .ga-chip:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }

    /* Log-stream rows (new for home-page hero). Severity shows as a
       4px left border + whisper-tint fill. Compose as "ga-log-row
       ga-log-row-red" etc. */
    .ga-log-row {
      border-left: 4px solid transparent;
      background-color: var(--ga-surface);
      padding-left: calc(var(--ga-space-5) - 4px);
    }
    .ga-log-row-red   { border-left: var(--ga-log-row-red);   background-color: var(--ga-log-row-bg-red); }
    .ga-log-row-amber { border-left: var(--ga-log-row-amber); background-color: var(--ga-log-row-bg-amber); }
    .ga-log-row-green { border-left: var(--ga-log-row-green); background-color: var(--ga-log-row-bg-green); }

    /* Severity-accent variant for rows inside cream surfaces (Batch 2).
       Unlike .ga-log-row above (tuned for dark surface), these ONLY add
       a 4px left accent bar. No background tint — rgba-red over cream
       reads like a water stain, and the bar alone is unambiguous. If
       severity contrast needs more punch later, revisit with a darker
       accent bar (not a tint). Compose as "ga-cream-row-red" etc. on
       an <li> or inner wrapper. */
    .ga-cream-row-red,
    .ga-cream-row-amber,
    .ga-cream-row-green {
      border-left-width: 4px;
      border-left-style: solid;
    }
    .ga-cream-row-red   { border-left-color: var(--ga-red); }
    .ga-cream-row-amber { border-left-color: var(--ga-amber); }
    .ga-cream-row-green { border-left-color: var(--ga-green); }

    /* ------------------------------------------------------------------------
     * Buttons. Primary = gold; secondary = surface-elevated; ghost = bare.
     * Same .ga-btn-{primary|secondary|ghost} API so existing markup works.
     * ---------------------------------------------------------------------- */
    .ga-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 18px;
      border-radius: var(--ga-radius-sm);
      font-size: var(--ga-size-body);
      font-weight: 600;
      line-height: 1;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: background-color var(--ga-dur-fast) var(--ga-ease),
                  border-color var(--ga-dur-fast) var(--ga-ease),
                  color var(--ga-dur-fast) var(--ga-ease),
                  box-shadow var(--ga-dur-fast) var(--ga-ease),
                  transform var(--ga-dur-fast) var(--ga-ease);
    }
    .ga-btn:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }
    .ga-btn:active        { transform: translateY(1px); }
    .ga-btn[disabled], .ga-btn[aria-disabled="true"] { opacity: 0.5; pointer-events: none; }

    .ga-btn-primary {
      background-color: var(--ga-gold);
      color: #1a1406;
      border-color: var(--ga-gold);
    }
    .ga-btn-primary:hover {
      background-color: var(--ga-gold-bright);
      border-color: var(--ga-gold-bright);
      box-shadow: var(--ga-glow-gold);
    }

    .ga-btn-secondary {
      background-color: var(--ga-surface-elevated);
      color: var(--ga-text-strong);
      border-color: var(--ga-border-strong);
    }
    .ga-btn-secondary:hover {
      background-color: var(--ga-surface);
      border-color: var(--ga-gold);
      color: var(--ga-gold);
    }

    .ga-btn-ghost {
      background-color: transparent;
      color: var(--ga-text);
    }
    .ga-btn-ghost:hover {
      background-color: var(--ga-surface-subtle);
      color: var(--ga-text-strong);
    }

    /* Destructive action — used for "Deactivate location/angel/etc." in
       Settings. Saturated red on dark, lighter on hover. White text for
       maximum contrast against the saturated severity. */
    .ga-btn-danger {
      background-color: var(--ga-red-strong);
      color: #ffffff;
      border-color: var(--ga-red-strong);
    }
    .ga-btn-danger:hover {
      background-color: var(--ga-red);
      border-color: var(--ga-red);
    }

    /* Links — smooth underline animation. Uses gold accent. */
    .ga-link {
      color: var(--ga-gold);
      text-decoration: none;
      background-image: linear-gradient(currentColor, currentColor);
      background-position: 0 100%;
      background-repeat: no-repeat;
      background-size: 0% 1px;
      transition: background-size var(--ga-dur) var(--ga-ease),
                  color var(--ga-dur) var(--ga-ease);
      padding-bottom: 1px;
    }
    .ga-link:hover { color: var(--ga-gold-bright); background-size: 100% 1px; }
    .ga-link:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); border-radius: 2px; }

    /* Focus ring — composable; applies to any element that opts in. */
    .ga-focus:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }

    /* Form controls — dark inputs with gold focus. */
    .ga-input {
      display: block;
      width: 100%;
      padding: 10px 14px;
      font-family: inherit;
      font-size: var(--ga-size-body);
      line-height: 1.4;
      color: var(--ga-text-strong);
      background-color: var(--ga-surface-elevated);
      border: 1px solid var(--ga-border-strong);
      border-radius: var(--ga-radius-sm);
      transition: border-color var(--ga-dur-fast) var(--ga-ease),
                  box-shadow var(--ga-dur-fast) var(--ga-ease);
    }
    .ga-input::placeholder { color: var(--ga-text-subtle); }
    .ga-input:hover   { border-color: var(--ga-text-subtle); }
    .ga-input:focus, .ga-input:focus-visible {
      outline: none;
      border-color: var(--ga-gold);
      box-shadow: var(--ga-focus);
    }

    /* ========================================================================
     * PRE-EXISTING UTILITIES — retuned for dark theme
     * ====================================================================== */

    .tnum { font-variant-numeric: tabular-nums; }

    /* htmx-indicator visibility */
    .ga-indicator { display: none; }
    .htmx-request .ga-indicator,
    .htmx-request.ga-indicator { display: block; }
    .htmx-request .ga-indicator[data-inline],
    .htmx-request.ga-indicator[data-inline] { display: inline-block; }

    /* Skeleton shimmer — navy-toned for dark surfaces */
    .ga-shimmer {
      background-color: var(--ga-surface-elevated);
      background-image: linear-gradient(90deg, var(--ga-surface-elevated) 0%, rgba(255,255,255,0.06) 50%, var(--ga-surface-elevated) 100%);
      background-size: 200% 100%;
      animation: ga-shimmer 1.4s ease-in-out infinite;
      border-radius: var(--ga-radius-sm);
    }
    @keyframes ga-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* In-flight dim state */
    .htmx-request[data-dim-while-loading] { opacity: 0.55; pointer-events: none; }

    /* App-wide base — font stack + default text color on dark bg.
       Background per REQ-11 (Batch 1.6): soft radial gradient from
       #1a2547 (top-right) fading to #0a1532 (bottom-left), fixed to the
       viewport so it acts as an ambient light source rather than
       scrolling with content. background-color is the fallback for
       email clients / older contexts; the gradient paints over it.
       The ellipse shape is wide+tall so the lightest point sits off-
       canvas top-right, giving a gentle diagonal falloff. */
    html, body {
      font-family: var(--ga-font-sans);
      font-feature-settings: 'cv11', 'ss01', 'ss03';  /* Inter stylistic: alt 1, alt 9 */
      background-color: var(--ga-bg);
      color: var(--ga-text);
    }
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background-image: radial-gradient(ellipse 120% 100% at 100% 0%, #1a2547 0%, #0a1532 65%);
      background-attachment: fixed;
      background-repeat: no-repeat;
      min-height: 100vh;
    }

    /* Respect reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .ga-shimmer { animation: none !important; background-image: none !important; }
      .ga-link { background-size: 0% 1px; }
      .ga-link:hover { background-size: 100% 1px; text-decoration: underline; }
    }

    /* Selection color — gold */
    ::selection { background-color: var(--ga-gold); color: #1a1406; }

    /* Logo sizing — desktop 60px, mobile (<640px) 44px. Width auto-scales
       from the PNG's 209x97 intrinsic aspect ratio. Per REQ-4 enrichment
       (Batch 1.6): the logo is the strongest brand signal on every page —
       earlier 40/28 read as tucked-away. 60px on desktop puts it in the
       56-64px range approved by the client; 44px on mobile keeps the
       hamburger-adjacent row intentional (not cramped). The header grows
       from h-20 to h-24 to accommodate. */
    .ga-logo-img { height: 60px; width: auto; display: block; }
    @media (max-width: 639px) {
      .ga-logo-img { height: 44px; }
    }
  </style>`;
