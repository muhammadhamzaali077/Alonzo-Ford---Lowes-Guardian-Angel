# Implementation Plan: Guardian Angel Compliance Monitor

**Branch**: `001-compliance-monitor` | **Date**: 2026-04-21 | **Spec**: [./spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-compliance-monitor/spec.md`

## Summary

Replace LGA's broken manual-review chain with a red/yellow/green dashboard over Therap T-Logs. One Railway service, one Node.js 20+ process, one SQLite file. Hono serves both HTML fragments (htmx-driven drill-down) and cron entry points. Flagging pipeline runs on ingestion: missing-note pass → deterministic `notification_level` pass → deterministic similarity pre-pass → AI classifier pass (consumes similarity score as structured context, may escalate but never downgrade). Prototype mode is first-class: fixtures seed the DB via `npm run seed`, demo login works with zero external dependencies except OpenRouter, and the weekly digest renders as an in-app preview instead of sending.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+ (strict mode, no untyped JS anywhere per Principle I)
**Primary Dependencies**: Hono (HTTP), better-sqlite3 (DB), better-auth (auth + Google Workspace SSO), htmx via CDN, Tailwind via Play CDN, zod (env + request validation), pino (structured logs), xlsx / SheetJS (Excel upload), p-limit (classifier concurrency), `ssh2-sftp-client` (production only — scaffolded, not wired), resend (production email; prototype intercepts). Classifier call is a hand-rolled `fetch` to OpenRouter — no SDK dependency.
**Storage**: SQLite on a Railway-mounted volume at `/data/gam.db`. Accessed through better-sqlite3 synchronous API (fast, perfect for single-process Hono).
**Testing**: Node built-in `node:test` runner invoked via `tsx`. Unit tests on pure flagging functions + missing-note detection. One integration test loads fixtures, runs the full flagging pipeline, and asserts Jamal's copy-paste count and Sunrise's Friday missing count.
**Target Platform**: Railway — single service, Node 20 runtime, volume mount at `/data`, cron entries declared in `railway.json`.
**Project Type**: Single web service. HTML-fragment frontend + REST-free htmx backend + cron entry points all share one Hono app, one deploy, one log stream.
**Performance Goals**: Any dashboard page renders in <1s. Rule re-run on last-7-days window (~150 notes on synthetic fixtures) completes in <30s at classifier concurrency = 5.
**Constraints**: Every T-Log description is PHI (synthetic or not). No note text, classifier reasoning, summary, or individual name in logs, emails, or browser storage. Mobile-first at 375px — no horizontal scroll, 44px tap targets, no hover-only affordances.
**Scale/Scope**: v1 sizing — ~100 angels, ~100 individuals, ~300 notes/day at production steady state. Prototype runs on 648 seeded notes across 31 days.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate evaluation | Status |
|-----------|-----------------|--------|
| **I. Stack Guardrails** | Node 20+/TS, Hono, better-sqlite3, htmx + Tailwind (Play CDN, prototype-only — see Complexity note), single Railway service, Railway cron, OpenRouter Lightweight, Better Auth, Resend. All within guardrails. | PASS |
| **II. PHI Discipline** | Logger config strips `description, summary, individual_name, reason` from every log entry. Digest email body carries counts + severities + deep-links only (data-model + contracts enforced). Classifier reasoning persisted to `flags.reason`, never logged. | PASS |
| **III. Prototype Mode** | `PROTOTYPE_MODE=true` default. `npm run seed` loads fixtures idempotently. Demo login always works. Digest send path hard-wired to preview renderer when `PROTOTYPE_MODE=true` — env guard in `sendDigest()` short-circuits before any Resend call. | PASS |
| **IV. Rules as Config** | `rule_config` table is the only source of prompt text. Editing emits a new version row; the classifier always reads `is_active=1`. Prompt-template string never appears outside `src/rules/rule-loader.ts`. | PASS |
| **V. Two Independent Flag Sources** | Pipeline order in `src/flagging/pipeline.ts`: (1) missing-note pass, (2) `notification_level` pass, (2.5) similarity pre-pass, (3) AI classifier pass. Classifier skips any T-Log already flagged red; escalate-only on yellow. Source enum locked per constitution v1.0.1: `notification_level`, `missing_schedule`, `ai_classifier`. | PASS |
| **VI. Preserve Original Note Text** | `t_logs` composite PK `(tlog_id, version)`, `is_current INTEGER NOT NULL DEFAULT 1`, unique partial index `idx_tlogs_current ON t_logs(tlog_id) WHERE is_current=1`. Ingestion never UPDATEs a T-Log row; re-ingest inserts a new version and flips prior `is_current` to 0. Flags store model_name, model_version, prompt_version (= `rule_config.version`), reason. | PASS |
| **VII. Mobile-Responsive** | Tailwind mobile-first defaults, every primary view checked at 375px in a Playwright device-emulation pass (run manually; no CI requirement). Drill-down works with tap, no hover-only UI. | PASS |
| **VIII. Scope Discipline** | Four user stories. Four src subdirs (`flagging/`, `rules/`, `digest/`, `admin/`). No feature flags, no email/calendar, no HR, no phone dictation. Out-of-scope list repeated in `quickstart.md`. | PASS |
| **IX. Single-File Frontend** | No JSX, no build step for frontend. View modules export `function <view>(data: T): string` returning tagged template strings. Tailwind + htmx via CDN. All interactivity is htmx-triggered server fragments — no separate client bundle. | PASS |
| **X. No Browser Storage** | No `localStorage`, `sessionStorage`, or `IndexedDB` anywhere in view code. All client state lives server-side; Better Auth cookies are the only persistence. Confirmed by a grep-style precommit check in the test suite. | PASS |

**Verdict**: All ten gates pass at plan time. No complexity tracking entries required aside from the documented Tailwind-Play-CDN note below.

## Project Structure

### Documentation (this feature)

```text
specs/001-compliance-monitor/
├── plan.md              # This file
├── spec.md              # /speckit.specify output
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── http-routes.md   # Phase 1 output — all HTTP surfaces
├── checklists/
│   └── requirements.md  # spec quality checklist
└── tasks.md             # created by /speckit.tasks (not yet)
```

### Source Code (repository root)

```text
src/
├── server.ts                     # Hono app wiring + Better Auth mount + route registration
├── config.ts                     # zod-validated env parsing; PROTOTYPE_MODE detection
├── db/
│   ├── client.ts                 # better-sqlite3 singleton, migration runner, WAL mode
│   ├── schema.sql                # raw DDL (TypeScript everywhere for code, SQL allowed for DDL)
│   └── migrate.ts                # migration driver invoked on boot
├── ingestion/
│   ├── csv-loader.ts             # fixtures loader (used by `npm run seed`)
│   ├── excel-upload.ts           # SheetJS-based admin upload path
│   ├── sftp-poller.ts            # scaffolded; TODO(post-BAA)
│   └── normalize.ts              # CSV/Excel rows → t_logs insert shape (handles composite PK + is_current flip)
├── flagging/
│   ├── pipeline.ts               # orchestrates missing → notification_level → similarity → AI
│   ├── missing.ts                # per (individual, shift) SQL; angel attribution best-effort
│   ├── notification-level.ts     # deterministic High→red, Medium→yellow
│   ├── similarity.ts             # token-overlap score vs author's last N notes (default N=20)
│   └── classifier.ts             # OpenRouter fetch + response parse + retry cap
├── rules/
│   ├── rule-loader.ts            # reads active rule_config, assembles prompt template
│   ├── rules-admin.ts            # rule CRUD, version bump on save
│   └── default-rules.ts          # seeded DBHDD-flavored rule set (TS file, PR-reviewable)
├── digest/
│   ├── render.ts                 # renderDigest(recipient): returns HTML string (counts + deep links only)
│   ├── send.ts                   # sendDigest guarded by PROTOTYPE_MODE; prod path calls Resend
│   └── preview.ts                # in-app preview route handler
├── admin/
│   ├── org.ts                    # locations, angels, managers, individuals, shift schedules CRUD
│   ├── recipients.ts             # digest recipients CRUD
│   ├── upload.ts                 # Excel upload handler + per-row outcome summary
│   └── ops.ts                    # /admin/ops — ops_notices history view
├── auth/
│   ├── better-auth.ts            # Better Auth config, demo provider + Google provider (hd claim)
│   └── scope.ts                  # request-scope middleware; computes user.locations from user_location_scope
├── views/                        # HTML-fragment view functions — one file per screen
│   ├── layout.ts                 # shared <html> shell with htmx + Tailwind CDN refs
│   ├── dashboard.ts              # top-level location/manager grid + trend line
│   ├── drilldown.ts              # location→angel→individual→note pages
│   ├── rules.ts                  # rule-edit + re-run + history
│   ├── digest-preview.ts         # rendered digest page
│   ├── admin.ts                  # admin screens
│   └── ops.ts                    # ops-notices list
├── lib/
│   ├── logger.ts                 # pino configured with PHI-redaction allowlist
│   ├── concurrency.ts            # p-limit wrapper for classifier
│   ├── time.ts                   # TZ-safe date math (America/New_York)
│   └── html.ts                   # tag-template helper + HTML-escape
└── jobs/
    ├── cron.ts                   # Railway cron dispatch (reads action from env/arg)
    ├── poll-and-flag.ts          # hourly job: SFTP poll (stubbed) → flagging pipeline
    ├── classifier-retry.ts       # 15-min job: retry notes with classifier_error, cap at 3 attempts
    ├── weekly-digest.ts          # Monday 08:00 ET: generate digest; prototype → preview only
    └── ingestion-gap-check.ts    # detect zero-note weeks; write ops_notice + suppress digest

fixtures/
├── lga_org_structure.csv         # existing (4 locations, 20 angels, 12 individuals)
└── lga_synthetic_tlogs.csv       # existing (648 rows, 2026-03-15 → 2026-04-14)

tests/
├── unit/
│   ├── notification-level.test.ts
│   ├── missing.test.ts
│   ├── similarity.test.ts
│   └── scope.test.ts
├── integration/
│   └── fixtures-pipeline.test.ts # load fixtures → run pipeline → assert Jamal cluster + Sunrise missing
└── helpers/
    └── test-db.ts                # :memory: DB factory + fixture seeder

railway.json                      # cron declarations + volume mount
.env.example                      # all env vars, empty values
package.json                      # scripts: build, start, seed, test, dev
tsconfig.json                     # strict: true, target ES2022
```

**Structure Decision**: Single-service web app. No separate `frontend/` or `backend/` — the Hono server hosts HTML fragments, JSON-free routes, and cron entry points. Matches PRD stack and Principle IX.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Tailwind Play CDN in prototype | Principle I/IX permits it explicitly for prototype; a proper Tailwind build adds a Node build step that doesn't buy anything for demo payload sizes. | A build-time Tailwind would require a bundler step (esbuild/tsup) just to purge CSS. FOUC on first paint is acceptable for a demo, not for production. Documented as TODO(post-prototype) in `.env.example` and `README.md`. |

No other violations.

## Post-Design Constitution Re-Check

After Phase 1 artifacts (`data-model.md`, `contracts/http-routes.md`, `quickstart.md`) were produced, the ten principles were re-evaluated against the detailed design. No new violations introduced. Notable design choices that reinforce the gates:

- **P2 / P6**: `data-model.md` codifies the unique partial index `idx_tlogs_current ON t_logs(tlog_id) WHERE is_current=1`, making "one current version per TLOG_ID" a DB-enforced invariant rather than an application-layer assertion.
- **P5**: The pipeline module boundary in `src/flagging/pipeline.ts` is enforced by function signatures in `contracts/http-routes.md` — the AI step receives already-severe notes as a filtered input, not a full set.
- **P4**: `rule_config.prompt_template` is read only from `src/rules/rule-loader.ts`. No other module imports the column. Contracts-level discipline.
- **P6**: `flags` records store `rule_version` (foreign key to the `rule_config.version` that produced the flag) so a reviewer can replay the exact prompt against the original immutable note.
- **P10**: Contracts list only `Cookie`-based session persistence. No route returns data intended for browser-side storage.

**Verdict**: All ten gates still pass post-design. No complexity-tracking additions.
