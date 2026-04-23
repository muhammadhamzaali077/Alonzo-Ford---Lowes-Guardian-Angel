// Upload view. Phase 9 also adds the full org + recipients + ops Settings
// surface in src/views/admin-org.ts.

import type { UploadResult } from '../admin/upload.js';
import { escapeHtml } from './layout.js';
import { renderSettingsShell } from './admin-org.js';
import { contextualHelp } from './contextual-help.js';

export function renderUploadPage(result?: UploadResult): string {
  const body = `<h2 class="text-lg font-medium ga-text-strong">Upload Therap export</h2>
  <p class="mt-1 text-sm ga-text">Upload an Excel or CSV T-Log export from Therap. Each row becomes a note in Guardian Angel.</p>

  <form method="post" action="/admin/upload" enctype="multipart/form-data" class="mt-6"
        onsubmit="var s=document.getElementById('upload-skeleton'); if(s) s.style.display='block'; var b=this.querySelector('button[type=submit]'); if(b){b.setAttribute('disabled','true'); b.textContent='Uploading…';}">
    <label for="upload-file" class="block border-2 border-dashed border-gray-300 rounded-md p-8 text-center cursor-pointer hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-600">
      <svg class="mx-auto w-10 h-10 ga-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12"/>
      </svg>
      <p class="mt-3 text-sm font-medium ga-text-strong">Drop a Therap Excel export here, or click to browse</p>
      <p class="mt-1 text-xs ga-text-muted">Max file size 10 MB. Supports .xlsx and .csv.</p>
      <input id="upload-file" name="file" type="file" accept=".xlsx,.csv,.xls,.xlsm,.xlsb" required class="sr-only"
             onchange="this.form.querySelector('[data-upload-filename]').textContent = this.files[0]?.name || ''">
    </label>
    <p data-upload-filename class="mt-2 text-xs ga-text tnum"></p>
    <div class="mt-4 flex gap-2">
      <button type="submit" class="ga-btn ga-btn-primary">Upload</button>
    </div>
  </form>

  <div id="upload-skeleton" class="mt-6 space-y-2" style="display:none" aria-live="polite">
    <div class="rounded-md border border-gray-200 bg-white p-4 space-y-2">
      <div class="ga-shimmer h-4 w-2/5"></div>
      <div class="ga-shimmer h-3 w-3/5"></div>
      <div class="ga-shimmer h-3 w-4/5"></div>
      <div class="ga-shimmer h-3 w-2/5"></div>
    </div>
    <p class="text-xs ga-text-muted text-center">Reading the export and running the flag checks — hang on a second.</p>
  </div>

  ${result ? renderUploadSummary(result) : renderEmptyHint()}
  ${contextualHelp('upload')}`;
  return renderSettingsShell('upload', body);
}

function renderEmptyHint(): string {
  return `<p class="mt-8 text-sm ga-text-muted">Upload results will appear below after you pick a file.</p>`;
}

export function renderUploadSummary(r: UploadResult): string {
  if (r.fatal_error) {
    return `<div class="mt-6 bg-white border border-red-200 rounded-md p-5">
  <h2 class="text-lg font-medium ga-text-strong">We couldn't process this file</h2>
  <p class="mt-2 text-sm ga-text">${escapeHtml(r.fatal_error)}</p>
</div>`;
  }

  const partsIn: string[] = [];
  if (r.ingested > 0) partsIn.push(`${r.ingested} added`);
  if (r.superseded > 0) partsIn.push(`${r.superseded} updated`);
  if (r.noop > 0) partsIn.push(`${r.noop} unchanged`);
  if (r.skipped.length > 0) partsIn.push(`${r.skipped.length} skipped`);
  const ingestSentence = `Parsed ${r.parsed} row${r.parsed === 1 ? '' : 's'}. ${partsIn.length > 0 ? partsIn.join(', ') + '.' : 'Nothing to do.'}`;

  const flagsSentence = renderFlagsSentence(r);

  const skippedDetails =
    r.skipped.length === 0
      ? ''
      : `<details class="mt-4" open>
  <summary class="cursor-pointer text-sm font-medium ga-text-strong focus:outline-none focus:ring-2 focus:ring-blue-600 rounded inline-block py-1 -my-1">Skipped rows (${r.skipped.length})</summary>
  <ul class="mt-2 divide-y divide-gray-100 text-sm ga-text border-t border-gray-200">
    ${r.skipped
      .slice(0, 200)
      .map(
        (s) => `<li class="py-2">
      <span class="font-medium tnum">Row ${s.row}:</span> ${escapeHtml(s.reason)}
    </li>`,
      )
      .join('')}
    ${r.skipped.length > 200 ? `<li class="py-2 text-xs ga-text-muted">… and ${r.skipped.length - 200} more.</li>` : ''}
  </ul>
</details>`;

  return `<div class="mt-6 bg-white border border-gray-200 rounded-md p-5">
  <h2 class="text-lg font-medium ga-text-strong">Upload summary</h2>
  <p class="mt-1 text-sm ga-text">File: <span class="font-medium ga-text-strong">${escapeHtml(r.filename)}</span></p>
  <p class="mt-3 text-sm ga-text-strong">${escapeHtml(ingestSentence)}</p>
  ${flagsSentence}
  ${skippedDetails}
  <div class="mt-4 pt-4 border-t border-gray-200 flex items-center gap-4">
    <a href="/" class="text-sm text-blue-600 hover:underline">Back to dashboard →</a>
    <a href="/admin/upload" class="text-sm ga-text hover:text-blue-600">Upload another file</a>
  </div>
</div>`;
}

function renderFlagsSentence(r: UploadResult): string {
  const parts: string[] = [];
  if (r.new_flags.red > 0)     parts.push(`${r.new_flags.red} new red`);
  if (r.new_flags.yellow > 0)  parts.push(`${r.new_flags.yellow} new yellow`);
  if (r.new_flags.missing > 0) parts.push(`${r.new_flags.missing} new missing-note`);
  if (parts.length === 0) return '';
  return `<p class="mt-1 text-sm ga-text">Flags from this upload: ${parts.join(', ')}.</p>`;
}
