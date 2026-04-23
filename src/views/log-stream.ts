// Home-page log stream — the new primary scroll surface per REQ-2.
//
// Two rendering shapes share markup here:
//
//   renderLogStream(...)         — full component. Used on initial page
//                                  render and by the 30-second htmx poll
//                                  (hx-swap="outerHTML" replaces the
//                                  whole container so the counter and
//                                  rows update together).
//
//   renderLogStreamPage(...)     — additive fragment. Returned by the
//                                  "Show more" endpoint; replaces the
//                                  tail of the stream (the old button +
//                                  empty slot) with the new rows + a
//                                  fresh "Show more" button (or nothing
//                                  if exhausted).
//
// Severity treatment (Batch 1.6 Option B — bar + tint, no pill):
//   - 4px colored left bar via .ga-log-row-{red,amber,green} class
//   - Whisper-tint row background via --ga-log-row-bg-* tokens
//   - Accessibility via aria-label on the row anchor (severity spoken)
// No per-row severity pill — at 25 rows/page, pills steal scan bandwidth
// and duplicate the aggregate tile counts elsewhere on the page.

import type { LogStreamRow } from '../db/queries/log-stream.js';
import { escapeHtml } from './layout.js';

export const DEFAULT_STREAM_PAGE_SIZE = 25;

export interface LogStreamViewParams {
  rows: LogStreamRow[];
  total: number;
  /**
   * Current offset into the stream — 0 on first load. "Show more" pages
   * set this to the offset of the FIRST row in `rows` so we can compute
   * the next offset in the button's hx-get.
   */
  offset: number;
  pageSize?: number;
  /**
   * Query-string suffix for "Show more" + poll URLs so filters + scope
   * carry through. Empty string when no filters active.
   */
  queryString?: string;
}

export function renderLogStream(params: LogStreamViewParams): string {
  const pageSize = params.pageSize ?? DEFAULT_STREAM_PAGE_SIZE;
  const shown = Math.min(params.rows.length, pageSize);
  const pollQs = params.queryString ? `?${params.queryString}` : '';
  // Poll target returns a replacement component of the SAME shape but
  // with offset=0 and limit=currently-shown so the user's "Show more"
  // expansions aren't lost on refresh.
  const pollUrl = `/stream/latest${pollQs}`;

  return `<section id="log-stream"
  hx-get="${pollUrl}"
  hx-trigger="every 30s"
  hx-swap="outerHTML"
  aria-label="Recent notes feed"
  class="mt-6">
  <header class="flex items-center justify-between gap-3 flex-wrap mb-3">
    <div>
      <h2 class="ga-h2">Recent notes</h2>
      <p class="mt-0.5 ga-caption">
        Showing <span class="tnum">${shown}</span> of <span class="tnum">${params.total}</span> recent notes
      </p>
    </div>
    <span class="ga-caption">Auto-refreshes every 30 seconds</span>
  </header>
  <ul class="ga-surface rounded-md overflow-hidden" style="border: 1px solid var(--ga-border);">
    ${params.rows.map((r) => renderRow(r)).join('')}
  </ul>
  ${renderLoadMoreButton(params.rows.length, params.total, params.offset + shown, params.queryString)}
</section>`;
}

/**
 * Additive page for "Show more" — returns JUST the next batch of rows +
 * an updated "Show more" button, wrapped in a fragment that replaces the
 * previous button via hx-swap="outerHTML". The parent <ul> and <section>
 * stay put on the page.
 *
 * Shape: `<li>...</li><li>...</li>...<LoadMoreButton />` — the htmx swap
 * target is the <div id="stream-load-more">, which is a self-contained
 * `<div>` so both the rows and the new button can live inside it.
 */
export function renderLogStreamPage(
  rows: LogStreamRow[],
  total: number,
  newOffset: number,
  queryString?: string,
): string {
  // We need to inject new <li>s into the preceding <ul> AND render a
  // new button. htmx can't target two elements from one swap, so we use
  // `hx-swap="beforeend" hx-target="#log-stream ul"` on the button AND
  // include the button's own replacement inline via OOB swap.
  const rowsHtml = rows.map((r) => renderRow(r)).join('');
  const button = renderLoadMoreButton(rows.length, total, newOffset, queryString);
  // Rows go into the UL (beforeend); the button replaces itself via OOB.
  return `${rowsHtml}<div id="stream-load-more" hx-swap-oob="true">${stripOuterLoadMoreWrapper(button)}</div>`;
}

