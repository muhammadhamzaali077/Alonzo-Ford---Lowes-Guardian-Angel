// Digest email renderer — pure function, returns an HTML string.
//
// Constitution P2 + UI/UX sign-off: digest body contains ONLY counts,
// severities, and deep links. No note text, no classifier reasoning, no
// free-text angel field. Verified by the allowlist test in Phase 12.

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { DigestRecipient } from '../db/queries/recipients.js';
import {
  getDigestCounts,
  getMissingNotesList,
  getTopAngels,
  getTopLocations,
} from '../db/queries/digest.js';
import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { escapeHtml } from '../views/layout.js';

export interface RenderedDigest {
  recipient_email: string;
  scope_label: string;       // "All locations" or a location name
  subject: string;
  html: string;              // the email body HTML
  window_start: string;
  window_end: string;
  counts: {
    red: number;
    yellow: number;
    missing: number;
    compliance_pct: number;
    wow_delta_pts: number;   // + or - percentage points vs prior week
  };
}

export interface WindowPair {
  thisStart: string;
  thisEnd: string;
  priorStart: string;
  priorEnd: string;
}

export function weekWindowsFrom(anchorDate: string): WindowPair {
  // anchorDate is the newest reported_date; "this week" = anchor − 6 days to anchor.
  // "prior week" = the 7 days before that.
  const anchorMs = Date.UTC(
    Number(anchorDate.slice(0, 4)),
    Number(anchorDate.slice(5, 7)) - 1,
    Number(anchorDate.slice(8, 10)),
  );
  const day = 24 * 3600 * 1000;
  const fmt = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  return {
    thisStart: fmt(anchorMs - 6 * day),
    thisEnd: fmt(anchorMs),
    priorStart: fmt(anchorMs - 13 * day),
    priorEnd: fmt(anchorMs - 7 * day),
  };
}

export function renderDigest(
  recipient: DigestRecipient,
  anchorDate: string,
  db: BetterSqliteDatabase = getDb(),
): RenderedDigest {
  const windows = weekWindowsFrom(anchorDate);

  const thisWeek = getDigestCounts(recipient.scope, windows.thisStart, windows.thisEnd, db);
  const priorWeek = getDigestCounts(recipient.scope, windows.priorStart, windows.priorEnd, db);
  const wow = thisWeek.compliance_pct - priorWeek.compliance_pct;

  const topLocations = recipient.scope === 'all'
    ? getTopLocations('all', windows.thisStart, windows.thisEnd, 3, db)
    : [];
  const topAngels = getTopAngels(recipient.scope, windows.thisStart, windows.thisEnd, 5, db);
  const missingNotes = getMissingNotesList(recipient.scope, windows.thisStart, windows.thisEnd, 10, db);

  const scopeLabel =
    recipient.scope === 'all'
      ? 'All locations'
      : locationName(recipient.scope, db);

  const subject = `Guardian Angel · Week of ${humanDate(windows.thisStart)}`;

  const html = renderBody({
    appUrl: config.APP_URL,
    subject,
    scopeLabel,
    thisWeek,
    priorWeek,
    wow,
    topLocations,
    topAngels,
    missingNotes,
    windows,
  });

  return {
    recipient_email: recipient.email,
    scope_label: scopeLabel,
    subject,
    html,
    window_start: windows.thisStart,
    window_end: windows.thisEnd,
    counts: {
      red: thisWeek.red + thisWeek.missing,
      yellow: thisWeek.yellow,
      missing: thisWeek.missing,
      compliance_pct: thisWeek.compliance_pct,
      wow_delta_pts: wow,
    },
  };
}

// -------------------------------------------------------------------------------------------------

interface BodyData {
  appUrl: string;
  subject: string;
  scopeLabel: string;
  thisWeek: ReturnType<typeof getDigestCounts>;
  priorWeek: ReturnType<typeof getDigestCounts>;
  wow: number;
  topLocations: ReturnType<typeof getTopLocations>;
  topAngels: ReturnType<typeof getTopAngels>;
  missingNotes: ReturnType<typeof getMissingNotesList>;
  windows: WindowPair;
}

