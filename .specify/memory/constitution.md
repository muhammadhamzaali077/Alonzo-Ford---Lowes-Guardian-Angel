<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.0.1 (2026-04-21)
Bump rationale: PATCH — clarification of Principle V's `flag source` enum
values. The spec (`specs/001-compliance-monitor/spec.md` FR-004 and FR-005)
and the plan (`specs/001-compliance-monitor/plan.md` data-model) settled on
the shorter enum `notification_level, missing_schedule, ai_classifier`; the
original `deterministic_notification_level` prefix is redundant because
`flags.source` is already the column name. Non-semantic wording fix.
Modified: Principle V text.
Templates requiring update: none — plan and data-model already use the
clarified values.

Version change: (uninitialized template) → 1.0.0 (2026-04-21)
Bump rationale: Initial ratification. All ten principles are freshly defined
from the PRD and user input; there is no prior version to compare against.
Starting at 1.0.0 rather than 0.x because the principles are binding from day
one — they gate `/speckit.plan` and `/speckit.implement`.

Principles (all newly defined, replacing five generic template placeholders
with ten project-specific ones):
  [PRINCIPLE_1_NAME] → I. Stack Guardrails (NON-NEGOTIABLE)
  [PRINCIPLE_2_NAME] → II. PHI Discipline (NON-NEGOTIABLE)
  [PRINCIPLE_3_NAME] → III. Prototype Mode Is a First-Class Feature
  [PRINCIPLE_4_NAME] → IV. Compliance Rules Are Configuration, Not Code
  [PRINCIPLE_5_NAME] → V. Two Independent Flag Sources
  (added)          → VI. Preserve Original Note Text (NON-NEGOTIABLE)
  (added)          → VII. Mobile-Responsive Is a Hard Requirement
  (added)          → VIII. Scope Discipline
  (added)          → IX. Single-File Frontend Components
  (added)          → X. No Browser Storage APIs

Sections: [SECTION_2_NAME] → "Security & Data Handling".
          [SECTION_3_NAME] → "Development Workflow".
          Governance fully filled (was placeholder).

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — "Constitution Check" section
     references the constitution dynamically; no edit required.
  ⚠ .specify/templates/spec-template.md — verify scope/out-of-scope
     alignment with Principle VIII when `/speckit.specify` is run.
  ⚠ .specify/templates/tasks-template.md — verify task-traceability
     expectation (every task → PRD user story) when `/speckit.tasks` is run.
  ✅ CLAUDE.md — already reflects the PRD anchors that map to these
     principles; no edit required at this time.

Deferred / follow-up TODOs:
  TODO(doc-paths): The constitution input referenced `docs/prd.md` and
     `docs/stack.md`. The repository currently stores the PRD as
     `PRD-lowes-guardian-angel.md` in the root, and `stack.md` is not
     committed. Relocate-or-rename decision to be made during `/speckit.plan`.
-->

# Guardian Angel Compliance Monitor Constitution

This constitution establishes binding engineering principles for the Guardian
Angel Compliance Monitor — a compliance dashboard for Lowe's Guardian Angel
(LGA), a Georgia IDD care provider. It surfaces missing or out-of-tolerance
Therap progress notes ("T-Logs") on a red/yellow/green dashboard so that quality
assurance stops being a bottleneck on growth. The product replaces a broken
manual review chain, not existing software.

## Core Principles

### I. Stack Guardrails (NON-NEGOTIABLE)

Stack.md defaults override all other preferences. Implementations MUST use:

- **Runtime**: Node.js 20+ with TypeScript. Untyped JavaScript is forbidden in
  any file, including config and cron entry points.
- **Backend framework**: Hono. Nothing else.
- **Frontend**: server-rendered HTML fragments with Tailwind CSS and htmx.
  React, Vue, Svelte, Solid, any client-side framework, and any frontend build
  step are prohibited.
- **Database**: SQLite on a Railway volume. Postgres and hosted DB services are
  prohibited.
- **Hosting**: a single Railway service hosts the web app, API routes, cron
  jobs, and the SQLite file. No microservices, no split deployments.
- **Scheduling**: Railway cron only. n8n and external schedulers are prohibited.
- **AI**: OpenRouter only, Lightweight tier (Flash/Nano-class from Google or
  OpenAI). SoTA-tier models are prohibited for note classification.
