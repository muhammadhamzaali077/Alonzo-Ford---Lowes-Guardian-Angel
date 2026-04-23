# Feature Specification: Guardian Angel Compliance Monitor

**Feature Branch**: `001-compliance-monitor`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "Guardian Angel Compliance Monitor — a compliance dashboard for Lowe's Guardian Angel (LGA), a Georgia IDD care provider. Surfaces missing or out-of-tolerance Therap T-Log progress notes on a red/yellow/green dashboard with drill-down, editable compliance rules, and weekly digest emails. Source of truth is the PRD at `PRD-lowes-guardian-angel.md`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leadership sees where compliance is on fire today (Priority: P1)

Alonzo (CEO) and Elaina (VP of Operations) open the dashboard, get a five-second read on red/yellow/green status across every location and every manager, and click through — location → angel → individual → specific note — to the exact flagged note that caused the red, including the original note text, the structured Therap fields, and the rule (or AI reasoning) that flagged it. Location managers see the same flow scoped to their own location.

**Why this priority**: Without this, the product does nothing. It replaces the missing feedback loop that has governed LGA's growth. All four PRD user stories ultimately exist to feed this view.

**Independent Test**: With synthetic fixtures loaded (30 days of T-Logs, 4 locations, 20 angels, 12 individuals) and deterministic flag rules in place (`notification_level` High → red; Medium → yellow), a leader can log in, identify Riverside Group Home as yellow for the week, drill down to Jamal Roberts's flagged notes, open a specific flagged note, and read the rule that fired. This ships as a standalone MVP even if the AI classifier and digest emails don't exist yet.

**Acceptance Scenarios**:

1. **Given** synthetic fixtures are loaded and deterministic flags are computed, **When** Alonzo signs in and lands on the dashboard, **Then** he sees a color-coded grid of locations and managers for the last 7 days, a last-refreshed timestamp, and a trend line of compliance score per location.
2. **Given** Alonzo is on the dashboard, **When** he clicks a red or yellow cell for Riverside Group Home, **Then** he sees Riverside's angels with their flag counts for the period.
3. **Given** Alonzo is viewing Riverside's angels, **When** he clicks Jamal Roberts, **Then** he sees the individuals Jamal wrote notes for with per-individual flag counts, and can open any specific flagged note.
4. **Given** Alonzo has opened a specific flagged note, **When** the note page renders, **Then** he sees the full original note text, the structured Therap fields (notification level, type, shift, time in/out), the triggering rule name, whether the flag was deterministic or AI-classified, and — for AI-classified flags — the reasoning string plus model and prompt versions.
5. **Given** a location manager (Vivian at Riverside) signs in, **When** the dashboard renders, **Then** she sees only Riverside's data and cannot navigate to or filter into any other location's notes.
6. **Given** Alonzo is on the dashboard, **When** he applies filters (date range, severity, shift, manager, location, individual) or types a search term, **Then** the grid and drill-down counts update to reflect the filter within the current period.
7. **Given** any page in the app, **When** it is viewed at 375px viewport width, **Then** the content remains usable with one thumb — no horizontal scroll on primary views, tap targets at least 44px, drill-down navigable without hover.

---

### User Story 2 - Elaina edits a compliance rule and watches flags update live (Priority: P2)

Elaina (VP of Operations) — with the CAO's input — opens the rules-config screen, reads the current rule set, tightens or expands a rule (for example, changing the copy-paste threshold or the minimum note length), clicks "re-run on last 7 days," and sees the dashboard reflect the new flag counts. Previous rule versions remain available to revert to.

**Why this priority**: This is the demo's "aha" moment — the hook that invites LGA's CAO and VP of Operations to hand over their mental model of "out of tolerance." It is what turns the app from a dashboard into a governance tool. It requires User Story 1 to already exist (there is nothing to update without a dashboard), and adds the AI classifier pipeline.

**Independent Test**: With User Story 1 shipped and the AI classifier wired in, Elaina can edit the "flag vague content" rule from "under 20 words" to "under 30 words," click re-run, and watch the flag count on the Riverside view change within 30 seconds. Reverting the rule restores the prior count.

**Acceptance Scenarios**:

