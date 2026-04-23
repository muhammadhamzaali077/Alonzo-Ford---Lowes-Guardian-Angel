import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { processUpload } from './admin/upload.js';
import { config } from './config.js';
import {
  canEditRules,
  canEditSettings,
  getScope,
  hasAccess,
  isLocationInScope,
  resolveScope,
  scopeMiddleware,
  type RequestScope,
} from './auth/scope.js';
import { validateCredentials } from './auth/login.js';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getUserByEmail,
  readSessionCookie,
  setSessionCookie,
} from './auth/session.js';
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  generateState,
  redirectUriFromConfig,
  verifyIdToken,
} from './auth/google-oauth.js';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { MAX_UPLOAD_BYTES } from './ingestion/excel-upload.js';
import {
  getAngel as getAngelRow, listAngels, softDeleteAngel, upsertAngel,
} from './db/queries/angels.js';
import {
  getIndividual as getIndividualRow, listIndividuals, softDeleteIndividual, upsertIndividual,
} from './db/queries/individuals.js';
import {
  getLocation as getLocationRow, listLocations, softDeleteLocation, upsertLocation,
} from './db/queries/locations.js';
import {
  getManager as getManagerRow, listManagers, upsertManager,
} from './db/queries/managers.js';
import { listOpsNotices } from './db/queries/ops-notices.js';
import {
  countAngelsAtLocation, countIndividualsAtLocation, countTlogsAtLocation,
  countTlogsByAngel, countTlogsByIndividual,
} from './db/queries/ref-counts.js';
import {
  deleteRecipient, getRecipient, listRecipients, upsertRecipient,
} from './db/queries/recipients.js';
import {
  deleteShiftSchedule, getShiftSchedule, listShiftSchedules, upsertShiftSchedule,
} from './db/queries/shift-schedule.js';
import {
  getAngelAggregatesForLocation,
  getAngelMeta,
  getFlagsForDrilldown,
  getIndividualAggregatesForAngel,
  getIndividualMeta,
  getLocationMeta,
  getMissingFlagsForLocation,
} from './db/queries/drilldown.js';
import {
  getLocationAggregates,
  getOverallCountsWithPrior,
} from './db/queries/dashboard.js';
import { getRecentLogRows } from './db/queries/log-stream.js';
import { renderLogStream, renderLogStreamPage, DEFAULT_STREAM_PAGE_SIZE, HOME_PREVIEW_PAGE_SIZE } from './views/log-stream.js';
import { getComplianceTrend } from './db/queries/compliance-score.js';
import { getAnchorDate, getFreshnessLabel, getLastIngestedAt } from './db/queries/last-refresh.js';
import { getFlagsForNote, getNoteDetail } from './db/queries/note.js';
import { rerunOnWindow, runAiPass, runDeterministicPass } from './flagging/pipeline.js';
import { editRule, getActiveRule, listActiveRules, listRuleHistory, revertRule } from './rules/rules-admin.js';
import { previewCopyPaste, previewShortNote, type ImpactPreview } from './db/queries/rule-impact.js';
import { seedIfEmpty } from './jobs/seed.js';
import { resetDemoData } from './admin/reset-demo.js';
import { applyScenario, getCurrentScenario, parseScenario, SCENARIOS } from './admin/scenarios.js';
import { prestageDemoFeedback } from './admin/prestage-demo-feedback.js';
import { humanizeSince, resolveWindowFromAnchor, type WindowPreset } from './lib/time.js';
import { logger } from './lib/logger.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAngelView, renderIndividualView, renderLocationView } from './views/drilldown.js';
import { layout, escapeHtml } from './views/layout.js';
import { renderLoginPage } from './views/auth-login.js';
import { seedUsers } from './jobs/seed-users.js';
import { renderDigestPreview } from './views/digest-preview.js';
import { previewStore } from './digest/preview-store.js';
import { runWeeklyDigest } from './jobs/weekly-digest.js';
import { renderNoteDetail, renderFeedbackControl, type FlagFeedbackState } from './views/note-detail.js';
import { getFeedbackCounts, getUserFeedback, upsertFeedback } from './db/queries/flag-feedback.js';
import { renderImpactPreview, renderRuleEditForm, renderRulesHistory, renderRulesList, type RerunFragmentData } from './views/rules.js';
import { renderUploadPage } from './views/admin.js';
import {
  renderAngelDeleteConfirm, renderAngelForm, renderAngelsList,
  renderIndividualDeleteConfirm, renderIndividualForm, renderIndividualsList,
  renderLocationDeleteConfirm, renderLocationForm, renderLocationsList,
  renderManagerForm, renderManagersList,
  renderOpsNoticesList,
  renderRecipientForm, renderRecipientsList,
  renderResetDemoForm,
  renderScenariosForm,
  renderScheduleForm, renderSchedulesList,
  renderSettingsHub,
} from './views/admin-org.js';
import { renderSearchResults, searchNotes } from './views/search.js';

// ---- Boot ----------------------------------------------------------------------------------------

migrate();

// Always seed users — idempotent via ON CONFLICT. Handles both a fresh DB
// and an existing DB that predates Phase 11's user seed (e.g., a long-
// running dev server getting Phase 11 rolled out under it).
seedUsers();

if (config.PROTOTYPE_MODE) {
  const seeded = seedIfEmpty();
  if (seeded) {
    logger.info('auto-seeded empty DB on cold boot');
    // On a fresh DB the FIRST seedUsers() call (near the top of this file,
    // before migrate's locations existed) could only insert users + default
    // recipients. Now that loadOrgStructure has created locations, call
    // seedUsers again so user_location_scope rows that were WHERE-EXISTS
    // skipped the first time fill in. Idempotent.
    seedUsers();
  }

  // When the stub classifier is enabled, reset any T-Logs that ended in
  // `permanent_failure` from a prior real-classifier run so the stub pass
  // re-classifies them. Without this the fix is cosmetic — the AI pass
  // would continue skipping those rows.
  if (config.PROTOTYPE_STUB_CLASSIFIER) {
    const reset = getDb()
      .prepare(
        "UPDATE t_logs SET classifier_status='pending', classifier_error_code=NULL, classifier_attempt_count=0, classifier_last_attempt_at=NULL WHERE is_current=1 AND classifier_status='permanent_failure'",
      )
      .run();
    if (reset.changes > 0) {
      logger.info({ reset: reset.changes }, 'boot: reset permanent_failure T-Logs for stub reclassification');
    }
    logger.info({ stub: true, model: 'google/gemini-flash-lite-2.0 (stubbed)' }, 'boot: AI classifier running in STUB mode (PROTOTYPE_STUB_CLASSIFIER=true)');
  }

  const det = runDeterministicPass();
  logger.info(
    {
      notification_level_red: det.notification_level.red,
      notification_level_yellow: det.notification_level.yellow,
      missing_written: det.missing.missing_written,
    },
    'boot: deterministic pass complete',
  );

  void runAiPass()
    .then(() => {
      // Pre-stage one thumbs-up feedback row so the T124 counter renders
      // non-zero at demo time. Idempotent via UPSERT. Only fires when the
      // stub is active so we don't pollute real prod data.
      if (config.PROTOTYPE_STUB_CLASSIFIER) {
        prestageDemoFeedback();
      }
    })
    .catch((err) => {
      logger.error({ err: String(err) }, 'boot: AI pass failed');
    });
}

