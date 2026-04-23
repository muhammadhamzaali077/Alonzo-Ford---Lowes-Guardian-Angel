# PROJECT_ANALYSIS.md — Guardian Angel Compliance Monitor

_Analysis date: 2026-04-23. Branch: `001-compliance-monitor`._

---

## 1. Project Overview

**Purpose.** A compliance dashboard for **Lowe's Guardian Angel (LGA)**, a Georgia assisted-living / IDD provider. It ingests daily **T-Log progress notes** from **Therap** (EMR), flags notes that are missing or out-of-tolerance, and surfaces a **red/yellow/green dashboard** with drill-down (location → angel → individual → note) plus **weekly digest emails**. See `PRD-lowes-guardian-angel.md` for the full product spec and `transcript.md` for the discovery call it was derived from.

**Status.** Prototype implementation is live on branch `001-compliance-monitor`. The app runs end-to-end against **synthetic seed data** (648 T-Logs across 31 days, 4 locations, 20 angels, 12 individuals in `fixtures/`). Real Therap SFTP ingestion is **scaffolded but not wired** — it's gated on a signed Therap Trading Partner Agreement (NDA + BAA). Production email (Resend) is also deferred behind `PROTOTYPE_MODE`.

**Tech stack (from `package.json`, `tsconfig.json`, `src/`).**

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 20, TypeScript 5.x, strict mode, `noUncheckedIndexedAccess` on, ES2022/NodeNext modules |
| HTTP | **Hono** `^4.6.10` on `@hono/node-server` |
| DB | **better-sqlite3** `^12.0.0` (synchronous), SQLite file on disk (`./dev.db` locally, `/data/gam.db` on Railway) |
| Frontend | Server-rendered HTML fragments from TS tagged-template-literal view functions. **Tailwind via Play CDN**, **htmx via unpkg CDN**. No JSX, no bundler, no build step for the frontend. |
| Auth | Prototype uses a hand-rolled random-hex session stored in `user_sessions` table with HttpOnly cookies. **Better Auth** `^1.1.0` is in `dependencies` but not yet wired — the Google Workspace SSO path (`/auth/google/*`) is a stub. |
| AI | Hand-rolled `fetch` to **OpenRouter** chat-completions endpoint (no SDK), Lightweight tier. Default model `google/gemini-flash-lite-2.0`, swappable via `OPENROUTER_MODEL`. Response validated with zod. |
| Email | **Resend** `^4.0.1` in deps; prototype mode intercepts all sends into an in-memory preview store. |
| Ingestion | **SheetJS (`xlsx`)** for admin Excel/CSV upload. **`ssh2-sftp-client`** installed but not called — Therap SFTP poller is a post-BAA TODO. |
| Logging | **pino** with a custom PHI-redaction formatter that blanks `description`, `summary`, `reason`, `individual_name`, `note_text` at any nesting depth. |
| Scheduling | Railway cron entries declared in `railway.json` (hourly poll-and-flag, 15-min classifier-retry, Monday 11:30 UTC ingestion-gap-check, Monday 12:00 UTC weekly-digest). |
| Date math | `date-fns` + `date-fns-tz` (America/New_York TZ-aware). |
| Concurrency | `p-limit` caps classifier fan-out. |
| Validation | `zod` for env (`src/config.ts`) and classifier response envelope. |

**Required runtime.** Node 20+. macOS/Linux/WSL2 are preferred; `better-sqlite3` on native Windows works but is fragile per `specs/001-compliance-monitor/quickstart.md`.

---

## 2. Architecture & Structure

**Pattern.** Single-service web app. One Railway process hosts HTTP, cron job entry points, and the SQLite file. No microservices, no client-side SPA. Route handlers assemble HTML strings from view functions (pure `(data) => string`) and return them as `c.html(...)`. htmx handles partial updates.

### Directory map