1. **Given** Elaina is authorized, **When** she opens the rules-config screen, **Then** she sees a list of named rules (e.g., "flag vague/copy-paste content," "flag medication refusals," "flag notes under 20 words for residential shifts") with each rule's current description and prompt template, plus its version number.
2. **Given** Elaina has edited a rule, **When** she saves and clicks "re-run on last 7 days," **Then** the classifier re-evaluates the notes in that window and the dashboard shows the new flag counts within 30 seconds.
3. **Given** a rule has been edited, **When** Elaina opens the rule's history, **Then** she sees all prior versions with their edit timestamps and authors, and can revert to any of them; reverting re-runs the classifier the same way as an edit.
4. **Given** a T-Log already flagged red by a deterministic rule (`notification_level` High or missing note), **When** the AI classifier runs, **Then** the classifier is not invoked for that T-Log and its flag source remains deterministic; the classifier's output is never allowed to downgrade a deterministic red to yellow or green.
5. **Given** a T-Log flagged yellow by a deterministic rule (`notification_level` Medium), **When** the AI classifier runs, **Then** it may escalate the flag to red (adding an AI reason alongside the deterministic reason) but never downgrades.
6. **Given** the classifier has run on any note, **When** that note's flag record is stored, **Then** the record captures flag source (`deterministic_notification_level`, `missing_schedule`, or `ai_classifier`), the rule or rule set that produced the flag, the model name and version, the prompt-template version, and the reasoning text the classifier returned.
7. **Given** the classifier has run, **When** logs or traces are emitted from the classifier code path, **Then** no full note text and no classifier reasoning string appears in any log line, stdout message, or error-reporter payload — only identifiers and severity.

---

### User Story 3 - Leadership receives a weekly digest that points them at what matters (Priority: P3)

On a configurable schedule, the system generates a weekly digest for each recipient scope: Alonzo and Elaina receive an all-locations digest; each location manager receives a digest scoped to their location. The digest contains compliance counts, top flagged locations and angels, week-over-week movement, and deep links into the dashboard — but no note text. In prototype mode, a "preview digest now" action renders the digest as an in-app page; real sending is disabled entirely regardless of configured credentials.

**Why this priority**: Turns the dashboard from a pull model into a push model, closing the loop Alonzo described — so that a manager or leader who doesn't open the dashboard on Monday morning still receives the signal. Lower than P2 because the dashboard is usable without email, and the demo narrative can reach its climax with a preview render alone.

**Independent Test**: On a seeded dataset, clicking "preview digest now" produces a realistic Monday-morning email for Alonzo/Elaina's all-locations scope and a second realistic email for Vivian's Riverside-only scope. Every deep link in the preview, when clicked in an authenticated browser session, lands on the correct dashboard view; no note text appears in the rendered email body.

**Acceptance Scenarios**:

1. **Given** the system is configured with recipient scopes (all-locations for Alonzo and Elaina; location-scoped for each manager), **When** a leader clicks "preview digest now," **Then** the app renders the digest exactly as it would be sent — summary counts, top flagged locations and angels, week-over-week change, and deep links — for each recipient scope.
2. **Given** prototype mode is active, **When** any digest action fires (scheduled or on-demand), **Then** no network request to the email provider is made, even if provider credentials are present in the environment.
3. **Given** a recipient opens a deep link from a digest, **When** they follow the link, **Then** they are required to sign in (if not already authenticated) and land on the dashboard view corresponding to the link's target, subject to their role's scope (managers see only their location even if a link targets another).
4. **Given** any digest is rendered, **When** its HTML body is inspected, **Then** it contains only identifiers, counts, severities, and links — never the body text of any T-Log or any classifier reasoning string.
5. **Given** a digest is scheduled (default: Monday 08:00 local time), **When** the scheduler fires in production mode, **Then** each configured recipient receives their scoped digest via the transactional email provider.

---

### User Story 4 - Adrian configures org structure, recipients, and brings in data (Priority: P4)

Adrian (EA / implementation owner) opens admin screens to populate the data that powers everything above: locations and their types (group home, host home, day program), angels with their role and location assignment, managers with their location assignment, individuals with their location assignment, expected shift schedules per individual, and digest recipient lists. He can also upload a Therap UI Excel export of T-Logs as a bridge path while SFTP ingestion contracting is in progress.

**Why this priority**: Essential for production but not for prototype — synthetic fixtures cover the demo. Ships after P1–P3 because those stories work against seeded data. This story is what turns the prototype into a production-ready tool once Therap contracting lands.

**Independent Test**: With a clean database (no fixtures), Adrian can use the admin screens alone to configure a single group home with one angel, one individual, and a day-shift schedule; upload a small Excel file of T-Logs for that angel; and see the resulting flags on the dashboard. This closes the end-to-end loop without any seeded data.

**Acceptance Scenarios**:

1. **Given** Adrian is signed in with admin scope, **When** he opens the org-structure admin, **Then** he can create, edit, and delete locations (with type), angels (with role and location), managers (with location), and individuals (with location).
2. **Given** Adrian is editing an individual, **When** he defines the expected shift schedule for that individual, **Then** he can express it as a per-day-of-week pattern (e.g., day/swing/overnight for group-home individuals; day only for host home and day program; day program skips weekends), and the pattern takes effect on the next flag computation.
3. **Given** Adrian has a Therap UI Excel export of T-Logs, **When** he uploads it through the admin screen, **Then** the system parses the rows, matches each row to an existing angel and individual, runs flag computation (deterministic + AI), and presents an upload summary showing rows ingested, rows skipped, and the reason each skipped row was rejected (e.g., unknown angel ID).
4. **Given** a row in the upload has an unrecognized angel or individual ID, **When** the upload completes, **Then** the row appears in the upload summary as "skipped: unknown ID" and the rest of the upload proceeds successfully — an unrecognized ID MUST NOT fail the batch.
5. **Given** T-Logs arrive through any path (manual upload, SFTP in production), **When** ingestion runs, **Then** every ingested T-Log is immutable; if a later version of the same source T-Log is received, both versions are retained and the newer one is marked current while the prior remains queryable.
6. **Given** Adrian opens the digest-recipients admin, **When** he adds or edits a recipient, **Then** he can specify the recipient's email, their scope (all locations or a specific location), and cadence (default weekly Monday 08:00); changes take effect for the next scheduled digest run.

