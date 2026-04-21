# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository is **pre-implementation**. It contains the product inputs for a build but no application source yet:

- `PRD-lowes-guardian-angel.md` — the approved build spec (read this first)
- `transcript.md` — the discovery call it was derived from (ground truth for intent)
- `.specify/` + `.claude/skills/speckit-*` — GitHub Spec Kit scaffolding (v0.6.2.dev0) used to drive the build workflow

Do not invent source directories, package.json, or tests — none exist. The first implementation step is to run the Spec Kit workflow (below) to produce a filled constitution, a feature spec, a plan, and tasks before any code lands.

## The Build (from the PRD)

**Guardian Angel Compliance Monitor** for Lowe's Guardian Angel (LGA), a Georgia assisted-living/disability-services provider. It ingests daily T-Log progress notes from Therap (EMR), flags missing notes and out-of-tolerance content, and surfaces a red/yellow/green dashboard with drill-down (location → angel → individual → note) plus weekly digest emails.

Anchors that should shape every implementation decision:

- **Prototype-first, synthetic data.** The first deliverable runs entirely on seeded synthetic data (~30 days, 4 locations, 20 angels, 12 individuals). Therap access is gated behind a multi-week Trading Partner Agreement (NDA + BAA); do not block prototype work on it.
- **Ingestion is SFTP, not REST.** Therap's public REST API does not cover T-Logs. Production ingestion is Therap's External Data Feed (ExDF) — SFTP CSV pulled on a schedule. A manual Therap UI Excel upload is the bridge path. Do not scrape or login-proxy the Therap portal.
- **Two separate detection paths.** (1) Missing-note rules are pure schedule logic over expected shifts per individual. (2) Content red-flag classification uses a Lightweight-tier LLM on note text. Each T-Log also carries a structured `notification level` (Low/Medium/High) — use that as a deterministic pre-flag before calling the model.
- **Compliance rules are editable config, not hardcoded prompts.** LGA's CAO + VP Ops own the rule definitions. Build a config screen; treat the rule set as data.
- **Always preserve original note text + the model's reasoning.** AI classifications are supplementary, never replacements. Flags must be auditable.
- **PHI everywhere.** Prefer summary stats + deep-links in emails over note content in email bodies. Confirm any AI provider's HIPAA posture before sending real PHI (Anthropic requires a BAA).

See PRD §Out of Scope for items that look tempting but are explicitly deferred (phone dictation, HR/BambooHR, email/calendar, auto-writeback to Therap).

## Stack Target (per PRD §Stack Suggestions)

| Layer | Choice |
|---|---|
| Hosting | Railway (single service for dashboard + SFTP poller + classifier + cron) |
| Frontend | HTML + Tailwind + htmx (server-rendered, no build step) |
| Backend | Hono on Node.js + TypeScript |
| DB | SQLite on a Railway volume |
| Scheduling | Railway cron (never n8n — stack.md rule) |
| AI | OpenRouter, Lightweight tier |
| Auth | Better Auth + Google Workspace SSO, restricted to `lowesguardianangel.com` via `hd` (validate server-side) |
| Email | Resend or equivalent |

