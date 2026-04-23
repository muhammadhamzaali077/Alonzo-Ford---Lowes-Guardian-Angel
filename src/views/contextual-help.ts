// T122 — inline contextual help.
//
// Per-screen "What am I looking at?" <details> disclosure. Collapsed by
// default so it doesn't crowd the page; expanded, it explains the screen in
// plain English using LGA's vocabulary (angel, T-Log, location, DSP —
// never classifier, pipeline, notification_level, JSON, etc.).
//
// Copy is intentionally short. The goal is "quick reorient for a returning
// user" — not a tutorial. Long-form onboarding would go in a separate guide.

export type HelpKey =
  | 'dashboard'
  | 'location'
  | 'angel'
  | 'individual'
  | 'note'
  | 'rules'
  | 'rule-edit'
  | 'digest'
  | 'upload'
  | 'settings';

interface HelpEntry {
  title: string;
  /** Paragraphs — each rendered as its own <p>. */
  paragraphs: string[];
}

const HELP: Record<HelpKey, HelpEntry> = {
  dashboard: {
    title: 'What am I looking at?',
    paragraphs: [
      'This is your compliance snapshot. Four tiles at the top show the week\'s red flags, yellow flags, missing notes, and overall compliance percentage — with the change vs. last week.',
      'Below that, every location is listed with a severity pill. Red means at least one urgent issue; yellow means something to review; green means everything looks clean. Click any location to drill into the angels who work there.',
      'The trend chart at the bottom compares compliance across locations over the selected period. Hover any point to see the date and percentage; click to open that location.',
    ],
  },
  location: {
    title: 'How this page works',
    paragraphs: [
      'Every angel assigned to this location is listed with their own severity pill and flag counts. Tap an angel to see the individuals they\'ve written notes for.',
      'The "Missing notes" section at the bottom shows shifts where no note was submitted. These don\'t have an angel attached — they\'re detected from the shift schedule.',
    ],
  },
  angel: {
    title: 'How this page works',
    paragraphs: [
      'Every individual this angel has written notes for in the current period is listed here, with flag counts from notes they wrote about that person. Tap an individual to see the specific flagged notes.',
    ],
  },
  individual: {
    title: 'How this page works',
    paragraphs: [
      'These are the flagged notes for this individual, written by this angel, in the current period. Each card shows why it was flagged and what the rule was. Click any flag to open the full note.',
    ],
  },
  note: {
    title: 'How this page works',
    paragraphs: [
      'The full original note text is at the top — exactly as the angel wrote it, never edited. Structured fields (date, shift, individual, location) are below.',
      'Every flag is shown as a card with a severity pill, a source badge, and the reason it fired. Expand "How was this flagged?" for the full audit trail — which rule version fired, which model reviewed it, and when.',
    ],
  },
  rules: {
    title: 'How rules work',
    paragraphs: [
      'Rules decide what counts as a red or yellow flag. You can edit thresholds, wording, and the detailed instructions the system uses for borderline cases.',
      'After you edit a rule, click "Save & update flags now" to re-check recent notes against the new rule. Older versions are kept — you can restore a prior version at any time.',
    ],
  },
  'rule-edit': {
    title: 'Tips for editing this rule',
    paragraphs: [
      'Start with the plain-English description and the numeric threshold. The Advanced section contains the detailed instructions the system uses on borderline cases — most people never need to change those.',
      'The "At this setting" preview updates as you drag the slider. It tells you how many notes this rule would have flagged in the last 30 days at the current threshold. Use it to tune without running a full re-check first.',
    ],
  },
  digest: {
    title: 'How the weekly email works',
    paragraphs: [
      'Every Monday at 8am ET, each recipient gets one email summarizing the prior week\'s red and yellow flags for the locations they have visibility into. This page shows exactly what would be sent.',
      'In preview mode no email actually goes out — this is for sanity-checking what recipients see. The real send runs on a cron schedule.',
    ],
  },
  upload: {
    title: 'About uploads',
    paragraphs: [
      'Drop a Therap export (Excel or CSV) here to ingest the notes into Guardian Angel. Each row becomes one note. Rows that can\'t be parsed (unknown individual, missing required field) are skipped with a reason — the rest succeed.',
      'Uploading the same file twice is safe: identical rows are ignored, and rows with edited content supersede the prior version without losing history.',
    ],
  },
  settings: {
    title: 'How Settings works',
    paragraphs: [
      'Everything here is org configuration: who the locations, angels, individuals, and managers are; who receives the weekly email; which shifts are scheduled where.',
      'Deletes are soft — removed entries are marked inactive, not erased, so the notes written by a deactivated angel still open cleanly on the dashboard.',
    ],
  },
};

/**
 * Render a contextual help <details> block. Pass one of the HelpKey values;
 * returns a collapsed disclosure ready to drop into a view.
 */
export function contextualHelp(key: HelpKey): string {
  const entry = HELP[key];
  if (!entry) return '';
  const paragraphs = entry.paragraphs
    .map((p) => `<p class="text-sm ga-text leading-6">${escapeText(p)}</p>`)
    .join('');
  return `<details class="mt-4 rounded-md border border-gray-200 bg-white">
  <summary class="flex items-center justify-between gap-3 cursor-pointer select-none px-5 py-3 min-h-[44px] text-sm ga-text hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded-md">
    <span class="inline-flex items-center gap-2">
      <svg class="w-4 h-4 ga-text-subtle" fill="none" viewBox="0 0 20 20" stroke="currentColor" aria-hidden="true">
        <circle cx="10" cy="10" r="8" stroke-width="1.5"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 14v-3m0-3.5h.01"/>
      </svg>
      <span class="font-medium ga-text-strong">${escapeText(entry.title)}</span>
    </span>
    <span class="text-xs ga-text-muted">Click to expand</span>
  </summary>
  <div class="px-5 pb-5 pt-1 space-y-2">
    ${paragraphs}
  </div>
</details>`;
}

// Small local escape (can't import from layout.ts without a cycle risk;
// this file stays leaf-level).
function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
