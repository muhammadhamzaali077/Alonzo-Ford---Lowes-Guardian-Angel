# Phase 0 Research: Guardian Angel Compliance Monitor

**Feature**: 001-compliance-monitor
**Date**: 2026-04-21
**Status**: Complete — all Technical-Context NEEDS-CLARIFICATION resolved, best-practice choices recorded for every stack decision.

There were no `NEEDS CLARIFICATION` markers in `plan.md` Technical Context at Phase 0 entry (the three spec-level clarifications were resolved during `/speckit.specify`). Research below is best-practices investigation for every non-trivial dependency or pattern, per the Spec Kit Phase 0 expectation.

---

## R1. OpenRouter Lightweight model selection (April 2026)

**Decision**: Pin model via `OPENROUTER_MODEL` env var, default to `google/gemini-flash-lite-2.0`. Fallback option: `openai/gpt-5.4-nano`. Both are Flash/Nano-class with `response_format: json_object` support.

**Rationale**:
- Lightweight tier is binding per constitution P1 and stack.md. Note classification is structured pattern detection — SoTA models add latency and cost without accuracy gain at this task.
- OpenRouter exposes model catalog at `GET https://openrouter.ai/api/v1/models` with `supported_parameters` listing JSON-mode support. Implementation reads this at boot and fails fast if the pinned model is missing it.
- Pinning via env var lets LGA swap providers without a code change when Anthropic or Google release a successor Flash/Nano model.

**Alternatives considered**:
- `anthropic/claude-haiku-4-5`: Rejected as borderline on the Lightweight tier definition; Haiku is intentionally more capable than Flash/Nano and the stack.md tiering places it one tier up.
- `meta-llama/llama-3-8b-instruct`: Open-weight alternative; rejected because its HIPAA posture on OpenRouter is not verified and because it's consistently worse on structured-output reliability.
- Local open-source model via Ollama: Out of scope for a single Railway service; would break Principle I (single-service hosting).

**Prompt shape locked**:

```txt
system: {rule_config.prompt_template, interpolated with rule names + descriptions}
user: {
  note_type: string,
  notification_level: "Low"|"Medium"|"High",
  shift_name: string,
  similarity_score: number (0..1),
  similar_match_count: int,
  description: string
}
response_format: json_object, schema {severity: "green"|"yellow"|"red", reason: string (<=240 chars)}
temperature: 0
```

Hand-rolled `fetch` call — no SDK. Keeps the dependency footprint small and the request shape under our eye.

---

## R2. Copy-paste similarity algorithm

**Decision**: **Token-set Jaccard** on normalized tokens (lowercase, strip punctuation, drop stop-words), window of 20 prior notes by same author, threshold surfaced via `rule_config`. Computed in pure TypeScript, stored on `t_logs.similarity_score` (0..1) with `t_logs.similar_match_tlog_ids` (JSON array of top-3 TLOG_IDs above 0.5).

**Rationale**:
- Token-set Jaccard is O(n·k) where n = tokens in new note and k = tokens across 20 prior — trivial at LGA's volume (even 200-token notes × 20 prior = 4k token comparisons per new note; sub-millisecond).
- Deterministic, explainable ("95% token overlap with TLOG000016"), robust to classifier downtime (Principle V defensibility).
- Elaina's editable rule governs the threshold. A score of 0.7 against the mean of the last 20 notes is the initial default — surfaces Jamal's boilerplate cluster (the two "Shift went well. X ate meals..." templates at ~0.85 Jaccard) without falsing on routine "vitals WNL" content (which are short and varied enough to stay under threshold).
- Cosine on TF-IDF vectors was the runner-up. Rejected for v1 because TF-IDF needs a corpus-wide statistic that drifts as the corpus grows; Jaccard is corpus-free and cheaper to explain in the UI.

**Alternatives considered**:
- **SimHash / MinHash**: Great for billion-document scale, unnecessary here. Adds complexity to explain in the UI.
- **Embedding-based cosine** (e.g., sentence-transformers run locally): Captures semantic near-duplicates ("he had a quiet shift" vs. "nothing happened") but requires shipping a model binary with Railway, breaking the single-service posture. Keep as post-prototype option.
- **Pure LLM judgment**: Rejected per Q2 resolution — fragile under classifier downtime, not defensible without a numerical score attached.

**Performance note**: Similarity runs synchronously in the ingestion pipeline. Per-note cost is negligible; full fixture reseed completes in well under 1 s for all 648 notes.

---

## R3. better-sqlite3 vs alternatives

**Decision**: **better-sqlite3** (v11.x), used synchronously from Hono handlers and cron entry points. WAL mode enabled at client init. One DB file, one process, no connection pool.