---

### Edge Cases

- **Rule edit mid-period**: A flag exists under rule v3; Elaina edits to v4 and re-runs. The original flag is superseded by the v4 evaluation for the re-run window, but the audit record for the v3 flag (including prior model/prompt version) is retained so an auditor can see what was flagged when.
- **AI classifier unavailable**: The classifier service (OpenRouter) returns an error or times out. The system falls back to deterministic flags only for affected notes, records that the AI pass failed for each note with an error code, and retries on the next scheduled classification run. Deterministic flags are never delayed by classifier availability.
- **Therap sends a late note after the missing-flag grace window**: The missing flag is retained as an audit record, and the late note is ingested and flagged normally; the missing-flag record is marked "resolved by late submission" with a pointer to the late note.
- **Note crosses midnight or timezone boundary**: Shift assignment uses the local LGA timezone (America/New_York) to decide which day's schedule applies; the grace window starts at configured shift-end time in that timezone.
- **An angel is reassigned mid-period**: Flag attribution follows the note's author at the time of the note, not the angel's current assignment. Manager attribution follows the location's manager at the time of the note.
- **An individual is moved to a new location mid-period**: Same treatment — attribution is as-of the note.
- **A manager is reassigned to a different location**: Their dashboard scope follows their current assignment; they lose visibility to their previous location's notes the moment the reassignment takes effect (no grace period). Historical digests they received remain in their inbox but do not grant authorization to click through.
- **Search matches note content the searcher is not authorized to see**: A manager searching free-text sees zero results from notes outside their location, even if the term matches — the search is scope-aware.
- **Duplicate-ID collision on upload**: Two rows in the uploaded Excel share the same source T-Log ID but differ in content. The system treats this as a version pair (newer marked current) rather than as an error.
- **Classifier disagreement after rule revert**: Elaina reverts rule v4 to v3 after ten minutes. The re-run re-evaluates notes against v3; any notes flagged by v4 that v3 does not flag return to the v3 verdict, and the audit trail records the revert as a distinct event.
- **No-data case on digest run**: The digest scheduler fires but the week has zero ingested T-Logs (e.g., SFTP failed). The digest is suppressed and an operations-only notice is recorded; no email is generated claiming 0% compliance.

## Requirements *(mandatory)*

### Functional Requirements

**Ingestion and data model**

- **FR-001**: System MUST accept T-Logs in prototype mode from pre-loaded CSV fixtures (`fixtures/lga_synthetic_tlogs.csv` + `fixtures/lga_org_structure.csv`) and in production mode from a scheduled SFTP pull of the same schema; the ingestion code path MUST be identical across the two modes, differing only in source.
- **FR-002**: System MUST treat every ingested T-Log as immutable; when a later version of the same source T-Log is received, both versions are retained and the newer one is marked current.
- **FR-003**: System MUST support manual upload of a Therap UI Excel export through an admin screen, produce an upload summary (rows ingested, rows skipped, reasons for skip), and MUST NOT fail the batch when individual rows reference unknown angel or individual IDs.

**Deterministic flagging**

- **FR-004**: System MUST flag any T-Log with `notification_level = "High"` as red and any T-Log with `notification_level = "Medium"` as yellow, with flag source recorded as `deterministic_notification_level`.
- **FR-005**: System MUST compute missing-note flags at **(individual, scheduled shift)** granularity against the per-individual shift schedule. For each (individual, shift) pair without a corresponding ingested T-Log within a configurable grace window (default: 6 hours after scheduled shift end), the system MUST produce a red flag with source `missing_schedule`. Manager attribution MUST be to the location's manager at the time of the shift. Angel attribution is best-effort against a staffing roster: if exactly one angel is on duty at that location during that shift, the flag attributes to that angel; otherwise the flag remains unattributed at the angel level (the dashboard shows "angel: unattributed" for it) and the location manager remains the accountable party.

**AI classification**

