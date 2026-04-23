// Rules-config screen views.
// Per UI/UX constraints:
//   - "Rules" in nav (never "Rules config")
//   - Numeric thresholds with plain-English labels
//   - Prompt textarea behind "Advanced: instructions for the system" disclosure
//   - Buttons: "Save changes", "Update flags now", "Restore this version"

import type { Rule } from '../rules/rules-admin.js';
import type { ImpactPreview } from '../db/queries/rule-impact.js';
import { escapeHtml } from './layout.js';
import { renderBreadcrumb } from './ui.js';
import { contextualHelp } from './contextual-help.js';

export function renderRulesList(rules: Rule[]): string {
  return `<section>
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="text-2xl font-semibold ga-text-strong">Rules</h1>
      <p class="mt-1 text-sm ga-text">Edit what counts as a problem. Changes apply on the next flag check.</p>
    </div>
  </div>

  <ul class="mt-6 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${rules
      .map((r) => `
    <li class="px-5 py-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <h3 class="text-base font-medium ga-text-strong">${escapeHtml(r.name)}</h3>
          <p class="mt-1 text-sm ga-text">${escapeHtml(r.description)}</p>
          <p class="mt-1 text-xs ga-text-muted">Version ${r.version}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a href="/rules/${encodeURIComponent(r.rule_key)}/history" class="ga-link text-sm">Previous versions</a>
          <a href="/rules/${encodeURIComponent(r.rule_key)}/edit" class="ga-btn ga-btn-secondary">Edit</a>
        </div>
      </div>
    </li>`)
      .join('')}
  </ul>
  ${contextualHelp('rules')}
</section>`;
}

// -------------------------------------------------------------------------------------------------
// Edit form
// -------------------------------------------------------------------------------------------------

export interface RuleEditFormOptions {
  rule: Rule;
  savedVersion?: number;    // set after a successful save — shows success banner
  rerunResult?: RerunFragmentData;
  /** Initial impact preview (already computed at current config values). Null when the rule is LLM-evaluated. */
  impact?: ImpactPreview | null;
}