**Rationale**:
- Synchronous API is the right fit for a single-process Node server. No callback juggling, no `await` on every query, no connection-pool config.
- Benchmarks show ~2–5× throughput vs async `sqlite3` for typical queries; more than fast enough for LGA's steady state.
- Prepared-statement caching built in.
- WAL mode lets concurrent read transactions proceed during writes — essential for the "re-run rules, show live dashboard" use case.

**Alternatives considered**:
- `node:sqlite` (Node 22+): Stable but not yet in Node 20, which is the constitution's minimum. Worth revisiting when Node 22 LTS lands.
- `sqlite3` (TJ-style async): Older, slower, callback-heavy. Rejected.
- **Drizzle / Kysely** on top of better-sqlite3: Rejected for prototype — pulls in a query-builder dependency and schema-codegen step that doesn't pay off at this scale. Raw SQL in named prepared-statement modules is clearer.

**Migration strategy**: boot-time runner reads `src/db/schema.sql` and `src/db/migrations/*.sql`, applied in lexical order; a `schema_versions` table tracks what's been applied. Prototype treats the whole schema as v1.

---

## R4. Better Auth + Google Workspace SSO with `hd` validation

**Decision**: Better Auth v1.x with two providers — `credentials` (the demo-login path, seeded single user) and `google` (production). Google provider configured with `hd=lowesguardianangel.com`; the callback handler validates the decoded ID token's `hd` claim **server-side** before issuing a session — never trust the query parameter alone.

**Rationale**:
- The `hd` parameter in the auth URL is a *request* to Google to only show Workspace users in the chosen domain — it's a UX hint, not a security boundary. An attacker can craft a request omitting `hd` and use a personal Gmail account with the same local-part.
- The real check is on the verified ID token: `jwt.verify(id_token, googlePublicKeys) && jwt.payload.hd === 'lowesguardianangel.com'`. Better Auth exposes a `verifyIdToken` hook; we plug the `hd` check there and reject sessions that don't match.
- "Never roll your own auth" (Principle I) — Better Auth handles the OAuth dance, cookie signing, session storage, and CSRF. We only add the one-line `hd` assertion.

**Alternatives considered**:
- NextAuth / Auth.js: Fine but targets Next; overkill for Hono. Better Auth is Hono-native.
- Hand-rolled OAuth: Banned by Principle I. Rejected.

**Demo-login ergonomics**: `DEMO_LOGIN_EMAIL=demo@lowesguardianangel.com`, `DEMO_LOGIN_PASSWORD=<env var, defaults to "demo">`. The demo user is seeded with role `leadership` so they see everything. Manager-view demos log in as pre-seeded `vivian@lowesguardianangel.com` / `marcus@…` etc., also via credentials provider.

---

## R5. Excel upload with SheetJS

**Decision**: **`xlsx`** (SheetJS community edition) for parsing the Therap UI Excel export. Upload endpoint streams the file to memory (cap at 10 MB), parses the first sheet, and maps columns by name (not by position — column order in the Therap UI export is not guaranteed stable).

**Rationale**:
- SheetJS community edition is ubiquitous, MIT-licensed, has been stable for years.
- Column-name mapping is resilient. We fail fast on any missing required column rather than silently mis-aligning.
- 10 MB cap is generous — Therap UI exports rarely exceed a few hundred KB even for multi-month windows. We fail the upload early if oversized; the user is told which column or size tripped the check.

**Alternatives considered**:
- **`exceljs`**: More feature-rich (writes Excel, not just reads). We only need read. Heavier dep.
- **CSV export path only**: Some Therap UIs export CSV directly; using that path would remove the xlsx dep. The 2022-era docs show XLSX is the primary export format; kept xlsx in.

**Row-level error surface**: Every parsed row runs through the same `normalize.ts` function used by the SFTP CSV ingester, so mapping rules stay identical across paths. Unmatched angel/individual IDs produce `{row, reason: 'unknown_id'}` in the upload summary; the batch proceeds (spec FR-003).

---

## R6. htmx patterns for drill-down

**Decision**: Every drill-down link uses `hx-get` + `hx-target="#main"` + `hx-push-url="true"`. A single `<div id="main">` in `layout.ts` holds the current view; server returns a full-page fragment each time. No client-side routing.

**Rationale**:
- Keeps all view logic server-side (Principle IX). No client bundler, no JSX.
- `hx-push-url` updates the browser URL so back/forward works; mobile-critical.
- Filters are `<form hx-get="/?loc=&sev=...">` — htmx handles the params naturally.
- Free-text search is `hx-trigger="input changed delay:300ms"` with `hx-get="/search?q=..."` returning a fragment — no custom debounce JS.

