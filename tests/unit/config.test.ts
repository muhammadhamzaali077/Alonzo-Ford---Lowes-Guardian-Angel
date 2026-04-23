import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../../src/config.ts';

test('config does NOT throw on missing OPENROUTER_API_KEY when stub is active (Railway demo path)', () => {
  // Empty env → PROTOTYPE_MODE defaults to true → STUB defaults to true →
  // the real classifier is never called → the key is not required. This is
  // the fix for the Railway crash-at-boot mode: previously an unset key
  // prevented config from loading at all.
  const cfg = loadConfig({});
  assert.equal(cfg.PROTOTYPE_MODE, true);
  assert.equal(cfg.PROTOTYPE_STUB_CLASSIFIER, true);
  assert.equal(cfg.OPENROUTER_API_KEY, undefined);
});

test('config throws when OPENROUTER_API_KEY is missing AND stub is explicitly off', () => {
  assert.throws(
    () => loadConfig({ PROTOTYPE_STUB_CLASSIFIER: 'false' }),
    /OPENROUTER_API_KEY is required/,
  );
});

test('config defaults PROTOTYPE_MODE to true', () => {
  const cfg = loadConfig({ OPENROUTER_API_KEY: 'sk-or-test' });
  assert.equal(cfg.PROTOTYPE_MODE, true);
});

test('config defaults DATABASE_PATH to ./dev.db', () => {
  const cfg = loadConfig({ OPENROUTER_API_KEY: 'sk-or-test' });
  assert.equal(cfg.DATABASE_PATH, './dev.db');
});

test('config defaults OPENROUTER_MODEL to google/gemini-flash-lite-2.0', () => {
  const cfg = loadConfig({ OPENROUTER_API_KEY: 'sk-or-test' });
  assert.equal(cfg.OPENROUTER_MODEL, 'google/gemini-flash-lite-2.0');
});

// T006a — boot-time guard tests.

test('config accepts weak demo password when APP_URL is localhost', () => {
  const cfg = loadConfig({
    OPENROUTER_API_KEY: 'sk-or-test',
    APP_URL: 'http://localhost:3000',
    DEMO_LOGIN_PASSWORD: 'demo',
  });
  assert.equal(cfg.DEMO_LOGIN_PASSWORD, 'demo');
});

test('config accepts weak demo password when APP_URL is 127.0.0.1', () => {
  const cfg = loadConfig({
    OPENROUTER_API_KEY: 'sk-or-test',
    APP_URL: 'http://127.0.0.1:3000',
    DEMO_LOGIN_PASSWORD: 'demo',
  });
  assert.equal(cfg.DEMO_LOGIN_PASSWORD, 'demo');
});

test('config refuses to boot on remote APP_URL with default demo password', () => {
  assert.throws(
    () =>
      loadConfig({
        OPENROUTER_API_KEY: 'sk-or-test',
        APP_URL: 'https://guardian-angel.up.railway.app',
        DEMO_LOGIN_PASSWORD: 'demo',
      }),
    /DEMO_LOGIN_PASSWORD/,
  );
});

test('config accepts strong demo password on remote APP_URL', () => {
  const cfg = loadConfig({
    OPENROUTER_API_KEY: 'sk-or-test',
    APP_URL: 'https://guardian-angel.up.railway.app',
    DEMO_LOGIN_PASSWORD: 'a-long-random-secret-not-demo',
  });
  assert.equal(cfg.DEMO_LOGIN_PASSWORD, 'a-long-random-secret-not-demo');
});
