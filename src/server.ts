import { serve } from '@hono/node-server';
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
  readSessionCookie,
  setSessionCookie,
} from './auth/session.js';
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
} from './db/queries/drilldown.js';
import {
  getLocationAggregates,
  getOverallCounts,
} from './db/queries/dashboard.js';
import { getComplianceTrend } from './db/queries/compliance-score.js';
import { getAnchorDate, getLastIngestedAt } from './db/queries/last-refresh.js';
import { getFlagsForNote, getNoteDetail } from './db/queries/note.js';
import { rerunOnWindow, runAiPass, runDeterministicPass } from './flagging/pipeline.js';
import { editRule, getActiveRule, listActiveRules, listRuleHistory, revertRule } from './rules/rules-admin.js';
import { seedIfEmpty } from './jobs/seed.js';
import { humanizeSince, resolveWindowFromAnchor, type WindowPreset } from './lib/time.js';
import { logger } from './lib/logger.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAngelView, renderIndividualView, renderLocationView } from './views/drilldown.js';
import { layout } from './views/layout.js';
import { renderLoginPage } from './views/auth-login.js';
import { seedUsers } from './jobs/seed-users.js';
import { renderDigestPreview } from './views/digest-preview.js';
import { previewStore } from './digest/preview-store.js';
import { runWeeklyDigest } from './jobs/weekly-digest.js';
import { renderNoteDetail } from './views/note-detail.js';
import { renderRuleEditForm, renderRulesHistory, renderRulesList, type RerunFragmentData } from './views/rules.js';
import { renderUploadPage } from './views/admin.js';
import {
  renderAngelDeleteConfirm, renderAngelForm, renderAngelsList,
  renderIndividualDeleteConfirm, renderIndividualForm, renderIndividualsList,
  renderLocationDeleteConfirm, renderLocationForm, renderLocationsList,
  renderManagerForm, renderManagersList,
  renderOpsNoticesList,
  renderRecipientForm, renderRecipientsList,
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
  if (seeded) logger.info('auto-seeded empty DB on cold boot');

  const det = runDeterministicPass();
  logger.info(
    {
      notification_level_red: det.notification_level.red,
      notification_level_yellow: det.notification_level.yellow,
      missing_written: det.missing.missing_written,
    },
    'boot: deterministic pass complete',
  );

  void runAiPass().catch((err) => {
    logger.error({ err: String(err) }, 'boot: AI pass failed');
  });
}

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
    path === '/readyz'
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
  const errorTyped = err === 'invalid_credentials' || err === 'google_hd_rejected' ? err : null;
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

app.get('/auth/google/start', (c) => {
  if (!config.GOOGLE_CLIENT_ID) return c.redirect('/auth/login', 302);
  // TODO(post-prototype): build real Google OAuth authorization-URL with hd.
  // For the prototype, surface a short status page so demos don't silently fail.
  return c.html(
    `<!doctype html><html><body style="font-family:system-ui;padding:32px;max-width:600px;margin:0 auto;">
      <h1 style="font-size:18px;">Google SSO not yet wired</h1>
      <p>Google OAuth integration ships after the prototype approval. Use the demo login for now.</p>
      <p><a href="/auth/login">← Back to sign in</a></p>
    </body></html>`,
  );
});

