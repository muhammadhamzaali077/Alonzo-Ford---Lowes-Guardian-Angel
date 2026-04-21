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
 * Token-count logging includes tlog_id and severity but NEVER the reason
 * string or description (P2).
 */
export async function classifyNote(input: ClassifyNoteInput): Promise<ClassifierResult> {
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