- **FR-006**: System MUST run the AI classifier only on T-Logs that are not already flagged red deterministically; the classifier MUST return a severity (green/yellow/red) and a reasoning string, MAY escalate a yellow deterministic flag to red, and MUST NOT downgrade any deterministic flag.
- **FR-007**: System MUST construct the classifier's prompt from the editable rule set stored in the database; prompts MUST NOT be hardcoded string literals in request handlers or cron entry points.
- **FR-008**: System MUST compute, for every ingested T-Log, a deterministic content-similarity score against the author's most recent N prior notes (default window: 20). The score and a pointer to the top matches MUST be persisted on the T-Log record. The similarity computation MUST NOT invoke the AI classifier and MUST remain available when the classifier is unavailable.
- **FR-008a**: The AI classifier MUST receive the similarity score and the top-match pointers as structured context alongside the note text and the rule set. An editable "copy-paste / near-identical content" rule in the rules-config screen governs the classifier's escalation behaviour — Elaina can tune both the rule's wording and the score threshold it references. When the classifier escalates a note on this rule, its reasoning string MUST cite the specific count of near-identical prior notes (e.g., "near-identical content to 12 previous notes from this angel") so the hero demo phrase reads accurately.
- **FR-009**: System MUST record, on every flag: flag source, triggering rule (or rule-set) identifier, model name, model version, prompt-template version, and the classifier's reasoning text when applicable.
- **FR-010**: System MUST continue to produce deterministic flags when the AI classifier is unavailable; the classifier failure for a given note MUST be recorded with an error code and retried on the next scheduled run, and MUST NOT block deterministic flag production.

**Rules configuration and audit**

- **FR-011**: System MUST persist compliance rules and their prompt templates in a database table and MUST expose an admin screen that lets authorized users read, edit, version, and revert rules.
- **FR-012**: System MUST support a "re-run on the last N days" action from the rules screen that re-evaluates in-window notes against the current rule set and updates the dashboard within 30 seconds of the request completing.
- **FR-013**: System MUST retain full rule version history (including timestamps and the editing user) and MUST allow revert-to-any-prior-version; reverting triggers the same re-run pipeline as an edit.

**Dashboard and drill-down**

- **FR-014**: System MUST render a dashboard showing red/yellow/green status per location and per manager for a selectable period (default: last 7 days), a last-data-refresh timestamp, and a per-location compliance-score trend line. The **compliance score** for a (location, period) is defined as `submitted_not_red / expected`, expressed as a percentage, where `submitted_not_red` is the count of ingested T-Logs for that location's individuals in the period whose current flag severity is not red (counting yellow and unflagged/green notes as compliant, counting any red flag — deterministic, missing, or AI-escalated — as non-compliant), and `expected` is the count of scheduled (individual, shift) slots for that location in that period. The same metric is the basis for "week-over-week change" in digest emails.
- **FR-015**: System MUST support drill-down from the dashboard in the order location → angel → individual → specific note, with per-level aggregate counts and filterable lists.
- **FR-016**: System MUST support filters on date range, severity, shift, manager, location, and individual; and a free-text search across T-Log note content.
- **FR-017**: System MUST, on a specific note page, display the full original note text, the structured Therap fields (notification level, type, shift label, time in, time out), the triggering rule(s), the flag source, and — for AI-classified flags — the reasoning string, model name, model version, and prompt-template version.
- **FR-018**: Every primary view MUST render correctly at 375px viewport width, with tap targets at least 44px on touch devices, no horizontal scroll on primary views, and no hover-only affordances.

**Authentication, authorization, and scoping**

- **FR-019**: System MUST provide two sign-in paths in v1: a demo-login path using a single hardcoded user and environment-provided password (for prototype mode) and a Google Workspace SSO path restricted to the `lowesguardianangel.com` hosted domain with server-side domain validation (for production).
- **FR-020**: System MUST enforce role-based scoping on every read path: leadership roles (CEO, VP of Operations, CAO) see all locations; a location manager sees only their assigned location(s); an implementation-admin role can access admin screens. Scope is applied server-side — never trusted from the client — and applies equally to dashboard views, drill-down paths, filters, free-text search results, and digest deep links.

**Weekly digest**

- **FR-021**: System MUST generate weekly digests on a configurable schedule (default: Monday 08:00 LGA-local time) for each configured recipient scope, and each digest MUST contain: notes submitted vs. expected for the week, top flagged locations and angels, week-over-week compliance change, and deep links into the dashboard for each flagged item.
- **FR-022**: Digest emails MUST NOT contain any T-Log note text, classifier reasoning string, or any free-text field an angel typed; the body MUST contain only counts, severities, and deep links.
- **FR-023**: In prototype mode, clicking "preview digest now" MUST render the digest as an in-app page and MUST NOT dispatch any outbound request to the email provider, regardless of whether provider credentials are configured.
- **FR-024**: System MUST suppress any scheduled digest that would report zero ingested notes for the period (ingestion failure suspected) and record an operations-only notice; no email is sent in this case.

**Org structure and admin**