**Alternatives considered**:
- Return JSON + hand-written DOM updates: Violates "JSON is for nothing the user sees" (Principle IX).
- `hx-boost` on every link: Enables but we lose the explicit fragment-swap target, which makes `hx-push-url` harder to reason about. Explicit `hx-get` per link beats auto-boost here.

---

## R7. Tailwind via Play CDN — posture and post-prototype plan

**Decision**: Keep Play CDN for prototype (`<script src="https://cdn.tailwindcss.com"></script>`). Document in `.env.example` and `README.md` that production hardening must switch to built-time Tailwind purge. Add TODO(post-prototype) pointing at a specific issue.

**Rationale**:
- Constitution P9 permits CDN explicitly for prototype.
- FOUC on first paint is real but acceptable for an internal demo. The first-time-per-session delay is <300 ms; subsequent page loads are cached.
- Principle VIII (scope discipline) argues against dragging in a bundler now.

**Post-prototype plan**: switch to `npx tailwindcss --input ./src/styles.css --output ./public/app.css --content './src/views/**/*.ts'` run in the `npm run build` step. No framework change, no JSX — just CSS purging at build time.

---

## R8. Railway cron declaration format

**Decision**: Cron entries in `railway.json` under the `cron` key:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "cron": [
    { "schedule": "0 * * * *",    "command": "node dist/jobs/poll-and-flag.js" },
    { "schedule": "*/15 * * * *", "command": "node dist/jobs/classifier-retry.js" },
    { "schedule": "0 8 * * 1",    "command": "node dist/jobs/weekly-digest.js" },
    { "schedule": "30 7 * * 1",   "command": "node dist/jobs/ingestion-gap-check.js" }
  ]
}
```

**Rationale**:
- Railway runs cron commands in a fresh process sharing the main service's env and volume mount. Each job script is self-contained (imports the DB client, does its work, exits).
- Times are UTC on Railway cron. The digest run is declared at `0 8 * * 1 UTC` but the weekly-digest job internally computes the digest window in America/New_York, which means the job fires at 04:00 ET — **we schedule at `0 12 * * 1` UTC to hit 08:00 ET**. Noted in the file comments.
- Ingestion-gap check runs 30 min before the digest so it can write an ops_notice and the digest job can read it and suppress (FR-024).

**Alternatives considered**:
- Long-running in-process scheduler (node-cron): Rejected — Principle I and stack.md forbid external schedulers, and Railway cron is the canonical host-side mechanism. Using node-cron doubles the scheduling surface (the container also needs to stay running between ticks, which is fine, but testing the scheduler itself becomes a thing).

---

## R9. Classifier concurrency

**Decision**: **`p-limit` with concurrency = 5 in both prototype and production.** Applied to the top-level `classifier.ts` invocation over the list of pending notes.

**Rationale**:
- SC-003 requires rule re-run to update flags in <30 s on the last-7-days window (~150 notes). At ~200 ms/call serial, that's exactly 30 s — no headroom. Concurrency 5 drops wall-clock to ~6 s for a comfortable margin.
- Concurrency 5 is well under OpenRouter's per-key rate limits (varies by key tier, typically 10–60 req/s). Exponential backoff on 429 responses is scoped inside `classifier.ts`.
- `p-limit` is a 3 kB zero-dep library; adding it is cheap.

**Alternatives considered**:
- `Promise.all` (unlimited): Blows past rate limits at bigger windows. Rejected.
- Serial loop: Fails SC-003 SLA. Rejected.

---

## R10. Logging redaction posture

**Decision**: pino logger with a fixed allowlist of field names. Any log object goes through a serializer that drops `description, summary, individual_name, reason, note_text` before emit. A unit test asserts the serializer on known-PHI objects emits only IDs and severities.

**Rationale**:
- Principle II is binding; an allowlist catches typos better than a denylist.
- pino is fast, structured by default, Railway-compatible (JSON to stdout).
- The serializer sits in `src/lib/logger.ts` and is imported once in `src/server.ts`; no module bypasses it.

**Alternatives considered**:
- Winston: Heavier, not idiomatic in modern Node apps.
- Manual `console.log` with grep-style precommit check: Brittle; tests and reviewers miss edge cases.

---

## R11. TZ handling for missing-note detection

**Decision**: All shift-time math happens in **America/New_York**. Use `date-fns-tz` (small) to convert between UTC storage and local shift arithmetic. Stored timestamps remain ISO-8601 UTC; computed boundaries (shift_end + grace_window) are done in ET and compared against UTC DB values after conversion.

**Rationale**:
- LGA is Georgia-based. All schedule semantics ("day shift" = 07:00–15:00 local) are ET.
- Storing UTC is still the right default for SQLite TEXT timestamps; the ET conversion happens at flag-computation time, never at insert time.
- DST transitions (March and November) are handled by date-fns-tz automatically.

**Alternatives considered**:
- Luxon: Works but larger. date-fns-tz is enough for our narrow needs.
- Hand-rolled offset math: Rejected — DST is a footgun.

---

## R12. Retry cap for classifier failures

**Decision**: Max 3 attempts per note. After attempt 3 fails, mark `t_logs.classifier_error = <code>` with `classifier_attempt_count = 3` and emit an `ops_notice(category='classifier_permanent_failure', ...)`. A dedicated "Ops" admin page (`/admin/ops`) lists permanent failures so Adrian can see coverage gaps without digging through logs.

**Rationale**:
- 3 attempts covers transient 429s and short outages without runaway billing.
- Surfacing failures in-app beats relying on log-reading for operational visibility — matches the "frictionless" posture Alonzo asked for.
- Operational notices are append-only (Principle VI-adjacent: audit records are append-only).

---

## R13. Staffing-roster-lite for prototype angel attribution

**Decision**: In prototype, "angel on duty at location L during shift S" is derived as: `SELECT id FROM angels WHERE location_id = L AND role IN ('DSP','Nurse')`. If exactly one row matches, attribute the missing-note flag to that angel; otherwise leave `flags.angel_on_duty_id = NULL` and show "angel: unattributed" on the dashboard. A `TODO(post-prototype)` comment in `src/flagging/missing.ts` and a README note point to the real shift-assignment table that production needs.

**Rationale**:
- The fixture has multiple DSPs per location, so this simplification attributes nobody for most locations — *which is the honest answer for v1*. It doesn't pretend to attribution it doesn't have.
- Production will replace the lookup with a `shift_assignment(location_id, shift_name, date, angel_id)` join once real scheduling data arrives. Swap point is a single function.
- Keeping the known blind spot on the README prevents Alonzo from reading "top-flagged angels" rankings as ground truth for missing-note attribution during the demo.

---

## R14. SFTP scaffolding

**Decision**: `src/ingestion/sftp-poller.ts` exports a `pollSftp()` function that, in prototype mode or when env vars are missing, logs `sftp: skipped (prototype mode)` and returns immediately. Production mode requires `THERAP_SFTP_HOST`, `THERAP_SFTP_USER`, `THERAP_SFTP_PRIVATE_KEY_PATH` and uses `ssh2-sftp-client` to pull `/outbound/*.csv`, move each file to `/processed/` after successful ingest, and retry on transient failures. A `TODO(post-BAA)` block flags the file path conventions that need confirmation with Therap GA support.

**Rationale**:
- Principle III: prototype boots with zero external deps except OpenRouter. SFTP skipped cleanly when creds are missing.
- ssh2-sftp-client is the canonical Node client for SFTP; widely used, well-tested.
- File-move-after-ingest is the standard idempotency pattern for SFTP-based feeds; ensures re-running never re-ingests old rows.

---

## Consolidated Decisions Summary

| # | Decision | Rationale keyword |
|---|----------|-------------------|
| R1 | OpenRouter Lightweight, pinned via env var | Constitution P1 |
| R2 | Token-set Jaccard, threshold in rule_config | Cheap, explainable, Q2/C |
| R3 | better-sqlite3 synchronous | Single-process Hono |
| R4 | Better Auth + `hd` claim verified server-side | Principle I, not the `hd` param alone |
| R5 | SheetJS `xlsx`, column-name mapping, 10 MB cap | Stable, resilient |
| R6 | htmx fragment swaps with `hx-push-url` | Principle IX |
| R7 | Tailwind Play CDN (prototype), TODO(post-prototype) for build | P9 allowance |
| R8 | Railway cron, UTC-declared, ET-adjusted internally | Principle I |
| R9 | p-limit concurrency = 5 in prototype and prod | SC-003 SLA |
| R10 | pino with allowlist serializer | Principle II |
| R11 | date-fns-tz, ET for all shift math | DST-safe |
| R12 | Retry cap 3 per note, surface on `/admin/ops` | Audit visibility |
| R13 | Staffing-roster-lite, TODO(post-prototype) | Honest attribution |
| R14 | SFTP scaffolded, skip in prototype | Principle III |

All decisions are compatible with constitution v1.0.1. No open research items.
