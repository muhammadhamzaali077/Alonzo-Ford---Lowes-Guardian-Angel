// Rules-config screen views.
// Per UI/UX constraints:
//   - "Rules" in nav (never "Rules config")
//   - Numeric thresholds with plain-English labels
//   - Prompt textarea behind "Advanced: instructions for the system" disclosure
//   - Buttons: "Save changes", "Update flags now", "Restore this version"

import type { Rule } from '../rules/rules-admin.js';
import { escapeHtml } from './layout.js';
import { renderBreadcrumb } from './ui.js';

export function renderRulesList(rules: Rule[]): string {
  return `<section>
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Rules</h1>
      <p class="mt-1 text-sm text-gray-600">Edit what counts as a problem. Changes apply on the next flag check.</p>
    </div>
  </div>

  <ul class="mt-6 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${rules
      .map((r) => `
    <li class="px-5 py-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <h3 class="text-base font-medium text-gray-900">${escapeHtml(r.name)}</h3>
          <p class="mt-1 text-sm text-gray-600">${escapeHtml(r.description)}</p>
          <p class="mt-1 text-xs text-gray-500">Version ${r.version}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a href="/rules/${encodeURIComponent(r.rule_key)}/history" class="text-sm text-gray-700 hover:text-blue-600 hover:underline py-2 px-1 -my-2 -mx-1 min-h-[44px] inline-flex items-center">Previous versions</a>
          <a href="/rules/${encodeURIComponent(r.rule_key)}/edit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Edit</a>
        </div>
      </div>
    </li>`)
      .join('')}
  </ul>
</section>`;
}

// -------------------------------------------------------------------------------------------------
// Edit form
// -------------------------------------------------------------------------------------------------

export interface RuleEditFormOptions {
  rule: Rule;
  savedVersion?: number;    // set after a successful save — shows success banner
  rerunResult?: RerunFragmentData;
}

export function renderRuleEditForm(opts: RuleEditFormOptions): string {
  const { rule, savedVersion, rerunResult } = opts;
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(rule.config_json) as Record<string, unknown>; } catch { /* ignore */ }

  const crumb = renderBreadcrumb([
    { label: 'Rules', href: '/rules' },
    { label: rule.name },
  ]);

  return `<section class="max-w-3xl">
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold text-gray-900">${escapeHtml(rule.name)}</h1>
    <p class="mt-1 text-sm text-gray-600">Version ${rule.version}${rule.created_by ? ' · edited by ' + escapeHtml(rule.created_by) : ''}</p>
  </div>

  ${savedVersion ? renderSavedBanner(savedVersion) : ''}
  ${rerunResult ? renderRerunResult(rerunResult) : ''}

  <form method="post" action="/rules/${encodeURIComponent(rule.rule_key)}" class="mt-6 space-y-6">

    <div>
      <label for="rule-name" class="block text-sm font-medium text-gray-900">Rule name</label>
      <input id="rule-name" name="name" type="text" value="${escapeHtml(rule.name)}"
             class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
    </div>

    <div>
      <label for="rule-desc" class="block text-sm font-medium text-gray-900">What this rule flags</label>
      <p class="mt-0.5 text-xs text-gray-500">What managers see when a note trips this rule.</p>
      <textarea id="rule-desc" name="description" rows="3"
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">${escapeHtml(rule.description)}</textarea>
    </div>

    ${renderConfigFields(rule.rule_key, config)}

    <details class="rounded-md border border-gray-200 bg-white">
      <summary class="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded-md">
        Advanced: instructions for the system
      </summary>
      <div class="px-4 pb-4 border-t border-gray-200 pt-3">
        <p class="text-xs text-gray-500">These are the detailed instructions the system uses to decide borderline cases. Most people never need to change this.</p>
        <textarea name="prompt_template" rows="8"
                  class="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  aria-label="Advanced instructions">${escapeHtml(rule.prompt_template)}</textarea>
      </div>
    </details>

    <div class="flex items-center gap-3 pt-4 border-t border-gray-200 flex-wrap">
      <button type="submit" name="intent" value="save"
              class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
        Save changes
      </button>
      <button type="submit" name="intent" value="save_and_rerun"
              class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
        Save &amp; update flags now
      </button>
      <a href="/rules/${encodeURIComponent(rule.rule_key)}/history" class="ml-auto text-sm text-blue-600 hover:underline">Previous versions</a>
    </div>
  </form>
</section>`;
}

function renderSavedBanner(newVersion: number): string {
  return `<div class="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
  Saved. Now at version ${newVersion}. Click <strong>Save &amp; update flags now</strong> to re-check notes against the new rule.
</div>`;
}

export interface RerunFragmentData {
  superseded: number;
  classified_ok: number;
  new_red: number;
  new_yellow: number;
  permanent_failures: number;
  wall_clock_ms: number;
  window_start: string;
  window_end: string;
}

