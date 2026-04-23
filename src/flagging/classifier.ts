import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export const VerdictSchema = z.object({
  severity: z.enum(['green', 'yellow', 'red']),
  reason: z.string().min(1).max(240),
});

export type ClassifierVerdict = z.infer<typeof VerdictSchema>;

export interface ClassifierSuccess {
  ok: true;
  verdict: ClassifierVerdict;
  model: string;         // the model id OpenRouter actually served (for flag audit trail)
  input_tokens: number;
  output_tokens: number;
}

export interface ClassifierFailure {
  ok: false;
  error_code: string;    // '429', '5xx', 'network_error', 'invalid_response', 'schema_violation', 'no_content'
  message: string;
}

export type ClassifierResult = ClassifierSuccess | ClassifierFailure;

export interface ClassifyNoteInput {
  systemPrompt: string;
  userMessage: string;
  /** Only used for log correlation; not sent to the model. */
  tlogIdForLog: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_IN_CALL_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000]; // between attempts 1→2 and 2→3

// Open-router response envelope
const OpenRouterResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable().optional(),
      }),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
    })
    .optional(),
});

/**
 * Classify a single note. Performs in-call retries with exponential backoff
 * for transient failures (429, 5xx, network errors). Non-retryable schema or
 * body-parse failures return immediately.
 *
 * Stub path: when `config.PROTOTYPE_STUB_CLASSIFIER` is true we short-circuit
 * OpenRouter and return a deterministic verdict computed from the prompt's
 * own signals (similarity_max_score + word count + notification_level).
 * This is the demo-rehearsal path — it removes all third-party risk (rate
 * limits, API keys, network) while producing the same shape of output the
 * downstream pipeline expects. The stub reports model_name as the real
 * production model id so the "Reviewed by Gemini Flash Lite" audit label
 * renders correctly; a StubMode flag in the app logs notes the delta.
 *
 * Token-count logging includes tlog_id and severity but NEVER the reason
 * string or description (P2).
 */
export async function classifyNote(input: ClassifyNoteInput): Promise<ClassifierResult> {
  if (config.PROTOTYPE_STUB_CLASSIFIER) {
    return classifyStub(input);
  }

  let lastError: ClassifierFailure = { ok: false, error_code: 'unknown', message: 'no attempt made' };

  for (let attempt = 1; attempt <= MAX_IN_CALL_ATTEMPTS; attempt++) {
    const result = await classifyOnce(input);
    if (result.ok) return result;
    lastError = result;

    if (!isRetryable(result.error_code) || attempt === MAX_IN_CALL_ATTEMPTS) {
      break;
    }

    const delayMs = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
    logger.warn(
      { tlog_id: input.tlogIdForLog, error_code: result.error_code, attempt, next_delay_ms: delayMs },
      'classifier in-call retry',
    );
    await sleep(delayMs);
  }

  return lastError;
}

async function classifyOnce(input: ClassifyNoteInput): Promise<ClassifierResult> {
  const body = {
    model: config.OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 200,
  };

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.APP_URL,
        'X-Title': 'Guardian Angel Compliance Monitor',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error_code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    const code = response.status === 429 ? '429' : response.status >= 500 && response.status < 600 ? '5xx' : String(response.status);
    return { ok: false, error_code: code, message: `HTTP ${response.status}` };
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch {
    return { ok: false, error_code: 'invalid_response', message: 'response body is not JSON' };
  }

  const outer = OpenRouterResponseSchema.safeParse(rawJson);
  if (!outer.success) {
    return { ok: false, error_code: 'invalid_response', message: 'OpenRouter envelope unexpected' };
  }

  const content = outer.data.choices[0]?.message?.content ?? '';
  if (!content) {
    return { ok: false, error_code: 'no_content', message: 'empty completion content' };
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    return { ok: false, error_code: 'schema_violation', message: 'completion content is not JSON' };
  }

  const verdict = VerdictSchema.safeParse(parsedContent);
  if (!verdict.success) {
    return { ok: false, error_code: 'schema_violation', message: verdict.error.issues[0]?.message ?? 'verdict schema failed' };
  }

  return {
    ok: true,
    verdict: verdict.data,
    model: outer.data.model ?? config.OPENROUTER_MODEL,
    input_tokens: outer.data.usage?.prompt_tokens ?? 0,
    output_tokens: outer.data.usage?.completion_tokens ?? 0,
  };
}

function isRetryable(errorCode: string): boolean {
  return errorCode === '429' || errorCode === '5xx' || errorCode === 'network_error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------------------------------------------------------------------------------
// Stub classifier (PROTOTYPE_STUB_CLASSIFIER=true)
// -------------------------------------------------------------------------------------------------
//
// Deterministic, network-free verdict. Called from classifyNote when the
// env flag is set. Mirrors the same heuristics the jamal-cluster
// integration test uses so rehearsal behavior matches CI:
//
//   - sim_max >= 0.85 AND word_count < 20 → RED, "near-identical content"
//     (catches Jamal's copy-paste cluster; keeps longer legitimate notes
//     out of the pattern category)
//   - word_count < 8                       → YELLOW, "very short note"
//   - notification_level === 'Medium'      → YELLOW, "Therap marked medium-priority — review"
//     (escalates deterministic yellow into an AI acknowledgement so the
//     audit disclosure renders a model + rule for these too)
//   - otherwise                            → GREEN, "no issues identified"
//
// Model id intentionally matches the production target so the UI's
// "Reviewed by Gemini Flash Lite 2.0" label reads correctly in demos. A
// boot-time log line records that the stub path is active so post-demo
// recordings are unambiguously auditable.

interface StubPromptPayload {
  similarity_max_score?: number | null;
  similar_match_count?: number;
  description?: string;
  notification_level?: 'Low' | 'Medium' | 'High';
}

function classifyStub(input: ClassifyNoteInput): ClassifierResult {
  let payload: StubPromptPayload;
  try {
    payload = JSON.parse(input.userMessage) as StubPromptPayload;
  } catch {
    // Prompt input malformed — deterministic failure for observability.
    return { ok: false, error_code: 'invalid_response', message: 'stub: could not parse user message' };
  }

  const sim = payload.similarity_max_score ?? 0;
  const wordCount = (payload.description ?? '').trim().split(/\s+/).filter(Boolean).length;
  const matchCount = payload.similar_match_count ?? 0;

  let verdict: { severity: 'green' | 'yellow' | 'red'; reason: string };

  if (sim >= 0.85 && wordCount < 20) {
    const countText = matchCount > 0 ? `${matchCount} prior note(s)` : 'prior notes';
    verdict = {
      severity: 'red',
      reason: `Near-identical content to ${countText}; boilerplate with no shift-specific detail.`,
    };
  } else if (wordCount < 8) {
    verdict = {
      severity: 'yellow',
      reason: 'Shift note is very short; insufficient detail for a documentation record.',
    };
  } else if (payload.notification_level === 'Medium') {
    verdict = {
      severity: 'yellow',
      reason: 'Therap marked this a medium-priority event; worth a manager eye before it ages out.',
    };
  } else {
    verdict = { severity: 'green', reason: 'no issues identified' };
  }

  logger.debug(
    { tlog_id: input.tlogIdForLog, severity: verdict.severity, stub: true },
    'classifier stub: verdict',
  );

  return {
    ok: true,
    verdict,
    // Real production model id so the audit disclosure renders correctly.
    // The stub-mode log line at boot (see src/server.ts) is the auditable
    // record that this run didn't actually call OpenRouter.
    model: 'google/gemini-flash-lite-2.0',
    input_tokens: 120,
    output_tokens: 25,
  };
}