```
/
├── PRD-lowes-guardian-angel.md   # Product spec — ground truth for scope
├── transcript.md                 # Discovery call transcript
├── CLAUDE.md                     # Per-repo rules for Claude Code
├── railway.json                  # Railway cron + deploy config
├── package.json                  # scripts, deps (ESM, "type":"module")
├── tsconfig.json                 # strict TS, NodeNext, outputs to dist/
├── .env.example                  # All env vars, heavily commented
├── .env                          # Local values (gitignored in principle; currently committed)
├── dev.db / dev.db-shm / dev.db-wal  # Local SQLite DB (WAL mode)
├── fixtures/
│   ├── lga_org_structure.csv    # 4 locations, 20 angels, 12 individuals
│   └── lga_synthetic_tlogs.csv  # 648 synthetic T-Log rows
├── .specify/                     # GitHub Spec Kit scaffolding v0.6.2.dev0
│   ├── memory/constitution.md    # 10 binding principles (v1.0.1)
│   ├── extensions.yml            # git hooks for each speckit phase
│   └── scripts/, templates/, integrations/
├── specs/001-compliance-monitor/
│   ├── spec.md, plan.md, research.md, data-model.md, quickstart.md
│   ├── tasks.md                  # Phase-ordered task list (the work backlog)
│   └── contracts/http-routes.md, checklists/requirements.md
├── dist/                         # `tsc` output; also copies schema.sql
├── node_modules/
├── tests/unit/                   # 11 unit test files (no integration/helpers yet)
└── src/
    ├── server.ts                 # Hono app — ALL route registration (~1050 lines)
    ├── config.ts                 # zod-validated env loader, lazy Proxy
    ├── lib/                      # logger (PHI redaction), concurrency, time, stopwords
    ├── db/
    │   ├── client.ts             # better-sqlite3 singleton (WAL, FK on, 5s busy_timeout)
    │   ├── schema.sql            # full DDL (copied to dist/ at build)
    │   ├── migrate.ts            # schema_versions-table driven; CURRENT_SCHEMA_VERSION=2
    │   ├── seed-schedules.ts     # default shift patterns
    │   └── queries/              # 14 query modules (one per domain: angels, dashboard, drilldown, digest, note, etc.)
    ├── auth/
    │   ├── login.ts              # demo email/password
    │   ├── session.ts            # cookie + user_sessions CRUD
    │   └── scope.ts              # scope middleware + role/location gate helpers
    ├── ingestion/
    │   ├── org-csv-loader.ts     # locations/angels/individuals/managers from CSV
    │   ├── tlog-csv-loader.ts    # synthetic fixture loader
    │   ├── excel-upload.ts       # SheetJS xlsx/csv upload
    │   ├── normalize.ts          # CSV row → t_logs insert shape
    │   └── insert-tlog.ts        # composite-PK + is_current flip logic (+ inline similarity)
    ├── flagging/                 # THE CORE PIPELINE
    │   ├── pipeline.ts           # runDeterministicPass, runAiPass, rerunOnWindow
    │   ├── missing.ts            # expected-vs-present shift check, angel attribution heuristic
    │   ├── notification-level.ts # High→red / Medium→yellow deterministic
    │   ├── similarity.ts         # Jaccard token-overlap vs author's last 20 notes
    │   ├── classifier.ts         # OpenRouter call + zod-validated verdict
    │   ├── classifier-usage.ts   # token-usage bookkeeping
    │   └── write-flag.ts         # INSERT INTO flags helper
    ├── rules/
    │   ├── default-rules.ts      # 5 seed rules (copy_paste, short_note, vague_content, medication_refusal, incident_language)
    │   ├── rule-loader.ts        # THE ONLY module reading rule_config.prompt_template (P4)
    │   ├── rules-admin.ts        # edit/revert/list; version-bump on save
    │   └── seed-rules.ts
    ├── digest/
    │   ├── render.ts             # pure HTML-string renderer (counts + deep links only)
    │   ├── send.ts               # PROTOTYPE_MODE short-circuits to preview-store
    │   └── preview-store.ts      # in-memory map of latest rendered digests
    ├── admin/upload.ts           # Excel-upload result builder
    ├── jobs/
    │   ├── seed.ts               # `npm run seed` — idempotent full bootstrap
    │   ├── seed-users.ts         # demo + manager + admin accounts, location-scoped
    │   ├── weekly-digest.ts      # Monday 08:00 ET: render + dispatch each recipient
    │   ├── classifier-retry.ts   # 15-min: retry classifier_status='retry' rows, cap 3
    │   └── ingestion-gap-check.ts
    └── views/                    # HTML-fragment view functions (one file per screen)
        ├── layout.ts             # <html> shell, header, nav, footer, escapeHtml
        ├── dashboard.ts, drilldown.ts, note-detail.ts, trend-chart.ts, search.ts, ui.ts
        ├── rules.ts, admin.ts, admin-org.ts, digest-preview.ts, auth-login.ts
```