// Boot-seed invariant check — emits a single one-line summary of what's
// in the DB after the full seed sequence completes. If any expected count
// is zero the `warnings` field is non-empty so a fresh deploy failure is
// diagnosable from logs alone (Railway audit 2026-04-23).
logBootSeedSummary();

function logBootSeedSummary(): void {
  try {
    const db = getDb();
    const count = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
    const summary = {
      locations:  count('locations'),
      angels:     count('angels'),
      individuals: count('individuals'),
      managers:   count('managers'),
      users:      count('users'),
      recipients: count('digest_recipients'),
      rules:      count('rule_config'),
      tlogs:      count('t_logs'),
    };
    const warnings: string[] = [];
    // In prototype mode we expect a fully populated DB after boot. In
    // non-prototype mode the DB might legitimately be empty on first
    // deploy — treat zeros as warnings, not errors, and let ops decide.
    const expectNonZero: Array<keyof typeof summary> = config.PROTOTYPE_MODE
      ? ['locations', 'angels', 'individuals', 'managers', 'users', 'recipients', 'rules', 'tlogs']
      : ['rules'];
    for (const key of expectNonZero) {
      if (summary[key] === 0) warnings.push(`${key}=0`);
    }
    if (warnings.length > 0) {
      logger.warn({ ...summary, warnings }, 'boot seed complete (with warnings)');
    } else {
      logger.info(summary, 'boot seed complete');
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'boot seed summary failed');
  }
}

// prestageDemoFeedback() lives in src/admin/prestage-demo-feedback.ts so
// src/admin/scenarios.ts can call it on every scenario switch too (the
// scenario wipe clears flag_feedback).

// ---- App -----------------------------------------------------------------------------------------

const app = new Hono();

// Very-first tracer — logs every request method+path. Helpful while we wire
// new routes; gated on DEBUG_TRACE to avoid noise in production.
if (process.env.DEBUG_TRACE === '1') {
  app.use('*', async (c, next) => {
    logger.info({ method: c.req.method, path: c.req.path, content_type: c.req.header('content-type') ?? null }, 'request in');
    await next();
  });
}

// Static file serving. Files live at `public/assets/*` in the repo root —
// Railway ships the full repo so this works the same locally and in prod.
// The LGA logo is served from `public/assets/lga-logo.png`.
app.use('/assets/*', serveStatic({ root: './public' }));

app.get('/healthz', (c) => c.text('ok'));
app.get('/readyz', (c) => c.text('ready'));

// Attach scope (if authenticated) to every request. The middleware itself
// does NOT force auth — it just populates `c.var.scope` when a valid session
// cookie is present. Route handlers decide whether to redirect to /auth/login.
app.use('*', scopeMiddleware);

// Paths that don't require auth: login pages, logout, health, static assets.
function isPublicPath(path: string): boolean {
  return (
    path === '/auth/login' ||
    path === '/auth/login/demo' ||
    path === '/auth/logout' ||
    path === '/auth/google/start' ||
    path === '/auth/google/callback' ||
    path === '/healthz' ||
    path === '/readyz' ||
    // Static brand assets (logo, favicon, etc.) must bypass the auth gate —
    // the login page itself references them so requiring auth creates a
    // redirect loop. Served by the serveStatic middleware mounted at the
    // top of the file.
    path.startsWith('/assets/')
  );
}

// Global auth gate — every non-public path redirects to /auth/login when
// there's no valid session. Ordered AFTER scopeMiddleware so c.get('scope')
// is populated for handlers.
app.use('*', async (c, next) => {
  if (isPublicPath(c.req.path)) return next();
  const scope = getScope(c);
  if (!scope) {
    // Preserve the attempted URL as ?next= so post-login redirect works.
    const next_ = encodeURIComponent(c.req.path + (c.req.url.split('?')[1] ? '?' + c.req.url.split('?')[1] : ''));
    return c.redirect(`/auth/login?next=${next_}`, 302);
  }
  return next();
});

// ---- Auth routes (US-shared, pre-scope-required) -------------------------------------------------

app.get('/auth/login', (c) => {
  const scope = getScope(c);
  if (scope) return c.redirect('/', 302);
  const err = c.req.query('error');
  const errorTyped =
    err === 'invalid_credentials' ||
    err === 'google_hd_rejected' ||
    err === 'google_unprovisioned' ||
    err === 'google_failed'
      ? err
      : null;
  return c.html(
    renderLoginPage({
      googleEnabled: Boolean(config.GOOGLE_CLIENT_ID),
      error: errorTyped,
      prefillEmail: config.PROTOTYPE_MODE ? config.DEMO_LOGIN_EMAIL : '',
      prefillPassword: config.PROTOTYPE_MODE ? config.DEMO_LOGIN_PASSWORD : '',
    }),
  );
});

app.post('/auth/login/demo', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const outcome = validateCredentials(email, password);
  if (!outcome.ok) {
    return c.redirect('/auth/login?error=invalid_credentials', 302);
  }
  const { id } = createSession({
    userId: outcome.user.id,
    userAgent: c.req.header('user-agent') ?? undefined,
  });
  setSessionCookie(c, id);
  const next = c.req.query('next');
  return c.redirect(next && next.startsWith('/') ? next : '/', 302);
});

app.post('/auth/logout', (c) => {
  const sessionId = readSessionCookie(c);
  if (sessionId) deleteSession(sessionId);
  clearSessionCookie(c);
  return c.redirect('/auth/login', 302);
});

// ---- Google OAuth (T092) -------------------------------------------------------------------------

const GOOGLE_STATE_COOKIE = 'ga_oauth_state';
const GOOGLE_NEXT_COOKIE = 'ga_oauth_next';
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

app.get('/auth/google/start', (c) => {
  if (!config.GOOGLE_CLIENT_ID) return c.redirect('/auth/login', 302);

  const state = generateState();
  const isHttps = c.req.url.startsWith('https');
  setCookie(c, GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: GOOGLE_STATE_TTL_SECONDS,
  });
  const next = c.req.query('next');
  if (next && next.startsWith('/')) {
    setCookie(c, GOOGLE_NEXT_COOKIE, next, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'Lax',
      path: '/',
      maxAge: GOOGLE_STATE_TTL_SECONDS,
    });
  }

  const url = buildAuthUrl({
    clientId: config.GOOGLE_CLIENT_ID,
    redirectUri: redirectUriFromConfig(),
    state,
  });
  return c.redirect(url, 302);
});