export function renderRuleEditForm(opts: RuleEditFormOptions): string {
  const { rule, savedVersion, rerunResult } = opts;
  const impact = opts.impact ?? null;
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(rule.config_json) as Record<string, unknown>; } catch { /* ignore */ }

  const crumb = renderBreadcrumb([
    { label: 'Rules', href: '/rules' },
    { label: rule.name },
  ]);

  return `<section class="max-w-3xl">
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold ga-text-strong">${escapeHtml(rule.name)}</h1>
    <p class="mt-1 text-sm ga-text">Version ${rule.version}${rule.created_by ? ' · edited by ' + escapeHtml(rule.created_by) : ''}</p>
  </div>

  ${savedVersion ? renderSavedBanner(savedVersion) : ''}
  ${rerunResult ? renderRerunResult(rerunResult) : ''}

  <form method="post" action="/rules/${encodeURIComponent(rule.rule_key)}" class="mt-6 space-y-6">

    <div>
      <label for="rule-name" class="block text-sm font-medium ga-text-strong">Rule name</label>
      <input id="rule-name" name="name" type="text" value="${escapeHtml(rule.name)}"
             class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
    </div>

    <div>
      <label for="rule-desc" class="block text-sm font-medium ga-text-strong">What this rule flags</label>
      <p class="mt-0.5 text-xs ga-text-muted">What managers see when a note trips this rule.</p>
      <textarea id="rule-desc" name="description" rows="3"
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">${escapeHtml(rule.description)}</textarea>
    </div>

    ${renderConfigFields(rule.rule_key, config)}

    ${renderImpactPreview(rule.rule_key, impact)}

    <details class="rounded-md border border-gray-200 bg-white">
      <summary class="cursor-pointer select-none px-4 py-3 text-sm font-medium ga-text-strong focus:outline-none focus:ring-2 focus:ring-blue-600 rounded-md">
        Advanced: instructions for the system
      </summary>
      <div class="px-4 pb-4 border-t border-gray-200 pt-3">
        <p class="text-xs ga-text-muted">These are the detailed instructions the system uses to decide borderline cases. Most people never need to change this.</p>
        <textarea name="prompt_template" rows="8"
                  class="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  aria-label="Advanced instructions">${escapeHtml(rule.prompt_template)}</textarea>
      </div>
    </details>

    <div class="flex items-center gap-3 pt-4 flex-wrap" style="border-top: 1px solid var(--ga-border);">
      <button type="submit" name="intent" value="save" class="ga-btn ga-btn-primary">
        Save changes
      </button>
      <button type="submit" name="intent" value="save_and_rerun" class="ga-btn ga-btn-secondary"
              onclick="var f=this.form; if(!f) return; var n=document.getElementById('rerun-skeleton'); if(n) n.style.display='block'; this.setAttribute('disabled','true'); this.textContent='Updating flags…';">
        Save &amp; update flags now
      </button>
      <a href="/rules/${encodeURIComponent(rule.rule_key)}/history" class="ga-link ml-auto text-sm">Previous versions</a>
    </div>
  </form>
  <div id="rerun-skeleton" class="mt-4 space-y-3" style="display:none" aria-live="polite">
    <div class="rounded-md border border-blue-100 bg-blue-50 p-4 space-y-2">
      <div class="ga-shimmer h-4 w-3/5"></div>
      <div class="ga-shimmer h-3 w-4/5"></div>
      <div class="ga-shimmer h-3 w-2/5"></div>
    </div>
    <p class="text-xs ga-text-muted text-center">Re-checking notes against the new rule — this usually takes a few seconds.</p>
  </div>
  ${contextualHelp('rule-edit')}
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
      return renderCopyPasteConfig(ruleKey, config);
    case 'short_note':
      return renderShortNoteConfig(ruleKey, config);
    default:
      return '';
  }
}

/**
 * Shared htmx attribute block applied to every config input — an `input`
 * event triggers a 400 ms-debounced GET to /rules/:key/preview-impact,
 * replacing the <div id="impact-preview"> fragment inline.
 */
function previewHxAttrs(ruleKey: string): string {
  const url = `/rules/${encodeURIComponent(ruleKey)}/preview-impact`;
  // `hx-indicator` points at a shimmer sibling inside #impact-preview so the
  // existing estimate stays visible (dimmed) while the new one loads —
  // preventing layout jitter on every slider tick.
  return `hx-get="${url}" hx-target="#impact-preview" hx-swap="outerHTML" hx-trigger="input changed delay:400ms" hx-include="closest form" hx-indicator="#impact-preview"`;
}

/**
 * Render the initial #impact-preview container. For LLM-evaluated rules,
 * shows a stub; for deterministic rules, shows the computed count.
 * This fragment is the same shape returned by GET /rules/:key/preview-impact
 * so htmx's outerHTML swap is symmetric.
 */
export function renderImpactPreview(ruleKey: string, impact: ImpactPreview | null): string {
  if (impact === null) {
    // LLM-evaluated rule — no cheap preview possible.
    return `<div id="impact-preview" class="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm ga-text">
      <div class="font-medium ga-text-strong">Live preview not available for this rule</div>
      <p class="mt-1 text-xs ga-text">This rule asks the system to read note content, which takes a few seconds per note. Click <strong>Save &amp; update flags now</strong> to see the effect across recent notes.</p>
    </div>`;
  }
  const pct = impact.total_in_window > 0
    ? ((impact.count / impact.total_in_window) * 100).toFixed(1)
    : '0.0';
  return `<div id="impact-preview" class="relative rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 transition-opacity" data-dim-while-loading>
    <div class="font-medium">At this setting, <span class="tnum">${impact.count}</span> of <span class="tnum">${impact.total_in_window}</span> notes (${pct}%) would be flagged</div>
    <p class="mt-1 text-xs text-blue-800">Preview covers ${escapeHtml(impact.window_start)} to ${escapeHtml(impact.window_end)}. Estimates update as you change thresholds. Click <strong>Save &amp; update flags now</strong> to apply.</p>
    <span class="ga-indicator absolute top-3 right-3 text-xs text-blue-700" data-inline aria-live="polite">Updating estimate…</span>
  </div>`;
}

function renderCopyPasteConfig(ruleKey: string, config: Record<string, unknown>): string {
  const threshold = Number(config.similarity_threshold ?? 0.85);
  const windowSize = Number(config.window_size ?? 20);
  const hx = previewHxAttrs(ruleKey);
  return `<div>
  <label for="cfg-threshold" class="block text-sm font-medium ga-text-strong">How similar is too similar?</label>
  <p class="mt-0.5 text-xs ga-text-muted">Lower = more sensitive. Higher = only near-identical notes flagged.</p>
  <div class="mt-2 flex items-center gap-4">
    <input id="cfg-threshold" name="cfg_similarity_threshold" type="range" min="0.5" max="1.0" step="0.05" value="${threshold.toFixed(2)}"
           class="flex-1 accent-blue-600" oninput="document.getElementById('cfg-threshold-value').textContent=Number(this.value).toFixed(2)"
           ${hx}>
    <span id="cfg-threshold-value" class="text-base font-medium tnum ga-text-strong w-12 text-right">${threshold.toFixed(2)}</span>
  </div>
  <div class="mt-1 flex justify-between text-xs ga-text-muted">
    <span>0.50 (very sensitive)</span>
    <span>1.00 (identical only)</span>
  </div>