### Entry points

- **`src/server.ts`** — the only process entry. Runs `migrate()` + `seedUsers()` at boot; in `PROTOTYPE_MODE` also runs `seedIfEmpty()` and kicks off the deterministic + AI flagging passes. Then `serve({ fetch: app.fetch, port: config.PORT })`.
- **Job CLIs** — each `src/jobs/*.ts` detects `import.meta.url === pathToFileURL(argv[1])` and invokes its top-level function. Mapped to `npm run seed`, `npm run job:digest`, `npm run job:retry`. Cron counterparts declared in `railway.json`.
- **Build artifact** — `npm run build` emits `dist/server.js` and copies `schema.sql` to `dist/db/schema.sql`; `npm start` runs `node dist/server.js`.

### How it connects

```
Request ──► Hono app (src/server.ts)
            ├─ scopeMiddleware  (reads ga_session cookie → resolves role + locations)
            ├─ auth gate        (redirect non-public paths to /auth/login when unscoped)
            └─ handler          (view function → HTML string)

Boot      ──► migrate() → seedUsers() → [PROTOTYPE] seedIfEmpty() → runDeterministicPass() → runAiPass()
Cron      ──► weekly-digest / classifier-retry / ingestion-gap-check / poll-and-flag (stub)
Upload    ──► /admin/upload POST → processUpload() → normalize → insertTlog (+ inline similarity) → writeFlag passes
Rule edit ──► /rules/:key POST → editRule() (version++) → optional rerunOnWindow()
                                                        └─► supersede open ai_classifier flags → reset t_logs.classifier_status → runAiPass(force=true)
```

---

## 3. Core Logic

### Data flow for a single T-Log

1. **Ingestion** (`src/ingestion/insert-tlog.ts`) — A row arrives via CSV seed, Excel upload, or (eventually) SFTP. If the same `tlog_id` already exists, the prior row is flipped to `is_current=0`, `superseded_at=now`, and a new version row inserted (`version = max+1`). The `idx_tlogs_current` partial unique index enforces one current version per `tlog_id`. Similarity is computed inline against the author's prior 20 current notes.
2. **Deterministic passes** (`src/flagging/pipeline.ts::runDeterministicPass`):
   - **Missing-note** (`missing.ts`): expand `shift_schedule` patterns over the window, subtract present `t_logs`, apply grace hours, write `source='missing_schedule'` red flags. Angel attribution uses the "single DSP at location" heuristic (noted as post-prototype swap point).
   - **Notification level** (`notification-level.ts`): Therap `High` → red (`high_priority`), `Medium` → yellow (`medium_priority`), `Low` → no flag.
3. **AI classifier pass** (`pipeline.ts::runAiPass`): for each current T-Log with no open deterministic red flag:
   - Build system prompt from active `rule_config` rows via `rules/rule-loader.ts` (the **only** module allowed to read `prompt_template` — constitution P4).
   - Build structured JSON user message including `similarity_max_score`, `similar_match_count`, `matched_prior_note_excerpt` (first 200 chars of top match).
   - Call OpenRouter via hand-rolled `fetch` (`flagging/classifier.ts`) with `response_format: { type: 'json_object' }`, temperature 0, 3-attempt in-call retry with exponential backoff on 429/5xx/network.
   - Validate response against `VerdictSchema` (zod): `{ severity: green|yellow|red, reason: ≤240 chars }`.
   - Non-green verdicts write a new `source='ai_classifier'` flag alongside any existing deterministic flag. Escalation only — never downgrade.
   - Permanent failure (3 attempts) writes an `ops_notices` row with category `classifier_permanent_failure`.
