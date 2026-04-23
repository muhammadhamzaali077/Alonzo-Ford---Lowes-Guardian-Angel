// Shared <html> shell for every view in the app.
//
// Design tokens (per specs/001-compliance-monitor/tasks.md §UI/UX Constraints):
//   - background: #fafafa   - text: gray-900
//   - accent:     blue-600  - severity: red-600 / amber-500 / green-600
//   - corners:    rounded-md max, no pill buttons
//   - fonts:      system stack (Tailwind default)
//
// Rules baked in:
//   - No JS charting libs. No modals. No dark mode.
//   - No emoji in chrome. No gradients. No custom fonts.
//   - All severity pills carry a text label, not color alone.
//   - Data-current-as-of bar renders between header and main on every page.

import { config } from '../config.js';

export type NavKey = 'dashboard' | 'rules' | 'settings' | null;

export type UserRole = 'admin' | 'leadership' | 'manager' | 'demo';

export interface LayoutUser {
  name: string;
  role: UserRole;
}

export interface LayoutOptions {
  title: string;
  body: string;
  /** Humanized "2 hours ago" / "just now" / "yesterday". Optional; omit on auth pages. */
  dataCurrentAs?: string;
  /** Signed-in user for the nav dropdown. Omit on auth pages. */
  user?: LayoutUser;
  /** Which primary-nav item is currently active. */
  activeNav?: NavKey;
}

export function layout({ title, body, dataCurrentAs, user, activeNav = null }: LayoutOptions): string {
  const showChrome = Boolean(user);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.3" defer></script>
  <style>
    /* ========================================================================
     * DESIGN TOKENS — single source of truth for color, typography, spacing,
     * elevation, and motion across Guardian Angel.
     *
     * Rule: if you're about to write a raw hex, a Tailwind gray-* / red-* / etc.
     * color class, or a one-off spacing value in a view, stop. Either consume
     * a token from here, or add one here and consume it.
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
     * Semantic names (what it's for), not visual (what it looks like), so a
     * future retheme doesn't require renaming HTML.
     * ====================================================================== */

    /* Backgrounds */
    .ga-bg       { background-color: var(--ga-bg); }
    .ga-surface  { background-color: var(--ga-surface); }

    /* Text tiers */
    .ga-text        { color: var(--ga-text); }
    .ga-text-strong { color: var(--ga-text-strong); }
    .ga-text-muted  { color: var(--ga-text-muted); }
    .ga-text-subtle { color: var(--ga-text-subtle); }

    /* Link — use on <a> only; focus-visible gets the app-wide ring */
    .ga-link { color: var(--ga-blue); text-decoration: none; }
    .ga-link:hover { color: var(--ga-blue-strong); text-decoration: underline; text-underline-offset: 2px; }

    /* Severity — applies color + background + border in one class so a pill
       just needs "inline-flex ... border ga-sev-red" */
    .ga-sev-red    { color: var(--ga-red);   background-color: var(--ga-red-bg);   border-color: var(--ga-red-border); }
    .ga-sev-amber  { color: var(--ga-amber); background-color: var(--ga-amber-bg); border-color: var(--ga-amber-border); }
    .ga-sev-green  { color: var(--ga-green); background-color: var(--ga-green-bg); border-color: var(--ga-green-border); }
    .ga-sev-red-dot   { background-color: var(--ga-red); }
    .ga-sev-amber-dot { background-color: var(--ga-amber); }
    .ga-sev-green-dot { background-color: var(--ga-green); }

    /* Typography scale — apply semantic classes at use sites; tune centrally */
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

    /* Motion — attach to anything that should transition on hover/focus */
    .ga-transition {
      transition-property: background-color, border-color, color, box-shadow, transform, opacity;
      transition-duration: var(--ga-dur);
      transition-timing-function: var(--ga-ease);
    }

    /* ------------------------------------------------------------------------
     * Component-level utilities. These are compositions of the primitives
     * above and live here so every tile / card / row reads the same.
     * ---------------------------------------------------------------------- */

    /* Hero tile — numeric metric card with an accent-colored left border,
       resting shadow and a subtle lift on hover. The accent color is set
       inline in the view (border-left) so each tile can vary. */
    .ga-tile {
      border: 1px solid var(--ga-border);
      /* The left border is re-declared by inline style on the tile element
         itself to install the 2px severity accent — must win the cascade. */
    }
    .ga-tile:hover { box-shadow: var(--ga-shadow-md); transform: translateY(-1px); }

    /* Welcome-style callout panel — used for the dashboard welcome card and
       any future calm-tone hint. Brand-blue vertical accent on the left. */
    .ga-panel-welcome {
      position: relative;
      background-color: var(--ga-surface);
      border: 1px solid var(--ga-blue-border);
      border-left: 3px solid var(--ga-blue);
      border-radius: 6px;
    }

    /* Round icon-button (header chrome, dismiss X, toolbar buttons). 32×32
       minimum hit target; darkens bg on hover via a subtle neutral shade. */
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

    /* Clickable list row. Used in the dashboard locations list, settings
       lists, and any other "tap the whole row to open" pattern. Separator
       is a bottom border so the last row sits flush with the card edge. */
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

    /* Focus ring — keyboard-only; respects :focus-visible */
    .ga-focus:focus-visible { outline: 2px solid transparent; box-shadow: var(--ga-focus); }

    /* ========================================================================
     * PRE-EXISTING UTILITIES — keep as-is; tokens above reinforce them.
     * ====================================================================== */

    /* tabular-nums for aligned columns on numeric displays */
    .tnum { font-variant-numeric: tabular-nums; }

    /* htmx-indicator visibility: element with .ga-indicator starts hidden;
       htmx adds .htmx-request which flips the indicator on. */
    .ga-indicator { display: none; }
    .htmx-request .ga-indicator,
    .htmx-request.ga-indicator { display: block; }
    .htmx-request .ga-indicator[data-inline],
    .htmx-request.ga-indicator[data-inline] { display: inline-block; }

    /* Skeleton shimmer — token-aware gradient; same behavior as before */
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

    /* In-flight buttons and trigger elements: disable + dim while waiting */
    .htmx-request[data-dim-while-loading] { opacity: 0.55; pointer-events: none; }

    /* App-wide base — pin font stack at body so Tailwind's font-sans picks it up */
    html, body { font-family: var(--ga-font-sans); }

    /* Respect reduced-motion: neutralize animations AND transitions */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .ga-shimmer { animation: none !important; background-image: none !important; }
    }
  </style>
