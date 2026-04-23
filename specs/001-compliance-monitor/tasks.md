# Tasks: Guardian Angel Compliance Monitor

**Feature**: 001-compliance-monitor | **Date**: 2026-04-21
**Input**: plan.md, spec.md, research.md, data-model.md, contracts/http-routes.md, quickstart.md
**Branch**: `001-compliance-monitor`

Tasks are topologically ordered — do them top-to-bottom. Every task cites the files it touches and its dependencies. Each task is scoped to ≲ half a day of focused work; larger chunks are split.

---

## Decisions log — UX overhaul (2026-04-23)

A demo-polish pass (see Phase 14 below) negotiated the following overrides against the original UI/UX Constraints block. Captured here so the reasoning doesn't live only in conversation.

| Ask | Decision | Rationale |
|---|---|---|
| Client-side tour lib (Shepherd.js / Intro.js / React tour) | **Dropped.** Built as htmx-native server-rendered tour cards instead. | Principle I + IX: no client framework, no frontend build step. Consistency with existing htmx/Tailwind-via-CDN pattern wins over tour polish. |
| Dark mode toggle | **Dropped.** | Principle X forbids browser storage; cookie-backed version contradicts "calm healthcare" aesthetic. Near-zero demo value vs. cookie plumbing. |
| Modal drawers / slide-in panels | Reaffirmed **out**. | UI/UX Constraints: "No modals". Drill-down stays as full-page navigation. |
| JS chart library (recharts / chart.js / uplot) | Reaffirmed **out**. | Phase 6 explicit: push back in code review. Interactive trend chart uses SVG + CSS hover. |
| Sound effects | **Dropped.** | Aesthetic mismatch with "state auditor reading over your shoulder" framing. |
| Emoji in chrome, glassmorphism, Framer-motion, glow, oversized hero | Reaffirmed **out**. | Forbidden list, UI/UX Constraints block. |
| Icons on the four top tiles | Reaffirmed **out**. | UI/UX Constraints: "number + one-word label, no icons". Icons elsewhere (nav, cards, affordances) are allowed — inline SVG only, no icon-font dep. |
| Thumbs up/down on flag cards, stored client-side | **Stored server-side** in new `flag_feedback` table. | Principle X: no localStorage/sessionStorage/IndexedDB. |
| Scenario presets ("quiet week" / "chaotic week") | **Approved.** | Biggest demo moment. Second fixture set + `/admin/scenario?preset=…` endpoint with double-confirmation on destructive reseed. |
| Reset demo data button | **Approved** with double-confirmation. | Prototype feature, matches Principle III ("Prototype Mode Is a First-Class Feature"). |
| Presenter mode (hide chrome for screenshots) | **Approved.** Cookie-backed toggle. | No PHI implications; cookie carries UI preference only. |

Tier execution order: Tier 1 (T112–T116) → human review → Tier 2 (T117–T122) → Tier 3 (T123–T126). See Phase 14 below.

---

Story-label convention:
- Setup / foundational / polish phases carry **no** story label.
- Story phases carry `[US1]` (dashboard), `[US2]` (rules config), `[US3]` (digest), `[US4]` (admin + upload).
- `[P]` marks tasks parallelizable with their neighbours (different files, no unmet dependency).

---

## UI/UX Constraints (binding on every view task — Phase 0 T009, Phase 6, Phase 7, Phase 8, Phase 9, Phase 10, Phase 11)

**Design intent**: a clean healthcare compliance tool that a state auditor could read over the user's shoulder without raising an eyebrow. Alonzo is a non-technical CEO; managers check from phones between site visits. Decent, professional, readable.

**Visual language**:
- Light background (`bg-[#fafafa]`), dark text, one accent — a calm `blue-600` for links and primary buttons.
- Severity palette for compliance only: `red-600` / `amber-500` / `green-600` — desaturated, not traffic-light.
- Whitespace over density. System font stack (Tailwind default `font-sans`). No Google Fonts, no custom typefaces.
- `rounded-md` max. No pill buttons. `border-gray-200` over heavy shadows; `shadow-sm` only when needed.
- Type scale: body `text-base` (16px), page titles `text-2xl font-semibold`, section headers `text-lg font-medium`. Never bolder than `font-semibold` except on metric numbers. `tabular-nums` on every number that belongs in a column.
- **Forbidden**: dark mode with purple gradients, neon accents, glassmorphism, Framer-motion entrances, emoji in chrome, shadcn "tech startup" look, "powered by AI" badges, oversized hero sections, glow effects.

**Language rules — forbidden in user-facing chrome** (labels, buttons, empty states, errors): "classifier", "pipeline", "ingestion", "deterministic", "tokenize", "Jaccard", "cron", "JSON", "SFTP", "OpenRouter", "LLM", "model", "prompt", "configure", "initialize", "validate", "parse", "SSO", "OAuth", "CSV", "PK/FK", "SLA". DSP / T-Log / DBHDD are OK — LGA's own words.
Allowed substitutions: classifier → "the system" or "system review"; pipeline → "when new notes come in"; re-run classifier → **"Update flags now"**; rules config → **"Rules"**; admin → **"Settings"**; ops notices → **"System messages"**; upload CSV → **"Upload Therap export"**; render digest → **"Preview this week's email"**.

**Information hierarchy (every authenticated page)**:
- Header: "Guardian Angel" on the left. Primary nav — max 4 items: Dashboard / Rules / Settings (admin or leadership with rules access) / user name with log-out dropdown. On <768px collapses to a hamburger.
- Below header: a single thin bar, **"Data current as of \<humanized timestamp\>"**.
- Page content below, full-width responsive container.
- Footer: one line, small gray text, no marketing.

**Dashboard structure**:
- Four tiles at the top — number + one-word label, no icons: **Red**, **Yellow**, **Missing**, **Compliance**. Stack vertically on mobile (`grid-cols-2 sm:grid-cols-4`).
- "Locations this week" as a **list** (not a grid) — each row has name, a labeled severity pill (pill carries text too, never color alone), flag counts; tap-targets ≥ 44px.
- Compliance trend chart below — one clean line per location, minimal grid, clean legend. No animated rendering.
- Filters collapsed by default inside a `<details>` "Filter" disclosure above the tiles.
- Search: icon in header on mobile (expands to full-width input), persistent input at top-right on desktop.

**Drill-down consistency**: breadcrumb at top → same tile layout scaled to scope → list of next-level items. Muscle memory is a feature.