app.get('/auth/google/callback', async (c) => {
  const clientId = config.GOOGLE_CLIENT_ID;
  const clientSecret = config.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.redirect('/auth/login', 302);
  }

  const expectedState = getCookie(c, GOOGLE_STATE_COOKIE);
  const nextCookie = getCookie(c, GOOGLE_NEXT_COOKIE);
  deleteCookie(c, GOOGLE_STATE_COOKIE, { path: '/' });
  deleteCookie(c, GOOGLE_NEXT_COOKIE, { path: '/' });

  const returnedState = c.req.query('state');
  const code = c.req.query('code');
  const oauthError = c.req.query('error');

  if (oauthError || !code || !returnedState || !expectedState || returnedState !== expectedState) {
    logger.warn(
      {
        has_code: Boolean(code),
        has_state: Boolean(returnedState),
        state_matches: returnedState === expectedState,
        oauth_error: oauthError ?? null,
      },
      'google callback: rejected before token exchange',
    );
    return c.redirect('/auth/login?error=google_failed', 302);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri: redirectUriFromConfig(),
    });
  } catch (err) {
    logger.error({ err: String(err) }, 'google callback: token exchange failed');
    return c.redirect('/auth/login?error=google_failed', 302);
  }

  const verdict = await verifyIdToken(tokens.id_token, clientId);
  if (!verdict.ok) {
    logger.warn({ reason: verdict.reason, detail: verdict.detail ?? null }, 'google callback: id_token rejected');
    if (verdict.reason === 'hd_missing' || verdict.reason === 'hd_mismatch') {
      return c.redirect('/auth/login?error=google_hd_rejected', 302);
    }
    return c.redirect('/auth/login?error=google_failed', 302);
  }

  const user = getUserByEmail(verdict.identity.email);
  if (!user) {
    logger.warn({ email_domain: verdict.identity.email.split('@')[1] ?? '?' }, 'google callback: user not provisioned');
    return c.redirect('/auth/login?error=google_unprovisioned', 302);
  }

  const { id } = createSession({
    userId: user.id,
    userAgent: c.req.header('user-agent') ?? undefined,
  });
  setSessionCookie(c, id);

  logger.info({ user_id: user.id, role: user.role }, 'google sign-in succeeded');
  return c.redirect(nextCookie && nextCookie.startsWith('/') ? nextCookie : '/', 302);
});