</head>
<body class="min-h-screen ga-bg ga-text text-base leading-6 antialiased">
${showChrome ? renderHeader({ user: user!, activeNav }) : ''}
${showChrome && dataCurrentAs ? renderDataBar(dataCurrentAs) : ''}
  <main id="main" class="mx-auto max-w-7xl px-4 sm:px-6 py-6">${body}</main>
${showChrome ? renderShortcutsOverlay() : ''}
${showChrome ? renderFooter() : ''}
${showChrome ? renderCountUpScript() : ''}
${showChrome ? renderShortcutsScript() : ''}
</body>
</html>`;
}

/**
 * Keyboard shortcuts overlay (cheat sheet). Hidden by default; toggled by
 * pressing `?`. Keeping the markup inline means no extra round trip when
 * the user wants to remind themselves.
 */
function renderShortcutsOverlay(): string {
  const item = (keys: string, label: string): string =>
    `<div class="flex items-center justify-between gap-8">
  <span class="text-sm ga-text">${label}</span>
  <kbd class="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-mono ga-text-strong">${keys}</kbd>
</div>`;
  return `<div id="ga-shortcuts" role="dialog" aria-modal="false" aria-labelledby="ga-shortcuts-title" hidden
  class="fixed inset-x-0 bottom-4 z-30 mx-auto w-[min(92vw,28rem)] rounded-md border border-gray-200 bg-white p-5 shadow-sm">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2 id="ga-shortcuts-title" class="text-sm font-semibold ga-text-strong">Keyboard shortcuts</h2>
      <p class="mt-0.5 text-xs ga-text-muted">Press <kbd class="font-mono">?</kbd> or <kbd class="font-mono">Esc</kbd> to close.</p>
    </div>
    <button type="button" data-shortcuts-close aria-label="Close shortcuts"
            class="ga-text-muted hover:ga-text focus:outline-none focus:ring-2 focus:ring-blue-600 rounded">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5l10 10M15 5L5 15"/>
      </svg>
    </button>
  </div>
  <div class="mt-4 space-y-2">
    ${item('/', 'Focus search')}
    ${item('g d', 'Go to Dashboard')}
    ${item('g r', 'Go to Rules')}
    ${item('g s', 'Go to Settings')}
    ${item('Esc', 'Close open disclosures')}
    ${item('?', 'Show this help')}
  </div>
