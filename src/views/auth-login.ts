// /auth/login page — centered card, app name, demo-login form, optional
// Google button. Per UI/UX decision: no marketing copy, no tagline.
//
// In prototype mode, both email AND password are pre-filled so demos are
// one-click (decision #7d). The boot-time guard in config.ts ensures this
// pre-fill never reaches a public deployment with default creds.

import { config } from '../config.js';
import { escapeHtml } from './layout.js';
import { DESIGN_TOKENS_STYLE } from './design-tokens-css.js';

export type LoginErrorCode =
  | 'invalid_credentials'
  | 'google_hd_rejected'
  | 'google_unprovisioned'
  | 'google_failed';

export interface AuthLoginViewOptions {
  googleEnabled: boolean;
  error?: LoginErrorCode | null;
  prefillEmail: string;
  prefillPassword: string;
}

export function renderLoginPage(opts: AuthLoginViewOptions): string {
  const errorBanner = opts.error ? renderError(opts.error) : '';
  const googleButton = opts.googleEnabled
    ? `<a href="/auth/google/start" class="ga-btn ga-btn-secondary mt-3 w-full">Sign in with Google</a>`
    : '';

  // Suggested emails as datalist — lets the demo presenter pick a manager
  // without typing the full address.
  const suggestions = [
    'demo@lowesguardianangel.com',
    'alonzo@lowesguardianangel.com',
    'elaina@lowesguardianangel.com',
    'adrian@lowesguardianangel.com',
    'vivian@lowesguardianangel.com',
    'marcus@lowesguardianangel.com',
    'anthony@lowesguardianangel.com',
    'elena@lowesguardianangel.com',
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in · Lowe's Guardian Angel</title>
  <meta name="theme-color" content="#0a1532">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <script src="https://cdn.tailwindcss.com"></script>
  ${DESIGN_TOKENS_STYLE}
</head>
<body class="min-h-screen ga-bg ga-text antialiased flex items-center justify-center p-4">
  <main class="w-full max-w-sm">
    <div class="flex items-center justify-center mb-6">
      <img src="/assets/lga-logo.png" alt="Lowe's Guardian Angel" height="56" style="height: 56px; width: auto; display: block;">
    </div>
    <div class="ga-surface ga-shadow-md p-7"
         style="border: 1px solid var(--ga-border); border-radius: var(--ga-radius-md);">
      <h1 class="ga-h2 text-center">Sign in</h1>
      <p class="ga-caption text-center mt-1">Compliance Monitor</p>

      ${errorBanner}

      <form method="post" action="/auth/login/demo" class="mt-6 space-y-4">
        <div>
          <label for="login-email" class="block text-sm font-semibold ga-text-strong mb-1">Email</label>
          <input id="login-email" name="email" type="email" required autocomplete="username"
                 value="${escapeHtml(opts.prefillEmail)}" list="demo-users"
                 class="ga-input">
          <datalist id="demo-users">
            ${suggestions.map((s) => `<option value="${escapeHtml(s)}"></option>`).join('')}
          </datalist>
        </div>
        <div>
          <label for="login-password" class="block text-sm font-semibold ga-text-strong mb-1">Password</label>
          <input id="login-password" name="password" type="password" required autocomplete="current-password"
                 value="${escapeHtml(opts.prefillPassword)}"
                 class="ga-input">
        </div>
        <button type="submit" class="ga-btn ga-btn-primary w-full">Sign in</button>
      </form>

      ${googleButton}
    </div>
    ${config.PROTOTYPE_MODE ? `<p class="mt-4 text-center text-xs ga-text-muted">Prototype mode · Try demo@, alonzo@, vivian@, marcus@, anthony@, or elena@ lowesguardianangel.com</p>` : ''}
  </main>
</body>
</html>`;
}

function renderError(error: LoginErrorCode): string {
  const msg =
    error === 'invalid_credentials' ? "That email and password don't match an account."
    : error === 'google_hd_rejected' ? 'This app is restricted to lowesguardianangel.com accounts. Sign in with a company account.'
    : error === 'google_unprovisioned' ? "Your company account isn't set up for Guardian Angel yet. Ask your admin to add you."
    : error === 'google_failed' ? 'Sign-in with Google failed. Try again, or use the email and password form.'
    : 'Something went wrong. Try again.';
  return `<div class="mt-4 rounded-md border p-3 text-sm ga-sev-red">${escapeHtml(msg)}</div>`;
}
