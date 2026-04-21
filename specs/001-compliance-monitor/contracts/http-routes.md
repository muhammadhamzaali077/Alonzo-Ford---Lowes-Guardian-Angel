# HTTP Routes Contract

**Feature**: 001-compliance-monitor
**Date**: 2026-04-21
**Audience**: engineers wiring up Hono handlers.

This is the complete route surface of the app. Every route returns either a full HTML page, an HTML fragment (for htmx swaps), or — in one narrow case — a 204/302 redirect. **No route returns JSON for anything a user sees** (Principle IX). A small number of JSON routes exist for machine-to-machine use (ops cron readiness probe, classifier-usage export) and are marked explicitly.

## Authentication

- All routes except `/auth/*`, `/healthz`, and `/readyz` require an authenticated session.
- Session is established by Better Auth's cookie; middleware in `src/auth/better-auth.ts` rejects unauthenticated requests with a 302 to `/auth/login`.
- Scope middleware (`src/auth/scope.ts`) resolves the user's scope on every request — **never trust a query param** for scope.

## Role matrix

| Role | Can reach |
|------|-----------|
| `leadership` | Dashboard + drill-down (all), rules config + edit, admin ops, digest preview (all scopes), all admin screens |
| `admin` | Everything `leadership` can, plus user/recipients CRUD |
| `manager` | Dashboard scoped to their `user_location_scope` rows; drill-down into their locations only; digest preview for their scope only; **cannot** reach rules, admin, ops |
| `demo` | Identical to `leadership` in prototype; disabled when `PROTOTYPE_MODE=false` |

Any scope violation returns **403 with a fragment**, never a redirect loop.

---

## Auth routes

### `GET /auth/login`

Renders the login page: demo-login form on top (always visible), "Sign in with Google" button below (only rendered when `GOOGLE_CLIENT_ID` is set).

### `POST /auth/login/demo`

Body: `email`, `password`. Validates against the seeded demo user (password from `DEMO_LOGIN_PASSWORD`). On success: session cookie set, 302 to `/`.

### `GET /auth/google/start`

Kicks off the Google OAuth dance with `hd=lowesguardianangel.com` query param.

### `GET /auth/google/callback`

Exchanges code for ID token, verifies `hd` claim server-side, upserts `users` row keyed on email, establishes session, 302 to `/`. Rejects any `hd` other than `lowesguardianangel.com` with a 403 page.

### `POST /auth/logout`

Clears session cookie, 302 to `/auth/login`.

---

## Dashboard + drill-down (US1)

All routes return an HTML fragment when `HX-Request: true` (for htmx swaps into `#main`), full page otherwise.

### `GET /`

**Top-level dashboard.** Shows the red/yellow/green grid (location × severity), per-manager roll-up, last-refresh timestamp, trend-line chart of compliance score per location over the selected period.

Query params:
- `start` — ISO date; default = today − 7 days
- `end` — ISO date; default = today
- `sev` — one of `all`, `red`, `yellow`; default `all`
- `shift` — one of `all`, `Day`, `Swing`, `Overnight`; default `all`
- `loc` — location_id or `all`; default `all`
- `manager` — manager_id or `all`; default `all`
- `individual` — individual_id or `all`; default `all`

Manager scope overrides `loc`/`manager` params — a manager's request for another location's data returns 403 regardless of the query string.

### `GET /location/:location_id`

Location drill-down: per-angel flag counts within the selected period + filters (inherited from query string). 403 if the user's scope doesn't include `location_id`.

### `GET /location/:location_id/angel/:angel_id`

Angel drill-down: per-individual flag counts for that angel at that location.

### `GET /location/:location_id/angel/:angel_id/individual/:individual_id`

List of flagged notes. Each row links to the note-detail route.

### `GET /note/:tlog_id/:version`

**Specific note page.** Renders:
- original `description` (the full, immutable text)
- structured fields: notification_level, type, shift_name, time_in, time_out, individual_name, author name
- all flags for this (tlog_id, version) — deterministic + AI — with:
  - rule name + rule version link to `/rules/:rule_id/v/:version`
  - source enum (`notification_level`, `missing_schedule`, `ai_classifier`)
  - for AI flags: model_name, model_version, prompt_version, reason
