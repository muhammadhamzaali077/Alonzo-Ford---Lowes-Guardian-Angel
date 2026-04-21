// Default seed rules shipped with the app. Plain TypeScript export on purpose —
// PR-reviewable, searchable, no JSON/YAML/DB migration needed to tune the wording.
//
// Each rule's `config_json` holds knobs that Elaina can edit from the Rules
// screen. The `prompt_template` is the instruction the AI classifier sees.
//
// The DEFAULT_RULES set is intentionally narrow: five rules that cover the
// demo narrative (copy-paste cluster, vague filler, short notes, medication,
// incident language). Additional rules can be added here or created at runtime
// through the admin screen.

export interface DefaultRule {
  rule_key: string;
  name: string;
  description: string;
  prompt_template: string;
  config_json: Record<string, unknown>;
}

export const DEFAULT_RULES: readonly DefaultRule[] = [
  {
    rule_key: 'copy_paste',
    name: 'Copy-paste notes',
    description:
      "Flag notes that look like they were copied from the same person's earlier notes, especially when the content doesn't describe anything specific to the current shift.",
    prompt_template: [
      'You are given a `similarity_max_score` (0.0 – 1.0) measuring token-set overlap against the SAME author\'s recent 20 notes.',
      'If similarity_max_score >= `config.similarity_threshold` (default 0.85) AND the note lacks shift-specific observations,',
      'flag RED with reasoning that cites the specific count of near-identical prior notes (from `similar_match_count`).',
      'If similarity is high but the note contains a concrete new observation about the individual (e.g., named activity, named medication, named visitor, specific time), flag YELLOW instead.',
    ].join(' '),
    config_json: {
      similarity_threshold: 0.85,
      window_size: 20,
    },
  },
  {
    rule_key: 'short_note',
    name: 'Short notes',
    description:
      'Flag notes that are too short to describe a full shift. Residential shifts (group home, host home) are expected to have more detail than day-program shifts.',
    prompt_template: [
      'Count words in `description` (whitespace-separated).',
      'If the shift took place at a residential location (type = group_home or host_home) and the word count is below `config.residential_min_words` (default 20), flag YELLOW.',
      'If the shift took place at a day program (type = day_program) and the word count is below `config.day_program_min_words` (default 15), flag YELLOW.',
      'If the note is extremely short (< 5 words total), flag RED regardless of shift type.',
    ].join(' '),
    config_json: {
      residential_min_words: 20,
      day_program_min_words: 15,
    },
  },
  {
    rule_key: 'vague_content',
    name: 'Vague content',
    description:
      "Flag notes that consist mostly of filler phrases (\"same as yesterday\", \"no issues\", \"uneventful\") without any concrete observation about the individual.",
    prompt_template: [
      'Filler phrases to watch for (case-insensitive): "same as yesterday", "same as usual", "nothing to report", "no issues", "uneventful", "routine", "all good", "fine today".',
      'If >50% of the note is filler phrases and there is no concrete observation (named activity, named meal, vital sign, behavior event, medication administered, contact with family), flag RED.',
      'If filler phrases dominate but there is one concrete detail, flag YELLOW.',
    ].join(' '),
    config_json: {},
  },
  {
    rule_key: 'medication_refusal',
    name: 'Medication issues',
    description:
      "Flag notes that describe medication problems — refusal, missed dose, medication error, or adverse effect — that aren't already marked High priority in Therap.",
    prompt_template: [
      'Medication-issue keywords (case-insensitive): "refused meds", "refused medication", "missed dose", "medication error", "med error", "late med", "late meds", "adverse reaction", "wrong dose", "spit out", "threw up after meds".',
      'If the note mentions any medication-issue keyword AND `notification_level` is not "High", flag RED.',
      'Reason should name the specific medication issue from the note.',
    ].join(' '),
    config_json: {},
  },
  {
    rule_key: 'incident_language',
    name: 'Incident-sounding notes without a high-priority tag',
    description:
      "Flag notes with serious-incident language (injury, choking, aggression, self-injurious behavior, emergency, ambulance) that aren't already marked High priority.",
    prompt_template: [
      'Incident keywords (case-insensitive): "choking", "choked", "injured", "injury", "bleeding", "fell", "fall", "hit head", "aggressive", "aggression", "hitting", "SIB", "self-injurious", "ambulance", "ER", "emergency room", "911", "police", "restraint", "seizure", "GER".',
      'If the note contains any incident keyword AND `notification_level` is not "High", flag RED.',
      'Reason should name the specific incident language used.',
    ].join(' '),
    config_json: {},
  },
];