Expected env vars: `THERAP_SFTP_HOST`, `THERAP_SFTP_USER`, `THERAP_SFTP_PRIVATE_KEY_PATH`, `OPENROUTER_API_KEY`, `EMAIL_API_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `DATABASE_PATH`.

The engineer may diverge if warranted, but diverge consciously — these are Sagan-wide defaults, not suggestions.

## Spec Kit Workflow

Work is driven by user-invoked slash commands that read/write `.specify/` and `specs/<NNN-feature>/`. Each command has a corresponding skill under `.claude/skills/speckit-*/SKILL.md` — follow those instructions verbatim when a command is invoked; do not improvise the phase.

Normal order:

1. `/speckit.constitution` — fill `.specify/memory/constitution.md` (currently a template with `[PLACEHOLDERS]`; must be filled before spec work is meaningful)
2. `/speckit.specify` — create `specs/NNN-feature/spec.md`
3. `/speckit.clarify` — resolve open questions in the spec
4. `/speckit.plan` — produce `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`
5. `/speckit.tasks` — produce `tasks.md` (P1 user story first, each story independently testable)
6. `/speckit.analyze` — cross-check spec ↔ plan ↔ tasks
7. `/speckit.implement` — execute tasks

Supporting commands: `/speckit.checklist`, `/speckit.taskstoissues`.

### Git is wired into every phase

`.specify/extensions.yml` registers `before_*` / `after_*` hooks that invoke the `git` extension automatically:

- `before_constitution` → `speckit.git.initialize` (non-optional)
- `before_specify` → `speckit.git.feature` (non-optional; **creates a new branch each time**)
- `before_*` / `after_*` for clarify/plan/tasks/implement/checklist/analyze/taskstoissues → `speckit.git.commit` (optional; prompts)

Because `before_specify` always branches, running `/speckit.specify` on `master` is expected — the hook will put you on a new `NNN-feature-name` branch. Branch numbering is **sequential** (`001-`, `002-`, ...) per `.specify/init-options.json`, not timestamped.

### Feature directory resolution

Scripts in `.specify/scripts/bash/` use this priority to find the current feature dir:

1. `SPECIFY_FEATURE_DIRECTORY` env var
2. `feature_directory` in `.specify/feature.json`
3. Numeric-prefix match of the current git branch against `specs/NNN-*`

If a script errors with "Not on a feature branch," you're on `master`/`main` — create a feature branch via `/speckit.specify` rather than hand-editing.

## Conventions specific to this repo

- **Target date context.** The PRD is dated 2026-04-16. When writing spec artifacts, prefer absolute dates — Spec Kit templates embed `[DATE]` fields.
- **Two realities for "data."** Until ExDF is live, "real data" means synthetic seed data shaped to ExDF's CSV schema (`individual ID, staff ID, date, shift/time, location, note type, notification level, note text`). Anything the prototype does must work against that shape; match field names to the Therap schema once the Trading Partner Agreement is signed.
- **Language matters.** "Angel" = LGA staff (DSP/nurse/manager). "Individual" = person receiving care. "T-Log" = Therap's daily shift-note module. Use these terms in user-facing copy and domain code — it's how Alonzo and team think.
- **`.DS_Store` is committed to the tree** and should be added to `.gitignore` when one is created.

## Active Technologies
- TypeScript 5.x on Node.js 20+ (strict mode, no untyped JS anywhere per Principle I) + Hono (HTTP), better-sqlite3 (DB), better-auth (auth + Google Workspace SSO), htmx via CDN, Tailwind via Play CDN, zod (env + request validation), pino (structured logs), xlsx / SheetJS (Excel upload), p-limit (classifier concurrency), `ssh2-sftp-client` (production only — scaffolded, not wired), resend (production email; prototype intercepts). Classifier call is a hand-rolled `fetch` to OpenRouter — no SDK dependency. (001-compliance-monitor)
- SQLite on a Railway-mounted volume at `/data/gam.db`. Accessed through better-sqlite3 synchronous API (fast, perfect for single-process Hono). (001-compliance-monitor)

## Recent Changes
- 001-compliance-monitor: Added TypeScript 5.x on Node.js 20+ (strict mode, no untyped JS anywhere per Principle I) + Hono (HTTP), better-sqlite3 (DB), better-auth (auth + Google Workspace SSO), htmx via CDN, Tailwind via Play CDN, zod (env + request validation), pino (structured logs), xlsx / SheetJS (Excel upload), p-limit (classifier concurrency), `ssh2-sftp-client` (production only — scaffolded, not wired), resend (production email; prototype intercepts). Classifier call is a hand-rolled `fetch` to OpenRouter — no SDK dependency.