</div>

<div>
  <label for="cfg-window" class="block text-sm font-medium ga-text-strong">Notes to compare against</label>
  <p class="mt-0.5 text-xs ga-text-muted">How many of the angel's most recent notes to check.</p>
  <div class="mt-2 flex items-center gap-3">
    <input id="cfg-window" name="cfg_window_size" type="number" min="5" max="100" value="${windowSize}"
           class="w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600">
    <span class="text-sm ga-text">most recent notes</span>
  </div>
</div>`;
}

function renderShortNoteConfig(ruleKey: string, config: Record<string, unknown>): string {
  const residential = Number(config.residential_min_words ?? 20);
  const dayProgram = Number(config.day_program_min_words ?? 15);
  const hx = previewHxAttrs(ruleKey);
  return `<fieldset>
  <legend class="block text-sm font-medium ga-text-strong">Minimum note length</legend>
  <div class="mt-2 space-y-2">
    <div class="flex items-center gap-3">
      <label for="cfg-residential" class="text-sm ga-text w-44">Residential shifts under</label>
      <input id="cfg-residential" name="cfg_residential_min_words" type="number" min="1" max="200" value="${residential}"
             class="w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
             ${hx}>
      <span class="text-sm ga-text">words</span>
    </div>
    <div class="flex items-center gap-3">
      <label for="cfg-dayprog" class="text-sm ga-text w-44">Day program under</label>
      <input id="cfg-dayprog" name="cfg_day_program_min_words" type="number" min="1" max="200" value="${dayProgram}"
             class="w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
             ${hx}>
      <span class="text-sm ga-text">words</span>
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
    <h1 class="text-2xl font-semibold ga-text-strong">Previous versions</h1>
    <p class="mt-1 text-sm ga-text">Every edit creates a new version. You can restore any prior version — restoring doesn't delete the edits since.</p>
  </div>
  <ul class="mt-6 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${history
      .map((r) => `
    <li class="px-5 py-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium ga-text-strong">Version ${r.version}</h3>
            ${r.is_active ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-800 text-xs font-medium border border-green-100"><span class="w-1.5 h-1.5 rounded-full bg-green-600"></span>Active</span>' : ''}
          </div>
          <p class="mt-1 text-xs ga-text-muted">${escapeHtml(r.created_at)}${r.created_by ? ' · ' + escapeHtml(r.created_by) : ''}</p>
          <p class="mt-2 text-sm ga-text">${escapeHtml(r.description)}</p>
        </div>
        ${r.is_active
          ? ''
          : `<form method="post" action="/rules/${encodeURIComponent(ruleKey)}/revert" class="shrink-0">
              <input type="hidden" name="version" value="${r.version}">
              <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md border border-gray-300 bg-white ga-text-strong text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Restore this version</button>
            </form>`}
      </div>
    </li>`)
      .join('')}
  </ul>
</section>`;
}