function renderRerunResult(r: RerunFragmentData): string {
  return `<div class="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
  <p class="font-medium">Flags updated.</p>
  <p class="mt-1 tnum">Re-checked notes from ${escapeHtml(r.window_start)} to ${escapeHtml(r.window_end)}. ${r.superseded} prior flags cleared; ${r.classified_ok} notes re-reviewed; ${r.new_red} new red and ${r.new_yellow} new yellow flags written.</p>
  ${r.permanent_failures > 0 ? `<p class="mt-1 text-xs">${r.permanent_failures} notes couldn't be reviewed after 3 attempts — see System messages in Settings.</p>` : ''}
  <p class="mt-2"><a href="/" class="text-blue-700 underline">Back to dashboard →</a></p>
</div>`;
}

function renderConfigFields(ruleKey: string, config: Record<string, unknown>): string {
  switch (ruleKey) {
    case 'copy_paste':
      return renderCopyPasteConfig(config);
    case 'short_note':
      return renderShortNoteConfig(config);
    default:
      return '';
  }
}

function renderCopyPasteConfig(config: Record<string, unknown>): string {
  const threshold = Number(config.similarity_threshold ?? 0.85);
  const windowSize = Number(config.window_size ?? 20);
  return `<div>
  <label for="cfg-threshold" class="block text-sm font-medium text-gray-900">How similar is too similar?</label>
  <p class="mt-0.5 text-xs text-gray-500">Lower = more sensitive. Higher = only near-identical notes flagged.</p>
  <div class="mt-2 flex items-center gap-4">
    <input id="cfg-threshold" name="cfg_similarity_threshold" type="range" min="0.5" max="1.0" step="0.05" value="${threshold.toFixed(2)}"
           class="flex-1 accent-blue-600" oninput="document.getElementById('cfg-threshold-value').textContent=Number(this.value).toFixed(2)">
    <span id="cfg-threshold-value" class="text-base font-medium tnum text-gray-900 w-12 text-right">${threshold.toFixed(2)}</span>
  </div>
  <div class="mt-1 flex justify-between text-xs text-gray-500">
    <span>0.50 (very sensitive)</span>
    <span>1.00 (identical only)</span>
  </div>
</div>

<div>
  <label for="cfg-window" class="block text-sm font-medium text-gray-900">Notes to compare against</label>
  <p class="mt-0.5 text-xs text-gray-500">How many of the angel's most recent notes to check.</p>
  <div class="mt-2 flex items-center gap-3">
    <input id="cfg-window" name="cfg_window_size" type="number" min="5" max="100" value="${windowSize}"
           class="w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600">
    <span class="text-sm text-gray-700">most recent notes</span>
  </div>
</div>`;
}

function renderShortNoteConfig(config: Record<string, unknown>): string {
  const residential = Number(config.residential_min_words ?? 20);
  const dayProgram = Number(config.day_program_min_words ?? 15);
  return `<fieldset>
  <legend class="block text-sm font-medium text-gray-900">Minimum note length</legend>
  <div class="mt-2 space-y-2">
    <div class="flex items-center gap-3">
      <label for="cfg-residential" class="text-sm text-gray-700 w-44">Residential shifts under</label>
      <input id="cfg-residential" name="cfg_residential_min_words" type="number" min="1" max="200" value="${residential}"
             class="w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600">
      <span class="text-sm text-gray-700">words</span>
    </div>
    <div class="flex items-center gap-3">
      <label for="cfg-dayprog" class="text-sm text-gray-700 w-44">Day program under</label>
      <input id="cfg-dayprog" name="cfg_day_program_min_words" type="number" min="1" max="200" value="${dayProgram}"
             class="w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600">
      <span class="text-sm text-gray-700">words</span>
    </div>
  </div>
</fieldset>`;
}

// -------------------------------------------------------------------------------------------------
// History view
// -------------------------------------------------------------------------------------------------

export function renderRulesHistory(ruleKey: string, history: Rule[]): string {
  const crumb = renderBreadcrumb([
    { label: 'Rules', href: '/rules' },
    { label: history[0]?.name ?? ruleKey, href: `/rules/${encodeURIComponent(ruleKey)}/edit` },
    { label: 'Previous versions' },
  ]);

  return `<section class="max-w-3xl">
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold text-gray-900">Previous versions</h1>
    <p class="mt-1 text-sm text-gray-600">Every edit creates a new version. You can restore any prior version — restoring doesn't delete the edits since.</p>
  </div>
  <ul class="mt-6 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${history
      .map((r) => `
    <li class="px-5 py-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-gray-900">Version ${r.version}</h3>
            ${r.is_active ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-800 text-xs font-medium border border-green-100"><span class="w-1.5 h-1.5 rounded-full bg-green-600"></span>Active</span>' : ''}
          </div>
          <p class="mt-1 text-xs text-gray-500">${escapeHtml(r.created_at)}${r.created_by ? ' · ' + escapeHtml(r.created_by) : ''}</p>
          <p class="mt-2 text-sm text-gray-700">${escapeHtml(r.description)}</p>
        </div>
        ${r.is_active
          ? ''
          : `<form method="post" action="/rules/${encodeURIComponent(ruleKey)}/revert" class="shrink-0">
              <input type="hidden" name="version" value="${r.version}">
              <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Restore this version</button>
            </form>`}
      </div>
    </li>`)
      .join('')}
  </ul>
</section>`;
}