</div>`;
}

/**
 * Keyboard handler. Treats a plain `/` as "focus the search input" (skipped
 * inside form fields so it doesn't hijack typing). `g` starts a two-key
 * leader sequence: the next key within 800ms fires a nav — `g d` → Dashboard,
 * `g r` → Rules, `g s` → Settings. `Esc` closes any open `<details>`. `?`
 * toggles the shortcuts overlay.
 */
function renderShortcutsScript(): string {
  return `<script>
(function () {
  if (typeof document === 'undefined') return;
  var overlay = document.getElementById('ga-shortcuts');
  function toggleOverlay(show) {
    if (!overlay) return;
    if (typeof show === 'undefined') show = overlay.hasAttribute('hidden');
    if (show) overlay.removeAttribute('hidden');
    else overlay.setAttribute('hidden', '');
  }
  if (overlay) {
    var closeBtn = overlay.querySelector('[data-shortcuts-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { toggleOverlay(false); });
  }

  function isTyping(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }

  function focusSearch() {
    var input = document.querySelector('input[name="q"]');
    if (input) { input.focus(); input.select && input.select(); return true; }
    // No search input on this page — navigate to /search instead.
    window.location.href = '/search';
    return true;
  }

  var leaderActive = false;
  var leaderTimeout;
  function startLeader() {
    leaderActive = true;
    clearTimeout(leaderTimeout);
    leaderTimeout = setTimeout(function () { leaderActive = false; }, 800);
  }

  document.addEventListener('keydown', function (e) {
    // Modifier keys (except Shift for ?) short-circuit — don't fight browser shortcuts.
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Esc closes open <details> elements and the overlay.
    if (e.key === 'Escape') {
      if (overlay && !overlay.hasAttribute('hidden')) { toggleOverlay(false); e.preventDefault(); return; }
      var anyOpen = false;
      document.querySelectorAll('details[open]').forEach(function (d) { d.removeAttribute('open'); anyOpen = true; });
      if (anyOpen) e.preventDefault();
      return;
    }

    if (isTyping(e.target)) return;

    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      toggleOverlay();
      e.preventDefault();
      return;
    }
    if (e.key === '/') {
      if (focusSearch()) e.preventDefault();
      return;
    }

    if (leaderActive) {
      var k = e.key.toLowerCase();
      leaderActive = false;
      clearTimeout(leaderTimeout);
      if (k === 'd') { window.location.href = '/'; e.preventDefault(); return; }
      if (k === 'r') { window.location.href = '/rules'; e.preventDefault(); return; }
      if (k === 's') { window.location.href = '/admin/org'; e.preventDefault(); return; }
      return;
    }

    if (e.key === 'g' || e.key === 'G') {
      startLeader();
      e.preventDefault();
      return;
    }
  });
})();
</script>`;
}

/**
 * Tiny inline count-up for tile numbers. Looks for `[data-count-to]` on
 * first paint and eases from 0 → target over ~700 ms. Skipped when the
 * user has `prefers-reduced-motion`. This is a DOM utility, not a
 * framework — same category as the htmx tag already loaded above.
 */
function renderCountUpScript(): string {
  return `<script>