4. **Rule re-run** (`pipeline.ts::rerunOnWindow`): marks every open `ai_classifier` flag in-window as `superseded_by_rerun`, resets `classifier_status='pending'` for those T-Logs, then re-runs the AI pass with `force=true`. Deterministic flags are untouched.
5. **Weekly digest** (`src/jobs/weekly-digest.ts`): for each active `digest_recipient`, build this-week vs prior-week counts, call `renderDigest()` (pure HTML), and `sendDigest()` which either saves to `previewStore` (prototype) or calls Resend (not wired). Recipients with zero notes in window → `digest_suppressed` ops notice.

### Critical files

| File | Role |
|---|---|
| `src/server.ts` | Single ~1050-line route table. All auth, CRUD, drill-down, search, upload, digest-preview, rules pages registered here. |
| `src/flagging/pipeline.ts` | Orchestrator for deterministic + AI passes and the re-run flow. The `has_open_red_det` SQL filter implements the "AI never fires on already-red deterministic" rule. |
| `src/flagging/classifier.ts` | OpenRouter call + retry + zod response parsing. Notably: `tlog_id` goes in logs; `reason` and `description` never do. |
| `src/flagging/missing.ts` | Missing-note detection; date math uses `expandScheduleOverWindow` + `shiftEndUtc` from `lib/time.ts` (America/New_York). |
| `src/flagging/similarity.ts` | Jaccard token-set overlap, stopword-filtered, O(n·k). Pure functions + persistence helpers. |
| `src/rules/rule-loader.ts` | Assembles the classifier system prompt from active rule rows (P4 chokepoint). |
| `src/db/schema.sql` | Full DDL — tables for managers, locations, angels, individuals, shift_schedule, t_logs (composite PK + is_current), rule_config (versioned), flags (source enum locked), users/user_sessions/user_location_scope, digest_recipients, classifier_usage, ops_notices, schema_versions. WAL, FKs on, partial indexes for is_current and retry. |
| `src/db/migrate.ts` | `schema_versions`-driven, reads `schema.sql` relative to module location (works under `tsx` and compiled `dist/`). Current version: 2. |
| `src/auth/scope.ts` | Role model (`admin`/`leadership`/`manager`/`demo`) + location-scope resolution (`'all'` vs array from `user_location_scope`). |
| `src/lib/logger.ts` | pino with `scrubPhi` formatter that recursively redacts the five PHI keys at all depths — the load-bearing piece of constitution P2. |
| `src/digest/send.ts` | First line is the `PROTOTYPE_MODE` guard — there is no code path to Resend when the flag is true. |

### Design patterns

- **View = pure function.** Each `views/*.ts` exports `function renderX(data): string`. No state, no side effects, testable in isolation.
- **Query module per domain.** `db/queries/*.ts` owns prepared statements; handlers never write inline SQL (with a few exceptions in the admin settings hub).
- **DI through default parameters.** Functions accept `db: BetterSqliteDatabase = getDb()` so tests can pass `:memory:` DBs.
- **Composite PK + `is_current` partial unique index.** Original note text is preserved across re-ingestions (constitution P6).
- **Versioned rules.** `rule_config(rule_key, version)` with an `is_active` partial index; re-runs tag produced flags with `rule_version` for audit replay.
- **Source enum locked** at `notification_level | missing_schedule | ai_classifier` by constitution v1.0.1 — adding a new source requires a constitution bump.
- **"Escalate, never downgrade."** AI only adds a flag to a yellow; a row with a deterministic red is skipped entirely before the classifier call.

---

## 4. Configuration & Environment

### Files

- **`.env.example`** (88 lines, heavily commented) — the canonical list of env vars.
- **`.env`** (present, gitignored by rule but currently committed — see §6).
- **`src/config.ts`** — `zod`-validated parse with a `Proxy` that defers load until first property access (so tests can `import { loadConfig }` without tripping required-env validation). Refuses to boot if `APP_URL` points to a non-local host while `DEMO_LOGIN_PASSWORD` is still the default `"demo"`.
- **`railway.json`** — `NIXPACKS` builder, `/healthz` health check, 4 cron entries.
- **`tsconfig.json`** — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, target ES2022, NodeNext.
- **`.specify/`** — Spec Kit scaffolding, including `memory/constitution.md` (10 binding principles).