- **FR-025**: System MUST provide an admin screen for managing locations (with type: group home, host home, day program), angels (with role + location), managers (with location), individuals (with location), and digest recipient lists.
- **FR-026**: System MUST let an admin define an expected shift schedule per individual, expressed as a per-day-of-week pattern (day / swing / overnight, with day program supporting weekday-only); edits take effect on the next flag computation.
- **FR-027**: Flag attribution MUST follow historical state: an angel reassigned mid-period remains the flag author for their prior notes; a manager reassigned remains attributed to flags on their prior location's notes from their tenure there.

**Logging, observability, and data handling**

- **FR-028**: System MUST NOT emit T-Log note text, classifier reasoning text, or any free-text field an angel typed to stdout, log files, error reporters, APMs, or any third-party observability surface; logs reference IDs and severity only.
- **FR-029**: System MUST NOT use browser-side persistent storage APIs (`localStorage`, `sessionStorage`, `IndexedDB`); all client-visible state MUST originate from the server. Session and identity cookies managed by the auth library are the only client-side persistence permitted.

### Key Entities

- **Location**: A physical care setting. Typed as group home, host home, or day program. Has a current manager assignment and a history of past assignments. Belongs to the org.
- **Angel**: An LGA caregiver (DSP, nurse, or manager role). Has a current location assignment and a history of past assignments. Authors T-Logs.
- **Individual**: A person receiving care. Has a current location assignment and a history of past assignments. Has an expected shift schedule.
- **Manager**: An angel with management role, responsible for one or more locations. First-line reviewer for flags on their location's notes.
- **Shift Schedule**: A per-individual, per-day-of-week expected shift pattern (day / swing / overnight), with support for day-program weekday-only patterns.
- **T-Log**: A daily shift note in Therap's schema: source ID, author (angel), subject (individual), date, shift label, time in, time out, location, note type, notification level (Low / Medium / High), and free-text description. Immutable once ingested; supersessions retain both versions with the newer marked current.
- **Rule**: A named compliance rule with a human-readable description and a prompt template used by the AI classifier. Versioned, with an edit history (prior versions, timestamps, editing user).
- **Flag**: An assertion that a specific T-Log — or the absence of an expected T-Log — is out of tolerance. Has a severity (red or yellow), a source (`deterministic_notification_level`, `missing_schedule`, or `ai_classifier`), a triggering rule or rule-set identifier, model/prompt versions when AI-classified, the reasoning string when AI-classified, and a resolution status (open, superseded by re-run, resolved by late submission, etc.).
- **User / Role**: Authenticated user with a role (leadership, manager, admin, demo). Scopes every read path. Comes from demo login in prototype or Google SSO in production.
- **Recipient**: A digest target — email, scope (all-locations or location-specific), and cadence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A leader opens the dashboard and can identify the most-flagged location for the current week in under 5 seconds of first paint.
- **SC-002**: From the top-level dashboard, a leader can reach any specific flagged note in no more than 4 clicks (location → angel → individual → note), and each intermediate page renders within 1 second of click.
- **SC-003**: Editing a rule in the rules-config screen and clicking "re-run on last 7 days" updates the dashboard's flag counts within 30 seconds for the synthetic dataset (30 days × 12 individuals × ~1.8 notes/day ≈ 650 notes).
- **SC-004**: The prototype's hero demo narrative runs end-to-end in under 5 minutes without any external dependency beyond the AI provider: open dashboard → see Riverside yellow → drill into Jamal Roberts → see the copy-paste AI reasoning → edit the copy-paste rule → re-run and watch flags update → open Sunrise Day Program → see Friday missing-note pattern → click "preview digest now" → see the Monday email Alonzo and Elaina would receive.
- **SC-005**: Every primary view passes a 375px-width render check — no horizontal scroll, tap targets ≥ 44px, no hover-only affordances — verified with a device-emulation pass in a headless browser.
- **SC-006**: Zero T-Log note text and zero classifier reasoning strings appear in any log output, error report, or outbound email body across a full prototype demo session, verified by grep/inspection of all emitted artifacts.
- **SC-007**: In prototype mode, zero outbound requests reach an email provider across a full session that includes triggering "preview digest now" at least once, verified by network-call inspection.
- **SC-008**: An admin can configure a clean org (one location, one angel, one individual, a day schedule) and upload a small Excel file of T-Logs to produce at least one flag on the dashboard in under 10 minutes from first login.
- **SC-009**: When the AI classifier is unavailable for a full run, the dashboard still shows correct deterministic flag counts (notification-level + missing-note) with no degradation of the drill-down experience; the only visible difference is the absence of AI reasoning on classifier-dependent notes.
- **SC-010**: A location manager signing in sees zero notes, zero flags, and zero free-text search hits from locations other than their assigned location — verified by attempting 5 cross-location search terms and 3 direct drill-down URLs for other locations.

## Assumptions

