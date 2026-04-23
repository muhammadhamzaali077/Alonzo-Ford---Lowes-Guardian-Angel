// Rules-config screen views.
// Per UI/UX constraints + Batch 2 simplification:
//   - "Rules" in nav (never "Rules config")
//   - Numeric thresholds with plain-English labels
//   - ONE primary action: "Save" — saves and re-runs flags atomically.
//     Batch 2 retired the prior two-button "Save changes" / "Save &
//     update flags now" pattern; a non-technical CEO expects clicking
//     Save to apply the change, not stage it.
//   - Advanced Instructions (prompt_template) disclosure removed from
//     UI per REQ-6 simplification. Data is still seeded in rule_config
//     and still drives the classifier — only the edit surface is gone.
//     Server-side POST handler still accepts prompt_template if sent.

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

  <ul class="mt-6 ga-surface-cream" style="overflow: hidden;">
    ${rules
      .map((r, idx) => `
    <li class="px-5 py-4"${idx === 0 ? '' : ' style="border-top: 1px solid var(--ga-cream-dim);"'}>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <h3 class="text-base font-medium ga-text-strong">${escapeHtml(r.name)}</h3>
          <p class="mt-1 text-sm ga-text">${escapeHtml(r.description)}</p>
          <p class="mt-1 text-xs ga-text-muted">Version ${r.version}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a href="/rules/${encodeURIComponent(r.rule_key)}/edit" class="ga-btn ga-btn-primary">Edit</a>
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

  // The prior renderSavedBanner is retired — every Save now goes through
  // the save_and_rerun path, which produces a rerunResult. The rerun
  // result already says "Flags updated. N prior flags cleared..." so a
  // separate "Saved as vN" banner was redundant. If someone lands here
  // with ?saved=N but no rerunResult (e.g., older bookmarked link or a
  // silent revert), we still want the "Saved as vN" confirmation, so
  // the banner is conditional on rerunResult being absent.
  return `<section class="max-w-3xl">
  ${crumb}
  <div class="mt-2">
    <h1 class="text-2xl font-semibold ga-text-strong">${escapeHtml(rule.name)}</h1>
    <p class="mt-1 text-sm ga-text">Version ${rule.version}${rule.created_by ? ' · edited by ' + escapeHtml(rule.created_by) : ''}</p>
  </div>

  ${savedVersion && !rerunResult ? renderSavedBanner(savedVersion) : ''}
  ${rerunResult ? renderRerunResult(rerunResult) : ''}

  <form method="post" action="/rules/${encodeURIComponent(rule.rule_key)}" class="mt-6 space-y-6">

    <div>
      <label for="rule-name" class="block text-sm font-medium ga-text-strong">Rule name</label>
      <input id="rule-name" name="name" type="text" value="${escapeHtml(rule.name)}"
             class="mt-1 ga-input">
    </div>

    <div>
      <label for="rule-desc" class="block text-sm font-medium ga-text-strong">What this rule flags</label>
      <p class="mt-0.5 text-xs ga-text-muted">What managers see when a note trips this rule.</p>
      <textarea id="rule-desc" name="description" rows="3"
                class="mt-1 ga-input">${escapeHtml(rule.description)}</textarea>
    </div>

    ${renderConfigFields(rule.rule_key, config)}

    ${renderImpactPreview(rule.rule_key, impact)}

    <div class="flex items-center gap-3 pt-4" style="border-top: 1px solid var(--ga-border);">
      <button type="submit" name="intent" value="save_and_rerun" class="ga-btn ga-btn-primary"
              onclick="var f=this.form; if(!f) return; var n=document.getElementById('rerun-skeleton'); if(n) n.style.display='block'; this.setAttribute('disabled','true'); this.textContent='Saving…';">
        Save
      </button>
      <span class="text-xs ga-text-muted">Applies the change and re-checks recent notes.</span>
    </div>
  </form>
  <div id="rerun-skeleton" class="mt-4 space-y-3" style="display:none" aria-live="polite">
    <div class="rounded-md p-4 space-y-2" style="background-color: var(--ga-gold-bg); border: 1px solid var(--ga-gold-border);">
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
  // Fallback banner for the rare no-rerun path (older ?saved= bookmark,
  // silent revert). Post-Batch-2 the primary Save always triggers a
  // rerun, which shows renderRerunResult instead.
  return `<div class="mt-4 rounded-md p-3 text-sm ga-sev-green" style="border: 1px solid var(--ga-green-border);">
  Saved as version ${newVersion}.
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
  return `<div class="mt-4 rounded-md p-4 text-sm ga-text" style="background-color: var(--ga-gold-bg); border: 1px solid var(--ga-gold-border);">
  <p class="font-medium ga-text-strong">Flags updated.</p>
  <p class="mt-1 tnum">Re-checked notes from ${escapeHtml(r.window_start)} to ${escapeHtml(r.window_end)}. ${r.superseded} prior flags cleared; ${r.classified_ok} notes re-reviewed; ${r.new_red} new red and ${r.new_yellow} new yellow flags written.</p>
  ${r.permanent_failures > 0 ? `<p class="mt-1 text-xs ga-text-muted">${r.permanent_failures} notes couldn't be reviewed after 3 attempts — see System messages in Settings.</p>` : ''}
  <p class="mt-2"><a href="/" class="ga-link">Back to dashboard →</a></p>
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
    return `<div id="impact-preview" class="rounded-md p-4 text-sm ga-text" style="background-color: var(--ga-surface-elevated); border: 1px solid var(--ga-border);">
      <div class="font-medium ga-text-strong">Live preview not available for this rule</div>
      <p class="mt-1 text-xs ga-text-muted">This rule asks the system to read note content, which takes a few seconds per note. Click <strong>Save</strong> to see the effect across recent notes.</p>
    </div>`;
  }
  const pct = impact.total_in_window > 0
    ? ((impact.count / impact.total_in_window) * 100).toFixed(1)
    : '0.0';
  return `<div id="impact-preview" class="relative rounded-md p-4 text-sm ga-text transition-opacity" data-dim-while-loading
       style="background-color: var(--ga-gold-bg); border: 1px solid var(--ga-gold-border);">
    <div class="font-medium ga-text-strong">At this setting, <span class="tnum">${impact.count}</span> of <span class="tnum">${impact.total_in_window}</span> notes (${pct}%) would be flagged</div>
    <p class="mt-1 text-xs ga-text-muted">Preview covers ${escapeHtml(impact.window_start)} to ${escapeHtml(impact.window_end)}. Estimates update as you change thresholds. Click <strong>Save</strong> to apply.</p>
    <span class="ga-indicator absolute top-3 right-3 text-xs" style="color: var(--ga-gold-bright);" data-inline aria-live="polite">Updating estimate…</span>
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
           class="flex-1" style="accent-color: var(--ga-gold);" oninput="document.getElementById('cfg-threshold-value').textContent=Number(this.value).toFixed(2)"
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
           class="ga-input" style="width: 6rem;">
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
             class="ga-input" style="width: 6rem;"
             ${hx}>
      <span class="text-sm ga-text">words</span>
    </div>
    <div class="flex items-center gap-3">
      <label for="cfg-dayprog" class="text-sm ga-text w-44">Day program under</label>
      <input id="cfg-dayprog" name="cfg_day_program_min_words" type="number" min="1" max="200" value="${dayProgram}"
             class="ga-input" style="width: 6rem;"
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
  <ul class="mt-6 ga-surface-cream" style="overflow: hidden;">
    ${history
      .map((r, idx) => `
    <li class="px-5 py-4"${idx === 0 ? '' : ' style="border-top: 1px solid var(--ga-cream-dim);"'}>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium ga-text-strong">Version ${r.version}</h3>
            ${r.is_active ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ga-sev-green text-xs font-medium" style="border: 1px solid var(--ga-green-border);"><span class="w-1.5 h-1.5 rounded-full ga-sev-green-dot"></span>Active</span>' : ''}
          </div>
          <p class="mt-1 text-xs ga-text-muted">${escapeHtml(r.created_at)}${r.created_by ? ' · ' + escapeHtml(r.created_by) : ''}</p>
          <p class="mt-2 text-sm ga-text">${escapeHtml(r.description)}</p>
        </div>
        ${r.is_active
          ? ''
          : `<form method="post" action="/rules/${encodeURIComponent(ruleKey)}/revert" class="shrink-0">
              <input type="hidden" name="version" value="${r.version}">
              <button type="submit" class="ga-btn ga-btn-secondary">Restore this version</button>
            </form>`}
      </div>
    </li>`)
      .join('')}
  </ul>
</section>`;
}
