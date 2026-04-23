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
import { DESIGN_TOKENS_STYLE } from './design-tokens-css.js';

export type NavKey = 'dashboard' | 'logs' | 'rules' | 'settings' | null;

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
  /**
   * Presenter mode (T125). When true, hide header + data-bar + footer +
   * keyboard-shortcut overlay so the screen is chrome-free for clean
   * demo screenshots. The main content still renders with its normal
   * padding. Toggled by the `ga_presenter=1` cookie at the request layer.
   */
  presenter?: boolean;
}

export function layout({ title, body, dataCurrentAs, user, activeNav = null, presenter = false }: LayoutOptions): string {
  const showChrome = Boolean(user) && !presenter;
  const presenterExit = presenter
    ? `<a href="/presenter/off" class="fixed bottom-3 right-3 z-40 inline-flex items-center gap-1.5 rounded-full ga-surface ga-text-muted ga-transition ga-focus px-3 py-1.5 text-xs font-medium ga-shadow-sm hover:ga-text-strong" style="border: 1px solid var(--ga-border-strong); opacity: 0.7;" aria-label="Exit presenter mode">
        <span class="w-1.5 h-1.5 rounded-full" style="background: var(--ga-amber);" aria-hidden="true"></span>
        Exit presenter
      </a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="theme-color" content="#0a1532">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.3" defer></script>
  ${DESIGN_TOKENS_STYLE}
</head>
<body class="min-h-screen ga-bg ga-text text-base leading-6 antialiased">
${showChrome ? renderHeader({ user: user!, activeNav }) : ''}
${showChrome && dataCurrentAs ? renderDataBar(dataCurrentAs) : ''}
  <main id="main" class="mx-auto max-w-7xl px-4 sm:px-6 py-6">${body}</main>
${presenterExit}
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
  <kbd class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono ga-text-strong" style="background-color: var(--ga-cream-soft); border: 1px solid var(--ga-cream-dim);">${keys}</kbd>
</div>`;
  return `<div id="ga-shortcuts" role="dialog" aria-modal="false" aria-labelledby="ga-shortcuts-title" hidden
  class="fixed inset-x-0 bottom-4 z-30 mx-auto w-[min(92vw,28rem)] ga-surface-cream p-5 ga-shadow-md">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2 id="ga-shortcuts-title" class="text-sm font-semibold ga-text-strong">Keyboard shortcuts</h2>
      <p class="mt-0.5 text-xs ga-text-muted">Press <kbd class="font-mono">?</kbd> or <kbd class="font-mono">Esc</kbd> to close.</p>
    </div>
    <button type="button" data-shortcuts-close aria-label="Close shortcuts"
            class="ga-text-muted hover:ga-text ga-focus rounded">
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
      ? 'px-3 py-1.5 rounded-md ga-text-strong font-semibold'
      : 'px-3 py-1.5 rounded-md ga-text hover:ga-text-strong ga-transition';
    const activeStyle = active
      ? ` style="background-color: var(--ga-surface-elevated); border: 1px solid var(--ga-border);"`
      : '';
    return `<a href="${href}" class="${cls}"${activeStyle}>${label}</a>`;
  };
  // Logo: real asset at public/assets/lga-logo.png, served via /assets/*.
  // Sizes live in design-tokens-css.ts under .ga-logo-img: 80px desktop,
  // 56px mobile (<640px). Header grows to h-28 (112px) to give the
  // larger logo room. PNG intrinsic 209x97; width scales from height.
  const logo = `<a href="/" class="flex items-center gap-3 ga-transition ga-focus rounded" aria-label="Lowe's Guardian Angel — home">
      <img src="/assets/lga-logo.png" alt="Lowe's Guardian Angel" class="ga-logo-img">
    </a>`;
  return `  <header style="background-color: var(--ga-bg); border-bottom: 1px solid var(--ga-border);">
    <div class="mx-auto max-w-7xl px-4 sm:px-6">
      <div class="flex items-center justify-between h-28">
        ${logo}
        <nav class="hidden md:flex items-center gap-2 text-sm" aria-label="Primary">
          ${navLink('/', 'Dashboard', 'dashboard')}
          ${navLink('/logs', 'All flags', 'logs')}
          ${showRules ? navLink('/rules', 'Rules', 'rules') : ''}
          ${showSettings ? navLink('/admin/org', 'Settings', 'settings') : ''}
          <details class="relative ml-2">
            <summary class="cursor-pointer select-none list-none ga-text hover:ga-text-strong ga-transition flex items-center gap-1 px-3 py-1.5 rounded-md focus:outline-none ga-focus">
              ${escapeHtml(user.name)}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 8l4 4 4-4"/></svg>
            </summary>
            <div class="absolute right-0 top-full mt-1 min-w-[12rem] py-1 z-10 ga-shadow-md"
                 style="background-color: var(--ga-surface-elevated); border: 1px solid var(--ga-border-strong); border-radius: var(--ga-radius-md);">
              <a href="/presenter/on" class="block px-3 py-2 text-sm ga-text ga-transition" style="border-radius: var(--ga-radius-sm);" onmouseover="this.style.backgroundColor='var(--ga-surface-subtle)'" onmouseout="this.style.backgroundColor=''">Enter presenter mode</a>
              <form action="/auth/logout" method="post">
                <button type="submit" class="block w-full text-left px-3 py-2 text-sm ga-text ga-transition" style="border-radius: var(--ga-radius-sm);" onmouseover="this.style.backgroundColor='var(--ga-surface-subtle)'" onmouseout="this.style.backgroundColor=''">Log out</button>
              </form>
            </div>
          </details>
        </nav>
        <details class="md:hidden relative">
          <summary class="cursor-pointer select-none list-none p-2 -mr-2 ga-text focus:outline-none ga-focus rounded" aria-label="Open menu">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </summary>
          <div class="absolute right-0 top-full mt-1 min-w-[12rem] py-1 z-10 ga-shadow-md"
               style="background-color: var(--ga-surface-elevated); border: 1px solid var(--ga-border-strong); border-radius: var(--ga-radius-md);">
            <a href="/" class="block px-3 py-3 text-sm ga-text min-h-[44px]">Dashboard</a>
            <a href="/logs" class="block px-3 py-3 text-sm ga-text min-h-[44px]">All flags</a>
            ${showRules ? '<a href="/rules" class="block px-3 py-3 text-sm ga-text min-h-[44px]">Rules</a>' : ''}
            ${showSettings ? '<a href="/admin/org" class="block px-3 py-3 text-sm ga-text min-h-[44px]">Settings</a>' : ''}
            <div class="mt-1 pt-1" style="border-top: 1px solid var(--ga-border);">
              <div class="px-3 py-1 text-xs ga-text-muted">Signed in as ${escapeHtml(user.name)}</div>
              <form action="/auth/logout" method="post">
                <button type="submit" class="block w-full text-left px-3 py-3 text-sm ga-text min-h-[44px]">Log out</button>
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
  const badge = config.PROTOTYPE_MODE
    ? `      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium ga-sev-amber" style="border: 1px solid var(--ga-amber-border); border-radius: var(--ga-radius-pill);" title="Synthetic data — no real individuals">
        <span class="h-1.5 w-1.5 rounded-full ga-sev-amber-dot" aria-hidden="true"></span>
        Demo data
        <span class="hidden sm:inline font-normal" style="opacity: 0.85;">· synthetic, no real individuals</span>
      </span>`
    : '';
  return `  <div style="background-color: var(--ga-surface); border-bottom: 1px solid var(--ga-border);">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-2 text-[11px] ga-text-muted flex flex-wrap items-center justify-between gap-x-4 gap-y-1" style="letter-spacing: 0.02em;">
      <span class="ga-micro">Data current as of ${escapeHtml(dataCurrentAs)}</span>
${badge}
    </div>
  </div>`;
}

function renderFooter(): string {
  return `  <footer class="mt-12" style="border-top: 1px solid var(--ga-border);">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-5 text-xs ga-text-muted flex items-center justify-between gap-4 flex-wrap">
      <span>Guardian Angel Compliance Monitor</span>
      <span style="color: var(--ga-gold); opacity: 0.7;">Lowe's Guardian Angel</span>
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