### Required env vars

| Var | Scope | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Always | Only mandatory var for the prototype. Refuses to boot without it. |
| `OPENROUTER_MODEL` | Always | Default `google/gemini-flash-lite-2.0`. Swap via env only — no code change. |
| `DATABASE_PATH` | Always | `./dev.db` local, `/data/gam.db` on Railway volume. |
| `APP_URL` | Always | Used in classifier `HTTP-Referer` + redirect validation. |
| `PROTOTYPE_MODE` | Always | Defaults `true`. Controls autoseed, digest-preview vs Resend, demo login prefill. |
| `BETTER_AUTH_SECRET` | Always | Auto-generated on first seed; required explicitly in prod. |
| `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` | Prototype | `demo@lowesguardianangel.com` / `demo`. |
| `LOG_LEVEL`, `PORT`, `NODE_ENV` | Always | pino level, HTTP port, env tag. |
| `THERAP_SFTP_HOST`, `THERAP_SFTP_USER`, `THERAP_SFTP_PRIVATE_KEY_PATH` | Production only | Scaffolded; requires signed Therap Trading Partner Agreement. |
| `EMAIL_API_KEY` | Production only | Resend. Prototype never calls it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Production only | Google Workspace SSO (`hd=lowesguardianangel.com`); UI shows "not yet wired" stub. |

### External services

- **OpenRouter** — chat-completions endpoint (`https://openrouter.ai/api/v1/chat/completions`). The only external dep required to boot.
- **Therap (via SFTP)** — ExDF CSV pulls, post-BAA. Not yet connected.
- **Resend** — transactional email, post-prototype.
- **Google Workspace** — SSO for `lowesguardianangel.com` tenant, post-prototype.
- **Railway** — hosting, volume, cron, deploy target.

### Database

Single SQLite file, WAL mode, foreign keys on. Schema in `src/db/schema.sql`; tables include `managers`, `locations`, `angels`, `individuals`, `shift_schedule`, `t_logs` (composite PK), `rule_config` (versioned), `flags`, `users`, `user_location_scope`, `user_sessions`, `digest_recipients`, `classifier_usage`, `ops_notices`, `schema_versions`. Managed by an 80-line migrate driver keyed on `schema_versions`.

---

## 5. Build, Run & Test

### Install

```bash
npm install          # installs all deps incl. better-sqlite3 native build
cp .env.example .env
# edit .env — set at minimum OPENROUTER_API_KEY=sk-or-...
```

### Run locally

```bash
npm run dev          # tsx --watch src/server.ts, reads .env
# then open http://localhost:3000
# login:    demo@lowesguardianangel.com / demo
```

On first start in `PROTOTYPE_MODE`, `seedIfEmpty()` loads fixtures (~648 notes, 31 days), runs the deterministic pass synchronously and kicks off the AI pass in the background.

### Manual seed / reseed

```bash
npm run seed         # idempotent — safe to re-run
# to reseed from scratch: delete dev.db* and run again
```

### Tests

Node's built-in `node:test` runner driven via `tsx`:

```bash
npm test             # node --import tsx --test "tests/**/*.test.ts"
npm run typecheck    # tsc --noEmit
```

Current coverage (`tests/unit/`): `config`, `logger`, `notification-level`, `missing`, `similarity`, `supersession`, `queries`, `rule-loader`, `rules-admin`, `classifier-retry`, `scope`. `tests/integration/` and `tests/helpers/` directories exist but are empty (`.gitkeep` only).

### Build & deploy

```bash
npm run build        # tsc + copies src/db/schema.sql → dist/db/schema.sql
npm start            # node dist/server.js (Railway's start command)
```

Deploy: push to GitHub → Railway (NIXPACKS) → add a volume mount at `/data` → set env → Railway cron auto-registers from `railway.json`. Full walk-through in `specs/001-compliance-monitor/quickstart.md`.

### Ad-hoc jobs

```bash
npm run job:digest   # regenerate weekly digest (stores to preview in prototype)
npm run job:retry    # retry classifier_status='retry' rows, cap at 3
```

---

