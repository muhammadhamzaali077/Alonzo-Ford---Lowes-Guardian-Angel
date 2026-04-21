// /digest/preview page — signed-off layout:
//   - Top banner in muted blue: "Preview mode — no emails will be sent."
//   - Stack of envelope cards, one per active recipient
//   - Each card: recipient + scope + subject + inline iframe-free HTML body
//     rendered directly into a bordered container
//
// Empty state if no active recipients configured.

import type { RenderedDigest } from '../digest/render.js';
import { escapeHtml } from './layout.js';

export interface DigestPreviewViewData {
  digests: RenderedDigest[];
  generatedAt: Date | null;
}

export function renderDigestPreview(data: DigestPreviewViewData): string {
  const banner = `<div class="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
  <span class="font-medium">Preview mode.</span> No emails will be sent. This page shows exactly what every recipient would receive on Monday at 8am ET.
</div>`;

  if (data.digests.length === 0) {
    return `<section>
  <h1 class="text-2xl font-semibold text-gray-900">Weekly email preview</h1>
  <div class="mt-4">${banner}</div>
  <div class="mt-6 bg-white border border-gray-200 rounded-md p-5 text-sm text-gray-500">
    No digest recipients yet. Add someone in <a href="/admin/recipients" class="text-blue-600 hover:underline">Settings › Digest recipients</a>.
  </div>
</section>`;
  }

  return `<section>
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Weekly email preview</h1>
      <p class="mt-1 text-sm text-gray-600">${data.digests.length} recipient${data.digests.length === 1 ? '' : 's'}${data.generatedAt ? ' · regenerated just now' : ''}</p>
    </div>
    <a href="/" class="text-sm text-blue-600 hover:underline py-2 px-1 -my-2 -mx-1 min-h-[44px] inline-flex items-center">← Back to dashboard</a>
  </div>

  <div class="mt-4">${banner}</div>

  <div class="mt-6 space-y-4">
    ${data.digests.map(renderEnvelopeCard).join('')}
  </div>
</section>`;
}

function renderEnvelopeCard(digest: RenderedDigest): string {
  return `<article class="bg-white border border-gray-200 rounded-md overflow-hidden">
  <div class="px-5 py-3 border-b border-gray-200 bg-gray-50">
    <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      <dt class="text-gray-500">To</dt>
      <dd class="text-gray-900 font-medium">${escapeHtml(digest.recipient_email)}</dd>
      <dt class="text-gray-500">Scope</dt>
      <dd class="text-gray-900">${escapeHtml(digest.scope_label)}</dd>
      <dt class="text-gray-500">Subject</dt>
      <dd class="text-gray-900">${escapeHtml(digest.subject)}</dd>
    </dl>
  </div>
  <div class="p-0">
    ${digest.html}
  </div>
</article>`;
}