function renderRow(r: LogStreamRow): string {
  const rowClass =
    r.severity === 'red'
      ? 'ga-log-row ga-log-row-red'
      : r.severity === 'yellow'
      ? 'ga-log-row ga-log-row-amber'
      : 'ga-log-row ga-log-row-green';
  const rowBorderStyle = 'border-bottom: 1px solid var(--ga-border);';
  const href = `/note/${encodeURIComponent(r.tlog_id)}/${encodeURIComponent(String(r.tlog_version))}`;
  const angel = r.angel_name ? escapeHtml(r.angel_name) : 'Unknown angel';
  const individual = escapeHtml(r.individual_name);
  const location = escapeHtml(r.location_name);
  const ts = formatRelativeTs(r.reported_date, r.reported_time);
  const preview = escapeHtml(truncate(r.note_preview, 140));
  const ariaSeverity =
    r.severity === 'red' ? 'Red flag' : r.severity === 'yellow' ? 'Yellow flag' : 'No flag';
  return `<li class="${rowClass}" style="${rowBorderStyle}">
    <a href="${href}" class="block px-5 py-3 ga-transition ga-focus"
       aria-label="${ariaSeverity}: note by ${angel} for ${individual} at ${location}, ${escapeHtml(ts)}">
      <div class="flex items-baseline justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <span class="text-sm font-medium ga-text-strong">${angel}</span>
          <span class="ga-text-subtle mx-1">·</span>
          <span class="text-sm ga-text">${individual}</span>
          <span class="ga-text-subtle mx-1">·</span>
          <span class="text-sm ga-text-muted">${location}</span>
        </div>
        <span class="text-xs ga-text-muted tnum shrink-0">${escapeHtml(ts)}</span>
      </div>
      <p class="mt-1 text-sm ga-text-muted" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${preview}</p>
    </a>
  </li>`;
}

function renderLoadMoreButton(
  currentShown: number,
  total: number,
  nextOffset: number,
  queryString?: string,
): string {
  if (nextOffset >= total) {
    // Nothing more to load; render an empty anchor slot so OOB swap has
    // something to target if the user just exhausted the list.
    return `<div id="stream-load-more" class="mt-3 text-center text-xs ga-text-subtle">All ${total} recent notes loaded.</div>`;
  }
  const remaining = total - nextOffset;
  const nextBatch = Math.min(DEFAULT_STREAM_PAGE_SIZE, remaining);
  const qs = queryString ? `&${queryString}` : '';
  const url = `/stream/more?offset=${nextOffset}${qs}`;
  void currentShown; // kept in signature for future UX callbacks
  return `<div id="stream-load-more" class="mt-3 flex justify-center">
    <button type="button"
            hx-get="${url}"
            hx-target="#log-stream ul"
            hx-swap="beforeend"
            class="ga-btn ga-btn-secondary">
      Show ${nextBatch} more<span class="ga-text-muted ml-1 tnum">· ${remaining} left</span>
    </button>
  </div>`;
}

/**
 * The rendered button is wrapped in `<div id="stream-load-more">` so
 * we can target it both for OOB swap (when appending rows) and for the
 * initial render (beforeend into the ul). For additive-page responses,
 * we need to PEEL OFF the outer wrapper because htmx's hx-swap-oob
 * substitutes the whole element, so double-wrapping breaks the swap.
 * This helper extracts the inner HTML.
 */
function stripOuterLoadMoreWrapper(btnHtml: string): string {
  const m = btnHtml.match(/^<div id="stream-load-more"[^>]*>([\s\S]*)<\/div>$/);
  return m?.[1] ?? btnHtml;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function formatRelativeTs(reportedDate: string, reportedTime: string | null): string {
  // Report time isn't a true timestamp — it's the shift's reported time
  // within the note's date. We keep the presentation simple: "Apr 14 ·
  // 2:30pm" or just "Apr 14" when no time. Relative-time dressing
  // ("3 hours ago") would require consistent ingested_at semantics that
  // don't exist on the synthetic fixtures; avoid misleading users.
  const dateLabel = humanDate(reportedDate);
  if (!reportedTime) return dateLabel;
  const timeLabel = humanTime(reportedTime);
  return `${dateLabel} · ${timeLabel}`;
}

function humanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function humanTime(hm: string): string {
  // reported_time may be "HH:MM" or "HH:MM:SS"; take first two groups.
  const m = /^(\d{2}):(\d{2})/.exec(hm);
  if (!m) return hm;
  const hour = Number(m[1]);
  const minute = m[2];
  const period = hour >= 12 ? 'pm' : 'am';
  const display = hour % 12 || 12;
  return minute === '00' ? `${display}${period}` : `${display}:${minute}${period}`;
}