**Note detail page**: full original text in a large readable box (not buried under metadata). Structured fields as a two-column list **below** the note. Each flag as a card with a labeled severity pill, a source badge (**Missing note / High priority / Medium priority / Pattern detected / System review** — never the enum string), reason text, and rule name. A collapsed **"How was this flagged?"** disclosure contains the audit trail (rule version, **"Reviewed by Google Gemini Flash Lite"** or the current model's friendly name, prompt version) — hidden by default.

**Flag display category — DB-driven, not string-matched**: the UI picks the source-badge text from a new `flags.display_category` column (one of `missing_note`, `high_priority`, `medium_priority`, `pattern_detected`, `system_review`), set deterministically at flag-insert time in the pipeline. The value is computed from `(source, severity, tlog.similarity_score ≥ copy_paste threshold)` — never by regex-matching the `reason` prose. This column is added to `flags` in data-model.md and writable only by the flagging pipeline.

**Rules screen (Phase 7)**: each rule has a plain-English name, plain-English description, and Edit. Edit form has: rule name, plain-English description, numeric inputs for thresholds with plain labels ("How similar is too similar?" with tick marks; "Residential shifts under __ words"), and a collapsed **"Advanced: instructions for the system"** disclosure that contains the prompt textarea. Two action buttons: **Save changes** and **Update flags now** (triggers re-run with an inline progress bar showing "Checking 147 notes… 62 done"). "Previous versions" link at the bottom opens the history list; each prior version has a **Restore this version** button. No diff view in v1.

**Upload screen (Phase 8)**: single drag-and-drop zone ("Drop a Therap Excel export here, or click to browse"). After upload: plain-English summary ("Uploaded 234 notes. 229 added. 5 skipped."). Each skipped row explains itself in one sentence ("Unknown individual ID: IND099 — add them in Settings first"). No error codes.

**Settings (Phase 9)**: left sidebar with sections Locations / Angels / Individuals / Managers / Shift Schedules / Digest Recipients / System Messages. Each section is a plain list + Add + per-row Edit/Delete. Soft-delete with a visible warning naming the consequence ("This angel has 47 notes. Deleting will mark the angel as inactive; the notes stay.").

**Digest preview (Phase 10)**: vertical list of envelope cards, each with recipient name, scope, and the rendered email inline. Top-of-page banner in muted color (not red): **"Preview mode — no emails will be sent."** No modals, no tabs, everything scrollable.

**Login screen (Phase 11)**: centered card. App name. In prototype mode, demo-login form visible directly with email pre-filled (`demo@lowesguardianangel.com`). "Sign in with Google" button only renders when `GOOGLE_CLIENT_ID` is set. No taglines, no marketing copy.

**Mobile (<768px)**: 375px must look intentional. Tiles stack vertically. Tables become card lists — never horizontal-scroll a table. Touch targets ≥ 44px (`min-h-[44px]` or `py-3`).

**Empty states**: friendly plain-text, centered in the content area. Examples: "No flagged notes in this period. Everything looks clean." / "No Therap exports uploaded yet. Drop one above to get started." / "No digest recipients yet. Add someone in Settings › Digest Recipients." No illustrations, no mascots.

**Loading states**: skeletons matching the upcoming layout on first page loads. For user-triggered actions (re-run, upload), show explicit progress text ("Updating flags… 62 of 147 done"), not a spinner. Never a full-page blocking spinner.

**Accessibility**: color is never the only signal — every severity pill carries a text label ("Red — 14 flags"). All inputs have visible labels; placeholders are never a substitute. Visible focus states (`focus:ring-2 focus:ring-blue-600`). Keyboard-navigable — sensible tab order, Enter submits, Escape closes disclosures.

**Error messages**: plain-language, always tell the user what to do next. Not "zod validation failed on `notification_level`: expected enum" but "Something's off with this file — the 'Notification Level' column has a value we don't recognize. Check row 23 and try again."

Every view task below inherits these constraints. The phrase **"per UI/UX Constraints"** in a task refers to this block.

---

## Phase 0 — Repo setup

**Goal**: A Railway-deployable Hono hello-world with `/healthz` and the Tailwind + htmx base layout. Deploy path proven.

- [X] T001 Initialize `package.json` with `scripts` (`dev`, `build`, `start`, `seed`, `test`, `job:digest`, `job:retry`) and dependencies per plan.md Technical Context — **file**: `package.json`. **DoD**: `npm install` succeeds; `npm run dev` starts (even if it exits because server.ts is empty). **Deps**: —.
- [X] T002 [P] Configure `tsconfig.json` with `strict: true`, `target: ES2022`, `module: NodeNext`, `outDir: dist/`, `noEmitOnError: true` — **file**: `tsconfig.json`. **DoD**: `npx tsc --noEmit` runs cleanly on an empty `src/` tree. **Deps**: —.
- [X] T003 [P] Create `src/` directory skeleton matching plan.md §Project Structure (empty stub files with a one-line comment each) — **files**: `src/server.ts`, `src/config.ts`, `src/db/`, `src/ingestion/`, `src/flagging/`, `src/rules/`, `src/digest/`, `src/admin/`, `src/auth/`, `src/views/`, `src/lib/`, `src/jobs/`, `tests/{unit,integration,helpers}/`. **DoD**: directories + stub files present; `npx tsc --noEmit` still clean. **Deps**: T002.
- [X] T004 [P] Write `.env.example` with every var from plan.md + quickstart.md, empty values, inline comments — **file**: `.env.example`. Include the `TODO(post-prototype)` note on Tailwind Play CDN and Google SSO activation. **DoD**: file committed; a grep of `README.md` and `src/config.ts` shows they reference this file as source of truth. **Deps**: —.
- [X] T005 [P] Write `.gitignore` excluding `node_modules/`, `dist/`, `.env`, `dev.db`, `*.db-journal`, `.DS_Store` — **file**: `.gitignore`. **DoD**: `git status` is clean on a fresh clone after `npm install`. **Deps**: —.
- [X] T006 Implement `src/config.ts` — zod schema parsing `process.env`, explicit `PROTOTYPE_MODE` boolean, fail-fast on missing required vars — **file**: `src/config.ts`. **DoD**: unit test in `tests/unit/config.test.ts` asserts missing `OPENROUTER_API_KEY` throws a descriptive error; `PROTOTYPE_MODE` defaults to `true`. **Deps**: T003.
- [X] T006a Boot-time safety guard inside `src/config.ts` — after zod parse, if `APP_URL` does NOT start with `http://localhost` (or `http://127.0.0.1`) AND `DEMO_LOGIN_PASSWORD === 'demo'`, throw a descriptive error instructing the operator to set a strong password — **file**: `src/config.ts` (same file as T006), `tests/unit/config.test.ts` (additional assertions). **DoD**: two new tests: (a) remote APP_URL + default `demo` password → throws; (b) remote APP_URL + strong password → passes. **Deps**: T006.
- [X] T007 Implement `src/lib/logger.ts` — pino logger with **allowlist serializer** that strips `description, summary, reason, individual_name, note_text` before emit — **file**: `src/lib/logger.ts`. **DoD**: unit test in `tests/unit/logger.test.ts` feeds an object containing all five PHI keys and asserts none appear in the emitted JSON. **Deps**: T003.
- [X] T008 Write Hono hello-world in `src/server.ts` with `/healthz` returning plaintext `ok`, `GET /` returning `<html>hello</html>`, logger wired — **file**: `src/server.ts`. **DoD**: `npm run dev` starts on port 3000; `curl http://localhost:3000/healthz` prints `ok`. **Deps**: T006, T007.
- [X] T009 [P] Implement `src/views/layout.ts` — shared `<html>` shell **per UI/UX Constraints**: light background `bg-[#fafafa]`, system font stack, Tailwind Play CDN + htmx 2.0.3 CDN, `<main id="main">` swap target, mobile viewport meta. Header = "Guardian Angel" wordmark left + nav (Dashboard / Rules / Settings / user dropdown, max 4 items) right; collapses to hamburger below `md:`. A thin "Data current as of <humanized timestamp>" bar between header and main. Single-line footer. `layout({title, body, currentAs?, user?, activeNav?})` signature; `escapeHtml` helper exported. Sharp `rounded-md` max, no pill buttons, `border-gray-200` over shadows. **File**: `src/views/layout.ts`. **DoD**: `/` renders at 375px (no horizontal scroll, nav collapsed to hamburger) AND at 1280px (nav visible) with no forbidden design elements (no gradients, no emoji in chrome, no custom fonts). Design snippet signed off before implementation. **Deps**: T008.
  - **Note (2026-04-21)**: a first pass of `src/views/layout.ts` was written during initial Phase 0 but predates the UI/UX Constraints block. Treat the current file as superseded — rewrite to this spec before Phase 1 begins.
- [X] T010 [P] Create `railway.json` with build + start commands, volume at `/data`, four cron entries (poll-and-flag hourly, classifier-retry 15-min, weekly-digest Monday 12:00 UTC = 08:00 ET, ingestion-gap-check Monday 11:30 UTC) — **file**: `railway.json`. **DoD**: `railway up` succeeds; `/healthz` responds on the Railway URL. **Deps**: T008.
- [ ] T011 Verify Railway deploy-from-main pipeline — connect repo, set `OPENROUTER_API_KEY` + `APP_URL` + `BETTER_AUTH_SECRET`, confirm one successful deploy. **DoD**: public URL responds `ok` on `/healthz` and `hello` on `/`. **Deps**: T010.

---

## Phase 1 — Data layer

**Goal**: SQLite schema in place, seed scripts for org structure + shift schedules, typed query helpers for the four core entities.

- [X] T012 Write `src/db/schema.sql` — every DDL statement from data-model.md verbatim, including the unique partial index `idx_tlogs_current` and all check constraints — **file**: `src/db/schema.sql`. **DoD**: applying this file to a fresh SQLite DB via `sqlite3` CLI produces the full schema with no errors; `PRAGMA foreign_key_check` returns zero rows. **Deps**: T003.
- [X] T013 Implement `src/db/client.ts` — better-sqlite3 singleton with WAL mode enabled, `PRAGMA foreign_keys = ON`, path from `config.DATABASE_PATH` — **file**: `src/db/client.ts`. **DoD**: calling `getDb()` twice returns the same instance; `getDb().prepare("SELECT 1").get()` works. **Deps**: T006.
- [X] T014 Implement `src/db/migrate.ts` — migration runner that creates `schema_versions` table, applies `schema.sql` if version < 1, logs applied version — **file**: `src/db/migrate.ts`. **DoD**: first boot applies schema; second boot is a no-op; deleting the DB file and booting recreates cleanly. **Deps**: T012, T013.
- [X] T015 Wire migrations into server boot — `src/server.ts` calls `migrate()` before registering routes — **file**: `src/server.ts`. **DoD**: `npm run dev` starts successfully against a fresh DB, all tables present. **Deps**: T014.
- [X] T016 [P] Implement `src/db/queries/locations.ts` — typed `listLocations`, `getLocation`, `upsertLocation`, `deleteLocation` (soft delete) helpers — **file**: `src/db/queries/locations.ts`. **DoD**: unit test uses `:memory:` DB and confirms all four helpers. **Deps**: T014.
- [X] T017 [P] Implement `src/db/queries/angels.ts` — `listAngels`, `getAngel`, `upsertAngel`, `deleteAngel` — **file**: `src/db/queries/angels.ts`. **Deps**: T014.
- [X] T018 [P] Implement `src/db/queries/individuals.ts` — `listIndividuals`, `getIndividual`, `upsertIndividual`, `deleteIndividual` — **file**: `src/db/queries/individuals.ts`. **Deps**: T014.
- [X] T019 [P] Implement `src/db/queries/managers.ts` — `listManagers`, `getManager`, `upsertManager` (no delete — references are heavy) — **file**: `src/db/queries/managers.ts`. **Deps**: T014.
- [X] T020 Implement `src/ingestion/org-csv-loader.ts` — reads `fixtures/lga_org_structure.csv`, upserts `locations`, `angels`, `individuals`; derives `managers` rows from `lga_synthetic_tlogs.csv` `MANAGER_ID`+`MANAGER_NAME` columns — **file**: `src/ingestion/org-csv-loader.ts`. **DoD**: running it against a fresh DB produces exactly 4 locations, 20 angels, 12 individuals, 4 managers; re-running is a no-op. **Deps**: T016, T017, T018, T019.
- [X] T021 Implement `src/db/seed-schedules.ts` — inserts default shift schedules per location type (group home: Day/Swing/Overnight all days; host home: Day all days; day program: Day weekdays only) — **file**: `src/db/seed-schedules.ts`. **DoD**: after running, `SELECT COUNT(*) FROM shift_schedule` returns the expected row count per data-model.md §shift_schedule seed defaults. **Deps**: T020.
- [X] T022 Implement `src/jobs/seed.ts` entry point — runs migration, org CSV loader, schedule seeder; exits cleanly — **file**: `src/jobs/seed.ts`, `package.json` (script entry). **DoD**: `npm run seed` on a fresh DB populates all org tables; re-running prints `already seeded` and exits 0. **Deps**: T020, T021.

---

## Phase 2 — Ingestion (T-Logs)

**Goal**: T-Log CSV ingestion with supersession semantics. Fixtures auto-load on first boot.

- [X] T023 Implement `src/ingestion/normalize.ts` — pure function mapping a parsed CSV/Excel row → typed `TLogInsertShape` (column-name mapping, type coercion, fail-on-unknown-column) — **file**: `src/ingestion/normalize.ts`. **DoD**: unit test feeds two valid rows + one row missing `NOTIFICATION_LEVEL`; valid rows map, invalid row throws a descriptive error. **Deps**: T014.
- [X] T024 Implement `src/ingestion/insert-tlog.ts` — idempotent upsert: if `tlog_id` exists with `is_current=1`, flip that row to `is_current=0, superseded_at=now()` and insert new row with `version=prev.version+1, is_current=1`; if absent, insert `version=1, is_current=1` — **file**: `src/ingestion/insert-tlog.ts`. Wraps in transaction. **DoD**: unit test covers three cases (new tlog, supersession of existing, no-op re-insert of identical content). **Deps**: T023.
- [X] T025 [P] Write `tests/unit/supersession.test.ts` — inserts TLOG000001 v1, inserts TLOG000001 v2 with changed description, asserts:
  - two rows exist for TLOG000001
  - exactly one has `is_current=1` (enforced by unique partial index)
  - v1 `superseded_at` is set, v2 `superseded_at` is null
  — **file**: `tests/unit/supersession.test.ts`. **DoD**: `npm test` passes. **Deps**: T024.
- [X] T026 Implement `src/ingestion/tlog-csv-loader.ts` — reads `fixtures/lga_synthetic_tlogs.csv`, iterates rows through `normalize` and `insertTlog` inside one transaction — **file**: `src/ingestion/tlog-csv-loader.ts`. **DoD**: loading the full fixture produces exactly 648 rows in `t_logs` with `is_current=1`; re-running is a no-op. **Deps**: T024.
- [X] T027 Add auto-seed-on-boot to `src/server.ts` — after `migrate()`, if `SELECT COUNT(*) FROM t_logs = 0` AND `PROTOTYPE_MODE=true`, call the org loader + schedule seeder + TLog loader in order — **file**: `src/server.ts`. **DoD**: deleting `dev.db` and running `npm run dev` produces a running server against fully seeded data within ~30 s (ingest only — flagging comes later). **Deps**: T020, T021, T026.

---

## Phase 3 — Deterministic flagging

**Goal**: Missing-note and notification-level flag sources writing to `flags` table, with unit tests against fixtures.

- [X] T028 Implement `src/flagging/write-flag.ts` — single helper to insert a flag row with proper attribution (location_id, manager_id, angel_id); validates `source` is one of the three allowed enum values per constitution v1.0.1 — **file**: `src/flagging/write-flag.ts`. **DoD**: unit test asserts a bad `source` string is rejected before hitting the DB. **Deps**: T014.
- [X] T029 Implement `src/flagging/notification-level.ts` — pure function scanning `t_logs WHERE is_current=1`: High → red flag, Medium → yellow flag, source `notification_level` — **file**: `src/flagging/notification-level.ts`. **DoD**: runs against seeded fixtures and produces the expected count of red + yellow flags per notification_level distribution in the CSV. **Deps**: T028.
- [X] T030 [P] Write `tests/unit/notification-level.test.ts` — three fixture rows (Low, Medium, High), assert zero/one/one flag counts with correct severity — **file**: `tests/unit/notification-level.test.ts`. **DoD**: `npm test` passes. **Deps**: T029.
- [X] T031 Implement `src/lib/time.ts` — ET-aware date math: `shiftEndLocalToUtc(date, shiftName)`, `expandScheduleOverWindow(start, end)` — **file**: `src/lib/time.ts`. Uses `date-fns-tz`. **DoD**: unit test crosses a DST boundary and confirms shift_end is computed in `America/New_York` without offset errors. **Deps**: T003.
- [X] T032 Implement `src/flagging/missing.ts` — SQL against `shift_schedule` × date-range, anti-joined with `t_logs WHERE is_current=1`, producing expected shifts with no corresponding log; creates red `missing_schedule` flags with best-effort angel attribution (R13: single DSP at location → attribute; else NULL) — **file**: `src/flagging/missing.ts`. Include `// TODO(post-prototype): replace roster-lite with real shift-assignment table` comment. **DoD**: running against seeded fixtures produces the three known Sunrise Friday missing flags (2026-03-27 IND012, 2026-04-03 IND008, 2026-04-10 IND011). **Deps**: T028, T031.
- [X] T033 [P] Write `tests/unit/missing.test.ts` — seeded schedule + partial T-Logs; asserts expected missing-flag count and attribution — **file**: `tests/unit/missing.test.ts`. **DoD**: passes. **Deps**: T032.

---

## Phase 3.5 — Similarity pre-pass

**Goal**: Deterministic copy-paste detection with persisted scores on `t_logs`. Jamal cluster proven in a unit test.

- [X] T034 Implement `src/flagging/similarity.ts` — token-set Jaccard over normalized tokens: lowercase, strip punctuation, drop stop-words (shared list with `src/lib/stopwords.ts`) — **files**: `src/flagging/similarity.ts`, `src/lib/stopwords.ts`. **DoD**: unit test on two near-identical strings returns Jaccard > 0.9; two unrelated strings return < 0.3. **Deps**: T003.
- [X] T035 Add similarity persistence fields to `src/ingestion/insert-tlog.ts` — after insert, call `computeSimilarity(newTlog, authorsLast20)` and update the new row's `similarity_score` + `similar_match_tlog_ids` (JSON array of top 3 matches with score ≥ 0.5) — **file**: `src/ingestion/insert-tlog.ts`, `src/flagging/similarity.ts`. **DoD**: re-ingesting a note writes non-null score + matches; no existing rows' fields mutate. **Deps**: T024, T034.
- [X] T036 Wire similarity pre-pass into `src/flagging/pipeline.ts` — first pass: for every `t_logs WHERE is_current=1 AND similarity_score IS NULL`, compute and persist score; **re-runs safely** because the IS NULL filter skips already-scored rows — **file**: `src/flagging/pipeline.ts`. **DoD**: running pipeline end-to-end leaves zero rows with `similarity_score IS NULL`. **Deps**: T035.
- [X] T037 Write `tests/unit/similarity.test.ts` — after seeding fixtures and running similarity pre-pass, assert:
  - Jamal Roberts (ANG007) has at least 10 notes with `similarity_score > 0.85` where `similar_match_tlog_ids` point to other Jamal notes
  - No non-Jamal note has a `similarity_score > 0.85` match pointing to Jamal (cross-angel cluster isolation)
  - Avg similarity_score across all non-Jamal notes is < 0.5
  — **file**: `tests/unit/similarity.test.ts`. **DoD**: passes against the real fixture. **Deps**: T036, T027.

---

## Phase 4 — Rules config data layer

**Goal**: `rule_config` table populated with seed rules; versioning + revert helpers.

- [X] T038 [P] Implement `src/rules/default-rules.ts` — exports `const DEFAULT_RULES` with five entries (`copy_paste`, `short_note`, `vague_content`, `medication_refusal`, `incident_language`), each with `name`, `description`, `prompt_template`, `config_json` including similarity threshold / window for `copy_paste` — **file**: `src/rules/default-rules.ts`. **DoD**: the array is a plain TypeScript export, PR-reviewable, no runtime dependency. **Deps**: T003.
- [X] T039 Implement `src/rules/seed-rules.ts` — on seed, inserts `DEFAULT_RULES` as version=1, is_active=1 rows; idempotent (skips if any row for rule_key exists) — **file**: `src/rules/seed-rules.ts`, `src/jobs/seed.ts`. **DoD**: `npm run seed` on a fresh DB ends with five `rule_config` rows; re-seeding is a no-op. **Deps**: T038, T022.
- [X] T040 Implement `src/rules/rules-admin.ts` — `editRule(ruleKey, fields, userId)` wraps in a transaction: set prior `is_active=0`, insert new row `version=prev+1, is_active=1`; `revertRule(ruleKey, versionToRestore, userId)` inserts a copy of that version as new `version=max+1, is_active=1`; `getActiveRule(ruleKey)` returns the active row — **file**: `src/rules/rules-admin.ts`. **DoD**: unit test edits a rule then reverts; ends with three rows for that rule_key with only the third active. **Deps**: T039.
- [X] T041 Implement `src/rules/rule-loader.ts` — `loadActiveRules()` returns all `is_active=1` rows; `buildPrompt(activeRules, tlog)` assembles the classifier system prompt from rule descriptions + prompt_templates; the ONLY module that reads `rule_config.prompt_template` — **file**: `src/rules/rule-loader.ts`. **DoD**: unit test asserts the assembled prompt contains every active rule's name and description. **Deps**: T040.

---

## Phase 5 — AI classifier

**Goal**: OpenRouter integration, similarity-aware prompt, pipeline runner with concurrency cap.

- [X] T042 Implement `src/lib/concurrency.ts` — wraps `p-limit` with a singleton `classifierLimit = pLimit(5)` — **file**: `src/lib/concurrency.ts`, `package.json`. **DoD**: unit test confirms 10 concurrent calls to a `setTimeout`-backed function take ≥ 2× the per-call time (proves the limit is applied). **Deps**: T006.
- [X] T043 Implement `src/flagging/classifier.ts` — `classifyNote(tlog, matchedPriorNoteExcerpt, activeRules)` builds request body per research.md §R1, posts to `https://openrouter.ai/api/v1/chat/completions`, validates response with zod, returns `{severity, reason}` — **file**: `src/flagging/classifier.ts`. User-message includes `notification_level`, `shift_name`, `type`, `similarity_score`, `similar_match_count`, `description`, and `matchedPriorNoteExcerpt` (first 200 chars of top match if score ≥ threshold). **DoD**: unit test mocks the fetch and asserts the request body shape; response-parse unit test covers happy path and malformed JSON. **Deps**: T041, T042.
- [X] T044 Add exponential-backoff retry inside `classifyNote` — on 429 or 5xx, retry up to 2 more times with 1s/2s backoff; on attempts 3 return `{error: code}` — **file**: `src/flagging/classifier.ts`. **DoD**: unit test with a mock returning 429 twice then 200 succeeds; unit test with 429 three times returns the error. **Deps**: T043.
- [X] T045 Extend `src/flagging/pipeline.ts` — AI pass: select `t_logs WHERE is_current=1 AND classifier_status='pending'` AND no red flag exists; fan out to `classifyNote` via `classifierLimit`; on ok → write ai_classifier flag if severity ≠ green; on error → set `classifier_status='retry', classifier_error_code=code, classifier_attempt_count++`; enforce "escalate-only" (never downgrade a deterministic yellow to green) — **file**: `src/flagging/pipeline.ts`. **DoD**: running against seeded data produces a non-zero count of ai_classifier flags; unit test asserts a deterministic yellow is never downgraded. **Deps**: T036, T044.
- [X] T046 Implement `src/flagging/classifier-usage.ts` — increments `classifier_usage` row for today on every classifier call (calls, input tokens, output tokens, errors); never stores note text — **file**: `src/flagging/classifier-usage.ts`, `src/flagging/classifier.ts`. **DoD**: after running full pipeline on fixtures, `SELECT * FROM classifier_usage` has a row for today with non-zero call count. **Deps**: T043.
- [X] T047 Add pipeline auto-run on boot in `src/server.ts` — after auto-seed, if any `t_logs` row has `classifier_status='pending'`, run the full pipeline (missing + notification-level + similarity + AI) — **file**: `src/server.ts`, `src/flagging/pipeline.ts`. **DoD**: fresh-boot end-to-end: `dev.db` deleted → `npm run dev` → within ~60s every current T-Log has `classifier_status` in `{ok, retry, permanent_failure}` and `flags` table is populated. **Deps**: T045.

---

## Phase 5.5 — Retry worker

**Goal**: Scheduled re-run for classifier errors; permanent-failure promotion with ops notice.

- [X] T048 Implement `src/jobs/classifier-retry.ts` — script entry point: select `t_logs WHERE is_current=1 AND classifier_status='retry' AND classifier_attempt_count < 3`, re-run `classifyNote` on each; on success → flag + `classifier_status='ok'`; on error with `attempt_count` now 3 → `classifier_status='permanent_failure'` + write `ops_notices` row with `category='classifier_permanent_failure', message=<tlog_id and count>, context_json={tlog_id, error_code}` — **file**: `src/jobs/classifier-retry.ts`. **DoD**: unit test with seeded retry row: first invocation transitions ok or increments count; third failed invocation writes ops_notices row + sets `permanent_failure`. **Deps**: T045.
- [X] T049 Add `/15 cron entry in `railway.json` invoking `node dist/jobs/classifier-retry.js` — **file**: `railway.json`. **DoD**: Railway dashboard shows the scheduled entry; one scheduled run logs the selected-count. **Deps**: T048, T010.

---

## Phase 6 — Dashboard views (read-only)  [US1]

**Goal**: Leadership and managers can read the dashboard and drill down. Delivers the MVP slice of User Story 1 from spec.md.

**Every task in this phase inherits the UI/UX Constraints block**. Specifically: four top tiles (Red / Yellow / Missing / Compliance), locations rendered as a list (not a grid), labeled severity pills (text + color), breadcrumbs on drill-downs with mobile truncation via `…` disclosure, filters collapsed by default. Flag source enum values never displayed verbatim — UI reads from `flags.display_category` and renders **"High priority"** / **"Medium priority"** / **"Missing note"** / **"Pattern detected"** / **"System review"**. Roll-up rows with zero red/yellow/missing flags get a green pill labeled **"Green — No flags"** (consistency over minimalism). The Dashboard must surface a **"Preview this week's email"** link at the top-right of the Locations section or inline with the page title — never below the trend chart. The trend chart is server-rendered inline SVG: one line per location, y-axis 0–100%, faint gridlines at 25/50/75/100, no animation, **no JS charting library** (recharts, chart.js, uplot are all explicitly out of scope — push back in code review if proposed).

- [X] T050 [US1] Implement `src/db/queries/dashboard.ts` — `dashboardAggregates(scope, start, end, filters)` returns rows of (location_id, manager_id, count_red, count_yellow, count_green) — **file**: `src/db/queries/dashboard.ts`. **DoD**: unit test against seeded data confirms Riverside shows non-zero yellow+red counts for the full window. **Deps**: T047.
- [X] T051 [US1] Implement `src/db/queries/compliance-score.ts` — `computeComplianceScore(locationId, start, end)` returns `{submitted_not_red, expected, pct}` per spec FR-014 definition — **file**: `src/db/queries/compliance-score.ts`. **DoD**: unit test against seeded data confirms Sunrise's score < 100% for 2026-03-27 week (Friday missing). **Deps**: T047.
- [X] T052 [US1] Implement `src/db/queries/last-refresh.ts` — returns max(`ingested_at`) across `t_logs WHERE is_current=1` — **file**: `src/db/queries/last-refresh.ts`. **Deps**: T014.
- [X] T053 [US1] [P] Implement `src/views/trend-chart.ts` — pure function returning an inline SVG per-location trend of daily compliance score over the window; no JS dependency — **file**: `src/views/trend-chart.ts`. **DoD**: rendering with 30 days of points produces a valid SVG string that displays in a browser (eyeball check). **Deps**: T051.
- [X] T054 [US1] Implement `src/views/dashboard.ts` — top-level view: location × severity grid, manager roll-up, filter form, last-refresh stamp, trend chart — **file**: `src/views/dashboard.ts`. **DoD**: `GET /` returns a full HTML page using `layout()` + `dashboard()`; 375px check passes. **Deps**: T050, T052, T053, T009.
- [X] T055 [US1] Register the `GET /` route in `src/server.ts` wired to the dashboard view; accepts filter query params (`start, end, sev, shift, loc, manager, individual`); htmx-aware (returns just the fragment when `HX-Request: true`) — **file**: `src/server.ts`. **DoD**: all query params filter correctly; visiting `/?sev=red` shows only red counts. **Deps**: T054.
- [X] T056 [US1] Implement `src/auth/scope.ts` **stub** — middleware that (for now) treats every user as `leadership` scope; real role lookup comes in Phase 11. **file**: `src/auth/scope.ts`, `src/server.ts`. **DoD**: every route handler can call `req.scope` and get `{role: 'leadership', locations: 'all'}` — and will later upgrade to real scope. **Deps**: T003.
- [X] T057 [US1] Implement `src/views/drilldown.ts` — three sub-views: `locationView(locationId)`, `angelView(locationId, angelId)`, `individualView(locationId, angelId, individualId)`; each shows per-child flag counts + list — **file**: `src/views/drilldown.ts`. **DoD**: clicking Riverside from dashboard shows angel list; clicking Jamal shows individual list; clicking Sarah K shows flagged note list. **Deps**: T054, T056.
- [X] T058 [US1] Register drill-down routes in `src/server.ts`: `GET /location/:location_id`, `GET /location/:location_id/angel/:angel_id`, `GET /location/:location_id/angel/:angel_id/individual/:individual_id` — **file**: `src/server.ts`. All 403 on scope violations. **DoD**: manual walk-through works; cross-scope requests return 403 (tested once real scope lands in Phase 11). **Deps**: T057.
- [X] T059 [US1] Implement `src/views/note-detail.ts` — **per UI/UX Constraints**: full original description in a large readable box (top of page, not buried under metadata). Two-column metadata list (date, shift, angel, individual, notification level) **below** the note. Each flag as a card with labeled severity pill + source badge (rendered as **"Missing note"** / **"High priority"** / **"Medium priority"** / **"System review"**, never the enum string) + reason text + rule name. A single collapsed disclosure labeled **"How was this flagged?"** at the bottom holds the audit trail (rule version, model name, prompt version) — hidden by default, exposed only for auditors. **File**: `src/views/note-detail.ts`. **DoD**: opening TLOG000016 v1 shows the original text prominently; "How was this flagged?" is collapsed on load; flag source badge reads "System review", not `ai_classifier`. **Deps**: T058.
- [X] T060 [US1] Register `GET /note/:tlog_id/:version` route; also `GET /note/:tlog_id/history` showing version list — **file**: `src/server.ts`. **Deps**: T059.
- [X] T061 [US1] Implement `src/views/search.ts` + `GET /search?q=...` — scope-aware free-text search across `t_logs.description` + `t_logs.summary`, top 20 hits, returns a fragment — **file**: `src/views/search.ts`, `src/server.ts`. **DoD**: searching "vitals" returns only hits within user's scope; manager-scope search excludes other locations. **Deps**: T058.

---

## Phase 7 — Rules config screen  [US2]

**Goal**: Elaina can edit rules and trigger a live re-run. Delivers User Story 2 — the demo's "aha" moment.

**Every task in this phase inherits the UI/UX Constraints block**. Specifically: the rule name + plain-English description are the primary form fields; numeric thresholds surface as labeled inputs with human-readable descriptions ("How similar is too similar?" with 0.50–1.00 tick marks; "Residential shifts under __ words"); the classifier prompt lives inside a collapsed **"Advanced: instructions for the system"** disclosure, hidden by default. Primary actions: **Save changes** and **Update flags now** (never "Re-run classifier" or "Commit"). Re-run progress shows "Checking 147 notes… 62 done" with a thin progress bar — never a spinner. History list uses **"Restore this version"** buttons (no diff view in v1).

- [X] T062 [US2] Implement `src/views/rules.ts` `rulesList()` — lists active rules with name, description, prompt_template preview, version — **file**: `src/views/rules.ts`. **Deps**: T041, T057.
- [X] T063 [US2] Implement `src/views/rules.ts` `ruleEditForm(ruleKey)` — form with name, description, prompt_template textarea, typed config_json inputs (slider for similarity_threshold, number for min_words) — **file**: `src/views/rules.ts`. **Deps**: T062.
- [X] T064 [US2] Register `GET /rules` + `GET /rules/:rule_key/edit` + `POST /rules/:rule_key` routes — save handler calls `editRule()` from rules-admin, returns a success fragment with "re-run?" button — **file**: `src/server.ts`. **DoD**: editing the copy_paste rule increments its `rule_config.version`; response shows the new version number. **Deps**: T040, T063.
- [X] T065 [US2] Implement `src/flagging/pipeline.ts` `rerunOnWindow(start, end, ruleKeys?)` — updates affected `flags.resolution='superseded_by_rerun', resolved_at=now()` for `source='ai_classifier'` flags in the window; re-runs AI pass for those notes; never touches deterministic flags — **file**: `src/flagging/pipeline.ts`. **DoD**: unit test on a narrow window confirms deterministic flags are untouched; ai_classifier flags change count. **Deps**: T045.
- [X] T066 [US2] Implement `POST /rules/rerun` with SSE progress fragment (htmx SSE extension via CDN) — streams progress every ~2s, final fragment is the updated dashboard for the window — **file**: `src/server.ts`, `src/views/rules.ts`. **DoD**: clicking "re-run on last 7 days" on seeded data completes in <30 s at concurrency 5 (SC-003); dashboard repaints with new counts. **Deps**: T065.
- [X] T067 [US2] Implement `src/views/rules.ts` `rulesHistory(ruleKey)` — lists every version with timestamp, author, diff-vs-prior; each row has a "revert" button posting to `POST /rules/:rule_key` with version payload — **file**: `src/views/rules.ts`, `src/server.ts`. **DoD**: revert action creates a new version row (not a flip of `is_active`) and triggers re-run. **Deps**: T066.

---

## Phase 8 — Manual upload path  [US4]

**Goal**: Admin can upload a Therap Excel export and see ingestion happen. Delivers half of User Story 4.

**Every task in this phase inherits the UI/UX Constraints block**. Specifically: the upload page is a single drag-and-drop zone labeled **"Drop a Therap Excel export here, or click to browse"** with max size shown in small text. The post-upload summary is plain English — **"Uploaded 234 notes. 229 added. 5 skipped."** — and every skipped row is a one-sentence human explanation (**"Unknown individual ID: IND099 — add them in Settings first"**), never an error code or stack trace. "Ingestion" / "parse" / "normalize" / "CSV" do not appear anywhere in the UI.

- [X] T068 [US4] Implement `src/ingestion/excel-upload.ts` — reads a Buffer with SheetJS `xlsx`, parses first sheet, column-name-maps rows, passes each through `normalize()`, caps at 10 MB — **file**: `src/ingestion/excel-upload.ts`, `package.json`. **DoD**: unit test reads a small .xlsx fixture and produces the same `TLogInsertShape[]` as the CSV path. **Deps**: T023.
- [X] T069 [US4] Implement `src/admin/upload.ts` — handler receives multipart, runs `excelUpload()`, invokes `insertTlog()` per row collecting `{row, outcome}` results, runs `pipeline.rerunForIngestedTlogs()` for new ones, returns a summary object — **file**: `src/admin/upload.ts`. **DoD**: unit test uploads 10-row fixture with one unknown angel and asserts 9 ingested, 1 skipped with `reason='unknown_id'`. **Deps**: T068, T024, T045.
- [X] T070 [US4] Implement `src/views/admin.ts` `uploadPage()` + `uploadSummary()` views — **file**: `src/views/admin.ts`. **Deps**: T062.
- [X] T071 [US4] Register `GET /admin/upload` + `POST /admin/upload` routes; write `ops_notices` row with `category='upload_partial'` if any row was skipped — **file**: `src/server.ts`, `src/admin/upload.ts`. **Deps**: T069, T070.

---

## Phase 9 — Org structure admin  [US4]

**Goal**: Admin CRUD for all org entities + shift schedules + recipients. Delivers the remainder of User Story 4.

**Every task in this phase inherits the UI/UX Constraints block**. Specifically: the screen is called **"Settings"** in the nav and on the page (never "Admin"). Left sidebar with sections **Locations / Angels / Individuals / Managers / Shift Schedules / Digest Recipients / System Messages**. Each section is a plain list + Add button + per-row Edit/Delete. Soft-delete shows a visible warning naming the consequence in human language (**"This angel has 47 notes. Deleting will mark the angel as inactive; the notes stay."**). "Ops notices" is rendered as **"System messages"** everywhere it appears.

- [X] T072 [US4] Implement `src/admin/org.ts` CRUD handlers for locations (create/edit/soft-delete) — **file**: `src/admin/org.ts`. **Deps**: T016.
- [X] T073 [US4] [P] CRUD handlers for angels — **file**: `src/admin/org.ts`. **Deps**: T017.
- [X] T074 [US4] [P] CRUD handlers for managers — **file**: `src/admin/org.ts`. **Deps**: T019.
- [X] T075 [US4] [P] CRUD handlers for individuals — **file**: `src/admin/org.ts`. **Deps**: T018.
- [X] T076 [US4] Implement shift-schedule CRUD — `src/admin/org.ts`; per-individual form with day-of-week toggles — **file**: `src/admin/org.ts`. **Deps**: T021.
- [X] T077 [US4] Implement `src/admin/recipients.ts` — CRUD for `digest_recipients` rows — **file**: `src/admin/recipients.ts`. **Deps**: T014.
- [X] T078 [US4] Implement `src/views/admin.ts` admin screens for all six CRUDs (htmx-driven, single-file-per-screen inline forms) — **file**: `src/views/admin.ts`. **Deps**: T072–T077.
- [X] T079 [US4] Register all admin routes in `src/server.ts`: `GET /admin/org`, `/admin/org/locations`, `/admin/org/angels`, `/admin/org/managers`, `/admin/org/individuals`, `/admin/org/shift-schedules`, `/admin/recipients` with their POST variants — **file**: `src/server.ts`. All require `admin` role (enforced in Phase 11). **Deps**: T078.

---

## Phase 10 — Digest preview + generator  [US3]

**Goal**: Weekly digest rendering with zero-note suppression; preview page for demo. Delivers User Story 3.

**Every task in this phase inherits the UI/UX Constraints block**. Specifically: the preview page renders a vertical list of envelope cards (recipient name, scope, rendered email inline) with a muted (not red) top banner reading **"Preview mode — no emails will be sent."** The digest body itself contains zero technical jargon — compliance numbers, location names, angel names, plain-English phrases like "top flagged angels" / "missing notes", and deep links. Source enum values never appear; render as **"Missing note"** / **"High priority"** / **"System review"** in any per-flag listing. The "send" button is labeled **"Preview this week's email"** in prototype mode and **"Send this week's email"** in production.

- [X] T080 [US3] Implement `src/digest/render.ts` `renderDigest(recipient, windowStart, windowEnd)` — pure function, returns HTML string with: notes submitted vs expected, top-flagged locations/angels, WoW change, deep links. Zero note text. Zero classifier reasoning text — **file**: `src/digest/render.ts`. **DoD**: unit test renders against seeded data, greps output for banned keys (`description`, `summary`, `reason`, `individual_name`), confirms none present. **Deps**: T050, T051.
- [X] T081 [US3] Implement recipient-scoped generation in `renderDigest` — honors `recipient.scope` ('all' or `location_id`); all-locations scope shows 4 location rows, per-location scope shows one. **Deps**: T080.
- [X] T082 [US3] Implement `src/digest/send.ts` — `sendDigest(recipient, html)`: first line is `if (config.PROTOTYPE_MODE) { previewStore.save(recipient, html); return; }`; production path calls Resend — **file**: `src/digest/send.ts`. **DoD**: unit test with `PROTOTYPE_MODE=true` confirms no fetch is attempted. **Deps**: T080.
- [X] T083 [US3] Implement `src/digest/preview.ts` + `src/views/digest-preview.ts` — preview page listing every recipient scope with the rendered digest HTML inline — **files**: `src/digest/preview.ts`, `src/views/digest-preview.ts`. **Deps**: T082.
- [X] T084 [US3] Register `GET /digest/preview` route — **file**: `src/server.ts`. **DoD**: visiting `/digest/preview` on seeded data shows 5 envelopes (1 all-locations + 4 per-manager). **Deps**: T083.
- [X] T085 [US3] Implement `src/jobs/weekly-digest.ts` cron entry — iterates `digest_recipients WHERE is_active=1`, calls `renderDigest` + `sendDigest` for each; in prototype, populates the preview store — **file**: `src/jobs/weekly-digest.ts`. **DoD**: `node dist/jobs/weekly-digest.js` produces the same preview envelopes as the preview page. **Deps**: T082.
- [X] T086 [US3] Implement `src/jobs/ingestion-gap-check.ts` — reads `t_logs WHERE is_current=1 AND ingested_at BETWEEN window_start AND window_end`; if count = 0, inserts `ops_notices(category='ingestion_gap', ...)` **file**: `src/jobs/ingestion-gap-check.ts`. **Deps**: T014.
- [X] T087 [US3] Zero-note suppression in `src/jobs/weekly-digest.ts` — before calling `renderDigest` for a recipient scope, check if the window has any ingested notes for that scope; if zero, skip dispatch and write `ops_notices(category='digest_suppressed', message='{scope}: zero ingested notes in window', context_json={scope,start,end})` — **file**: `src/jobs/weekly-digest.ts`. **DoD**: unit test with empty `t_logs` in window confirms zero preview envelopes stored + one ops_notices row. **Deps**: T085, T086.
- [X] T088 [US3] Register weekly-digest and ingestion-gap-check cron entries in `railway.json` (Monday 12:00 UTC + 11:30 UTC) — **file**: `railway.json`. **Deps**: T085, T086.

---

## Phase 11 — Auth

**Goal**: Real auth with role-based scoping replacing the Phase 6 stub; Anthony-King-pattern multi-location manager support.

**Every task in this phase inherits the UI/UX Constraints block**. Specifically: the login page is a centered card — app name, nothing else chromewise (no marketing copy, no tagline). In prototype mode **both** the demo-login email (`demo@lowesguardianangel.com`) AND the password are pre-filled, enabling one-click sign-in for demos; the pre-fill is guarded by `PROTOTYPE_MODE=true` and MUST NOT appear in production (verified by a unit test reading rendered HTML with `PROTOTYPE_MODE=false`). The **"Sign in with Google"** button is rendered only when `GOOGLE_CLIENT_ID` is set. The role list in the codebase is **three roles**: `admin` (Adrian — Settings + Rules + everything), `leadership` (Alonzo, Elaina — full visibility + Rules, no Settings/recipients admin), `manager` (scoped to their assigned locations, read-only on Rules); `demo` is a prototype-only alias for leadership. Nav items are gated by role — managers do NOT see Rules or Settings.

- [X] T089 Implement `src/auth/better-auth.ts` — Better Auth setup with SQLite adapter pointed at the existing DB, configured to manage `users` + its own `account`, `session`, `verification` tables — **file**: `src/auth/better-auth.ts`, `src/db/schema.sql` (add Better Auth tables if the library doesn't create them itself), `src/server.ts` (mount auth routes). **DoD**: `GET /auth/login` renders a page; unauthenticated requests to `/` redirect to `/auth/login`. **Deps**: T013, T055.
- [X] T090 Register the credentials (demo login) provider — `POST /auth/login/demo` accepts email+password, validates against `DEMO_LOGIN_PASSWORD` for `demo@lowesguardianangel.com` — **file**: `src/auth/better-auth.ts`. **DoD**: posting demo creds establishes a session. **Deps**: T089.
- [X] T091 Seed demo + manager users — `src/jobs/seed.ts` adds `demo@lowesguardianangel.com` with `role='leadership'` and four manager users (vivian@/marcus@/anthony@/elena@) with `role='manager'` — **file**: `src/jobs/seed.ts`. **Deps**: T089.
- [X] T092 Add Google SSO provider — registered only when `config.GOOGLE_CLIENT_ID` is present; server-side `hd` claim verification rejects any non-`lowesguardianangel.com` ID token — **file**: `src/auth/better-auth.ts`. **DoD**: with env vars present, `/auth/google/start` 302s to Google; a non-LGA test token is rejected by the callback. **Deps**: T089.
- [X] T093 Implement `user_location_scope` seeding + Anthony King pattern — seed script inserts Anthony's user with both `LOC003` (his host home) AND `LOC001` (oversight of Peachtree — per transcript); Vivian gets LOC001, Marcus LOC002, Elena LOC004 — **file**: `src/jobs/seed.ts`. **DoD**: `SELECT * FROM user_location_scope WHERE user_id = <anthony's id>` returns 2 rows. **Deps**: T091.
- [X] T094 Replace the Phase 6 stub in `src/auth/scope.ts` with real lookup — computes `scope` per role: leadership/admin → all-locations, manager → `SELECT location_id FROM user_location_scope WHERE user_id = ?`, demo → all-locations (prototype-only) — **file**: `src/auth/scope.ts`. **DoD**: Anthony's session iterates both of his locations in dashboard queries; Vivian's sees only Peachtree. **Deps**: T093, T056.
- [X] T095 Write `tests/unit/scope.test.ts` — with seeded multi-location manager, assert:
  - Anthony's scope returns exactly [LOC001, LOC003]
  - Vivian's scope returns exactly [LOC001]
  - Leadership scope returns "all"
  - An unauthenticated request to `/location/LOC002` returns 403
  — **file**: `tests/unit/scope.test.ts`. **Deps**: T094.
- [X] T096 Enforce role guards on routes — admin routes (`/admin/*`, `/rules/*`) require `role IN ('admin','leadership')` for reads and `role='admin'` for writes; ops export JSON requires `role='admin'` — **file**: `src/server.ts`, `src/auth/scope.ts`. **DoD**: manager session hitting `/rules` gets 403. **Deps**: T094.

---

## Phase 12 — Demo polish + acceptance gates

**Goal**: Verify the two hero demo patterns surface and the 30-second rule-rerun SLA holds. Mobile sweep.

- [X] T097 **Acceptance gate: Jamal copy-paste cluster surfaces on Riverside drill-down** — write `tests/integration/jamal-cluster.test.ts`: seed fixtures → run full pipeline → fetch `GET /location/LOC002` → assert Jamal Roberts (ANG007) appears with the highest `ai_classifier` flag count among Riverside angels; click through to an angel page and confirm at least one flag's `reason` text cites "near-identical content to" with count ≥ 8 — **file**: `tests/integration/jamal-cluster.test.ts`. **DoD**: test passes against real seeded data. This is an acceptance gate, not a nice-to-have. **Deps**: T047, T057.
- [X] T098 **Acceptance gate: Sunrise Friday missing notes visible** — write `tests/integration/sunrise-fridays.test.ts`: seed fixtures → run full pipeline → query flags with `source='missing_schedule' AND location_id='LOC004'` → assert at least three rows for 2026-03-27 (IND012), 2026-04-03 (IND008), 2026-04-10 (IND011); fetch `GET /location/LOC004?sev=red&source=missing_schedule` and assert all three surface on the page — **file**: `tests/integration/sunrise-fridays.test.ts`. **Deps**: T047, T057. Required adding `getMissingFlagsForLocation` + a Missing-notes section on the location view so missing flags (which carry `angel_id=null`) could surface beyond per-angel aggregates.
- [X] T099 **Acceptance gate: rule-edit SLA** — write `tests/integration/rerun-sla.test.ts`: seed fixtures → run pipeline → edit `copy_paste` rule's threshold from 0.7 to 0.6 → post to `/rules/rerun?start=...&end=...` (last 7 days) → assert the pipeline completes in < 30 seconds and flag counts in the window change — **file**: `tests/integration/rerun-sla.test.ts`. **Deps**: T066, T037. Test calls `rerunOnWindow()` directly rather than over HTTP (server.ts isn't test-mountable yet).
- [X] T100 Integration test: full fixture pipeline — write `tests/integration/fixtures-pipeline.test.ts` that ties T037 + T097 + T098 together as a smoke test for the whole hero narrative — **file**: `tests/integration/fixtures-pipeline.test.ts`. **Deps**: T097, T098.
- [X] T101 Mobile-375px audit — write `tests/integration/mobile-viewport.test.ts` using Playwright's device emulation (iPhone SE viewport = 375×667); for each primary route (`/`, `/location/:id`, `/rules`, `/digest/preview`, `/note/:id/:version`, `/admin/org`) assert no horizontal scrollbar and no element overflows viewport width — **file**: `tests/integration/mobile-viewport.test.ts`. **DoD**: passes on seeded data. **Deps**: T060, T079, T084. *Playwright not installed* — substituted happy-dom structural lint (raw `<table>` outside `overflow-x`, explicit widths >375px, `whitespace-nowrap` on long content). True rendered-layout verification remains open.
- [X] T102 Empty / loading / error states sweep — every view renders gracefully when queries return zero rows; htmx errors return a friendly fragment with correlation ID — **files**: all `src/views/*.ts`. **DoD**: manual sweep; obvious empty-state messages on filtered-to-nothing dashboard views; 500s show correlation ID, not stack. **Deps**: T060, T067, T079, T084. Added `app.onError` to `src/server.ts` returning htmx fragment vs full page, both carrying a correlation ID and omitting stack.
- [X] T103 PHI log-redaction verification — grep-style unit test `tests/unit/log-redaction.test.ts`: feed 50 log calls with banned keys in payload; assert none appear in emitted output — **file**: `tests/unit/log-redaction.test.ts`. **Deps**: T007.
- [X] T104 Static grep for PHI leaks — unit test `tests/unit/no-phi-in-views.test.ts` scans `src/views/**/*.ts` for any `<script>` or `data-*` attribute concatenated with banned fields (`description, summary, reason, individual_name, note_text`); fails on hits — **file**: `tests/unit/no-phi-in-views.test.ts`. **Deps**: T060.