function renderBody(d: BodyData): string {
  const base = d.appUrl.replace(/\/$/, '');
  const pct = d.thisWeek.compliance_pct.toFixed(1);
  const wowStr =
    Math.abs(d.wow) < 0.05
      ? 'unchanged from last week'
      : `${d.wow > 0 ? '+' : ''}${d.wow.toFixed(1)} pts vs last week (${d.priorWeek.compliance_pct.toFixed(1)}%)`;

  const locationsBlock = d.topLocations.length
    ? `<h3 style="font-size:15px;margin:24px 0 8px;color:#111827;">Top flagged locations</h3>
<ul style="list-style:none;padding:0;margin:0;">
${d.topLocations.map((l) => `<li style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
  <a href="${base}/location/${encodeURIComponent(l.location_id)}" style="color:#111827;text-decoration:none;">
    <span style="font-weight:500;">${escapeHtml(l.location_name)}</span> —
    <span style="color:#374151;">${l.red + l.missing} red, ${l.yellow} yellow</span>
    <span style="color:#2563eb;">Open in dashboard →</span>
  </a>
</li>`).join('')}
</ul>`
    : '';

  const angelsBlock = d.topAngels.length
    ? `<h3 style="font-size:15px;margin:24px 0 8px;color:#111827;">Top flagged angels</h3>
<ul style="list-style:none;padding:0;margin:0;">
${d.topAngels.map((a) => `<li style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
  <a href="${base}/location/${encodeURIComponent(a.location_id)}/angel/${encodeURIComponent(a.angel_id)}" style="color:#111827;text-decoration:none;">
    <span style="font-weight:500;">${escapeHtml(a.angel_name)}</span>
    <span style="color:#6b7280;">· ${escapeHtml(a.location_name)}</span> —
    <span style="color:#374151;">${a.red + a.missing} red, ${a.yellow} yellow</span>
    <span style="color:#2563eb;">Open →</span>
  </a>
</li>`).join('')}
</ul>`
    : '';

  const missingBlock = d.missingNotes.length
    ? `<h3 style="font-size:15px;margin:24px 0 8px;color:#111827;">Missing notes</h3>
<ul style="list-style:none;padding:0;margin:0;color:#374151;">
${d.missingNotes.slice(0, 10).map((m) => `<li style="padding:6px 0;">
  ${escapeHtml(m.scheduled_shift_date)} · ${escapeHtml(m.scheduled_shift_name)} shift · ${escapeHtml(m.individual_name)}
  <span style="color:#6b7280;">at ${escapeHtml(m.location_name)}</span>
</li>`).join('')}
</ul>`
    : '';

  const noNotesBlock = d.thisWeek.red + d.thisWeek.yellow + d.thisWeek.missing === 0
    ? `<p style="color:#047857;margin:24px 0;">No flags this week. Everything looks clean.</p>`
    : '';

  return `<!doctype html>
<html>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#fafafa;margin:0;padding:24px;color:#111827;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:24px;">

  <h1 style="font-size:20px;margin:0 0 4px;color:#111827;">Guardian Angel</h1>
  <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">${escapeHtml(d.subject.replace('Guardian Angel · ', ''))} · ${escapeHtml(d.scopeLabel)}</p>

  <h2 style="font-size:16px;margin:0 0 8px;color:#111827;">Compliance</h2>
  <p style="margin:0 0 4px;">
    <span style="font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;color:#111827;">${pct}%</span>
    <span style="color:#6b7280;font-size:14px;">compliance this week</span>
  </p>
  <p style="color:#6b7280;font-size:13px;margin:0;">${escapeHtml(wowStr)}</p>
  <p style="color:#374151;font-size:14px;margin:8px 0 0;">
    ${d.thisWeek.submitted_not_red} of ${d.thisWeek.expected} expected notes submitted clean.
    ${d.thisWeek.red + d.thisWeek.missing} red, ${d.thisWeek.yellow} yellow.
  </p>

  ${locationsBlock}
  ${angelsBlock}
  ${missingBlock}
  ${noNotesBlock}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;">
    <a href="${base}/" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">Open the full dashboard</a>
  </div>

  <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">
    You're receiving this as the ${escapeHtml(d.scopeLabel.toLowerCase())} compliance summary.
    Note content is never included in this email — click any link above to see details in the app.
  </p>
</div>
</body>
</html>`;
}

function humanDate(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  } catch { return iso; }
}

function locationName(id: string, db: BetterSqliteDatabase): string {
  const row = db.prepare('SELECT name FROM locations WHERE id = ?').get(id) as { name: string } | undefined;
  return row?.name ?? id;
}