- audit chain: prior flags (superseded_by_rerun) listed in an expandable "rule history" panel

Scope: 403 unless user's scope includes this note's `program_id` (= `location_id`).

### `GET /search`

Free-text search across `t_logs.description` and `t_logs.summary`. Scope-aware — the SQL always filters `program_id IN <user's scope>` first. htmx-triggered on `input changed delay:300ms`.

Query params: `q` (required), `start`, `end`.

Returns a fragment: top-20 hits, each linking to the corresponding note page.

### `GET /note/:tlog_id/history`

Shows all versions of the TLOG — `is_current` on top, superseded versions below with their `superseded_at` timestamps. Scope-checked like the note page.

---

## Rules config + re-run (US2)

All rules routes require `leadership` or `admin` role.

### `GET /rules`

Renders the rules-config screen: list of active rules (one per `rule_key`), each with name, description, prompt-template, and config_json knobs. Each rule links to `/rules/:rule_key/edit` and `/rules/:rule_key/history`.

### `GET /rules/:rule_key/edit`

Edit form: name, description, prompt_template (textarea), config_json knobs (rendered as typed inputs per rule — e.g., similarity_threshold is a slider 0–1).

### `POST /rules/:rule_key`

Body: form fields above. Creates a new `rule_config` row with `version = prev.version + 1`, flips prior `is_active` to 0, returns a fragment showing "saved, v{N+1} active; re-run?" with a button to trigger re-run.

### `POST /rules/rerun`

Body: `window_start`, `window_end` (ISO dates; default last 7 days). Kicks off the re-run pipeline for affected notes:
- Updates existing flag `resolution` to `superseded_by_rerun` for any flag whose `tlog_id` falls in the window AND whose `source = 'ai_classifier'`.
- Re-runs the AI pass for each of those notes.
- Does NOT touch `notification_level` or `missing_schedule` flags — deterministic sources are invariant w.r.t. rule changes.

Returns a streaming fragment (htmx SSE) with progress updates every ~2s; final fragment is the updated dashboard for the window.

### `GET /rules/:rule_key/history`

Shows every version of the rule with timestamps + authors + diff from prior. A "revert to this" button on each prior version submits to `POST /rules/:rule_key` with that version's content, creating a new version row and triggering re-run.

---

## Weekly digest + preview (US3)

### `GET /digest/preview`

Renders the preview page: one "envelope" per recipient scope.

Each envelope shows:
- To: recipient_email
- Subject: `Guardian Angel — Week of YYYY-MM-DD`
- Body: HTML rendering of `renderDigest(recipient)` — counts, severities, deep links. **Zero note text.** (FR-022.)

In prototype mode (`PROTOTYPE_MODE=true`): a banner at top reads "Preview only — no emails will be sent."

In production mode: a "Send now" button posts to `POST /digest/send-now/:recipient_id`. That route is hidden in prototype mode.

### `POST /digest/send-now/:recipient_id` (production-only)

Dispatches the digest via Resend. `PROTOTYPE_MODE=true` routes this to the preview renderer instead; the button is hidden in that case but the server-side handler also checks the env flag as defense in depth.

### Internal cron entry points (not HTTP-reachable)

- `node dist/jobs/weekly-digest.js` — runs at the Railway cron schedule. In prototype: writes the rendered HTML into the DB's `ops_notices` with `category='digest_suppressed'` if the ingestion-gap check flagged the window, otherwise persists to a transient in-memory preview cache that the preview route reads. In production: iterates active recipients, calls `sendDigest(recipient)`.

---

## Admin + upload (US4)

All admin routes require `admin` role (leadership can read, but write requires `admin`).

### `GET /admin/org`

Top-level admin hub: links to locations, angels, managers, individuals, shift-schedules, recipients.

### `GET /admin/org/locations`, `POST /admin/org/locations`, `GET /admin/org/locations/:id`, `POST /admin/org/locations/:id`, `POST /admin/org/locations/:id/delete`