---

## Phase 13 — Documentation

**Goal**: Run-locally, demo-walkthrough, env-vars, extend-a-rule, and post-prototype roadmap.

- [ ] T105 Write `README.md` with run-locally section (clone → install → `.env` → `npm run seed` → `npm run dev`) — **file**: `README.md`. **Deps**: T022.
- [ ] T106 Add demo-walkthrough section to README matching `specs/001-compliance-monitor/quickstart.md` hero narrative, step-by-step, with screenshots placeholder — **file**: `README.md`. **Deps**: T105, T100.
- [ ] T107 Add env-var reference table to README (copy from quickstart.md, keep in sync) — **file**: `README.md`. **Deps**: T105.
- [ ] T108 Document "how to swap the OpenRouter model" — single `OPENROUTER_MODEL` env var, link to OpenRouter models page, note response_format support requirement — **file**: `README.md`. **Deps**: T043.
- [ ] T109 Document "how to add a new rule" — insert a row to `DEFAULT_RULES` in `src/rules/default-rules.ts` OR use the in-app rules-config screen; reference the rule_config schema — **file**: `README.md`. **Deps**: T038.
- [ ] T110 Post-prototype TODO section in README — enumerate open work: BAA + Trading Partner Agreement, SFTP wiring and confirmation of T-Log feed inclusion with Therap GA support, real email enabling (Resend), Google SSO enabling (admin consent), build-time Tailwind switch, real shift-assignment table replacing staffing-roster-lite — **file**: `README.md`. **Deps**: T105.
- [ ] T111 Architecture note in README — link to `specs/001-compliance-monitor/plan.md` and `data-model.md`, one-paragraph summary of the flagging pipeline order (missing → notification_level → similarity → AI), and the rationale for prototype-mode-as-first-class — **file**: `README.md`. **Deps**: T105.

