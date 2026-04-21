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
    /* The only bespoke utility — tabular-nums for aligned columns on numeric displays. */
    .tnum { font-variant-numeric: tabular-nums; }
    /* Respect reduced-motion: disable htmx + CSS transitions for users who ask. */
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  </style>
</head>
<body class="min-h-screen bg-[#fafafa] text-gray-900 text-base leading-6 antialiased">
${showChrome ? renderHeader({ user: user!, activeNav }) : ''}
${showChrome && dataCurrentAs ? renderDataBar(dataCurrentAs) : ''}
  <main id="main" class="mx-auto max-w-7xl px-4 sm:px-6 py-6">${body}</main>
${showChrome ? renderFooter() : ''}
</body>
</html>`;
}

function renderHeader({ user, activeNav }: { user: LayoutUser; activeNav: NavKey }): string {
  const showRules = user.role !== 'manager';
  const showSettings = user.role === 'admin';
  const navLink = (href: string, label: string, key: NavKey): string => {
    const active = key === activeNav;
    const cls = active
      ? 'text-gray-900 font-medium'
      : 'text-gray-700 hover:text-blue-600';
    return `<a href="${href}" class="${cls}">${label}</a>`;
  };
  return `  <header class="bg-white border-b border-gray-200">
    <div class="mx-auto max-w-7xl px-4 sm:px-6">
      <div class="flex items-center justify-between h-14">
        <a href="/" class="text-lg font-medium text-gray-900 hover:text-blue-600">Guardian Angel</a>
        <nav class="hidden md:flex items-center gap-6 text-sm" aria-label="Primary">
          ${navLink('/', 'Dashboard', 'dashboard')}
          ${showRules ? navLink('/rules', 'Rules', 'rules') : ''}
          ${showSettings ? navLink('/admin/org', 'Settings', 'settings') : ''}
          <details class="relative">
            <summary class="cursor-pointer select-none list-none text-gray-700 hover:text-blue-600 flex items-center gap-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded">
              ${escapeHtml(user.name)}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 8l4 4 4-4"/></svg>
            </summary>
            <div class="absolute right-0 top-full mt-1 min-w-[10rem] rounded-md border border-gray-200 bg-white shadow-sm py-1 z-10">
              <form action="/auth/logout" method="post">
                <button type="submit" class="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50">Log out</button>
              </form>
            </div>
          </details>
        </nav>
        <details class="md:hidden relative">
          <summary class="cursor-pointer select-none list-none p-2 -mr-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded" aria-label="Open menu">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </summary>
          <div class="absolute right-0 top-full mt-1 min-w-[12rem] rounded-md border border-gray-200 bg-white shadow-sm py-1 z-10">
            <a href="/" class="block px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">Dashboard</a>
            ${showRules ? '<a href="/rules" class="block px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">Rules</a>' : ''}
            ${showSettings ? '<a href="/admin/org" class="block px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">Settings</a>' : ''}
            <div class="border-t border-gray-200 mt-1 pt-1">
              <div class="px-3 py-1 text-xs text-gray-500">Signed in as ${escapeHtml(user.name)}</div>
              <form action="/auth/logout" method="post">
                <button type="submit" class="block w-full text-left px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">Log out</button>
              </form>
            </div>
          </div>
        </details>
      </div>
    </div>
  </header>`;
}

function renderDataBar(dataCurrentAs: string): string {
  return `  <div class="bg-white border-b border-gray-200">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-2 text-sm text-gray-500">
      Data current as of ${escapeHtml(dataCurrentAs)}
    </div>
  </div>`;
}

function renderFooter(): string {
  return `  <footer class="mt-12 border-t border-gray-200">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-4 text-xs text-gray-500">
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