(function () {
  if (typeof document === 'undefined') return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var els = document.querySelectorAll('[data-count-to]');
  if (!els.length) return;
  var duration = 700;
  els.forEach(function (el) {
    var raw = el.getAttribute('data-count-to') || '0';
    var unit = el.getAttribute('data-count-unit') || '';
    var decimals = parseInt(el.getAttribute('data-count-decimals') || '0', 10) || 0;
    var target = parseFloat(raw);
    if (!isFinite(target)) return;
    var start = performance.now();
    el.textContent = (0).toFixed(decimals) + unit;
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - t, 3);
      var value = target * eased;
      el.textContent = value.toFixed(decimals) + unit;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toFixed(decimals) + unit;
    }
    requestAnimationFrame(tick);
  });
})();
</script>`;
}

function renderHeader({ user, activeNav }: { user: LayoutUser; activeNav: NavKey }): string {
  const showRules = user.role !== 'manager';
  const showSettings = user.role === 'admin';
  const navLink = (href: string, label: string, key: NavKey): string => {
    const active = key === activeNav;
    const cls = active
      ? 'ga-text-strong font-medium'
      : 'ga-text hover:text-blue-600';
    return `<a href="${href}" class="${cls}">${label}</a>`;
  };
  return `  <header class="ga-surface" style="border-bottom: 1px solid var(--ga-border);">
    <div class="mx-auto max-w-7xl px-4 sm:px-6">
      <div class="flex items-center justify-between h-16">
        <a href="/" class="text-[1.0625rem] font-semibold ga-text-strong hover:text-[color:var(--ga-blue-strong)] ga-transition" style="letter-spacing: -0.01em;">Guardian Angel</a>
        <nav class="hidden md:flex items-center gap-6 text-sm" aria-label="Primary">
          ${navLink('/', 'Dashboard', 'dashboard')}
          ${showRules ? navLink('/rules', 'Rules', 'rules') : ''}
          ${showSettings ? navLink('/admin/org', 'Settings', 'settings') : ''}
          <details class="relative">
            <summary class="cursor-pointer select-none list-none ga-text hover:text-blue-600 flex items-center gap-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded">
              ${escapeHtml(user.name)}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 8l4 4 4-4"/></svg>
            </summary>
            <div class="absolute right-0 top-full mt-1 min-w-[10rem] rounded-md border border-gray-200 bg-white shadow-sm py-1 z-10">
              <form action="/auth/logout" method="post">
                <button type="submit" class="block w-full text-left px-3 py-2 text-sm ga-text hover:bg-gray-50 focus:outline-none focus:bg-gray-50">Log out</button>
              </form>
            </div>
          </details>
        </nav>
        <details class="md:hidden relative">
          <summary class="cursor-pointer select-none list-none p-2 -mr-2 ga-text focus:outline-none focus:ring-2 focus:ring-blue-600 rounded" aria-label="Open menu">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </summary>
          <div class="absolute right-0 top-full mt-1 min-w-[12rem] rounded-md border border-gray-200 bg-white shadow-sm py-1 z-10">
            <a href="/" class="block px-3 py-3 text-sm ga-text hover:bg-gray-50 min-h-[44px]">Dashboard</a>
            ${showRules ? '<a href="/rules" class="block px-3 py-3 text-sm ga-text hover:bg-gray-50 min-h-[44px]">Rules</a>' : ''}
            ${showSettings ? '<a href="/admin/org" class="block px-3 py-3 text-sm ga-text hover:bg-gray-50 min-h-[44px]">Settings</a>' : ''}
            <div class="border-t border-gray-200 mt-1 pt-1">
              <div class="px-3 py-1 text-xs ga-text-muted">Signed in as ${escapeHtml(user.name)}</div>
              <form action="/auth/logout" method="post">
                <button type="submit" class="block w-full text-left px-3 py-3 text-sm ga-text hover:bg-gray-50 min-h-[44px]">Log out</button>
              </form>
            </div>
          </div>
        </details>
      </div>
    </div>
  </header>`;
}

function renderDataBar(dataCurrentAs: string): string {
  // Meta-information band beneath the primary nav. Kept small + muted so
  // nothing in it competes with the nav or the page title below it.
  // The Demo-data pill uses filled dot (--ga-amber), not an outline ring —
  // easier to spot at a glance that this is synthetic data.
  const badge = config.PROTOTYPE_MODE
    ? `      <span class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ga-sev-amber" title="Synthetic data — no real individuals">
        <span class="h-2 w-2 rounded-full ga-sev-amber-dot" aria-hidden="true"></span>
        Demo data
        <span class="hidden sm:inline font-normal" style="color: var(--ga-amber-strong); opacity: 0.85;">· synthetic, no real individuals</span>
      </span>`
    : '';
  return `  <div class="ga-surface" style="border-bottom: 1px solid var(--ga-border);">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-1.5 text-[11px] ga-text-muted flex flex-wrap items-center justify-between gap-x-4 gap-y-1" style="letter-spacing: 0.01em;">
      <span>Data current as of ${escapeHtml(dataCurrentAs)}</span>
${badge}
    </div>
  </div>`;
}

function renderFooter(): string {
  return `  <footer class="mt-12 border-t border-gray-200">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-4 text-xs ga-text-muted">
      Guardian Angel Compliance Monitor · Lowe's Guardian Angel
    </div>
  </footer>`;
}

export function escapeHtml(s: string): string {
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