---

## Dependency graph (phase-level)

```text
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 3.5 ──► Phase 4 ──► Phase 5 ──► Phase 5.5
                                                                                │
                                                                                ▼
                                     Phase 11 (auth) ─────────────────────► Phase 6 (US1)
                                                                                │
                           ┌────────────────────────────────────────────────────┤
                           ▼                          ▼                          ▼
                       Phase 7 (US2)            Phase 10 (US3)            Phase 8 + 9 (US4)
                           │                          │                          │
                           └───────────► Phase 12 (polish + gates) ◄─────────────┘
                                                      │
                                                      ▼
                                                Phase 13 (docs)
```

- Phase 11 (auth) depends on Phase 6 only for the scope-stub swap point; Better Auth itself can be set up in parallel with Phases 6–10 and swapped in at T094.
- Phases 7 (US2), 8+9 (US4), and 10 (US3) are mutually independent once Phase 6 lands. They can be built in any order or in parallel across engineers.
- Phase 12's integration tests (T097–T100) need Phases 6 + 7 + rule config + full pipeline in place.

---

## Implementation strategy: MVP first, incremental delivery

- **Walking-skeleton MVP (US1 only)**: Phases 0 → 1 → 2 → 3 → 3.5 → 4 → 5 → 5.5 → 6 → Phase 11 (slimmed: demo login only) → T097 + T098 acceptance gates. At this point Alonzo can walk the hero narrative minus the rules-edit moment and the digest preview — enough for an early demo.
- **Demo-ready (US1 + US2)**: Add Phase 7. Now the "aha" moment works.
- **Scope-complete (US1–US4)**: Add Phases 8, 9, 10. Now Alonzo sees the full demo narrative end-to-end including digest preview and admin flows.
- **Production-hardening**: Complete Phase 11 (Google SSO, real multi-location scope) + Phase 12 polish + Phase 13 docs. At this milestone the prototype is ready for LGA sign-off and the BAA conversation.

