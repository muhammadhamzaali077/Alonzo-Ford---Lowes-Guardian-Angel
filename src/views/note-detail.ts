// Note-detail page — the signed-off layout: full original text at top, metadata
// below, flag cards stacked, each with a "How was this flagged?" disclosure.

import type { NoteDetailRow, NoteFlagRow } from '../db/queries/note.js';
import type { FeedbackCounts, FeedbackVerdict } from '../db/queries/flag-feedback.js';
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

/** Per-flag feedback state passed in from the server handler. */
export interface FlagFeedbackState {
  counts: FeedbackCounts;
  my_verdict: FeedbackVerdict | null;
}

export interface NoteDetailViewData {
  note: NoteDetailRow;
  flags: NoteFlagRow[];
  /** Map of flag.id → current feedback state for the rendering user. */
  feedback?: Map<number, FlagFeedbackState>;
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
  ${data.flags.length === 0 ? renderNoFlags() : renderFlagCards(data.flags, data.feedback)}
  ${contextualHelp('note')}
</section>`;
}

function renderNoFlags(): string {
  return `<p class="mt-3 text-sm ga-text-muted bg-white border border-gray-200 rounded-md p-5">No flags on this note.</p>`;
}

function renderFlagCards(flags: NoteFlagRow[], feedback?: Map<number, FlagFeedbackState>): string {
  return `<div class="mt-3 space-y-3">
${flags.map((f) => renderFlagCard(f, feedback?.get(f.id))).join('')}
</div>`;
}

function renderFlagCard(flag: NoteFlagRow, feedback?: FlagFeedbackState): string {
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
  ${renderFeedbackControl(flag.id, feedback)}
</div>`;
}

/**
 * Per-flag thumbs-up / thumbs-down control. htmx-backed: POSTs to
 * /flags/:id/feedback and swaps this fragment back in. Used so Alonzo
 * can correct the system during a demo without leaving the note page.
 *
 * Exported so the POST endpoint can render the same fragment back.
 */
export function renderFeedbackControl(flagId: number, feedback?: FlagFeedbackState): string {
  const counts = feedback?.counts ?? { up: 0, down: 0 };
  const myVerdict = feedback?.my_verdict ?? null;
  const postUrl = `/flags/${flagId}/feedback`;
  return `<div id="flag-feedback-${flagId}" class="mt-3 pt-3 flex items-center gap-3 text-xs" style="border-top: 1px solid var(--ga-border);">
    <span class="ga-text-muted">Is this flag useful?</span>
    ${renderThumbButton(flagId, 'up',   myVerdict === 'up',   counts.up,   postUrl)}
    ${renderThumbButton(flagId, 'down', myVerdict === 'down', counts.down, postUrl)}
    ${myVerdict ? `<span class="ga-text-muted" aria-live="polite">Thanks — your feedback is recorded.</span>` : ''}
  </div>`;
}

function renderThumbButton(flagId: number, verdict: 'up' | 'down', active: boolean, count: number, postUrl: string): string {
  const iconPath = verdict === 'up'
    ? 'M5 10v9a1 1 0 001 1h2a1 1 0 001-1v-9M5 10H3m2 0l3-6a2 2 0 012-1.5h.5a1.5 1.5 0 011.5 1.5V8h4.5a2 2 0 012 2.25l-1 6a2 2 0 01-2 1.75H9'
    : 'M15 14V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v9m4 0h2m-2 0l-3 6a2 2 0 01-2 1.5h-.5a1.5 1.5 0 01-1.5-1.5V16H5.5a2 2 0 01-2-2.25l1-6A2 2 0 016.5 6H11';
  const label = verdict === 'up' ? 'Mark this flag useful' : 'Mark this flag not useful';
  const activeStyle = active
    ? verdict === 'up'
      ? 'background-color: var(--ga-green-bg); border-color: var(--ga-green-border); color: var(--ga-green);'
      : 'background-color: var(--ga-red-bg); border-color: var(--ga-red-border); color: var(--ga-red);'
    : 'background-color: var(--ga-surface); border-color: var(--ga-border-strong); color: var(--ga-text-muted);';
  return `<button type="button"
          hx-post="${postUrl}"
          hx-vals='{"verdict":"${verdict}"}'
          hx-target="#flag-feedback-${flagId}"
          hx-swap="outerHTML"
          aria-label="${escapeHtml(label)}"
          aria-pressed="${active ? 'true' : 'false'}"
          class="inline-flex items-center gap-1 rounded-md border px-2 py-1 ga-transition ga-focus"
          style="${activeStyle}">
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}"/>
    </svg>
    ${count > 0 ? `<span class="tnum" style="font-weight:500;">${count}</span>` : ''}
  </button>`;
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