app.get('/', (c) => {
  const scope = mustGetScope(c);
  const windowPreset = parseWindowParam(c.req.query('window'));
  const anchor = getAnchorDate();
  const windowRange = resolveWindowFromAnchor(windowPreset, anchor);

  const locationIds =
    scope.locations === 'all'
      ? (getLocationAggregates('all', windowRange.start, windowRange.end).map((r) => r.location_id))
      : scope.locations;

  const overall = getOverallCountsWithPrior(scope.locations, windowRange.start, windowRange.end);
  const locations = getLocationAggregates(scope.locations, windowRange.start, windowRange.end);
  const trend = getComplianceTrend(locationIds, windowRange.start, windowRange.end);
  const sparklines = new Map(trend.map((s) => [s.location_id, s.points]));

  // Log stream (REQ-2 revised by Batch 1.7): 4-row compact preview on
  // the home page. The dedicated /logs page hosts the full 25-row
  // stream + Show more pagination. Filters still cascade via URL.
  const streamFilters = {
    severity: c.req.query('severity'),
    shift: c.req.query('shift'),
  };
  const streamPage = getRecentLogRows({
    start: windowRange.start,
    end: windowRange.end,
    limit: HOME_PREVIEW_PAGE_SIZE,
    offset: 0,
    filters: streamFilters,
    scopedLocationIds: scope.locations === 'all' ? undefined : scope.locations,
  });
  const logStreamHtml = renderLogStream({
    rows: streamPage.rows,
    total: streamPage.total,
    offset: 0,
    pageSize: HOME_PREVIEW_PAGE_SIZE,
    queryString: streamQueryString(c),
    compact: true,
  });

  const welcomeDismissed = getCookie(c, 'ga_welcome_dismissed') === '1';

  const body = renderDashboard({
    window: windowRange,
    overall,
    locations,
    trend,
    sparklines,
    showWelcome: !welcomeDismissed,
    filters: {
      severity: c.req.query('severity'),
      shift: c.req.query('shift'),
      locationId: c.req.query('loc'),
    },
    logStreamHtml,
  });

  return c.html(
    renderLayout(c, {
      title: 'Dashboard · Guardian Angel',
      body,
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

/**
 * Build the query-string suffix that carries current filters through
 * to the stream's poll + "Show more" endpoints, so the user's dashboard
 * state stays coherent across the async fetches.
 */
function streamQueryString(c: { req: { query: (k: string) => string | undefined } }): string {
  const parts: string[] = [];
  const window = c.req.query('window');
  const severity = c.req.query('severity');
  const shift = c.req.query('shift');
  if (window) parts.push(`window=${encodeURIComponent(window)}`);
  if (severity) parts.push(`severity=${encodeURIComponent(severity)}`);
  if (shift) parts.push(`shift=${encodeURIComponent(shift)}`);
  return parts.join('&');
}

/**
 * 30-second poll target for both the home preview AND the /logs full
 * stream (REQ-9 / AC-9.1). Reads `?limit=N` (1..50, default 25) and
 * `?compact=1` (home preview shape vs. full /logs shape) so each
 * surface refreshes in its own size and shape. The htmx hx-swap=
 * "outerHTML" call replaces the whole <section id="log-stream"> in
 * place — scroll position is preserved because the section's height
 * stays roughly stable (same row count + same footer affordance).
 */
app.get('/stream/latest', (c) => {
  const scope = mustGetScope(c);
  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const requestedLimit = Number.parseInt(c.req.query('limit') ?? `${DEFAULT_STREAM_PAGE_SIZE}`, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(50, requestedLimit))
    : DEFAULT_STREAM_PAGE_SIZE;
  const compact = c.req.query('compact') === '1';
  const streamPage = getRecentLogRows({
    start: windowRange.start,
    end: windowRange.end,
    limit,
    offset: 0,
    filters: {
      severity: c.req.query('severity'),
      shift: c.req.query('shift'),
    },
    scopedLocationIds: scope.locations === 'all' ? undefined : scope.locations,
  });
  return c.html(
    renderLogStream({
      rows: streamPage.rows,
      total: streamPage.total,
      offset: 0,
      pageSize: limit,
      queryString: streamQueryString(c),
      compact,
    }),
  );
});

/**
 * Dedicated /logs page (Batch 1.7 / AC-2.7). Hosts the full 25-row
 * stream + "Show more" pagination + counter — everything that used to
 * live on `/` before the home page got reduced to a 4-row preview.
 * Filters cascade via query string the same way as `/`.
 */
app.get('/logs', (c) => {
  const scope = mustGetScope(c);
  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const streamFilters = {
    severity: c.req.query('severity'),
    shift: c.req.query('shift'),
  };
  const streamPage = getRecentLogRows({
    start: windowRange.start,
    end: windowRange.end,
    limit: DEFAULT_STREAM_PAGE_SIZE,
    offset: 0,
    filters: streamFilters,
    scopedLocationIds: scope.locations === 'all' ? undefined : scope.locations,
  });
  const logStreamHtml = renderLogStream({
    rows: streamPage.rows,
    total: streamPage.total,
    offset: 0,
    pageSize: DEFAULT_STREAM_PAGE_SIZE,
    queryString: streamQueryString(c),
    compact: false,
  });

  const body = `<section>
  <div class="mt-2">
    <h1 class="ga-h1">All flags</h1>
    <p class="mt-1 ga-caption">${escapeHtml(windowRange.label)} · auto-refreshes every 30 seconds</p>
  </div>
  ${logStreamHtml}
</section>`;

  return c.html(
    renderLayout(c, {
      title: 'All flags · Guardian Angel',
      body,
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'logs',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

/**
 * "Show more" pagination for the home-page log stream (REQ-2 AC-2.5).
 * Returns the next batch of rows + an OOB swap fragment replacing the
 * "Show more" button. The rows are appended via hx-swap="beforeend" on
 * the parent <ul>; the button's DIV is replaced via hx-swap-oob="true".
 */
app.get('/stream/more', (c) => {
  const scope = mustGetScope(c);
  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const requestedOffset = Number.parseInt(c.req.query('offset') ?? '0', 10);
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const streamPage = getRecentLogRows({
    start: windowRange.start,
    end: windowRange.end,
    limit: DEFAULT_STREAM_PAGE_SIZE,
    offset,
    filters: {
      severity: c.req.query('severity'),
      shift: c.req.query('shift'),
    },
    scopedLocationIds: scope.locations === 'all' ? undefined : scope.locations,
  });
  return c.html(
    renderLogStreamPage(
      streamPage.rows,
      streamPage.total,
      offset + streamPage.rows.length,
      streamQueryString(c),
    ),
  );
});

app.get('/location/:loc', (c) => {
  const scope = mustGetScope(c);
  const locId = c.req.param('loc');
  const loc = getLocationMeta(locId);
  if (!loc) return c.html(renderNotFoundPage(c, scope, 'Location not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(locId)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }

  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const angels = getAngelAggregatesForLocation(locId, windowRange.start, windowRange.end);
  const missingFlags = getMissingFlagsForLocation(locId, windowRange.start, windowRange.end);

  return c.html(
    renderLayout(c, {
      title: `${loc.name} · Guardian Angel`,
      body: renderLocationView({ location: loc, angels, missingFlags, window: windowRange }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

app.get('/location/:loc/angel/:ang', (c) => {
  const scope = mustGetScope(c);
  const locId = c.req.param('loc');
  const angId = c.req.param('ang');
  const loc = getLocationMeta(locId);
  const ang = getAngelMeta(angId);
  if (!loc || !ang) return c.html(renderNotFoundPage(c, scope, 'Not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(locId)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }

  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const individuals = getIndividualAggregatesForAngel(locId, angId, windowRange.start, windowRange.end);

  return c.html(
    renderLayout(c, {
      title: `${ang.name} · Guardian Angel`,
      body: renderAngelView({
        location: { id: loc.id, name: loc.name },
        angel: { id: ang.id, name: ang.name, role: ang.role },
        individuals,
        window: windowRange,
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

app.get('/location/:loc/angel/:ang/individual/:ind', (c) => {
  const scope = mustGetScope(c);
  const locId = c.req.param('loc');
  const angId = c.req.param('ang');
  const indId = c.req.param('ind');
  const loc = getLocationMeta(locId);
  const ang = getAngelMeta(angId);
  const ind = getIndividualMeta(indId);
  if (!loc || !ang || !ind) return c.html(renderNotFoundPage(c, scope, 'Not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(locId)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }

  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const flags = getFlagsForDrilldown(locId, angId, indId, windowRange.start, windowRange.end);

  return c.html(
    renderLayout(c, {
      title: `${ind.name} · Guardian Angel`,
      body: renderIndividualView({
        location: { id: loc.id, name: loc.name },
        angel: { id: ang.id, name: ang.name },
        individual: { id: ind.id, name: ind.name },
        flags,
        window: windowRange,
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

app.get('/note/:tlog/:version', (c) => {
  const scope = mustGetScope(c);
  const tlogId = c.req.param('tlog');
  const version = Number.parseInt(c.req.param('version'), 10);
  if (!Number.isFinite(version)) return c.html(renderNotFoundPage(c, scope, 'Invalid version.'), 404);

  const note = getNoteDetail(tlogId, version);
  if (!note) return c.html(renderNotFoundPage(c, scope, 'Note not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(note.program_id)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }

  const flags = getFlagsForNote(tlogId, version);

  // Per-flag feedback state for the calling user (T124). One query per
  // flag is acceptable at this list size; if a note ever grew to dozens of
  // flags we'd batch. For now, deliberately simple.
  const feedback = new Map<number, FlagFeedbackState>();
  for (const f of flags) {
    const my = getUserFeedback(f.id, scope.user.id);
    feedback.set(f.id, {
      counts: getFeedbackCounts(f.id),
      my_verdict: my?.verdict ?? null,
    });
  }

  return c.html(
    renderLayout(c, {
      title: `Note · Guardian Angel`,
      body: renderNoteDetail({ note, flags, feedback }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

/**
 * T124 — record or update a user's verdict on a single flag. Returns the
 * thumbs fragment so htmx can swap it in-place. Non-htmx clients (rare)
 * get a 303 back to the referer or the note detail page.
 */
app.post('/flags/:id/feedback', async (c) => {
  const scope = mustGetScope(c);
  const flagId = Number.parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(flagId)) return c.text('invalid flag id', 400);

  const body = await c.req.parseBody();
  const verdictRaw = String(body.verdict ?? '');
  if (verdictRaw !== 'up' && verdictRaw !== 'down') return c.text('invalid verdict', 400);
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;

  upsertFeedback({
    flag_id: flagId,
    user_id: scope.user.id,
    verdict: verdictRaw,
    note,
  });

  const isHtmx = c.req.header('HX-Request') === 'true';
  if (isHtmx) {
    const state: FlagFeedbackState = {
      counts: getFeedbackCounts(flagId),
      my_verdict: verdictRaw,
    };
    return c.html(renderFeedbackControl(flagId, state));
  }

  const back = c.req.header('referer') ?? '/';
  return c.redirect(back, 303);
});

// ---- Rules (US2) ---------------------------------------------------------------------------------

app.get('/rules', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }
  return c.html(
    renderLayout(c, {
      title: 'Rules · Guardian Angel',
      body: renderRulesList(listActiveRules()),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'rules',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

app.get('/rules/:rule_key/edit', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }
  const rule = getActiveRule(c.req.param('rule_key'));
  if (!rule) return c.html(renderNotFoundPage(c, scope, 'Rule not found.'), 404);
  const savedFromQuery = c.req.query('saved');
  const impact = computeImpactFromRule(rule.rule_key, rule.config_json);
  return c.html(
    renderLayout(c, {
      title: `${rule.name} · Rules · Guardian Angel`,
      body: renderRuleEditForm({
        rule,
        impact,
        ...(savedFromQuery ? { savedVersion: Number(savedFromQuery) } : {}),
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'rules',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

// Htmx fragment — called as user drags a slider or changes a threshold.
// Returns the same <div id="impact-preview"> block that the full edit page
// ships with, so htmx outerHTML swap is symmetric.
app.get('/rules/:rule_key/preview-impact', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const ruleKey = c.req.param('rule_key');
  const impact = computeImpactFromQuery(ruleKey, c.req.query());
  return c.html(renderImpactPreview(ruleKey, impact));
});

/**
 * Resolve initial impact from the active rule's stored config_json. Returns
 * null for LLM-evaluated rules — the view renders a "not available" stub
 * in that case.
 */
function computeImpactFromRule(ruleKey: string, configJson: string): ImpactPreview | null {
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(configJson) as Record<string, unknown>; } catch { /* default */ }
  if (ruleKey === 'copy_paste') {
    return previewCopyPaste({ similarityThreshold: Number(cfg.similarity_threshold ?? 0.85) });
  }
  if (ruleKey === 'short_note') {
    return previewShortNote({
      residentialMinWords: Number(cfg.residential_min_words ?? 20),
      dayProgramMinWords: Number(cfg.day_program_min_words ?? 15),
    });
  }
  return null;
}

/**
 * Same as `computeImpactFromRule` but reads `cfg_*` values from query-string
 * input (htmx `hx-include="closest form"` serializes form fields into query
 * params for a GET request).
 */
function computeImpactFromQuery(ruleKey: string, q: Record<string, string>): ImpactPreview | null {
  if (ruleKey === 'copy_paste') {
    const threshold = Number(q.cfg_similarity_threshold);
    return previewCopyPaste({ similarityThreshold: Number.isFinite(threshold) ? threshold : 0.85 });
  }
  if (ruleKey === 'short_note') {
    const residential = Number(q.cfg_residential_min_words);
    const dayProgram = Number(q.cfg_day_program_min_words);
    return previewShortNote({
      residentialMinWords: Number.isFinite(residential) ? residential : 20,
      dayProgramMinWords: Number.isFinite(dayProgram) ? dayProgram : 15,
    });
  }
  return null;
}

app.post('/rules/:rule_key', async (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }
  const ruleKey = c.req.param('rule_key');
  const body = await c.req.parseBody();
  const name = (body.name as string | undefined)?.trim();
  const description = (body.description as string | undefined)?.trim();
  const prompt_template = (body.prompt_template as string | undefined);
  const intent = (body.intent as string | undefined) ?? 'save';

  // Assemble config from cfg_* fields
  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!k.startsWith('cfg_')) continue;
    const key = k.slice(4);
    const num = Number(v);
    config[key] = Number.isFinite(num) ? num : v;
  }

  const updated = editRule(
    ruleKey,
    {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(prompt_template !== undefined ? { prompt_template } : {}),
      ...(Object.keys(config).length > 0 ? { config_json: config } : {}),
    },
    scope.user.id,
  );

  if (intent === 'save_and_rerun') {
    const anchor = getAnchorDate();
    const windowRange = resolveWindowFromAnchor('7d', anchor);
    const rerun = await rerunOnWindow(windowRange.start, windowRange.end);
    const rerunResult: RerunFragmentData = {
      superseded: rerun.superseded_flags,
      classified_ok: rerun.ai.classified_ok,
      new_red: rerun.ai.classified_red,
      new_yellow: rerun.ai.classified_yellow,
      permanent_failures: rerun.ai.permanent_failures,
      wall_clock_ms: rerun.ai.wall_clock_ms,
      window_start: windowRange.start,
      window_end: windowRange.end,
    };
    return c.html(
      renderLayout(c, {
        title: `${updated.name} · Rules · Guardian Angel`,
        body: renderRuleEditForm({
          rule: updated,
          savedVersion: updated.version,
          rerunResult,
          impact: computeImpactFromRule(updated.rule_key, updated.config_json),
        }),
        user: { name: scope.user.name, role: scope.user.role },
        activeNav: 'rules',
        dataCurrentAs: getFreshnessLabel(),
      }),
    );
  }

  return c.redirect(`/rules/${encodeURIComponent(ruleKey)}/edit?saved=${updated.version}`, 303);
});

// Intentionally reachable by direct URL — the UI entry point to this
// route was removed in Batch 1.5 per REQ-6, but the data path is kept
// live so version history can be inspected (or an admin-only UI brought
// back) without a migration. If you want to 404 this route instead,
// flip it to `renderNotFoundPage` below; the underlying DB data stays.
app.get('/rules/:rule_key/history', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }
  const ruleKey = c.req.param('rule_key');
  const history = listRuleHistory(ruleKey);
  if (history.length === 0) return c.html(renderNotFoundPage(c, scope, 'Rule not found.'), 404);
  return c.html(
    renderLayout(c, {
      title: 'Previous versions · Guardian Angel',
      body: renderRulesHistory(ruleKey, history),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'rules',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

// Intentionally reachable by direct URL + form POST — see note on
// GET /rules/:rule_key/history above. The UI "Restore this version"
// button is only reachable if a user navigates to /rules/:key/history
// directly, since Batch 1.5 removed the in-UI link to that page.
app.post('/rules/:rule_key/revert', async (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(c, scope), 403);
  }
  const ruleKey = c.req.param('rule_key');
  const body = await c.req.parseBody();
  const version = Number.parseInt(body.version as string, 10);
  if (!Number.isFinite(version)) return c.html(renderNotFoundPage(c, scope, 'Missing version.'), 404);
  const restored = revertRule(ruleKey, version, scope.user.id);
  return c.redirect(`/rules/${encodeURIComponent(ruleKey)}/edit?saved=${restored.version}`, 303);
});

// ---- UI preferences (cookie-backed, no browser storage) -----------------------------------------

app.post('/ui/welcome/dismiss', (c) => {
  setCookie(c, 'ga_welcome_dismissed', '1', {
    httpOnly: false, // readable by htmx if we ever need to, but Path=/ HttpOnly=false is the default for UI prefs
    secure: c.req.url.startsWith('https'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  // Empty body → htmx swaps <aside id="welcome-panel"> outerHTML to nothing.
  return c.body(null, 204);
});

// ---- Presenter mode (T125) — cookie-backed chrome toggle -----------------------------------------
//
// Alonzo clicks /presenter/on before taking a screenshot; header + footer
// disappear from every subsequent page until /presenter/off. Cookie carries
// a UI preference, not identity — no Principle X issue.

function presenterCookieOpts(c: Parameters<typeof setCookie>[0]) {
  return {
    httpOnly: false,
    secure: c.req.url.startsWith('https'),
    sameSite: 'Lax' as const,
    path: '/',
  };
}

app.get('/presenter/on', (c) => {
  setCookie(c, 'ga_presenter', '1', {
    ...presenterCookieOpts(c),
    maxAge: 60 * 60 * 24 * 7, // 7 days — long enough for a demo run
  });
  const back = c.req.query('next') ?? c.req.header('referer') ?? '/';
  return c.redirect(back.startsWith('/') || back.startsWith(config.APP_URL) ? back : '/', 303);
});

app.get('/presenter/off', (c) => {
  deleteCookie(c, 'ga_presenter', { path: '/' });
  const back = c.req.query('next') ?? c.req.header('referer') ?? '/';
  return c.redirect(back.startsWith('/') || back.startsWith(config.APP_URL) ? back : '/', 303);
});

/** Read the presenter-mode cookie. Layout suppresses chrome when true. */
function isPresenterMode(c: Parameters<typeof getCookie>[0]): boolean {
  return getCookie(c, 'ga_presenter') === '1';
}

/**
 * Wrapper around `layout()` that fills in presenter-mode from the request
 * cookie automatically. Every handler that renders a full page should
 * prefer this over calling `layout()` directly so presenter chrome-toggle
 * is uniform across the app.
 */
function renderLayout(
  c: Parameters<typeof getCookie>[0],
  opts: Omit<Parameters<typeof layout>[0], 'presenter'>,
): string {
  return layout({ ...opts, presenter: isPresenterMode(c) });
}

// ---- Admin: Settings (US4) -----------------------------------------------------------------------

/** Asserts scope is set (auth gate guarantees this past /auth/*). */
function mustGetScope(c: Parameters<typeof getScope>[0]): RequestScope {
  const s = getScope(c);
  if (!s) throw new Error('Unreachable: scope missing past auth gate');
  return s;
}

function allowAdminRoute(scope: RequestScope): boolean {
  return canEditSettings(scope);
}

function adminLayout(c: Parameters<typeof getCookie>[0], title: string, bodyHtml: string, scope: RequestScope): string {
  return renderLayout(c, {
    title: `${title} · Guardian Angel`,
    body: bodyHtml,
    user: { name: scope.user.name, role: scope.user.role },
    activeNav: 'settings',
    dataCurrentAs: getFreshnessLabel(),
  });
}

// Settings hub
app.get('/admin/org', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const db = getDb();
  const counts = {
    locations:       (db.prepare('SELECT COUNT(*) AS n FROM locations WHERE deleted_at IS NULL').get() as { n: number }).n,
    angels:          (db.prepare('SELECT COUNT(*) AS n FROM angels WHERE deleted_at IS NULL').get() as { n: number }).n,
    individuals:     (db.prepare('SELECT COUNT(*) AS n FROM individuals WHERE deleted_at IS NULL').get() as { n: number }).n,
    managers:        (db.prepare('SELECT COUNT(*) AS n FROM managers WHERE deleted_at IS NULL').get() as { n: number }).n,
    shift_schedules: (db.prepare('SELECT COUNT(*) AS n FROM shift_schedule').get() as { n: number }).n,
    recipients:      (db.prepare('SELECT COUNT(*) AS n FROM digest_recipients').get() as { n: number }).n,
    ops:             (db.prepare('SELECT COUNT(*) AS n FROM ops_notices').get() as { n: number }).n,
  };
  return c.html(adminLayout(c, 'Settings', renderSettingsHub(counts), scope));
});

// ---- Locations ----
app.get('/admin/locations', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Locations', renderLocationsList(listLocations(), listManagers()), scope));
});
app.get('/admin/locations/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Add location', renderLocationForm(null, listManagers()), scope));
});
app.get('/admin/locations/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const loc = getLocationRow(c.req.param('id'));
  if (!loc) return c.html(renderNotFoundPage(c, scope, 'Location not found.'), 404);
  return c.html(adminLayout(c, 'Edit location', renderLocationForm(loc, listManagers()), scope));
});
app.post('/admin/locations', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertLocation({
    id: String(b.id ?? '').trim(),
    name: String(b.name ?? '').trim(),
    type: (b.type as 'group_home' | 'host_home' | 'day_program'),
    manager_id: b.manager_id ? String(b.manager_id) : null,
  });
  return c.redirect('/admin/locations', 303);
});
app.post('/admin/locations/:id', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertLocation({
    id: c.req.param('id'),
    name: String(b.name ?? '').trim(),
    type: (b.type as 'group_home' | 'host_home' | 'day_program'),
    manager_id: b.manager_id ? String(b.manager_id) : null,
  });
  return c.redirect('/admin/locations', 303);
});
app.get('/admin/locations/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const loc = getLocationRow(c.req.param('id'));
  if (!loc) return c.html(renderNotFoundPage(c, scope, 'Location not found.'), 404);
  const refCounts = {
    angels: countAngelsAtLocation(loc.id),
    individuals: countIndividualsAtLocation(loc.id),
    tlogs: countTlogsAtLocation(loc.id),
  };
  return c.html(adminLayout(c, 'Deactivate location', renderLocationDeleteConfirm(loc, refCounts), scope));
});
app.post('/admin/locations/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  softDeleteLocation(c.req.param('id'));
  return c.redirect('/admin/locations', 303);
});

// ---- Angels ----
app.get('/admin/angels', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Angels', renderAngelsList(listAngels(), listLocations()), scope));
});
app.get('/admin/angels/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Add angel', renderAngelForm(null, listLocations()), scope));
});
app.get('/admin/angels/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const a = getAngelRow(c.req.param('id'));
  if (!a) return c.html(renderNotFoundPage(c, scope, 'Angel not found.'), 404);
  return c.html(adminLayout(c, 'Edit angel', renderAngelForm(a, listLocations()), scope));
});
app.post('/admin/angels', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertAngel({
    id: String(b.id ?? '').trim(),
    name: String(b.name ?? '').trim(),
    role: (b.role as 'DSP' | 'Nurse' | 'Manager'),
    location_id: b.location_id ? String(b.location_id) : null,
  });
  return c.redirect('/admin/angels', 303);
});
app.post('/admin/angels/:id', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertAngel({
    id: c.req.param('id'),
    name: String(b.name ?? '').trim(),
    role: (b.role as 'DSP' | 'Nurse' | 'Manager'),
    location_id: b.location_id ? String(b.location_id) : null,
  });
  return c.redirect('/admin/angels', 303);
});
app.get('/admin/angels/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const a = getAngelRow(c.req.param('id'));
  if (!a) return c.html(renderNotFoundPage(c, scope, 'Angel not found.'), 404);
  return c.html(adminLayout(c, 'Deactivate angel', renderAngelDeleteConfirm(a, countTlogsByAngel(a.id)), scope));
});
app.post('/admin/angels/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  softDeleteAngel(c.req.param('id'));
  return c.redirect('/admin/angels', 303);
});

// ---- Individuals ----
app.get('/admin/individuals', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Individuals', renderIndividualsList(listIndividuals(), listLocations()), scope));
});
app.get('/admin/individuals/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Add individual', renderIndividualForm(null, listLocations()), scope));
});
app.get('/admin/individuals/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const i = getIndividualRow(c.req.param('id'));
  if (!i) return c.html(renderNotFoundPage(c, scope, 'Individual not found.'), 404);
  return c.html(adminLayout(c, 'Edit individual', renderIndividualForm(i, listLocations()), scope));
});
app.post('/admin/individuals', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertIndividual({
    id: String(b.id ?? '').trim(),
    name: String(b.name ?? '').trim(),
    location_id: b.location_id ? String(b.location_id) : null,
  });
  return c.redirect('/admin/individuals', 303);
});
app.post('/admin/individuals/:id', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertIndividual({
    id: c.req.param('id'),
    name: String(b.name ?? '').trim(),
    location_id: b.location_id ? String(b.location_id) : null,
  });
  return c.redirect('/admin/individuals', 303);
});
app.get('/admin/individuals/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const i = getIndividualRow(c.req.param('id'));
  if (!i) return c.html(renderNotFoundPage(c, scope, 'Individual not found.'), 404);
  return c.html(adminLayout(c, 'Deactivate individual', renderIndividualDeleteConfirm(i, countTlogsByIndividual(i.id)), scope));
});
app.post('/admin/individuals/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  softDeleteIndividual(c.req.param('id'));
  return c.redirect('/admin/individuals', 303);
});

// ---- Managers ----
app.get('/admin/managers', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Managers', renderManagersList(listManagers()), scope));
});
app.get('/admin/managers/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Add manager', renderManagerForm(null), scope));
});
app.get('/admin/managers/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const m = getManagerRow(c.req.param('id'));
  if (!m) return c.html(renderNotFoundPage(c, scope, 'Manager not found.'), 404);
  return c.html(adminLayout(c, 'Edit manager', renderManagerForm(m), scope));
});
app.post('/admin/managers', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertManager({
    id: String(b.id ?? '').trim(),
    name: String(b.name ?? '').trim(),
    email: b.email ? String(b.email).trim() : null,
  });
  return c.redirect('/admin/managers', 303);
});
app.post('/admin/managers/:id', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertManager({
    id: c.req.param('id'),
    name: String(b.name ?? '').trim(),
    email: b.email ? String(b.email).trim() : null,
  });
  return c.redirect('/admin/managers', 303);
});

// ---- Shift schedules ----
app.get('/admin/shift-schedules', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Shift schedules', renderSchedulesList(listShiftSchedules()), scope));
});
app.get('/admin/shift-schedules/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Add shift schedule', renderScheduleForm(null, listIndividuals()), scope));
});
app.get('/admin/shift-schedules/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const id = Number(c.req.param('id'));
  const row = getShiftSchedule(id);
  if (!row) return c.html(renderNotFoundPage(c, scope, 'Shift schedule not found.'), 404);
  return c.html(adminLayout(c, 'Edit shift schedule', renderScheduleForm(row, listIndividuals()), scope));
});
app.post('/admin/shift-schedules', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertShiftSchedule({
    individual_id: String(b.individual_id ?? ''),
    shift_name: (b.shift_name as 'Day' | 'Swing' | 'Overnight'),
    start_time: String(b.start_time ?? ''),
    end_time: String(b.end_time ?? ''),
    days_of_week: String(b.days_of_week ?? ''),
  });
  return c.redirect('/admin/shift-schedules', 303);
});
app.post('/admin/shift-schedules/:id', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertShiftSchedule({
    id: Number(c.req.param('id')),
    individual_id: String(b.individual_id ?? ''),
    shift_name: (b.shift_name as 'Day' | 'Swing' | 'Overnight'),
    start_time: String(b.start_time ?? ''),
    end_time: String(b.end_time ?? ''),
    days_of_week: String(b.days_of_week ?? ''),
  });
  return c.redirect('/admin/shift-schedules', 303);
});
app.post('/admin/shift-schedules/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  deleteShiftSchedule(Number(c.req.param('id')));
  return c.redirect('/admin/shift-schedules', 303);
});

// ---- Digest recipients ----
app.get('/admin/recipients', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Digest recipients', renderRecipientsList(listRecipients(), listLocations()), scope));
});
app.get('/admin/recipients/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'Add recipient', renderRecipientForm(null, listLocations()), scope));
});
app.get('/admin/recipients/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const r = getRecipient(Number(c.req.param('id')));
  if (!r) return c.html(renderNotFoundPage(c, scope, 'Recipient not found.'), 404);
  return c.html(adminLayout(c, 'Edit recipient', renderRecipientForm(r, listLocations()), scope));
});
app.post('/admin/recipients', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertRecipient({
    email: String(b.email ?? '').trim(),
    scope: String(b.scope ?? 'all'),
    is_active: Number(b.is_active ?? 1),
  });
  return c.redirect('/admin/recipients', 303);
});
app.post('/admin/recipients/:id', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  const b = await c.req.parseBody();
  upsertRecipient({
    id: Number(c.req.param('id')),
    email: String(b.email ?? '').trim(),
    scope: String(b.scope ?? 'all'),
    is_active: Number(b.is_active ?? 1),
  });
  return c.redirect('/admin/recipients', 303);
});
app.post('/admin/recipients/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  deleteRecipient(Number(c.req.param('id')));
  return c.redirect('/admin/recipients', 303);
});

// ---- System messages ----
app.get('/admin/ops', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(adminLayout(c, 'System messages', renderOpsNoticesList(listOpsNotices({ limit: 50 })), scope));
});