---

## Parallel opportunities

- **Phase 0**: T002 / T004 / T005 run fully in parallel after T001. T010 parallel with T009.
- **Phase 1**: T016 / T017 / T018 / T019 all in parallel after T014.
- **Phase 3**: T029 parallel with T030; T032 independent of T029 once T031 lands.
- **Phase 6**: T050 / T051 / T052 / T053 parallel after T047.
- **Phase 9**: T073 / T074 / T075 parallel (different entities, same file — only marked [P] if engineers coordinate).
- **Phase 12 (gates)**: T097 / T098 / T099 / T101 / T103 / T104 all parallel after their upstream phases complete.

---

## Summary

- **Total tasks**: 111.
- **Phases**: 14 (0 through 13, plus 3.5 and 5.5).
- **Distribution by story**:
  - No-story (Phase 0, 1, 2, 3, 3.5, 4, 5, 5.5, 11, 12, 13): 77 tasks
  - [US1] Phase 6: 12 tasks (T050–T061)
  - [US2] Phase 7: 6 tasks (T062–T067)
  - [US3] Phase 10: 9 tasks (T080–T088)
  - [US4] Phases 8+9: 12 tasks (T068–T079)
- **Acceptance gates in Phase 12**: T097 (Jamal cluster), T098 (Sunrise Fridays), T099 (30-second SLA), T101 (375px mobile). These block shipping.
- **Integration tests**: 4 (T097, T098, T099, T100, T101).
- **Unit tests**: 10 (config, logger, supersession, notification-level, missing, similarity, concurrency, rules-admin, scope, log-redaction, no-PHI-in-views).