- Prototype mode is controlled by an environment variable (e.g., `APP_MODE=prototype` or `DEMO_MODE=true`) and defaults to prototype when Therap SFTP credentials are absent, with explicit override possible. The exact env var name is a plan-phase decision.
- Copy-paste similarity uses a deterministic score (algorithm chosen at plan time; token-overlap, cosine on TF-IDF vectors, or small-model embedding are all acceptable) computed against the author's most recent 20 notes by default. The window size and the escalation threshold the AI classifier references are both exposed through the rules-config screen.
- Compliance score is a single-axis percentage and is the same metric on the trend line and in digest week-over-week movement. Yellow notes count as compliant; only red flags (from any source) reduce the score.
- Missing-note flags at (individual, shift) granularity imply a per-individual schedule and a location-level staffing roster. The staffing roster in prototype mode can be a simple "one angel covers all individuals at this location during this shift" assumption derived from the angel→location mapping; a richer roster can replace it later without changing the flag semantics.
- Time zone for shift schedules is America/New_York (LGA is Georgia-based). Configurable per-location if needed later, but v1 uses a single org-wide default.
- The "compliance score" label used on the trend line is the same metric used for week-over-week movement in digests — whatever definition is chosen (pending clarification Q3), it is applied consistently.
- Synthetic fixtures already include the demo's two scripted failure patterns: a copy-paste cluster for Jamal Roberts at Riverside Group Home, and a recurring Friday missing-note pattern at Sunrise Day Program. If not, fixture generation is a plan-phase task.
- DBHDD "Therap Bulletins" and the DBHDD Provider Manual inform default rule content. The initial seeded rule set reflects those; subsequent rule edits by LGA supersede them.
- An in-app UI-admin path exists for at least one admin account to reach the org-structure, rules, and recipients screens — bootstrapped in prototype by the demo login, in production by granting a specific Google-SSO identity the admin role.
- "Last-refreshed" timestamp reflects the most recent successful ingestion run (SFTP pull or upload), not the most recent classifier run. The two are displayed separately when they differ.

## Dependencies

- Synthetic fixtures: `fixtures/lga_synthetic_tlogs.csv` (648 rows, 30 days) and `fixtures/lga_org_structure.csv` must exist and must include the scripted demo failure patterns (Jamal copy-paste cluster; Sunrise Friday missing pattern).
- Seeded rule set: an initial rule catalog (vague/copy-paste content, medication refusals, short-note threshold, etc.) must ship with the app so User Story 1 is useful on day one before Elaina touches the rules screen.
- AI provider availability: User Story 2 depends on the AI classifier being reachable. User Story 1 does not.
- Google Workspace SSO app registration (production only): LGA admin consent for the Sagan app on `lowesguardianangel.com`. Not required for prototype demos.

## Out of Scope

Explicitly deferred per the PRD and the constitution (Principle VIII):

