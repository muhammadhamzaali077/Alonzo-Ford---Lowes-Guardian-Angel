// Config guard — the google-oauth module reads config.APP_URL at runtime via
// redirectUriFromConfig(). Ensure the lazy config proxy resolves before the
// first test runs.
process.env.OPENROUTER_API_KEY ??= 'sk-or-test';
process.env.APP_URL ??= 'http://localhost:3000';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLOWED_HD,
  buildAuthUrl,
  exchangeCodeForTokens,
  generateState,
  redirectUriFromConfig,
  verifyIdToken,
} from '../../src/auth/google-oauth.ts';

// -------------------------------------------------------------------------------------------------
// buildAuthUrl
// -------------------------------------------------------------------------------------------------

test('buildAuthUrl pins hd to lowesguardianangel.com', () => {
  const url = buildAuthUrl({
    clientId: 'test-client.apps.googleusercontent.com',
    redirectUri: 'http://localhost:3000/auth/google/callback',
    state: 'abc123',
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(parsed.searchParams.get('hd'), ALLOWED_HD);
  assert.equal(parsed.searchParams.get('hd'), 'lowesguardianangel.com');
  assert.equal(parsed.searchParams.get('client_id'), 'test-client.apps.googleusercontent.com');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/google/callback');
  assert.equal(parsed.searchParams.get('state'), 'abc123');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.match(parsed.searchParams.get('scope') ?? '', /\bopenid\b/);
  assert.match(parsed.searchParams.get('scope') ?? '', /\bemail\b/);
});

test('generateState returns 64-char hex (32 bytes)', () => {
  const s = generateState();
  assert.match(s, /^[0-9a-f]{64}$/);
  // Two successive calls produce different values
  assert.notEqual(s, generateState());
});

test('redirectUriFromConfig derives from APP_URL and trims trailing slash', () => {
  const uri = redirectUriFromConfig();
  assert.equal(uri, 'http://localhost:3000/auth/google/callback');
});

// -------------------------------------------------------------------------------------------------
// verifyIdToken outcomes
// -------------------------------------------------------------------------------------------------

interface FakeFetchCall {
  url: string;
  init?: RequestInit;
}

function makeFetch(
  responder: (url: string) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>,
): { fn: typeof fetch; calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const { status = 200, body } = await responder(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('verifyIdToken: happy path returns identity', async () => {
  const { fn } = makeFetch(() => ({
    status: 200,
    body: {
      sub: '100123',
      email: 'Vivian@LowesGuardianAngel.com',
      email_verified: 'true',
      name: 'Vivian Daniels',
      hd: 'lowesguardianangel.com',
      aud: 'test-client.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
    },
  }));
  const outcome = await verifyIdToken('fake.id.token', 'test-client.apps.googleusercontent.com', fn);
  assert.ok(outcome.ok);
  if (outcome.ok) {
    assert.equal(outcome.identity.email, 'vivian@lowesguardianangel.com'); // lowercased
    assert.equal(outcome.identity.hd, 'lowesguardianangel.com');
    assert.equal(outcome.identity.name, 'Vivian Daniels');
  }
});

test('verifyIdToken: hd_mismatch rejects wrong domain', async () => {
  const { fn } = makeFetch(() => ({
    status: 200,
    body: {
      sub: '100123',
      email: 'outsider@example.com',
      email_verified: true,
      hd: 'example.com',
      aud: 'test-client',
    },
  }));
  const outcome = await verifyIdToken('fake.id.token', 'test-client', fn);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'hd_mismatch');
});

test('verifyIdToken: hd_missing when claim absent (personal gmail)', async () => {
  const { fn } = makeFetch(() => ({
    status: 200,
    body: {
      sub: '100123',
      email: 'someone@gmail.com',
      email_verified: true,
      aud: 'test-client',
      // no hd
    },
  }));
  const outcome = await verifyIdToken('fake.id.token', 'test-client', fn);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'hd_missing');
});

test('verifyIdToken: aud mismatch rejects token for a different client', async () => {
  const { fn } = makeFetch(() => ({
    status: 200,
    body: {
      sub: '100123',
      email: 'vivian@lowesguardianangel.com',
      email_verified: true,
      hd: 'lowesguardianangel.com',
      aud: 'other-client-id',
    },
  }));
  const outcome = await verifyIdToken('fake.id.token', 'test-client', fn);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'token_invalid');
});

test('verifyIdToken: email_unverified rejects Google accounts with unverified email', async () => {
  const { fn } = makeFetch(() => ({
    status: 200,
    body: {
      sub: '100123',
      email: 'vivian@lowesguardianangel.com',
      email_verified: false,
      hd: 'lowesguardianangel.com',
      aud: 'test-client',
    },
  }));
  const outcome = await verifyIdToken('fake.id.token', 'test-client', fn);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'email_unverified');
});

test('verifyIdToken: non-2xx tokeninfo response is token_invalid', async () => {
  const { fn } = makeFetch(() => ({ status: 400, body: { error: 'invalid_token' } }));
  const outcome = await verifyIdToken('fake.id.token', 'test-client', fn);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'token_invalid');
});

// -------------------------------------------------------------------------------------------------
// exchangeCodeForTokens
// -------------------------------------------------------------------------------------------------

test('exchangeCodeForTokens: posts form body and returns id_token', async () => {
  const { fn, calls } = makeFetch(() => ({
    status: 200,
    body: { id_token: 'header.payload.sig', access_token: 'at', expires_in: 3600, token_type: 'Bearer' },
  }));
  const tokens = await exchangeCodeForTokens({
    code: 'auth-code-xyz',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:3000/auth/google/callback',
    fetchImpl: fn,
  });
  assert.equal(tokens.id_token, 'header.payload.sig');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://oauth2.googleapis.com/token');
  const body = String(calls[0]!.init?.body ?? '');
  assert.match(body, /code=auth-code-xyz/);
  assert.match(body, /client_id=client-id/);
  assert.match(body, /client_secret=client-secret/);
  assert.match(body, /grant_type=authorization_code/);
});

test('exchangeCodeForTokens: non-2xx throws with status in message', async () => {
  const { fn } = makeFetch(() => ({ status: 401, body: { error: 'invalid_grant' } }));
  await assert.rejects(
    exchangeCodeForTokens({
      code: 'expired',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      fetchImpl: fn,
    }),
    /HTTP 401/,
  );
});

test('exchangeCodeForTokens: missing id_token throws', async () => {
  const { fn } = makeFetch(() => ({ status: 200, body: { access_token: 'only-access' } }));
  await assert.rejects(
    exchangeCodeForTokens({
      code: 'c',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      fetchImpl: fn,
    }),
    /missing id_token/,
  );
});