app.get('/auth/google/callback', (c) => {
  // Stub. Production flow: exchange code → verify id_token → check hd claim.
  return c.redirect('/auth/login?error=google_hd_rejected', 302);
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

  const overall = getOverallCounts(scope.locations, windowRange.start, windowRange.end);
  const locations = getLocationAggregates(scope.locations, windowRange.start, windowRange.end);
  const trend = getComplianceTrend(locationIds, windowRange.start, windowRange.end);

  const body = renderDashboard({
    window: windowRange,
    overall,
    locations,
    trend,
    filters: {
      severity: c.req.query('severity'),
      shift: c.req.query('shift'),
      locationId: c.req.query('loc'),
    },
  });

  return c.html(
    layout({
      title: 'Dashboard · Guardian Angel',
      body,
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.get('/location/:loc', (c) => {
  const scope = mustGetScope(c);
  const locId = c.req.param('loc');
  const loc = getLocationMeta(locId);
  if (!loc) return c.html(renderNotFoundPage(scope, 'Location not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(locId)) {
    return c.html(renderForbiddenPage(scope), 403);
  }

  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const angels = getAngelAggregatesForLocation(locId, windowRange.start, windowRange.end);

  return c.html(
    layout({
      title: `${loc.name} · Guardian Angel`,
      body: renderLocationView({ location: loc, angels, window: windowRange }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.get('/location/:loc/angel/:ang', (c) => {
  const scope = mustGetScope(c);
  const locId = c.req.param('loc');
  const angId = c.req.param('ang');
  const loc = getLocationMeta(locId);
  const ang = getAngelMeta(angId);
  if (!loc || !ang) return c.html(renderNotFoundPage(scope, 'Not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(locId)) {
    return c.html(renderForbiddenPage(scope), 403);
  }

  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const individuals = getIndividualAggregatesForAngel(locId, angId, windowRange.start, windowRange.end);

  return c.html(
    layout({
      title: `${ang.name} · Guardian Angel`,
      body: renderAngelView({
        location: { id: loc.id, name: loc.name },
        angel: { id: ang.id, name: ang.name, role: ang.role },
        individuals,
        window: windowRange,
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
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
  if (!loc || !ang || !ind) return c.html(renderNotFoundPage(scope, 'Not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(locId)) {
    return c.html(renderForbiddenPage(scope), 403);
  }

  const windowRange = resolveWindowFromAnchor(parseWindowParam(c.req.query('window')), getAnchorDate());
  const flags = getFlagsForDrilldown(locId, angId, indId, windowRange.start, windowRange.end);

  return c.html(
    layout({
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
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.get('/note/:tlog/:version', (c) => {
  const scope = mustGetScope(c);
  const tlogId = c.req.param('tlog');
  const version = Number.parseInt(c.req.param('version'), 10);
  if (!Number.isFinite(version)) return c.html(renderNotFoundPage(scope, 'Invalid version.'), 404);

  const note = getNoteDetail(tlogId, version);
  if (!note) return c.html(renderNotFoundPage(scope, 'Note not found.'), 404);
  if (scope.locations !== 'all' && !scope.locations.includes(note.program_id)) {
    return c.html(renderForbiddenPage(scope), 403);
  }

  const flags = getFlagsForNote(tlogId, version);

  return c.html(
    layout({
      title: `Note · Guardian Angel`,
      body: renderNoteDetail({ note, flags }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

// ---- Rules (US2) ---------------------------------------------------------------------------------

app.get('/rules', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(scope), 403);
  }
  return c.html(
    layout({
      title: 'Rules · Guardian Angel',
      body: renderRulesList(listActiveRules()),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'rules',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.get('/rules/:rule_key/edit', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(scope), 403);
  }
  const rule = getActiveRule(c.req.param('rule_key'));
  if (!rule) return c.html(renderNotFoundPage(scope, 'Rule not found.'), 404);
  const savedFromQuery = c.req.query('saved');
  return c.html(
    layout({
      title: `${rule.name} · Rules · Guardian Angel`,
      body: renderRuleEditForm({
        rule,
        ...(savedFromQuery ? { savedVersion: Number(savedFromQuery) } : {}),
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'rules',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.post('/rules/:rule_key', async (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(scope), 403);
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
      layout({
        title: `${updated.name} · Rules · Guardian Angel`,
        body: renderRuleEditForm({ rule: updated, savedVersion: updated.version, rerunResult }),
        user: { name: scope.user.name, role: scope.user.role },
        activeNav: 'rules',
        dataCurrentAs: humanizeSince(getLastIngestedAt()),
      }),
    );
  }

  return c.redirect(`/rules/${encodeURIComponent(ruleKey)}/edit?saved=${updated.version}`, 303);
});

app.get('/rules/:rule_key/history', (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(scope), 403);
  }
  const ruleKey = c.req.param('rule_key');
  const history = listRuleHistory(ruleKey);
  if (history.length === 0) return c.html(renderNotFoundPage(scope, 'Rule not found.'), 404);
  return c.html(
    layout({
      title: 'Previous versions · Guardian Angel',
      body: renderRulesHistory(ruleKey, history),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'rules',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.post('/rules/:rule_key/revert', async (c) => {
  const scope = mustGetScope(c);
  if (!canEditRules(scope)) {
    return c.html(renderForbiddenPage(scope), 403);
  }
  const ruleKey = c.req.param('rule_key');
  const body = await c.req.parseBody();
  const version = Number.parseInt(body.version as string, 10);
  if (!Number.isFinite(version)) return c.html(renderNotFoundPage(scope, 'Missing version.'), 404);
  const restored = revertRule(ruleKey, version, scope.user.id);
  return c.redirect(`/rules/${encodeURIComponent(ruleKey)}/edit?saved=${restored.version}`, 303);
});

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

function adminLayout(title: string, bodyHtml: string, scope: RequestScope): string {
  return layout({
    title: `${title} · Guardian Angel`,
    body: bodyHtml,
    user: { name: scope.user.name, role: scope.user.role },
    activeNav: 'settings',
    dataCurrentAs: humanizeSince(getLastIngestedAt()),
  });
}

// Settings hub
app.get('/admin/org', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  return c.html(adminLayout('Settings', renderSettingsHub(counts), scope));
});

// ---- Locations ----
app.get('/admin/locations', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Locations', renderLocationsList(listLocations(), listManagers()), scope));
});
app.get('/admin/locations/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Add location', renderLocationForm(null, listManagers()), scope));
});
app.get('/admin/locations/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const loc = getLocationRow(c.req.param('id'));
  if (!loc) return c.html(renderNotFoundPage(scope, 'Location not found.'), 404);
  return c.html(adminLayout('Edit location', renderLocationForm(loc, listManagers()), scope));
});
app.post('/admin/locations', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const loc = getLocationRow(c.req.param('id'));
  if (!loc) return c.html(renderNotFoundPage(scope, 'Location not found.'), 404);
  const refCounts = {
    angels: countAngelsAtLocation(loc.id),
    individuals: countIndividualsAtLocation(loc.id),
    tlogs: countTlogsAtLocation(loc.id),
  };
  return c.html(adminLayout('Deactivate location', renderLocationDeleteConfirm(loc, refCounts), scope));
});
app.post('/admin/locations/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  softDeleteLocation(c.req.param('id'));
  return c.redirect('/admin/locations', 303);
});

// ---- Angels ----
app.get('/admin/angels', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Angels', renderAngelsList(listAngels(), listLocations()), scope));
});
app.get('/admin/angels/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Add angel', renderAngelForm(null, listLocations()), scope));
});
app.get('/admin/angels/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const a = getAngelRow(c.req.param('id'));
  if (!a) return c.html(renderNotFoundPage(scope, 'Angel not found.'), 404);
  return c.html(adminLayout('Edit angel', renderAngelForm(a, listLocations()), scope));
});
app.post('/admin/angels', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const a = getAngelRow(c.req.param('id'));
  if (!a) return c.html(renderNotFoundPage(scope, 'Angel not found.'), 404);
  return c.html(adminLayout('Deactivate angel', renderAngelDeleteConfirm(a, countTlogsByAngel(a.id)), scope));
});
app.post('/admin/angels/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  softDeleteAngel(c.req.param('id'));
  return c.redirect('/admin/angels', 303);
});

// ---- Individuals ----
app.get('/admin/individuals', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Individuals', renderIndividualsList(listIndividuals(), listLocations()), scope));
});
app.get('/admin/individuals/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Add individual', renderIndividualForm(null, listLocations()), scope));
});
app.get('/admin/individuals/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const i = getIndividualRow(c.req.param('id'));
  if (!i) return c.html(renderNotFoundPage(scope, 'Individual not found.'), 404);
  return c.html(adminLayout('Edit individual', renderIndividualForm(i, listLocations()), scope));
});
app.post('/admin/individuals', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const i = getIndividualRow(c.req.param('id'));
  if (!i) return c.html(renderNotFoundPage(scope, 'Individual not found.'), 404);
  return c.html(adminLayout('Deactivate individual', renderIndividualDeleteConfirm(i, countTlogsByIndividual(i.id)), scope));
});
app.post('/admin/individuals/:id/delete', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  softDeleteIndividual(c.req.param('id'));
  return c.redirect('/admin/individuals', 303);
});

// ---- Managers ----
app.get('/admin/managers', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Managers', renderManagersList(listManagers()), scope));
});
app.get('/admin/managers/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Add manager', renderManagerForm(null), scope));
});
app.get('/admin/managers/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const m = getManagerRow(c.req.param('id'));
  if (!m) return c.html(renderNotFoundPage(scope, 'Manager not found.'), 404);
  return c.html(adminLayout('Edit manager', renderManagerForm(m), scope));
});
app.post('/admin/managers', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Shift schedules', renderSchedulesList(listShiftSchedules()), scope));
});
app.get('/admin/shift-schedules/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Add shift schedule', renderScheduleForm(null, listIndividuals()), scope));
});
app.get('/admin/shift-schedules/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const id = Number(c.req.param('id'));
  const row = getShiftSchedule(id);
  if (!row) return c.html(renderNotFoundPage(scope, 'Shift schedule not found.'), 404);
  return c.html(adminLayout('Edit shift schedule', renderScheduleForm(row, listIndividuals()), scope));
});
app.post('/admin/shift-schedules', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  deleteShiftSchedule(Number(c.req.param('id')));
  return c.redirect('/admin/shift-schedules', 303);
});

// ---- Digest recipients ----
app.get('/admin/recipients', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Digest recipients', renderRecipientsList(listRecipients(), listLocations()), scope));
});
app.get('/admin/recipients/new', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('Add recipient', renderRecipientForm(null, listLocations()), scope));
});
app.get('/admin/recipients/:id/edit', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  const r = getRecipient(Number(c.req.param('id')));
  if (!r) return c.html(renderNotFoundPage(scope, 'Recipient not found.'), 404);
  return c.html(adminLayout('Edit recipient', renderRecipientForm(r, listLocations()), scope));
});
app.post('/admin/recipients', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
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
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  deleteRecipient(Number(c.req.param('id')));
  return c.redirect('/admin/recipients', 303);
});

