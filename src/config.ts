import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_PATH: z.string().default('./dev.db'),
  // Only required when PROTOTYPE_STUB_CLASSIFIER=false (the real classifier
  // path). In stub mode the AI pass never touches OpenRouter, so requiring
  // this key at config-load would block deploys that are intentionally
  // stub-only (e.g. Railway demo instances). Checked for presence in
  // loadConfig() after the stub-mode default resolves.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('google/gemini-flash-lite-2.0'),
  BETTER_AUTH_SECRET: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  PROTOTYPE_MODE: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  /**
   * Bypass OpenRouter entirely. When true, `classifyNote()` returns a
   * deterministic in-process verdict based on the prompt signals (similarity
   * score + word count + notification level). Used for demo rehearsal and
   * offline CI so the AI path is reproducible across reseeds and scenario
   * switches. Defaults to match PROTOTYPE_MODE so prototype instances are
   * stub-by-default; set explicitly to 'false' to use the real classifier
   * once a paid OpenRouter model is wired up. See loadConfig() below for the
   * resolve-after-parse logic.
   */
  PROTOTYPE_STUB_CLASSIFIER: z
    .string()
    .optional()
    .transform((v) => (v == null ? undefined : v.toLowerCase() === 'true')),
  DEMO_LOGIN_EMAIL: z.string().email().default('demo@lowesguardianangel.com'),
  DEMO_LOGIN_PASSWORD: z.string().default('demo'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => Number.parseInt(v, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  THERAP_SFTP_HOST: z.string().optional(),
  THERAP_SFTP_USER: z.string().optional(),
  THERAP_SFTP_PRIVATE_KEY_PATH: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  // Stub-classifier defaults to PROTOTYPE_MODE when unset. This keeps the
  // demo + dev experience reproducible (no external API dependency) while
  // allowing a deliberate opt-out for paid-model testing.
  if (parsed.PROTOTYPE_STUB_CLASSIFIER === undefined) {
    parsed.PROTOTYPE_STUB_CLASSIFIER = parsed.PROTOTYPE_MODE;
  }
  // When the real classifier is in play, OPENROUTER_API_KEY becomes mandatory.
  // Stub mode doesn't touch OpenRouter so we leave the key unset there.
  if (!parsed.PROTOTYPE_STUB_CLASSIFIER && !parsed.OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is required when PROTOTYPE_STUB_CLASSIFIER=false. ' +
      'Either set the key (https://openrouter.ai/keys) or leave PROTOTYPE_STUB_CLASSIFIER unset/true.',
    );
  }
  assertDemoPasswordSafety(parsed);
  return parsed;
}

function assertDemoPasswordSafety(cfg: Config): void {
  const isLocalhost =
    cfg.APP_URL.startsWith('http://localhost') || cfg.APP_URL.startsWith('http://127.0.0.1');
  if (!isLocalhost && cfg.DEMO_LOGIN_PASSWORD === 'demo') {
    throw new Error(
      'Refusing to boot: DEMO_LOGIN_PASSWORD is still the default "demo" but APP_URL ' +
        `("${cfg.APP_URL}") points to a non-local host. Seeded PHI-shaped synthetic data ` +
        'lives behind the demo login — set a strong DEMO_LOGIN_PASSWORD env var before deploying.',
    );
  }
}

let cached: Config | undefined;
export function getConfig(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

// Convenience proxy so `config.X` continues to read as a plain object at call sites.
// Resolves lazily on first property access — does NOT run at module load, so tests
// can import { loadConfig } without tripping required-env validation.
export const config: Config = new Proxy({} as Config, {
  get(_t, p) {
    return getConfig()[p as keyof Config];
  },
  has(_t, p) {
    return p in getConfig();
  },
  ownKeys() {
    return Reflect.ownKeys(getConfig() as object);
  },
  getOwnPropertyDescriptor(_t, p) {
    return Object.getOwnPropertyDescriptor(getConfig(), p);
  },
});
