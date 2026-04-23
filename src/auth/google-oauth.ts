// Real Google OAuth flow for LGA Workspace sign-in.
//
// Per T092: only provision-aware sign-in for `lowesguardianangel.com`. The
// `hd` claim on Google's ID token is verified server-side; missing or
// non-matching `hd` rejects the login. Unknown emails (hd matches but no
// row in our `users` table) are also rejected — provisioning is manual via
// the seed script / Settings, not open self-signup.
//
// This module deliberately does NOT bring in Better Auth. The hand-rolled
// session machinery in `session.ts` is already tested and load-bearing;
// a Better Auth migration is a separate, larger piece of work tracked in
// plan.md and .env.example's post-prototype TODO list.
//
// ID token verification uses Google's tokeninfo endpoint, which performs
// signature + expiry + audience validation server-side on Google's
// infrastructure. A future hardening step is to move to local JWKS
// verification to avoid the extra HTTP hop on every login.

import { randomBytes } from 'node:crypto';
import { config } from '../config.js';

export const ALLOWED_HD = 'lowesguardianangel.com';
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

export interface OAuthStateCookie {
  state: string;
  next: string;
}

export interface GoogleTokenResponse {
  id_token: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  hd: string | null;
}

export type VerifyOutcome =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: 'hd_missing' | 'hd_mismatch' | 'email_unverified' | 'token_invalid'; detail?: string };

/** Random 32-byte hex for CSRF state. */
export function generateState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Build the Google authorize URL the user will be redirected to. Requests
 * the `openid email profile` scopes and pins `hd` so Google's consent UI
 * only offers Workspace accounts on the right domain (the server still
 * re-verifies `hd` on the returned ID token — client-side `hd` is a hint,
 * not a guarantee).
 */
export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: opts.state,
    hd: ALLOWED_HD,
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

/** Build `${APP_URL}/auth/google/callback` — the redirect URI we register with Google. */
export function redirectUriFromConfig(): string {
  const base = config.APP_URL.replace(/\/+$/, '');
  return `${base}/auth/google/callback`;
}

/**
 * Exchange an authorization code for a Google token response. Throws on
 * network errors or non-2xx responses — callers redirect to /auth/login
 * with an error when this fails.
 */
export async function exchangeCodeForTokens(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code',
  });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google token exchange failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  const json = (await response.json()) as GoogleTokenResponse;
  if (!json.id_token) {
    throw new Error('Google token response missing id_token');
  }
  return json;
}

interface TokenInfoRaw {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  hd?: string;
  aud?: string;
  iss?: string;
  exp?: string | number;
}

/**
 * Verify an ID token via Google's tokeninfo endpoint. Google performs
 * signature + expiry + issuer checks; we additionally enforce:
 *   - `aud` matches our client_id
 *   - `email_verified` is true
 *   - `hd` === ALLOWED_HD (the compliance-critical check)
 *
 * Returns a discriminated-union outcome so callers can redirect to the
 * login page with a specific error code.
 */
export async function verifyIdToken(
  idToken: string,
  expectedClientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  } catch (err) {
    return { ok: false, reason: 'token_invalid', detail: `network: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!response.ok) {
    return { ok: false, reason: 'token_invalid', detail: `tokeninfo HTTP ${response.status}` };
  }
  let raw: TokenInfoRaw;
  try {
    raw = (await response.json()) as TokenInfoRaw;
  } catch {
    return { ok: false, reason: 'token_invalid', detail: 'tokeninfo body not JSON' };
  }

  if (raw.aud !== expectedClientId) {
    return { ok: false, reason: 'token_invalid', detail: 'aud mismatch' };
  }
  if (!raw.sub || !raw.email) {
    return { ok: false, reason: 'token_invalid', detail: 'missing sub/email' };
  }
  const emailVerified = raw.email_verified === true || raw.email_verified === 'true';
  if (!emailVerified) {
    return { ok: false, reason: 'email_unverified' };
  }
  if (!raw.hd) {
    return { ok: false, reason: 'hd_missing' };
  }
  if (raw.hd !== ALLOWED_HD) {
    return { ok: false, reason: 'hd_mismatch', detail: raw.hd };
  }

  return {
    ok: true,
    identity: {
      sub: raw.sub,
      email: raw.email.toLowerCase(),
      email_verified: true,
      name: raw.name ?? null,
      hd: raw.hd,
    },
  };
}