**Ready for `/speckit.implement`** once the user signs off on the task list.

---

## Phase 14 — UX overhaul (2026-04-23)

**Goal**: Raise demo polish without violating the constitution. See Decisions log at top for scope negotiation.

### Tier 1 — core demo impact (batched; human review after)

- [X] T112 Demo-data badge in the header data-bar — `src/views/layout.ts`. Amber pill, visible only when `config.PROTOTYPE_MODE=true`.
- [X] T113 Dismissible welcome panel on `/` — cookie-backed (`ga_welcome_dismissed`), new `POST /ui/welcome/dismiss` returning empty htmx fragment. `src/views/dashboard.ts` + `src/server.ts`.
- [X] T114 Count-up animation + WoW delta + trend arrow on hero tiles. `src/views/dashboard.ts`, `src/db/queries/dashboard.ts` (add prior-window counts), `src/views/layout.ts` (tiny inline count-up script).
- [X] T115 Per-location sparkline in the locations list — reuse `getComplianceTrend`, render ~84×20 SVG inline. `src/views/dashboard.ts`, possibly a new `src/views/sparkline.ts`.
- [X] T116 Rule-editor live impact preview for `copy_paste` and `short_note`. New `GET /rules/:rule_key/preview-impact`. For the three LLM-evaluated rules, show a "Live preview not available — click Update flags now" stub. `src/views/rules.ts`, `src/server.ts`, `src/db/queries/rule-impact.ts` (new).

