import pino from 'pino';

// PHI keys that MUST NOT appear in any log entry (constitution P2).
// The scrubPhi walker below redacts these at every nesting depth.
const PHI_KEYS = new Set(['description', 'summary', 'reason', 'individual_name', 'note_text']);

export function scrubPhi(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(scrubPhi);
  if (typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    result[key] = PHI_KEYS.has(key) ? '[REDACTED]' : scrubPhi(v);
  }
  return result;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    log: (obj) => scrubPhi(obj) as Record<string, unknown>,
  },
});

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(scrubPhi(bindings) as Record<string, unknown>);
}