// ---- Admin: Scenario presets (T123) — prototype-only, double-confirm -----------------------------

app.get('/admin/scenarios', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  if (!config.PROTOTYPE_MODE) return c.html(renderNotFoundPage(c, scope, 'Scenarios are only available in prototype mode.'), 404);
  return c.html(
    adminLayout(
      c,
      'Scenario presets',
      renderScenariosForm({
        current: getCurrentScenario(),
        scenarios: SCENARIOS,
        appliedMessage: null,
        pendingConfirm: null,
      }),
      scope,
    ),
  );
});

app.post('/admin/scenarios', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  if (!config.PROTOTYPE_MODE) return c.html(renderNotFoundPage(c, scope, 'Scenarios are only available in prototype mode.'), 404);

  const body = await c.req.parseBody();
  const preset = parseScenario(String(body.preset ?? ''));
  const step = String(body.step ?? '');
  if (!preset) {
    return c.html(renderNotFoundPage(c, scope, 'Unknown scenario preset.'), 400);
  }

  // Step 1 — re-render with that card's button flipped to the red Confirm.
  if (step === 'request') {
    return c.html(
      adminLayout(
        c,
        'Scenario presets',
        renderScenariosForm({
          current: getCurrentScenario(),
          scenarios: SCENARIOS,
          appliedMessage: null,
          pendingConfirm: preset,
        }),
        scope,
      ),
    );
  }

  if (step !== 'confirm') {
    return c.html(
      adminLayout(
        c,
        'Scenario presets',
        renderScenariosForm({
          current: getCurrentScenario(),
          scenarios: SCENARIOS,
          appliedMessage: 'Unexpected form state; please try again.',
          pendingConfirm: null,
        }),
        scope,
      ),
    );
  }

  const result = await applyScenario(preset);
  return c.html(
    adminLayout(
      c,
      'Scenario presets',
      renderScenariosForm({
        current: result.scenario,
        scenarios: SCENARIOS,
        appliedMessage: `Applied "${result.scenario}" scenario. ${result.t_logs} T-Logs across ${result.locations} locations loaded.`,
        pendingConfirm: null,
      }),
      scope,
    ),
  );
});