- **Auth**: Better Auth. Hand-rolled auth is prohibited.
- **Email**: Resend or an equivalent transactional provider, chosen at
  implementation time. Self-hosted SMTP is prohibited.

**Rationale**: LGA is a Sagan member on the standard stack.md contract.
Deviating changes the cost model, the ops burden, and the hand-off profile for
future Sagan builds that reuse this codebase.

### II. PHI Discipline (NON-NEGOTIABLE)

Every T-Log description field MUST be treated as real PHI, even when content is
synthetic.

- Full note text MUST NOT be written to stdout, log files, error reporters,
  APMs, or any third-party observability surface. Logs reference IDs and
  severity only.
- Digest emails MUST contain summary counts and deep links into the
  authenticated dashboard. Note text in an email body is forbidden regardless
  of recipient.
- Classifier reasoning MUST persist in the database, not in application logs.

**Rationale**: DBHDD, CARF, and HIPAA obligations survive any "it's only
synthetic data" shortcut. Disciplining the logging surface now avoids a
production re-architecture later.

### III. Prototype Mode Is a First-Class Feature

The application MUST run end-to-end with zero external dependencies except
OpenRouter. Therap credentials, real email delivery, and SSO configuration MUST
NOT be prerequisites for a working demo.

- A demo-login path (single user + password sourced from an env var) MUST ship
  alongside the production Google Workspace SSO path. Both ship in v1.
- CSV fixtures under `/fixtures/` MUST be the default data source in prototype
  mode and MUST mirror the ExDF T-Log schema field-for-field. Production mode
  pulls the same schema via SFTP. The ingestion code path MUST be identical
  across modes; only the source differs.
- The weekly digest MUST render as an in-app preview in prototype mode, and
  MUST NOT actually send, even when SMTP credentials are present in the
  environment.

**Rationale**: Therap's Trading Partner Agreement is a multi-week contracting
gate. Customer approval depends on a fully functional demo that predates
contracting; any code path that forks would re-diverge before production.

### IV. Compliance Rules Are Configuration, Not Code

The classifier's rule set and prompt template MUST live in a database table
(`rule_config` or equivalent) and MUST be editable from an admin screen.

- Editing a rule in the UI MUST re-run the classifier against the currently
  visible notes and update flags in real time.
- Prompt text MUST NOT be hardcoded as a string literal inside request
  handlers, cron jobs, or any module other than the rule loader.

**Rationale**: The specific rules — "what does LGA mean by out-of-tolerance?" —
live in the heads of the CAO and VP of Operations. The editable rule screen is
the deliberate hook that invites them to hand that knowledge over.

### V. Two Independent Flag Sources

Flags MUST be produced through two clearly separated pipelines:

1. **Deterministic pre-flags** run first, with no LLM call:
   `notification_level = Medium` → yellow; `notification_level = High` → red.
   Missing-note detection is pure SQL against the configured shift schedule.
2. **AI classifier** runs second, only on notes not already flagged red by the
   deterministic path. It returns `{severity, reason}`. It MAY escalate a
   yellow deterministic flag to red; it MUST NOT downgrade a deterministic
   flag.

Every flag record MUST store its source as exactly one of the string
values `notification_level`, `missing_schedule`, or `ai_classifier`.

**Rationale**: Deterministic pre-flags are cheaper, faster, and defensible to
auditors without model evidence. The ordering preserves that auditability even
when the classifier disagrees with the deterministic read.

### VI. Preserve Original Note Text (NON-NEGOTIABLE)

AI classifications are supplementary metadata; they never replace the note.

- The original T-Log description field MUST be immutable in the database.
- Every flag record MUST store model name, model version, prompt version, and
  the reasoning text the classifier returned.
- Any audit-trail view MUST be able to show a reviewer exactly why a flag
  fired, against the exact text the angel wrote.

**Rationale**: Regulatory audits work by reading the original record. A
classification that overwrote or obscured it would turn a compliance tool into
a compliance liability.

### VII. Mobile-Responsive Is a Hard Requirement

Managers open the dashboard on phones in the field. This is a product
constraint, not a nice-to-have.

