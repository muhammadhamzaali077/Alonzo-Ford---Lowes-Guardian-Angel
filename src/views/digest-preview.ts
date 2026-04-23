// /digest/preview page — signed-off layout:
//   - Top banner in muted blue: "Preview mode — no emails will be sent."
//   - Stack of envelope cards, one per active recipient
//   - Each card: recipient + scope + subject + inline iframe-free HTML body
//     rendered directly into a bordered container
//
// Empty state if no active recipients configured.

import type { RenderedDigest } from '../digest/render.js';
import { escapeHtml } from './layout.js';
import { contextualHelp } from './contextual-help.js';

export interface DigestPreviewViewData {
  digests: RenderedDigest[];
  generatedAt: Date | null;
}

export function renderDigestPreview(data: DigestPreviewViewData): string {
  const banner = `<div class="rounded-md p-3 text-sm ga-text" style="background-color: var(--ga-gold-bg); border: 1px solid var(--ga-gold-border);">
  <span class="font-medium ga-text-strong">Preview mode.</span> No emails will be sent. This page shows exactly what every recipient would receive on Monday at 8am ET.
</div>`;

  if (data.digests.length === 0) {
    return `<section>
  <h1 class="text-2xl font-semibold ga-text-strong">Weekly email preview</h1>
  <div class="mt-4">${banner}</div>
  <div class="mt-6 ga-surface-cream p-5 text-sm">
    No digest recipients yet. Add someone in <a href="/admin/recipients" class="ga-link">Settings › Digest recipients</a>.
  </div>
</section>`;
  }

  return `<section>
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="text-2xl font-semibold ga-text-strong">Weekly email preview</h1>
      <p class="mt-1 text-sm ga-text">${data.digests.length} recipient${data.digests.length === 1 ? '' : 's'}${data.generatedAt ? ' · regenerated just now' : ''}</p>
    </div>
    <a href="/" class="ga-link text-sm py-2 px-1 -my-2 -mx-1 min-h-[44px] inline-flex items-center">← Back to dashboard</a>
  </div>

  <div class="mt-4">${banner}</div>

  <div class="mt-6 space-y-4">
    ${data.digests.map(renderEnvelopeCard).join('')}
  </div>
  ${contextualHelp('digest')}
</section>`;
}

function renderEnvelopeCard(digest: RenderedDigest): string {
  // T121 — Gmail-style frame. The card now reads like a single email open
  // in Gmail's reading pane: avatar + name + timestamp header, subject
  // line as a bold title, recipient row with a "To" pill, and the
  // rendered email body below. Purely visual — no behavior change.
  const fromLabel = 'Guardian Angel <digest@lowesguardianangel.com>';
  const recipient = digest.recipient_email;
  const sentStamp = 'Monday, 8:00 AM';
  // The digest HTML renderer emits a full <!doctype html><html><body ...>
  // document (that's what gets sent to Resend as a real email). When
  // inlined into this preview page directly, the browser merges that
  // second <body> into the parent and its inline background leaks onto
  // the whole dashboard. Strip the outer chrome so only the email's own
  // inner content (<div style="max-width:640px;...">) renders here.
  const innerEmailHtml = stripEmailChrome(digest.html);
  return `<article class="ga-surface-cream" style="overflow: hidden;">
  <header class="px-5 py-3" style="border-bottom: 1px solid var(--ga-cream-dim);">
    <h3 class="text-base font-semibold ga-text-strong leading-snug">${escapeHtml(digest.subject)}</h3>
    <div class="mt-2 flex items-start gap-3">
      <div class="shrink-0 w-8 h-8 rounded-full text-sm font-medium flex items-center justify-center" aria-hidden="true"
           style="background-color: var(--ga-gold-bg); color: var(--ga-gold-dim); border: 1px solid var(--ga-gold-border);">GA</div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <span class="text-sm font-medium ga-text-strong truncate">Guardian Angel</span>
          <span class="text-xs ga-text-muted tnum shrink-0">${escapeHtml(sentStamp)}</span>
        </div>
        <div class="mt-0.5 text-xs ga-text-muted truncate">${escapeHtml(fromLabel)}</div>
        <div class="mt-1 flex items-center gap-1.5 text-xs ga-text">
          <span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide ga-text-muted"
                style="background-color: var(--ga-cream-soft); border: 1px solid var(--ga-cream-dim);">To</span>
          <span class="truncate">${escapeHtml(recipient)}</span>
          <span class="shrink-0 ga-text-subtle">·</span>
          <span class="truncate">${escapeHtml(digest.scope_label)}</span>
        </div>
      </div>
      <span class="shrink-0 hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ga-sev-amber" aria-label="This is a preview"
            style="border: 1px solid var(--ga-amber-border);">
        <span class="w-1.5 h-1.5 rounded-full ga-sev-amber-dot mr-1"></span>Preview
      </span>
    </div>
  </header>
  <div class="px-5 pb-5 pt-4" style="background-color: #fafafa;">
    <div class="ga-shadow-xs" style="background-color: #ffffff; border: 1px solid var(--ga-cream-dim); border-radius: var(--ga-radius-sm); overflow: hidden;">
      ${innerEmailHtml}
    </div>
  </div>
  <footer class="px-5 py-2 text-xs ga-text-muted flex items-center gap-4" style="border-top: 1px solid var(--ga-cream-dim);">
    <span class="inline-flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10l7 5 7-5M3 6l7 5 7-5"/></svg>Preview only — not sent.</span>
    <span class="ga-text-subtle">|</span>
    <span>Recipient: ${escapeHtml(recipient)}</span>
  </footer>
</article>`;
}

/**
 * Pull the inner body content out of a full email document so it can be
 * inlined into the preview page without its <body style="background:...">
 * leaking onto the parent. The raw email is preserved for actual sending —
 * this only affects what gets rendered in /digest/preview.
 */
function stripEmailChrome(fullHtml: string): string {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(fullHtml);
  return bodyMatch?.[1] ?? fullHtml;
}