// ---- Admin: Reset Demo Data (T126) — prototype-only, double-confirm ------------------------------

app.get('/admin/reset-demo', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  if (!config.PROTOTYPE_MODE) return c.html(renderNotFoundPage(c, scope, 'Reset is only available in prototype mode.'), 404);
  return c.html(adminLayout(c, 'Reset demo data', renderResetDemoForm(false, null), scope));
});

app.post('/admin/reset-demo', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  if (!config.PROTOTYPE_MODE) return c.html(renderNotFoundPage(c, scope, 'Reset is only available in prototype mode.'), 404);

  const body = await c.req.parseBody();
  const step = String(body.step ?? '');

  // Step 1 — user clicked the first button. Re-render with the red Confirm
  // button; the "really" flag in the form means a second submit runs it.
  if (step === 'request') {
    return c.html(adminLayout(c, 'Reset demo data', renderResetDemoForm(true, null), scope));
  }
  if (step !== 'confirm') {
    return c.html(adminLayout(c, 'Reset demo data', renderResetDemoForm(false, 'Unexpected form state; please try again.'), scope));
  }

  const counts = resetDemoData();
  return c.html(
    adminLayout(
      c,
      'Reset demo data',
      renderResetDemoForm(
        false,
        `Done. Re-seeded ${counts.t_logs} T-Logs across ${counts.locations} locations, ${counts.angels} angels, and ${counts.individuals} individuals.`,
      ),
      scope,
    ),
  );
});