- Every view MUST render correctly at 375px viewport width.
- The location → angel → individual → note drill-down MUST be usable with one
  thumb: targets ≥ 44px, no hover-only affordances, no horizontal scroll on
  primary views.

**Rationale**: The manual review chain this product replaces runs in the
field. A desktop-only dashboard would not, in practice, replace it.

### VIII. Scope Discipline

The four user stories in the PRD define the entire v1. Out-of-scope items —
email/calendar management, HR/BambooHR, phone dictation, auto-write-back to
Therap, predictive analytics — remain out.

- Adding a fifth user story requires explicit user approval in writing before
  implementation.
- Every task emitted by `/speckit.tasks` MUST trace to a PRD user story or to
  infrastructure that directly supports one. Orphan tasks are rejected.

**Rationale**: Alonzo explicitly walked back phone dictation in the discovery
call. Feature creep unwinds the economics of the low-cost delivery model Sagan
committed to.

### IX. Single-File Frontend Components

Per stack.md, HTML artifacts MUST keep JavaScript and CSS inline.

- No separate JS bundles beyond Tailwind (CDN or Play CDN in prototype; proper
  Tailwind build only if JIT purge is demonstrably required for payload size).
- Server endpoints MUST return HTML fragments for htmx. JSON is reserved for
  non-UI surfaces (health checks, webhook acks) and MUST NOT drive any view a
  user sees.

**Rationale**: No build step means no build failures, no `node_modules` in the
hosting image, and a dashboard that a non-JS engineer can still read. The
frontend stays boring on purpose.

### X. No Browser Storage APIs

The frontend MUST NOT use `localStorage`, `sessionStorage`, or `IndexedDB`.

All client-visible state lives on the server in SQLite. Session and identity
cookies managed by Better Auth are the only client-side persistence permitted.

**Rationale**: Browser storage fragments the source of truth, complicates PHI
handling, and invites offline caching of precisely the data Principle II
forbids to persist outside the database.

## Security & Data Handling

- **PHI boundary**: data originating from Therap — or synthetic data shaped
  like Therap data — is PHI. It is readable only through authenticated routes
  behind Better Auth.
- **Logging**: structured logs reference note IDs, angel IDs, individual IDs,
  and flag severity. They do NOT include `note_text`, `classifier_reason`, or
  any free-text field an angel typed.
- **Transport**: all external I/O (SFTP, OpenRouter, Resend, Google OAuth)
  MUST run over TLS. SFTP private keys MUST be supplied via environment-bound
  file paths; keys are never committed and never logged.
- **Retention**: audit records (flag reason, model version, prompt version,
  user who edited a rule) are append-only. The original T-Log description is
  immutable per Principle VI.

## Development Workflow

- **Constitution Check gate**: the `/speckit.plan` output MUST include a
  Constitution Check section evaluating the plan against Principles I, II,
  III, V, and VI before Phase 0 research begins. Unresolved failures block the
  plan.
- **Traceability**: every task emitted by `/speckit.tasks` MUST name the PRD
  user story (or supporting infrastructure) it serves.
- **Deviation protocol**: when an engineer considers a tool or technique not
  listed in `stack.md`, the PR description MUST record (a) the specific
  customer need the tool addresses and (b) why no stack.md tool handles it.
  "I prefer X" is not sufficient.
- **Review stance**: PR review treats Principle violations the same as test
  failures — blocking, not advisory.

## Governance

- **Source of truth for scope**: `PRD-lowes-guardian-angel.md` is the
  authoritative scope document. Any scope change beyond its four user stories
  requires explicit user approval before implementation.
- **Amendments**: changes to this constitution require (1) a pull request
  modifying `.specify/memory/constitution.md`, (2) a Sync Impact Report entry
  at the top of this file documenting the version bump, and (3) user
  approval.
- **Versioning**: semantic. MAJOR for backward-incompatible principle
  removals or redefinitions; MINOR for additions or materially expanded
  guidance; PATCH for clarifications, wording fixes, and non-semantic
  refinements.
- **Compliance review**: `/speckit.analyze` cross-checks spec, plan, and
  tasks against these principles. Running it before `/speckit.implement` is
  recommended; running it before shipping to the customer is mandatory.

**Version**: 1.0.1 | **Ratified**: 2026-04-21 | **Last Amended**: 2026-04-21