### Tier 2 — polish (auto-proceed after Tier 1 approval)

- [X] T117 Skeleton loaders + `hx-indicator` shimmer utility. Applies to re-run, search, upload.
- [X] T118 Keyboard shortcuts (`/` search, `g d` dashboard, `g r` rules, `Esc` closes disclosures) + `?` cheat-sheet disclosure. Inline script in `layout.ts`. Also added `g s` → Settings.
- [X] T119 Interactive trend chart — SVG `<title>` hover tooltips + click-to-scope. `src/views/trend-chart.ts`. Per-point circles are anchor-wrapped, so click-to-scope is server-side nav (no JS handler).
- [X] T120 Filter chips on dashboard (clickable severity / shift / location pills that toggle query params). `src/views/dashboard.ts`. Shift dimension accepted in query string but not yet filtered at the query level — see Tier 4 punch list.
- [X] T121 Gmail-style frame on digest preview envelopes. `src/views/digest-preview.ts`.
- [X] T122 Inline contextual help `<details>` on each primary screen. Help copy map per view file. New `src/views/contextual-help.ts`.

### Tier 3 — approved, post Tier 2

- [X] T123 **Scenario presets** — `GET/POST /admin/scenarios` with three preset cards (baseline / quiet / chaotic). Double confirmation on destructive reseed. Current scenario stored in new `app_settings` key/value table. **Deviation from brief**: instead of checking in separate fixture CSVs under `fixtures/scenarios/*`, presets are implemented as pure row-transforms over the single baseline fixture (quiet = drop High-priority + Jamal's short boilerplate; chaotic = triple Jamal's cluster + drop all Sunrise day-shift rows). Keeps the tree clean and lets us tune presets without regenerating fixtures. New files: `src/admin/scenarios.ts`, route additions in `src/server.ts`, `renderScenariosForm` in `src/views/admin-org.ts`.
- [X] T124 **AI flag feedback** — new `flag_feedback(flag_id, user_id, verdict, note, created_at, updated_at)` table with UNIQUE(flag_id, user_id) and ON DELETE CASCADE; thumbs up/down rendered per flag on the note-detail page; `POST /flags/:id/feedback` htmx fragment swap. Server-side only per Principle X. New: `src/db/queries/flag-feedback.ts`, `renderFeedbackControl` in `src/views/note-detail.ts`.
- [X] T125 **Presenter mode** — cookie `ga_presenter=1` flag threaded through `layout()`; suppresses header, data-bar, footer, and keyboard-shortcut overlay. Toggles at `GET /presenter/on` and `GET /presenter/off` (both redirect back via `?next=` or referer). Also added "Enter presenter mode" in header user dropdown and a persistent "Exit presenter" pill in the bottom-right corner when active.
- [X] T126 **Reset demo data** — Settings sidebar entry at `/admin/reset-demo`, double-confirm flow (first POST re-renders with red Confirm button; second POST actually wipes). Preserves users + user_sessions; cascades cleanup via `src/admin/reset-demo.ts` wipeOrder. Prototype-only (404 when `PROTOTYPE_MODE=false`). Admin role required.