## 6. Key Observations

### Unusual / notable patterns

- **HTML out of tagged-template functions, no JSX, no bundler.** Every view is `function render…(data): string`. Tailwind and htmx both load from CDN at runtime. This is enforced by constitution Principle IX ("Single-File Frontend Components"). Expect FOUC on first paint; explicitly called out as a prototype-only tradeoff.
- **One 1050-line `server.ts`.** Every route is registered in one file. That's deliberate per the plan — no separate router modules. It's legible but searches for a route always start from one place.
- **Config lazy-Proxy.** `src/config.ts` exports `config` as a `Proxy` that defers zod parsing until first property read. Lets tests import helpers without tripping required-env validation.
- **Spec Kit drives process, not code.** `.specify/` holds the 10-principle constitution, plan/spec/tasks/research/data-model markdown, and git hooks that branch on `/speckit.specify`. The `001-compliance-monitor` branch name comes from the `before_specify` hook.
- **Better Auth is a dependency but not yet used.** Current session scheme is hand-rolled (random-hex id in `user_sessions`). `src/auth/scope.ts` comments call out the swap point. Google SSO (`/auth/google/start`) returns a placeholder HTML page.
- **The AI never contradicts deterministic red.** The SQL in `pipeline.ts::loadPendingRows` filters out rows with an open red deterministic flag before a classifier call is made — this is a load-bearing invariant per constitution P5.
- **PHI redaction at log-formatter level.** `src/lib/logger.ts::scrubPhi` walks the entire log object recursively and replaces `description`, `summary`, `reason`, `individual_name`, `note_text` with `[REDACTED]`. Any new field that looks like note text should be added to `PHI_KEYS`.
- **Prototype/production split is first-class.** `PROTOTYPE_MODE` gates autoseed, demo login prefill, digest intercept, and refuses to serve a non-local `APP_URL` with default demo password. `sendDigest`'s first line is the prototype guard.

### Things that look incomplete (by design)

- `src/ingestion/sftp-poller.ts` — **not present**. The `ssh2-sftp-client` dep is installed but unused. Per `CLAUDE.md` this is gated on the Therap Trading Partner Agreement.
- `jobs/poll-and-flag.ts` — referenced in `railway.json` cron but not in `src/jobs/`. It's in the tasks.md backlog.
- `auth/better-auth.ts` — planned in `plan.md` §Project Structure but not yet created. Better Auth is unused at runtime.
- Google SSO callback is a 302 to `?error=google_hd_rejected` — intentional placeholder.
- `/admin/ops` is a read-only list; there's no acknowledgement/dismiss flow yet.
- `tests/integration/` and `tests/helpers/` are empty directories.

### Security concerns & flags

- **`.env` is committed to the repo.** `.gitignore` lists `.env` but the file exists in the tree (`Apr 21 14:47`). If it contains a real OpenRouter key, it should be rotated and `git rm --cached .env`'d. Double-check before any public push.
- **`dev.db`, `dev.db-shm`, `dev.db-wal` are committed.** These are also in `.gitignore`. The DB is populated with synthetic PHI-shaped data — not real PHI, but still worth cleaning the tree.
- **`.DS_Store` is committed** — noted in `CLAUDE.md`; `.gitignore` covers it but the existing file is tracked.
- **Demo password refusal is the only production guardrail.** It blocks booting with default creds behind a non-local URL, but doesn't block weak passwords per se. Fine for prototype.
- **Google `hd` claim verification is a TODO.** `/auth/google/callback` today just 302s to an error — safe, but the production flow isn't wired. If the callback is wired without `hd` enforcement it would accept any Google account.
- **No CSRF protection** on the POST handlers. Cookies are `SameSite=Lax`, which prevents cross-site form posts in modern browsers, but there's no synchronizer token. Noted as acceptable per the mobile-first prototype profile.
- **Dependency freshness.** Top deps are current as of April 2026 (Hono 4.6, better-sqlite3 12, zod 3.23). No obvious audit-flagged outdated packages.

### Coding conventions observed