CRUD for locations. Same pattern for `/angels`, `/managers`, `/individuals`, `/shift-schedules`, `/recipients`.

Deletes are soft — set a `deleted_at` timestamp where applicable; for locations/angels/individuals with referenced flags, deletes are refused with a 409 fragment (forces the admin to reassign first).

### `GET /admin/upload`

Upload page: file picker, "Upload" button. Accepts .xlsx (SheetJS) or .csv (native parser).

### `POST /admin/upload`

Multipart body with `file`. Stream to memory up to 10 MB cap. Parses, normalizes, inserts T-Logs via the same ingestion path as the CSV loader. Runs flagging pipeline on inserted rows.

Returns a fragment with the upload summary:

```text
Upload summary
  File: therap_export_2026-04-15.xlsx
  Rows parsed: 230
  Rows ingested: 224
  Rows skipped: 6
    - row 18: unknown angel ANG999
    - row 91: unknown individual IND999
    - row 103: invalid notification_level 'Urgent'
    - ...
  Flagging pipeline: completed in 4.2s
  New flags: 37 (28 notification_level, 5 ai_classifier, 4 missing_schedule)
```

Summary is persisted to `ops_notices` with `category = 'upload_partial'` if any rows were skipped.

### `GET /admin/ops`

Ops notices page. Shows the last 50 `ops_notices` rows by `created_at DESC`, filterable by category. Each row is read-only.

### `GET /admin/ops/export.json` (admin-only, JSON)

**Exception to the "no JSON" rule.** Returns the last 500 ops notices as JSON for piping into external monitoring if LGA wants to wire one up later. Restricted to `admin` role, scoped to nothing user-visible. Documented as the only JSON route in the app.

---

## Health and readiness

### `GET /healthz`

Plaintext `ok` + 200. No auth. Railway's liveness probe.

### `GET /readyz`

Plaintext `ready` + 200 when:
- DB file exists and schema version matches expected,
- at least one `rule_config` row with `is_active=1` exists,
- (production only) OpenRouter ping succeeds within 2s.

Returns `not ready` + 503 otherwise. No auth.

---

## Error shapes

Every error response is either a full HTML error page (for non-htmx requests) or an error fragment (for htmx requests, swapped into `#main`). The fragment:

- includes a human-readable message,
- no stack trace (those go to logs, minus PHI),
- a correlation ID (also in logs) that support can use to cross-reference.

Status codes:

| Code | When |
|------|------|
| 302 | Redirect after auth action |
| 400 | Malformed request (zod validation failed) |
| 403 | Scope violation or role check failed |
| 404 | Unknown tlog_id, angel_id, etc. |
| 409 | Delete refused (references exist) |
| 429 | Classifier rate-limit forwarded to UI during re-run (rare) |
| 500 | Unhandled error; correlation ID surfaced |

---

## Contract invariants (binding on implementation)

1. **No HTML fragment ever embeds raw `description`, `summary`, `reason`, or `individual_name` inside a `<script>` or `data-*` attribute.** All such strings are HTML-escaped once and rendered inside text nodes. Unit test greps the view modules for string concatenation into attributes.
2. **No JSON response body carries note text.** The `/admin/ops/export.json` route's schema excludes all PHI keys; a unit test runs 50 representative ops_notices rows through the serializer and asserts the output keys are a subset of the allowlist.
3. **Every route handler reads scope from the request-scope middleware result, never from a query param.** A test introspects the route registry and fails any handler whose signature accepts `loc` or `manager` params without calling `req.scope` first.
4. **Every scoped route returns 403 (not 404) for scope violations on known resources.** 404 is reserved for genuinely unknown IDs. This matters because leaking "this resource exists" to a manager outside the scope is a low-grade info leak.
5. **The digest render function is pure.** `renderDigest(recipient, windowStart, windowEnd)` has no side effects and no network calls. `sendDigest` is the only side-effectful wrapper, and `sendDigest`'s first line is `if (PROTOTYPE_MODE) return previewRenderer.save(recipient, html)`.