- Email and calendar management for Alonzo or any staff.
- HR/BambooHR compliance for angel credentials, I-9, driver's licenses, certifications.
- Phone-based dictation of daily notes (Alonzo walked this back for v1 — no behavioral change for angels).
- Phone-based reporting for field sales.
- Clockify time-tracking ROI analysis.
- Auto-write-back of flags, comments, or tasks to Therap.
- Predictive / multi-week pattern analytics beyond simple week-over-week trend lines.
- Real-time per-event alerts to managers beyond the weekly digest.
- Nurse-specific compliance workflows distinct from DSP T-Logs (ingestion stream unclear — pending kickoff confirmation).
- Host-home review-cadence model distinct from the group-home model (pending confirmation during kickoff whether Anthony King's flow differs meaningfully).

## Clarifications Resolved

Three scope-shaping questions raised during `/speckit.specify` were answered on 2026-04-21 and have been written into the functional requirements above. For future-reader reference:

- **Q1 → A (per scheduled shift-individual)**: Missing-note flags fire at (individual, shift) granularity. See FR-005. Angel attribution is best-effort against a staffing roster; manager attribution is always to the location's manager at shift time.
- **Q2 → C (hybrid)**: A deterministic similarity score is computed per ingested note against the angel's recent N notes and persisted on the T-Log record. The AI classifier receives the score as structured context. Elaina's editable "copy-paste" rule governs the escalation threshold and the wording the classifier reasons with. See FR-008 and FR-008a.
- **Q3 → B (% of expected shifts with a non-red note)**: Single-axis metric — `submitted_not_red / expected`. Yellow counts as compliant. The same metric drives the trend line and the digest week-over-week line. See FR-014.

---

## Brand Redesign Requirements (amendment, 2026-04-23 — post-demo)

**Source**: Direct client feedback from Alonzo Ford + LGA leadership during the 2026-04-23 live demo. Formally catalogued here so each redesign requirement has a single, testable home; acceptance criteria live alongside.

These requirements SUPPLEMENT the functional requirements above — they do not alter any FR-0## behavior. They govern visual language and home-page interaction density. The "state auditor" aesthetic direction captured in the UI/UX Constraints block of `tasks.md` is retired (see that file's Decisions log for the override rationale).

**REQ-1 — Complete visual redesign.** Every screen gets new visual treatment in navy + gold. Polish is not sufficient; full replacement is required.
- **AC-1.1**: Every authenticated screen renders with `--ga-bg: #0a1532` as the page background (dark navy, not slate or light).
- **AC-1.2**: Primary call-to-action buttons render with the gold accent (`--ga-gold: #e8b53c`); zero remaining `text-blue-*` / `bg-blue-*` Tailwind classes in shipped view code after the final sweep batch.

**REQ-2 — Home page log stream + dedicated /logs page.** The home page surfaces a tight 4-row preview of recent T-Log entries (newest first, color-coded by severity). A dedicated `/logs` page hosts the full dense stream with pagination. Aggregate tiles, locations list, and trend chart on the home page sit below the 4-row preview, not below 25 rows.
- **AC-2.1**: The `/` route renders a log-stream preview region as the first scrollable block below the header + data-bar.
- **AC-2.2**: Each stream row shows angel name, individual name, location name, relative timestamp, severity signal, and a truncated note preview (≥ 60 characters visible at desktop, ≥ 40 characters on 375px mobile before ellipsis).
- **AC-2.3** *(revised 2026-04-23 evening, post Batch 1.6 review)*: Home page `/` renders **4 stream rows by default** — a teasing preview, scannable in 3 seconds. The dedicated `/logs` page renders **20–25 rows by default** with "Show more" pagination. Reverses the prior 25-row home default after the user observed that 25 rows pushed the tiles + locations + trend chart below the fold and made the home read as "the full feed" rather than "the dashboard summary."
- **AC-2.4**: Stream row vertical padding is reduced ~30% vs. the location-row baseline so density reads as log-like without sacrificing 44px touch targets at the anchor level. Applies to both home preview and `/logs` rows.
- **AC-2.5** *(revised)*: On `/logs`, a "Show more" button loads the next 25 rows in place via htmx (no full-page navigation). Target is `outerHTML` swap on the stream tail. The home `/` preview does NOT paginate in place; it renders only the 4 rows and a "View all flags" button (see AC-2.7).
- **AC-2.6** *(revised)*: On `/logs`, the stream header shows a "Showing X of Y" counter (e.g., "Showing 25 of 314 recent notes"). The home `/` preview omits this counter — the 4-row block stays clean and uncluttered; users go to `/logs` for the full picture.
- **AC-2.7** *(new 2026-04-23 evening)*: The home `/` preview renders a primary gold "View all flags" CTA button below the 4 rows. Clicking navigates to `/logs`.
- **AC-2.8** *(new 2026-04-23 evening)*: Primary nav includes a top-level "All flags" (or "Logs") link reachable from any authenticated page. Sits alongside Dashboard / Rules / Settings / user menu.

**REQ-3 — LGA brand color theme.** Navy surface + gold accent + cream/white text. Exact hex values derived from the LGA marketing site and client confirmation.
- **AC-3.1**: `:root` tokens in `src/views/design-tokens-css.ts` include `--ga-bg`, `--ga-surface`, `--ga-surface-elevated`, `--ga-gold`, and `--ga-cream` with the values approved on 2026-04-23.
- **AC-3.2**: WCAG AA contrast passes for every text-on-surface pairing used in chrome (ga-text, ga-text-strong, ga-text-muted on dark; ga-text-on-light variants on cream).

**REQ-4 — LGA logo in header.** Official logo (angel wings + halo + wordmark) in the header, visibly branded without dominating.
- **AC-4.1**: Logo renders via `<img src="/assets/lga-logo.png">` served from the static mount.
- **AC-4.2** *(revised 2026-04-23 late evening, post Batch 3 review)*: Desktop header logo height is **80px**. The prior 56–64px range (Batch 1.6) and the originally-shipped 40px (Batch 1) were both insufficient — client direction "make it bigger" came twice in succession. 80px is now the documented value; further bumps require a separate amendment.
- **AC-4.3** *(revised same)*: Mobile (≤ 639px) header logo height is **56px** (was 44px in Batch 1.6, 28px in Batch 1). Stays proportional to the desktop bump.
- **AC-4.4**: Header total height accommodates the logo without cramping. With the 80px logo, header is `h-28` (112px), giving ~16px breathing room top/bottom.

**REQ-5 — No page reloads on stateful UI interactions.** Filter chip toggles, severity switches, date range changes, rule-editor tabs — every stateful interaction updates in place via htmx.
- **AC-5.1**: Clicking any filter chip, severity switch, or date-range preset fires an htmx request with `HX-Request: true`; the browser's navigation history does NOT record a full-page navigation.
- **AC-5.2**: Every such action has an `hx-target` scoped to the result region only, not the full `<main>`.

**REQ-6 — Remove version history UI from rule editor.** Underlying DB data preserved; only the UI entry points removed.
- **AC-6.1**: The rendered DOM of `/rules/:key/edit` contains zero occurrences of "Previous versions", "Restore", or `href="/rules/:key/history"`.
- **AC-6.2**: The rendered DOM of `/rules` (rule list) contains zero occurrences of "Previous versions" or `/history` links.
- **AC-6.3**: The `rule_config` table still retains all version history; direct-URL GET of `/rules/:key/history` still renders (routes unchanged).

**REQ-7 — Non-technical-user-friendly UI.** Visually engaging to an executive; not minimal-clinical.
- **AC-7.1**: Plain-English labels throughout (language rules from the UI/UX Constraints block still apply — no "classifier", "pipeline", "JSON", etc.).
- **AC-7.2**: Visual hierarchy on every page: clear page title (`ga-h1`), clear primary action, no wall-of-form pattern.

**REQ-8 — Modern, realistic, colorful, bold.** Client's direct words. Premium + branded, not minimal + clinical.
- **AC-8.1**: Severity palette is saturated (vivid red `#ef4444`, warm amber `#f59e0b`, vibrant green `#10b981`) — not desaturated clinical tones.
- **AC-8.2**: Gold accent is present on every primary screen (CTAs, active nav, focus rings, link accents).
- **AC-8.3**: Typography uses Inter (via Google Fonts CDN, authorized per the brand amendment) with tabular numerals enabled for numeric tabular alignment.

**REQ-9 — Log stream auto-refreshes.** Both home preview and `/logs` page poll for fresh notes without user intervention.
- **AC-9.1**: Both surfaces carry `hx-trigger="every 30s"`, `hx-get="/stream/latest?limit=N"`, `hx-swap="outerHTML"`. N=4 on home, N=25 on `/logs`.
- **AC-9.2**: Poll endpoint returns the updated stream fragment with the current counter (on `/logs`) or no counter (on home).
- **AC-9.3**: In-place polling does not reset the user's scroll position or, on `/logs`, the expanded "Show more" state.

**REQ-10 — Location rows show flag breakdown instead of location type (new, 2026-04-23 evening).** On the home-page locations list, the secondary line shows active flag counts, not the "Group home" / "Day program" type label. Type labels remain in contexts where they aid orientation (drill-down page header, admin screens, digest envelope copy).
- **AC-10.1**: On `/`, each row in "Locations this week" renders a secondary line of the form `"N red · N yellow · N missing"` (counts ≥ 0).
- **AC-10.2**: When all three counts are zero, the secondary line reads "No flags this week" in a muted-green state (not "0 red · 0 yellow · 0 missing", which is noisy).
- **AC-10.3**: Location type string ("Group home" / "Host home" / "Day program") does NOT appear anywhere on the home-page locations list.
- **AC-10.4**: Location type string DOES appear in the drill-down page header (e.g., "Riverside Group Home · Group home"), the Settings › Locations admin list, and the digest preview scope-label copy.

**REQ-11 — Background depth pattern (new, 2026-04-23 evening).** Flat navy reads "Tailwind dark mode default." Brand has more warmth — add a very subtle visual texture so the page feels designed.
- **AC-11.1**: The `<body>` background renders a soft radial gradient from `#1a2547` (top-right) fading to `#0a1532` (bottom-left) via a `radial-gradient` CSS function on the body or a full-viewport pseudo-element.
- **AC-11.2**: The gradient is `background-attachment: fixed` so it does not scroll with content (ambient light-source feel, not parallax decoration).
- **AC-11.3**: Text-on-bg contrast for every existing readable element remains WCAG AA — the gradient's lightest point must not reduce legibility of any chrome text.
- **AC-11.4**: Optional subtle grain (SVG data URI, 3–4% opacity) MAY layer over the gradient if the gradient alone reads too flat at review.
- **AC-11.5**: No animation. No floating shapes. No particles. No "hero section" decoration. Nothing that competes with content. Nothing that feels crypto/startup/gaming.

### Screens in scope for REQ-1 sweep

1. Login page, 2. Home page (restructured per REQ-2), 3. Location drill-down, 4. Angel drill-down, 5. Individual drill-down, 6. Note detail, 7. Rules list, 8. Rule editor (with REQ-6 removals), 9. Digest preview, 10. Admin scenarios, 11. Admin locations / angels / individuals / managers / shift schedules / recipients, 12. Every mobile variant at 375px.

### Out of scope for the redesign amendment

- Adding new features beyond the visual + interaction shifts above.
- Changing any backend logic, classifier behavior, or data model.
- Changing URL structure or routing.
- Changing authentication flow.
- Changing demo data shape or counts.

### Review gates

- The redesign is executed as a batched migration (see `tasks.md` Phase 15). Human review sits between every batch — no batch auto-proceeds.
- Batch 1.6 (this amendment's implementation scope) is its own review gate separate from Batch 1.5. Two review gates before Batch 2.
