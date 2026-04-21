// Shared UI helpers — severity pills, display_category labels, breadcrumbs.
// Every user-visible string that depends on an internal enum routes through
// here so language is consistent and the forbidden-words audit is trivial.

import { escapeHtml } from './layout.js';

// -------------------------------------------------------------------------------------------------
// Severity pill — always text + color, never color alone (a11y)
// -------------------------------------------------------------------------------------------------

export type PillSeverity = 'red' | 'yellow' | 'green';

export function severityPill(
  severity: PillSeverity,
  label?: string,
): string {
  const cfg = {
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-100',    dot: 'bg-red-600',    defaultLabel: 'Red' },
    yellow: { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-100',  dot: 'bg-amber-500',  defaultLabel: 'Yellow' },
    green:  { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-100',  dot: 'bg-green-600',  defaultLabel: 'Green' },
  }[severity];

  const text = label ?? cfg.defaultLabel;
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.text} text-xs font-medium border ${cfg.border}">
  <span class="w-1.5 h-1.5 rounded-full ${cfg.dot}" aria-hidden="true"></span>
  ${escapeHtml(text)}
</span>`;
}

/**
 * Pick the roll-up pill for a location row given flag counts. If zero flags,
 * returns a green "No flags" pill (per UI/UX sign-off decision #4:
 * consistency beats minimalism; a pill-less row reads as broken).
 */
export function rollupPill(redCount: number, yellowCount: number, missingCount: number): string {
  const totalRed = redCount + missingCount;
  if (totalRed > 0) return severityPill('red', 'Red');
  if (yellowCount > 0) return severityPill('yellow', 'Yellow');
  return severityPill('green', 'Green — No flags');
}

// -------------------------------------------------------------------------------------------------
// display_category → user-facing label (never show the enum verbatim)
// -------------------------------------------------------------------------------------------------

export type DisplayCategory =
  | 'missing_note'
  | 'high_priority'
  | 'medium_priority'
  | 'pattern_detected'
  | 'system_review';

export function displayCategoryLabel(cat: DisplayCategory): string {
  switch (cat) {
    case 'missing_note':      return 'Missing note';
    case 'high_priority':     return 'High priority';
    case 'medium_priority':   return 'Medium priority';
    case 'pattern_detected':  return 'Pattern detected';
    case 'system_review':     return 'System review';
  }
}

// -------------------------------------------------------------------------------------------------
// Location-type → friendly label
// -------------------------------------------------------------------------------------------------

export function locationTypeLabel(type: 'group_home' | 'host_home' | 'day_program'): string {
  switch (type) {
    case 'group_home':  return 'Group home';
    case 'host_home':   return 'Host home';
    case 'day_program': return 'Day program';
  }
}

// -------------------------------------------------------------------------------------------------
// Breadcrumb — truncate-with-expander on mobile per snippet (b)
// -------------------------------------------------------------------------------------------------

export interface BreadcrumbItem {
  label: string;
  href?: string; // absent on the current page
}

export function renderBreadcrumb(items: BreadcrumbItem[]): string {
  if (items.length === 0) return '';
  const root = items[0]!;
  const current = items[items.length - 1]!;
  const middle = items.slice(1, -1);

  const rootHtml = root.href
    ? `<li class="shrink-0"><a href="${escapeHtml(root.href)}" class="hover:text-blue-600">${escapeHtml(root.label)}</a></li>`
    : `<li class="shrink-0">${escapeHtml(root.label)}</li>`;

  const middleDesktop = middle
    .map(
      (m) =>
        `<li aria-hidden="true" class="hidden md:inline shrink-0">›</li>
<li class="hidden md:inline shrink-0">${m.href ? `<a href="${escapeHtml(m.href)}" class="hover:text-blue-600">${escapeHtml(m.label)}</a>` : escapeHtml(m.label)}</li>`,
    )
    .join('');

  let middleMobile = '';
  if (middle.length > 0) {
    middleMobile = `
<li aria-hidden="true" class="md:hidden shrink-0">›</li>
<li class="md:hidden shrink-0">
  <details class="relative inline-block">
    <summary class="cursor-pointer select-none px-2 py-1 -my-1 text-gray-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded" aria-label="Show intermediate levels">…</summary>
    <div class="absolute left-0 top-full mt-1 min-w-[12rem] rounded-md border border-gray-200 bg-white shadow-sm py-1 z-10">
      ${middle.map((m) => `<a href="${escapeHtml(m.href ?? '#')}" class="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50">${escapeHtml(m.label)}</a>`).join('')}
    </div>
  </details>
</li>`;
  }

  const currentHtml = `
<li aria-hidden="true" class="shrink-0">›</li>
<li class="text-gray-900 truncate min-w-0 max-w-[14rem] sm:max-w-none">${escapeHtml(current.label)}</li>`;

  return `<nav class="text-sm text-gray-500" aria-label="Breadcrumb">
  <ol class="flex items-center gap-1 flex-nowrap">
    ${rootHtml}${middleDesktop}${middleMobile}${currentHtml}
  </ol>
</nav>`;
}