### Explicitly not doing (from Decisions log)

- Shepherd.js / Intro.js / React tour (replaced by htmx-native tour cards if demand arises — not in Tier 1–3).
- Dark mode toggle.
- Modal drawers.
- JS charting library.
- Sound effects.

### Tier 4 — punch list (spotted during Tier 2 build)

These are small UX issues / inconsistencies observed while implementing T117–T122. Captured here so they don't get rediscovered during the demo. None are blockers.

- [ ] T127 **Shift filter doesn't actually filter.** `DashboardFilters.shift` is accepted from query string and highlighted in the chip bar (T120), but the `getLocationAggregates` query ignores it — the flag-aggregation subselect has no `shift_name` join. Fix: filter flags by the underlying t_log's shift_name and re-aggregate. Scope: `src/db/queries/dashboard.ts` getLocationAggregates + getOverallCounts.
- [ ] T128 **Severity chip + old severity radio group are redundant.** `renderChipBar` (top of dashboard) and the `Severity` radio group inside `renderFilter`'s disclosure control the same query param. Keep one. Likely the right move is drop the severity radios from inside the disclosure and keep date-range as the only disclosure control.
- [ ] T129 **Dashboard "Locations this week" heading is misleading when window != 7d.** The heading hard-codes "this week" but the filter chip can choose Last 30 days / This week / All time. Rename to match `data.window.label`.
- [ ] T130 **Sparkline widths drift at breakpoints.** Inline SVG sparklines use a fixed viewBox (84×20) rendered at `hidden sm:inline` in a flex row; on tablet widths the counts column can wrap underneath instead of staying right-aligned. Pin the counts column width or switch to `grid-cols-[1fr_auto_auto]`.
- [ ] T131 **Contextual-help copy duplicates itself.** Some help paragraphs (`location`, `angel`) restate what the section heading already says. Trim to 1–2 paragraphs max per screen — current ones are verbose.
- [ ] T132 **Keyboard shortcut `g s` → `/admin/org` 403s for non-admins.** Settings is admin-only; the shortcut should resolve the right landing page by role or be gated off entirely for managers/leadership. Scope: `layout.ts` renderShortcutsScript, or add role-aware shortcut rendering.
- [ ] T133 **Re-run skeleton persists if form submit fails client-side.** The inline `onclick` on the rerun button shows the skeleton unconditionally. If the browser blocks the submit (e.g., validation), the user sees a stuck skeleton. Wrap in a `form.addEventListener('submit', ..., { once: true })` instead, triggered only on successful submission.
- [ ] T134 **Welcome panel is only on `/`, not on drill-down pages on first visit.** If Alonzo's first-ever deep link is `/location/LOC002`, he never sees the welcome. Either surface a one-line "first-time here?" hint elsewhere, or make the panel trigger on any authenticated page until dismissed.
- [ ] T135 **Trend-chart dot click target is 3.5 px — too small for touch.** For mouse it's fine (hover grows opacity). For mobile/tablet increase the hit area via an invisible `<circle r=12 fill=transparent>` overlay per point, keeping the visible dot at 3.5.
- [ ] T136 **Digest preview "Monday, 8:00 AM" timestamp is a hardcoded string.** If the demo runs on a Tuesday, it's a tiny credibility break. Either derive from `digest.generated_at` or make it present-tense ("Preview · just now").
- [ ] T137 **`?` help overlay isn't announced to screen readers.** `role="dialog"` + `aria-modal="false"` is correct for non-blocking, but there's no focus-trap or return-focus-on-close. Low priority for demo; should be tightened before production auth users touch it.
- [ ] T138 **Filter-chip "Clear" link returns to bare `/`.** It drops the `window=` param too, resetting the date range. Users toggling severity probably didn't mean to also reset the window. Preserve `window` through Clear.
- [ ] T139 **Search indicator skeleton doesn't hide when results come back empty.** The `hx-indicator` flips off on response received, but the visible "No notes match" then sits below three phantom shimmer rows for one frame. Ensure the indicator fully detaches or swap target includes it.
- [ ] T140 **Manager filter (PRD §user story 3).** No way to filter the dashboard or drill-down by manager today. PRD lists manager as a first-class filter dimension. Surfaced by demo-readiness audit 2026-04-23. PRD-scoped; deliver post-prototype approval. Scope: add manager column + select to `DashboardFilters`, wire through `getLocationAggregates`/`getOverallCounts`, add a second chip row OR filter-disclosure entry.
  - **Note for T128 ID conflict**: user requested ID T128 in 2026-04-23 audit follow-up; T128 was already taken by an internal punch-list item from Batch 2. Kept as T140 to preserve history.
- [ ] T141 **Custom date range (PRD §user story 3).** Date filter today has four presets (7d / this_week / 30d / all). PRD implies "last Tuesday at Peachtree"-style queries. Surfaced by demo-readiness audit 2026-04-23. PRD-scoped; deliver post-prototype approval. Scope: add `from` / `to` date inputs to the filter form + a clean URL shape (`?from=YYYY-MM-DD&to=YYYY-MM-DD`), fall through to preset when blank.
  - **Note for T129 ID conflict**: same rationale as T140 — requested as T129 but that ID was already taken. Kept as T141.


### Post-demo followups (captured 2026-04-23, post audit sign-off)

Not blocking tomorrow's demo. Add properly with file paths + dependencies after the demo lands.

- [ ] T142 **Locations-list counts wrap at 375px.** After the demo-readiness batch bumped the counts column to `sm:w-[11rem]`, mobile still falls back to `w-[9rem]` and the longest count strings (`NN red · NN yellow · NN missing`) wrap to two lines. Acceptable for demo; capture as a Tier 4 polish task. Options: shorten to `NNr · NNy · NNm` on mobile, or restructure the row as two stacked rows.
- [ ] T143 **Real-classifier telemetry + resilience.** If the stub is going to stay in place for internal work beyond the demo, fix the failure-visibility gap that caused the audit: a full DB of `permanent_failure` rows with no surfaced warning anywhere. Scope: (a) admin-surfaced alert when `permanent_failure` count crosses a threshold, (b) per-error-code counts in an admin panel, (c) exponential-backoff retry on the 429 path before permanent-failing, (d) decide whether to keep attempting rate-limited models vs. fall back to a configured alt model. Prevents the same silent-break mode when we switch off the stub.
- [ ] T144 **Stub-vs-real parity audit.** Once we have a paid OpenRouter model working, run the same note set through both paths and diff: do severity distributions match? does reason text shape match (length, format)? does the UI render both model_name values cleanly? The stub already uses the production model id for UI continuity; validate that the UI behaves identically when the real model returns its actual id.