// ---- System messages ----
app.get('/admin/ops', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(adminLayout('System messages', renderOpsNoticesList(listOpsNotices({ limit: 50 })), scope));
});

// ---- Admin: Upload (carried over from Phase 8) ---------------------------------------------------

app.get('/admin/upload', (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);
  return c.html(
    layout({
      title: 'Upload Therap export · Guardian Angel',
      body: renderUploadPage(),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'settings',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

app.post('/admin/upload', async (c) => {
  const scope = mustGetScope(c);
  if (!allowAdminRoute(scope)) return c.html(renderForbiddenPage(scope), 403);

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
      layout({
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
        dataCurrentAs: humanizeSince(getLastIngestedAt()),
      }),
      400,
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return c.html(
      layout({
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
        dataCurrentAs: humanizeSince(getLastIngestedAt()),
      }),
      413,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = processUpload(file.name, buffer);

  return c.html(
    layout({
      title: 'Upload Therap export · Guardian Angel',
      body: renderUploadPage(result),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'settings',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
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
    layout({
      title: 'Weekly email preview · Guardian Angel',
      body: renderDigestPreview({
        digests: previewStore.list(),
        generatedAt: previewStore.lastGenerated(),
      }),
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
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

  return c.html(
    layout({
      title: `Search · Guardian Angel`,
      body: `<section>
        <h1 class="text-2xl font-semibold text-gray-900">Search</h1>
        <form method="get" action="/search" class="mt-4">
          <input name="q" value="${q.replace(/"/g, '&quot;')}" placeholder="Search notes…" class="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600" autofocus>
        </form>
        <div class="mt-6">${renderSearchResults(q, scopedHits)}</div>
      </section>`,
      user: { name: scope.user.name, role: scope.user.role },
      activeNav: 'dashboard',
      dataCurrentAs: humanizeSince(getLastIngestedAt()),
    }),
  );
});

// ---- Helpers -------------------------------------------------------------------------------------

function parseWindowParam(raw: string | undefined): WindowPreset {
  if (raw === 'this_week' || raw === '30d' || raw === 'all' || raw === '7d') return raw;
  return '7d';
}

function renderNotFoundPage(scope: RequestScope, message: string): string {
  return layout({
    title: 'Not found · Guardian Angel',
    body: `<section class="text-center py-12">
      <h1 class="text-2xl font-semibold text-gray-900">Not found</h1>
      <p class="mt-2 text-sm text-gray-600">${message}</p>
      <a href="/" class="mt-4 inline-block text-sm text-blue-600 hover:underline">Back to dashboard</a>
    </section>`,
    user: { name: scope.user.name, role: scope.user.role },
    activeNav: 'dashboard',
  });
}

function renderForbiddenPage(scope: RequestScope): string {
  return layout({
    title: 'Access denied · Guardian Angel',
    body: `<section class="text-center py-12">
      <h1 class="text-2xl font-semibold text-gray-900">Access denied</h1>
      <p class="mt-2 text-sm text-gray-600">You don't have access to this page. If you think this is a mistake, ask your admin.</p>
      <a href="/" class="mt-4 inline-block text-sm text-blue-600 hover:underline">Back to dashboard</a>
    </section>`,
    user: { name: scope.user.name, role: scope.user.role },
    activeNav: 'dashboard',
  });
}

// ---- Serve ---------------------------------------------------------------------------------------

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(
    { port: info.port, mode: config.PROTOTYPE_MODE ? 'prototype' : 'production' },
    'server started',
  );
});

export default app;
