// Note-detail page — the signed-off layout: full original text at top, metadata
// below, flag cards stacked, each with a "How was this flagged?" disclosure.

import type { NoteDetailRow, NoteFlagRow } from '../db/queries/note.js';
import { escapeHtml } from './layout.js';
import {
  displayCategoryLabel,
  locationTypeLabel,
  renderBreadcrumb,
  rollupPill,
  severityPill,
  type DisplayCategory,
} from './ui.js';
import { contextualHelp } from './contextual-help.js';

export interface NoteDetailViewData {
  note: NoteDetailRow;
  flags: NoteFlagRow[];
}

export function renderNoteDetail(data: NoteDetailViewData): string {
  const n = data.note;

  const crumb = renderBreadcrumb([
    { label: 'Dashboard', href: '/' },
    { label: n.location_name, href: `/location/${encodeURIComponent(n.program_id)}` },
    n.created_by_id && n.angel_name
      ? {
          label: n.angel_name,
          href: `/location/${encodeURIComponent(n.program_id)}/angel/${encodeURIComponent(n.created_by_id)}`,
        }
      : { label: 'Unknown angel' },
    { label: n.individual_name },
  ]);

  const dateHuman = humanizeDate(n.reported_date);
  const shiftHuman = humanizeShift(n.shift_name, n.time_in, n.time_out);

  return `<section>
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold ga-text-strong">Note · ${escapeHtml(dateHuman)} · ${escapeHtml(shiftHuman)}</h1>
    <p class="mt-1 text-sm ga-text">${escapeHtml(n.individual_name)} · ${escapeHtml(n.location_name)}</p>
  </div>

  <article class="mt-6 bg-white border border-gray-200 rounded-md p-5 sm:p-6">
    <p class="text-base ga-text-strong leading-7 whitespace-pre-wrap">${escapeHtml(n.description)}</p>
  </article>

  <dl class="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
    <dt class="ga-text-muted">Date</dt><dd class="ga-text-strong">${escapeHtml(dateHuman)}</dd>
    <dt class="ga-text-muted">Shift</dt><dd class="ga-text-strong">${escapeHtml(shiftHuman)}</dd>
    <dt class="ga-text-muted">Angel</dt><dd class="ga-text-strong">${escapeHtml(n.angel_name ?? 'Unknown')}</dd>
    <dt class="ga-text-muted">Individual</dt><dd class="ga-text-strong">${escapeHtml(n.individual_name)}</dd>
    <dt class="ga-text-muted">Location</dt><dd class="ga-text-strong">${escapeHtml(n.location_name)} · ${escapeHtml(locationTypeLabel(n.location_type as 'group_home' | 'host_home' | 'day_program'))}</dd>
    <dt class="ga-text-muted">Notification level</dt><dd class="ga-text-strong">${escapeHtml(n.notification_level)}</dd>
    <dt class="ga-text-muted">Type</dt><dd class="ga-text-strong">${escapeHtml(n.type)}</dd>
    ${n.summary ? `<dt class="ga-text-muted">Summary</dt><dd class="ga-text-strong">${escapeHtml(n.summary)}</dd>` : ''}
  </dl>

  <h2 class="mt-8 text-lg font-medium ga-text-strong">Flags</h2>
  ${data.flags.length === 0 ? renderNoFlags() : renderFlagCards(data.flags)}
  ${contextualHelp('note')}
</section>`;
}

function renderNoFlags(): string {
  return `<p class="mt-3 text-sm ga-text-muted bg-white border border-gray-200 rounded-md p-5">No flags on this note.</p>`;
}

function renderFlagCards(flags: NoteFlagRow[]): string {
  return `<div class="mt-3 space-y-3">
${flags.map(renderFlagCard).join('')}
</div>`;
}

function renderFlagCard(flag: NoteFlagRow): string {
  const pill = severityPill(flag.severity === 'red' ? 'red' : 'yellow');
  const label = displayCategoryLabel(flag.display_category as DisplayCategory);
  const ruleLabel = flag.rule_name ? `${flag.rule_name}${flag.rule_version ? ' · version ' + flag.rule_version : ''}` : ruleLabelFromSource(flag.source);

  const audit = renderAuditDisclosure(flag);

  return `<div class="bg-white border border-gray-200 rounded-md p-4 sm:p-5">
  <div class="flex items-center gap-2 flex-wrap">
    ${pill}
    <span class="text-xs font-medium ga-text">${escapeHtml(label)}</span>
    <span class="ml-auto text-xs ga-text-muted">${escapeHtml(ruleLabel)}</span>
  </div>
  <p class="mt-3 text-sm ga-text-strong leading-6">${escapeHtml(flag.reason)}</p>
  ${audit}
</div>`;
}

function ruleLabelFromSource(source: string): string {
  switch (source) {
    case 'missing_schedule':    return 'Shift schedule check';
    case 'notification_level':  return 'Therap notification level';
    case 'ai_classifier':       return 'System review';
    default:                    return 'Rule';
  }
}

function renderAuditDisclosure(flag: NoteFlagRow): string {
  const rows: Array<[string, string]> = [];
  if (flag.rule_name) rows.push(['Rule', `${flag.rule_name} · version ${flag.rule_version ?? '?'}`]);
  if (flag.model_name) rows.push(['Reviewed by', humanizeModelName(flag.model_name)]);
  if (flag.prompt_version != null) rows.push(['Instructions', `Version ${flag.prompt_version}`]);
  rows.push(['Flagged at', humanizeDateTime(flag.created_at)]);

  const dl = rows
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('');

  return `<details class="mt-3">
  <summary class="cursor-pointer select-none text-xs text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 rounded inline-block py-1 -my-1">How was this flagged?</summary>
  <dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs ga-text">${dl}</dl>
</details>`;
}

/** Strip OpenRouter provider prefix and the ":free" / ":nitro" suffixes. */
function humanizeModelName(raw: string): string {
  const stripped = raw.split('/').pop() ?? raw;
  const base = stripped.split(':')[0] ?? stripped;
  // "gemini-flash-lite-2.0" → "Gemini Flash Lite 2.0"
  return base
    .split('-')
    .map((seg) => (/^\d/.test(seg) ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)))
    .join(' ');
}

function humanizeDate(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function humanizeShift(shiftName: string, timeIn: string, timeOut: string): string {
  const pretty = (iso: string): string => {
    try {
      const [, hm] = iso.split('T');
      if (!hm) return '';
      const [h, m] = hm.split(':');
      const hour = Number(h);
      const minute = m ?? '00';
      const period = hour >= 12 ? 'pm' : 'am';
      const display = hour % 12 || 12;
      return minute === '00' ? `${display}${period}` : `${display}:${minute}${period}`;
    } catch {
      return '';
    }
  };
  const tIn = pretty(timeIn);
  const tOut = pretty(timeOut);
  return tIn && tOut ? `${shiftName} (${tIn}–${tOut})` : shiftName;
}

function humanizeDateTime(iso: string): string {
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}