- **Naming.** `snake_case` for DB columns and SQL-derived row shapes, `camelCase` for TS identifiers. React-style PascalCase nowhere.
- **File layout.** Feature-first under `src/` (`flagging/`, `rules/`, `digest/`, `admin/`, `auth/`, `ingestion/`). Pure `lib/` for cross-feature helpers.
- **Import style.** ESM-first, relative imports with `.js` extensions (NodeNext convention). No barrel files.
- **Typing.** Interfaces exported per module; zod schemas for anything crossing a boundary (env, classifier response). No `any`; `noUncheckedIndexedAccess` is on, so lots of `!` assertions and `??` fallbacks around array/object access.
- **Error handling.** Functions return `{ ok: true, ... } | { ok: false, error_code, message }` for fallible operations (see `classifier.ts`). Handlers log and surface in-page error messages rather than exceptions.
- **Comments.** Fairly generous — explain *why* (constitution refs, research refs like "R13", "P5") rather than *what*. `TODO(post-prototype)` / `TODO(post-BAA)` markers flag deferred work.
- **SQL.** Prepared statements with named parameters (`@name`) inside `db/queries/*.ts`. Multi-line strings are template literals.
- **Vocabulary.** "Angel" = caregiver, "Individual" = person receiving care, "T-Log" = daily note. Used consistently in UI copy and domain code.

---

## 7. Summary

### Executive summary (5 sentences)

**Guardian Angel Compliance Monitor** is a single-service TypeScript/Hono web app that ingests Therap T-Log progress notes from Lowe's Guardian Angel, runs them through a three-stage flag pipeline (missing-schedule → deterministic notification-level → LLM content classifier via OpenRouter), and surfaces results on a red/yellow/green dashboard with drill-down and weekly email digests. The codebase is well past scaffolding — ~30 source files across `src/`, a 270-line SQLite schema, 11 unit-test files, full dashboard, rules editor, admin CRUD, Excel upload, and weekly-digest preview all work end-to-end against 648 synthetic T-Logs seeded at boot. Everything is shaped to honor a formal 10-principle constitution (`.specify/memory/constitution.md`) covering stack guardrails, PHI discipline, prototype-first data, rules-as-configuration, two independent flag sources, preservation of original note text, mobile-first UI, scope discipline, single-file frontend, and no browser storage. The production cutover is deliberately gated on external steps — Therap SFTP wiring (needs a signed Trading Partner Agreement + BAA), Resend email wiring, Better Auth / Google Workspace SSO — and each of those has explicit `TODO(post-prototype)` or `TODO(post-BAA)` markers at its swap point. The main risks in the current tree are a committed `.env` file and a committed `dev.db`, both of which are listed in `.gitignore` but already tracked; neither contains real PHI, but both should be cleaned before any public exposure.

### Read-first path for a new contributor

1. **`PRD-lowes-guardian-angel.md`** — the product spec. Ground truth for scope and vocabulary.
2. **`CLAUDE.md`** — the repo-specific working rules and the stack/conventions cheat sheet.
3. **`.specify/memory/constitution.md`** — the 10 binding principles every new feature has to pass.
4. **`specs/001-compliance-monitor/spec.md` then `plan.md` then `data-model.md`** — what was built and why, in that order.
5. **`specs/001-compliance-monitor/quickstart.md`** — the zero-to-demo runbook.
6. **`src/db/schema.sql`** — the entire domain model in 270 lines.
7. **`src/server.ts`** — every route, in order. Skim top-to-bottom to see surface area.
8. **`src/flagging/pipeline.ts`** — the core business logic. Everything else orbits it.
9. **`src/flagging/missing.ts`, `notification-level.ts`, `similarity.ts`, `classifier.ts`** — the four flag producers, in pipeline order.
10. **`src/rules/rule-loader.ts` + `rules/default-rules.ts`** — how compliance rules become classifier prompts.
11. **`specs/001-compliance-monitor/tasks.md`** — the work backlog, organized by phase and user story.

Start the dev server (`npm install`, add `OPENROUTER_API_KEY` to `.env`, `npm run dev`) and click through the hero narrative in `quickstart.md` §"The hero demo narrative" before editing anything. The synthetic data is tuned so that specific names (Jamal Roberts / Sarah K. / the Sunrise Friday gaps) reveal each flag type.