// ---- Admin: Upload (carried over from Phase 8) ---------------------------------------------------

app.get('/admin/upload', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);
  return c.html(
    renderLayout(c, {
      title: 'Upload Therap export · Guardian Angel',
      body: renderUploadPage(),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'settings',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

app.post('/admin/upload', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(c, scope), 403);

  let file: File | undefined;
  try {
    const body = await c.req.parseBody();
    const raw = body.file;
    if (raw instanceof File) file = raw;
  } catch (err) {
    logger.error({ err: String(err) }, 'upload: parseBody threw');
  }

  if (!file) {
    return c.html(
      renderLayout(c, {
        title: 'Upload Therap export · Guardian Angel',
        body: renderUploadPage({
          filename: '(none)',
          parsed: 0,
          ingested: 0,
          superseded: 0,
          noop: 0,
          skipped: [],
          new_flags: { red: 0, yellow: 0, missing: 0 },
          fatal_error: 'No file was attached. Pick an .xlsx or .csv file and try again.',
        }),
        user: { name: scope.user.name, role: scope.user.role },
        activeNav: 'settings',
        dataCurrentAs: getFreshnessLabel(),
      }),
      400,
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return c.html(
      renderLayout(c, {
        title: 'Upload Therap export · Guardian Angel',
        body: renderUploadPage({
          filename: file.name,
          parsed: 0,
          ingested: 0,
          superseded: 0,
          noop: 0,
          skipped: [],
          new_flags: { red: 0, yellow: 0, missing: 0 },
          fatal_error: `File is larger than 10 MB. Split the export or upload a shorter date range.`,
        }),
        user: { name: scope.user.name, role: scope.user.role },
        activeNav: 'settings',
        dataCurrentAs: getFreshnessLabel(),
      }),
      413,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = processUpload(file.name, buffer);

  return c.html(
    renderLayout(c, {
      title: 'Upload Therap export · Guardian Angel',
      body: renderUploadPage(result),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'settings',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

// ---- Digest preview (US3) ------------------------------------------------------------------------

app.get('/digest/preview', async (c) => {
  const scope = mustGetScope(c);
  // Regenerate on every load so the preview always reflects current data +
  // rule state (useful right after a rule edit).
  await runWeeklyDigest();
  return c.html(
    renderLayout(c, {
      title: 'Weekly email preview · Guardian Angel',
      body: renderDigestPreview({
        digests: previewStore.list(),
        generatedAt: previewStore.lastGenerated(),
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

// ---- Search --------------------------------------------------------------------------------------

app.get('/search', (c) => {
  const scope = mustGetScope(c);
  const q = c.req.query('q') ?? '';
  const hits = q.trim() ? searchNotes(q) : [];
  const scopedHits =
    scope.locations === 'all'
      ? hits
      : hits.filter((h) => scope.locations.includes(h.program_id));

  // htmx sub-request from the live-search input → return only the results
  // fragment, keep the input in place (htmx swaps #search-results).
  if (c.req.header('HX-Request') === 'true') {
    return c.html(renderSearchResults(q, scopedHits));
  }

  return c.html(
    renderLayout(c, {
      title: `Search · Guardian Angel`,
      body: `<section>
        <h1 class="text-2xl font-semibold ga-text-strong">Search</h1>
        <form method="get" action="/search" class="mt-4">
          <input name="q" value="${q.replace(/"/g, '&quot;')}"
                 placeholder="Search notes…"
                 class="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                 autofocus
                 hx-get="/search"
                 hx-trigger="input changed delay:300ms, keyup[key=='Enter'] delay:0ms"
                 hx-target="#search-results"
                 hx-swap="innerHTML"
                 hx-indicator="#search-indicator"
                 hx-push-url="true">
        </form>
        <div id="search-indicator" class="ga-indicator mt-4 space-y-2" aria-live="polite">
          <div class="ga-shimmer h-14"></div>
          <div class="ga-shimmer h-14"></div>
          <div class="ga-shimmer h-14"></div>
        </div>
        <div id="search-results" class="mt-6">${renderSearchResults(q, scopedHits)}</div>
      </section>`,
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: getFreshnessLabel(),
    }),
  );
});

// ---- Helpers -------------------------------------------------------------------------------------

function parseWindowParam(raw: string | undefined): WindowPreset {
  if (raw === 'this_week' || raw === '30d' || raw === 'all' || raw === '7d') return raw;
  // Default to 30 days (was '7d'). The synthetic fixture spans ~30 days and
  // the demo hero narrative relies on Jamal's copy-paste cluster being
  // visible — with a 7-day window it can be out-of-range and Riverside
  // reads as "No flags" on the dashboard. Flip back to '7d' if/when a
  // production deployment collects real-time ingest.
  return '30d';
}

function renderNotFoundPage(c: Parameters<typeof getCookie>[0], scope: RequestScope, message: string): string {
  return renderLayout(c, {
    title: 'Not found · Guardian Angel',
    body: `<section class="text-center py-12">
      <h1 class="text-2xl font-semibold ga-text-strong">Not found</h1>
      <p class="mt-2 text-sm ga-text">${message}</p>
      <a href="/" class="mt-4 inline-block text-sm text-blue-600 hover:underline">Back to dashboard</a>
    </section>`,
    user: { name: scope.user.name, role: scope.user.role },
    activeNav: 'dashboard',
  });
}

function renderForbiddenPage(c: Parameters<typeof getCookie>[0], scope: RequestScope): string {
  return renderLayout(c, {
    title: 'Access denied · Guardian Angel',
    body: `<section class="text-center py-12">
      <h1 class="text-2xl font-semibold ga-text-strong">Access denied</h1>
      <p class="mt-2 text-sm ga-text">You don't have access to this page. If you think this is a mistake, ask your admin.</p>
      <a href="/" class="mt-4 inline-block text-sm text-blue-600 hover:underline">Back to dashboard</a>
    </section>`,
    user: { name: scope.user.name, role: scope.user.role },
    activeNav: 'dashboard',
  });
}

// ---- Error handler (correlation-ID friendly) ------------------------------------------------------
//
// Two shapes:
//   - htmx request (`HX-Request: true`) → return a small inline fragment so
//     only the targeted region updates. No layout, no nav.
//   - Full page request → render the full layout with a 500 page carrying
//     the same correlation ID.
// The correlation ID is logged with the stack so operators can cross-reference.
// Stack is NEVER rendered to the client — only the ID + a plain-language hint.

function newCorrelationId(): string {
  // Short, clipboard-friendly, URL-safe. Collisions are irrelevant — this is
  // a log-lookup cookie, not an identity.
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

app.onError((err, c) => {
  const correlationId = newCorrelationId();
  logger.error(
    {
      err: String(err),
      stack: err instanceof Error ? err.stack : undefined,
      correlation_id: correlationId,
      method: c.req.method,
      path: c.req.path,
    },
    'request failed',
  );

  const isHtmx = c.req.header('HX-Request') === 'true';
  if (isHtmx) {
    return c.html(
      `<div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
  <p class="font-medium">Something went wrong.</p>
  <p class="mt-1">Reload the page and try again. If it keeps happening, send this code to support: <code class="font-mono tnum">${correlationId}</code>.</p>
</div>`,
      500,
    );
  }

  const scope = getScope(c);
  return c.html(
    renderLayout(c, {
      title: 'Something went wrong · Guardian Angel',
      body: `<section class="py-12 text-center">
        <h1 class="text-2xl font-semibold ga-text-strong">Something went wrong</h1>
        <p class="mt-2 text-sm ga-text">Reload the page and try again. If it keeps happening, send this code to support:</p>
        <p class="mt-2 font-mono tnum text-sm ga-text-strong">${correlationId}</p>
        <a href="/" class="mt-6 inline-block text-sm text-blue-600 hover:underline">Back to dashboard</a>
      </section>`,
      user: scope ? { name: scope.user.name, role: scope.user.role } : undefined,
      activeNav: 'dashboard',
    }),
    500,
  );
});

// ---- Serve ---------------------------------------------------------------------------------------

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(
    { port: info.port, mode: config.PROTOTYPE_MODE ? 'prototype' : 'production' },
    'server started',
  );
});

export default app;


