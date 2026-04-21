import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../../src/config.ts';

test('config throws when OPENROUTER_API_KEY is missing', () => {
  assert.throws(() => loadConfig({}), /OPENROUTER_API_KEY/);
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
