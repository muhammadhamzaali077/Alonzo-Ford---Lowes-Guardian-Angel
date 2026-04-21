# Data Model: Guardian Angel Compliance Monitor

**Feature**: 001-compliance-monitor
**Date**: 2026-04-21
**Source**: `spec.md` Key Entities + FR-001…FR-029 + `research.md` decisions.

This is the authoritative SQLite schema. Expressed as DDL because the stack uses raw SQL (no ORM). The DDL is also what `src/db/schema.sql` will contain verbatim.

## Conventions

- All timestamps are **ISO-8601 text in UTC** (SQLite `TEXT`). ET conversion happens at flag-computation time only.
- All IDs coming from Therap (`TLOG_ID`, `IND*`, `ANG*`, `LOC*`, `MGR*`) are preserved as `TEXT` primary/foreign keys — no renumbering.
- Local surrogate IDs (`flags.id`, `rule_config.id`) are `INTEGER PRIMARY KEY`.
- `REFERENCES` declarations are advisory on SQLite unless `PRAGMA foreign_keys=ON`, which we enable at connection init.
- Boolean fields are `INTEGER NOT NULL` with a `CHECK(col IN (0,1))` guard.
- No column stores `description` text outside `t_logs`. Principle II.

---

## Core tables

### `locations`

```sql
CREATE TABLE locations (
  id           TEXT PRIMARY KEY,                 -- e.g., LOC001
  name         TEXT NOT NULL,                    -- "Peachtree Group Home"
  type         TEXT NOT NULL CHECK(type IN ('group_home','host_home','day_program')),
  manager_id   TEXT REFERENCES managers(id),     -- nullable during admin setup
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `angels`

```sql
CREATE TABLE angels (
  id           TEXT PRIMARY KEY,                 -- e.g., ANG007
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK(role IN ('DSP','Nurse','Manager')),
  location_id  TEXT REFERENCES locations(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_angels_location ON angels(location_id);
```

### `individuals`

```sql
CREATE TABLE individuals (
  id           TEXT PRIMARY KEY,                 -- e.g., IND001
  name         TEXT NOT NULL,                    -- "John D." (already anonymized in fixture)
  location_id  TEXT REFERENCES locations(id),
  dob          TEXT,                             -- optional; PHI-sensitive, not logged
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_individuals_location ON individuals(location_id);
```

### `managers`

```sql
CREATE TABLE managers (
  id           TEXT PRIMARY KEY,                 -- e.g., MGR002
  name         TEXT NOT NULL,                    -- "Marcus Thompson"
  email        TEXT,                             -- used for digest routing
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> **Fixture gap note**: `fixtures/lga_org_structure.csv` does not have `record_type=manager` rows. The CSV-loader derives manager rows from `fixtures/lga_synthetic_tlogs.csv`'s `MANAGER_ID`/`MANAGER_NAME` columns on first seed (distinct set). `src/ingestion/csv-loader.ts` owns this derivation and is idempotent.

### `shift_schedule`

Per-individual expected shift patterns. A row declares: for individual X, a named shift exists on the listed days-of-week, starting and ending at the given local times. Missing-note detection uses this table as the "expected" set.

```sql
CREATE TABLE shift_schedule (
  id             INTEGER PRIMARY KEY,
  individual_id  TEXT NOT NULL REFERENCES individuals(id),
  shift_name     TEXT NOT NULL CHECK(shift_name IN ('Day','Swing','Overnight')),
  start_time     TEXT NOT NULL,                   -- 'HH:MM' in America/New_York
  end_time       TEXT NOT NULL,                   -- 'HH:MM' in America/New_York; may cross midnight
  days_of_week   TEXT NOT NULL,                   -- csv like 'mon,tue,wed,thu,fri,sat,sun'
  active_from    TEXT NOT NULL DEFAULT (date('now')),
  active_to      TEXT,                            -- null = still active
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_shift_schedule_individual ON shift_schedule(individual_id);
```

Seed defaults (written by `src/rules/default-rules.ts`-adjacent seeder):
- Group-home individuals (LOC001, LOC002): three rows each — Day 07:00–15:00 mon–sun; Swing 15:00–23:00 mon–sun; Overnight 23:00–07:00 mon–sun.
- Host-home individual (LOC003): one row — Day 08:00–20:00 mon–sun.
- Day-program individuals (LOC004): one row each — Day 09:00–15:00 **mon,tue,wed,thu,fri** only.

---

## T-Logs (the workhorse)

### `t_logs`

Composite PK + `is_current` flag implements the spec's "retain both versions, mark newer current" rule (FR-002, Principle VI).

```sql
CREATE TABLE t_logs (
  tlog_id                 TEXT NOT NULL,             -- Therap's source id, e.g., TLOG000001
  version                 INTEGER NOT NULL DEFAULT 1,-- monotonic per tlog_id; increments on supersession
  is_current              INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  individual_id           TEXT NOT NULL REFERENCES individuals(id),
  program_id              TEXT NOT NULL REFERENCES locations(id),
  created_by_id           TEXT REFERENCES angels(id), -- author; null if unrecognized at ingest
  manager_id              TEXT REFERENCES managers(id),
  reported_date           TEXT NOT NULL,             -- ISO-8601 date (source column)
  reported_time           TEXT,                      -- HH:MM:SS
  time_in                 TEXT NOT NULL,             -- ISO-8601 timestamp
  time_out                TEXT NOT NULL,             -- ISO-8601 timestamp
  shift_name              TEXT NOT NULL CHECK(shift_name IN ('Day','Swing','Overnight')),
  notification_level      TEXT NOT NULL CHECK(notification_level IN ('Low','Medium','High')),
  type                    TEXT NOT NULL,             -- 'Notes','Behavior','Health','Contacts',...
  summary                 TEXT,
  description             TEXT NOT NULL,             -- the note body; PHI; never logged
  status                  TEXT NOT NULL DEFAULT 'Submitted',
  acknowledged            INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)),

  -- Similarity pre-pass results (R2 / FR-008)
  similarity_score        REAL,                      -- 0..1, Jaccard against author's last N notes
  similar_match_tlog_ids  TEXT,                      -- JSON array of top matches, up to 3

  -- Classifier bookkeeping (R12 / FR-010)
  classifier_status       TEXT CHECK(classifier_status IN ('pending','ok','retry','permanent_failure')),
  classifier_error_code   TEXT,                       -- null unless classifier_status in ('retry','permanent_failure')
  classifier_attempt_count INTEGER NOT NULL DEFAULT 0,
  classifier_last_attempt_at TEXT,

  ingested_at             TEXT NOT NULL DEFAULT (datetime('now')),
  superseded_at           TEXT,                       -- non-null when is_current flipped to 0

  PRIMARY KEY (tlog_id, version)
);

-- "One current version per tlog_id" as a DB-enforced invariant (user-requested):
CREATE UNIQUE INDEX idx_tlogs_current ON t_logs(tlog_id) WHERE is_current = 1;

-- Query indexes
CREATE INDEX idx_tlogs_individual_date ON t_logs(individual_id, reported_date) WHERE is_current = 1;
CREATE INDEX idx_tlogs_author          ON t_logs(created_by_id) WHERE is_current = 1;
CREATE INDEX idx_tlogs_program_date    ON t_logs(program_id, reported_date) WHERE is_current = 1;
CREATE INDEX idx_tlogs_classifier_retry ON t_logs(classifier_status) WHERE classifier_status = 'retry';
```

**Immutability invariant**: Application code never UPDATEs an existing `(tlog_id, version)` row (excepting `is_current`, `superseded_at`, `classifier_*` fields, which are audit/bookkeeping and don't alter the note). A code-review rule and a unit test over the repository grep for `UPDATE t_logs SET description` — should always be zero matches.

**Supersession flow**: when an ingest sees `TLOG000001` already in the table:
1. Start transaction.
2. `UPDATE t_logs SET is_current = 0, superseded_at = datetime('now') WHERE tlog_id = 'TLOG000001' AND is_current = 1`.
3. `INSERT INTO t_logs (tlog_id, version, is_current, ...) VALUES ('TLOG000001', max_version+1, 1, ...)`.
4. Re-compute similarity + flags for the new version.
5. Commit.

---

## Flags

### `flags`

```sql
CREATE TABLE flags (
  id                     INTEGER PRIMARY KEY,
  tlog_id                TEXT,                      -- null for missing-note flags
  tlog_version           INTEGER,                   -- null for missing-note flags; pinned to the version that flagged
  individual_id          TEXT NOT NULL REFERENCES individuals(id),
  location_id            TEXT NOT NULL REFERENCES locations(id),
  manager_id             TEXT REFERENCES managers(id),
  angel_id               TEXT REFERENCES angels(id),          -- attributed angel (null if unattributed per Q1/A)
  scheduled_shift_date   TEXT,                      -- for missing-note flags; null otherwise
  scheduled_shift_name   TEXT,                      -- for missing-note flags; null otherwise

  severity               TEXT NOT NULL CHECK(severity IN ('yellow','red')),
  source                 TEXT NOT NULL CHECK(source IN (
                            'notification_level',
                            'missing_schedule',
                            'ai_classifier'
                         )),                         -- enum locked by constitution v1.0.1 P5
  rule_id                INTEGER REFERENCES rule_config(id),
  rule_version           INTEGER,                    -- pins the rule_config.version that produced this flag
  reason                 TEXT NOT NULL,              -- for deterministic: rule name; for ai: model's reasoning (PHI, never logged)
  model_name             TEXT,                       -- null unless source = 'ai_classifier'
  model_version          TEXT,
  prompt_version         INTEGER,                    -- = rule_version for AI flags
  resolution             TEXT CHECK(resolution IN ('open','superseded_by_rerun','resolved_by_late_submission')) NOT NULL DEFAULT 'open',
  resolved_at            TEXT,

  created_at             TEXT NOT NULL DEFAULT (datetime('now')),

  -- Foreign-key-style integrity: if tlog_id is set, (tlog_id, tlog_version) must reference a real row.
  FOREIGN KEY (tlog_id, tlog_version) REFERENCES t_logs(tlog_id, version)
);

CREATE INDEX idx_flags_severity_created ON flags(severity, created_at);
CREATE INDEX idx_flags_tlog             ON flags(tlog_id, tlog_version);
CREATE INDEX idx_flags_individual       ON flags(individual_id);
CREATE INDEX idx_flags_location         ON flags(location_id);
CREATE INDEX idx_flags_angel            ON flags(angel_id);
CREATE INDEX idx_flags_open_source      ON flags(source) WHERE resolution = 'open';
```

**Attribution rules**:
- `manager_id`: always populated — the location's manager at the time of the flag (from `locations.manager_id`; historical attribution in production will need a `location_manager_history` table, TODO post-prototype).
- `angel_id`: best-effort per Q1/A — for content flags, it's the note's `created_by_id`. For missing-note flags, derived per R13 (single DSP at location; else NULL).
- `severity` is **always** yellow or red — green is represented by absence of a flag (Principle V cheapness of the deterministic path).

**Re-run mechanics**: a rule-config re-run does NOT delete old flags. It updates their `resolution` to `superseded_by_rerun` and `resolved_at = now()`, then inserts new flags for the re-evaluated notes. Old flags remain queryable for audit (Principle VI).

---

## Rules configuration

### `rule_config`

```sql
CREATE TABLE rule_config (
  id                INTEGER PRIMARY KEY,
  rule_key          TEXT NOT NULL,               -- e.g., 'copy_paste','short_note','medication_refusal'
  version           INTEGER NOT NULL,            -- monotonic per rule_key
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  name              TEXT NOT NULL,               -- human label shown in UI
  description       TEXT NOT NULL,               -- longer description
  prompt_template   TEXT NOT NULL,               -- the text the classifier uses
  config_json       TEXT NOT NULL DEFAULT '{}',  -- per-rule knobs (e.g., similarity_threshold, min_words)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT REFERENCES users(id),   -- null for seed rows

  UNIQUE (rule_key, version)
);

CREATE INDEX idx_rule_active ON rule_config(rule_key) WHERE is_active = 1;
```

Editing a rule:
1. Read the current `is_active=1` row for `rule_key`.
2. Start transaction.
3. Set that row's `is_active = 0`.
4. Insert a new row with `version = prev.version + 1`, `is_active = 1`, new content, `created_by = user.id`.
5. Commit.
6. Trigger re-run for the selected date window (resolves old flags + inserts new ones per the re-run mechanics above).

**Seeded rules** (defined in `src/rules/default-rules.ts` — PR-reviewable, per user's opinion):
- `copy_paste` — uses `similarity_score` as context; `config_json.threshold = 0.7`, `config_json.window = 20`.
- `short_note` — `config_json.min_words = 20` for residential shifts, 15 for day-program.
- `medication_refusal` — keyword+AI.
- `vague_content` — AI rule targeting filler phrases like "same as yesterday".
- `incident_language` — flags notes containing incident keywords that don't carry `notification_level = High` (classifier catches mislabeled severity).

---

## Auth + scoping

### `users`

Better Auth-managed. We add a few columns for role scoping.

```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,              -- Better Auth uses UUID strings
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  role            TEXT NOT NULL CHECK(role IN ('leadership','manager','admin','demo')),
  -- "legacy single-scope" kept for backward compat of old session tokens during migration;
  -- authoritative scope is in user_location_scope below.
  scope_location_id TEXT REFERENCES locations(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `user_location_scope`

New per user request — supports Anthony King's multi-location oversight pattern from the transcript.

```sql
CREATE TABLE user_location_scope (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id  TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, location_id)
);
```

Scoping rules at request time:
- `role = 'leadership'` or `'admin'` → all-locations.
- `role = 'manager'` → `SELECT location_id FROM user_location_scope WHERE user_id = ?`. Zero rows = access denied (surface "no locations assigned; contact admin").
- `role = 'demo'` → all-locations for prototype convenience. Blocked by config in production.

Better Auth session cookie carries `user_id` only. Location scope is re-resolved per request from `user_location_scope` (not stashed in session) so admin reassignments take effect immediately (spec edge case).

### Better Auth's own tables

Better Auth v1.x creates `account`, `session`, `verification` tables on its own; we let the library own them. Our `users` table is what Better Auth calls the "user" table — configured via the library's schema options.

---

## Digest recipients

### `digest_recipients`

```sql
CREATE TABLE digest_recipients (
  id           INTEGER PRIMARY KEY,
  user_id      TEXT REFERENCES users(id),      -- null = recipient doesn't need app access (e.g., external CAO)
  email        TEXT NOT NULL,                  -- address mail is sent to
  scope        TEXT NOT NULL,                  -- 'all' or a specific location_id
  cadence      TEXT NOT NULL DEFAULT 'weekly' CHECK(cadence IN ('weekly')),
  day_of_week  INTEGER NOT NULL DEFAULT 1 CHECK(day_of_week BETWEEN 0 AND 6),  -- 1 = Monday
  hour_et      INTEGER NOT NULL DEFAULT 8 CHECK(hour_et BETWEEN 0 AND 23),
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_digest_recipients_active ON digest_recipients(is_active, day_of_week, hour_et);
```

Weekly digest job reads active rows, computes the recipient's window, renders per scope, and dispatches (or previews) via `sendDigest()`.

---

## Operations

### `classifier_usage`

```sql
CREATE TABLE classifier_usage (
  date                 TEXT PRIMARY KEY,           -- 'YYYY-MM-DD' UTC
  total_calls          INTEGER NOT NULL DEFAULT 0,
  total_input_tokens   INTEGER NOT NULL DEFAULT 0,
  total_output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_errors         INTEGER NOT NULL DEFAULT 0
);
```

Updated by the classifier on every call. **Never stores note text or reasoning.** Used by admin ops page to track cost drift.

### `ops_notices`

New per user request — replaces pure-log visibility with an in-app history.

```sql
CREATE TABLE ops_notices (
  id         INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  category   TEXT NOT NULL CHECK(category IN (
                'digest_suppressed',
                'classifier_permanent_failure',
                'ingestion_gap',
                'sftp_failure',
                'upload_partial'
             )),
  message    TEXT NOT NULL,                       -- human-readable; IDs only, no note text
  context_json TEXT                               -- JSON blob: tlog_id, location_id, count, etc. — no description field permitted
);

CREATE INDEX idx_ops_notices_category_time ON ops_notices(category, created_at DESC);
```

Surface: `/admin/ops` view shows the last 50 by `created_at DESC`. A JSON allowlist check in `src/admin/ops.ts` rejects any `context_json` that includes a disallowed key (`description`, `summary`, `reason`, `note_text`, `individual_name`) before insert.

---

## State transitions (key lifecycles)

### T-Log lifecycle

```text
[ingested, is_current=1, classifier_status='pending']
   │
   ▼ deterministic passes run (notification_level + missing impl. irrelevant for this log)
   ▼ similarity pre-pass writes similarity_score, similar_match_tlog_ids
   ▼ classifier invoked
   │
   ├─ ok → classifier_status='ok', optional flag(s) written
   ├─ 429/5xx → classifier_status='retry', classifier_error_code set, attempt_count++
   └─ attempt_count == 3 → classifier_status='permanent_failure', ops_notice written
          (retry cron re-tries until 3, then stops)
   │
   ▼ later, Therap sends same TLOG with new content
   ▼ old row: is_current=0, superseded_at=now
   ▼ new row: version++, is_current=1, classifier_status='pending', pipeline reruns
```

### Flag lifecycle

```text
open
  ├─ superseded_by_rerun    (rule edit / revert triggered re-run in this flag's window)
  └─ resolved_by_late_submission  (missing-note flag; a late T-Log arrived that covers the shift)
```

Only these transitions are permitted. A flag is **never** deleted.

### Rule lifecycle

```text
(inserted is_active=1, version=N)
   │
   ▼ edit
   (old: is_active=0, new row: version=N+1, is_active=1)
   │
   ▼ revert
   (current: is_active=0, reverted-to: is_active=1 copied to version=N+2)
```

Revert always creates a new version row — it never flips an old row's `is_active` back on. Preserves the audit trail.

---

## Entity-relationship summary

```text
managers 1──* locations 1──* individuals 1──* shift_schedule
    │          │                │
    │          │                │
    │          ▼                │
    │        angels ────────────┤
    │          │                ▼
    │          │              t_logs (composite PK tlog_id,version; is_current index)
    │          │                │
    └──────────┴────────────────┼──► flags ──► rule_config (via rule_id,rule_version)
                                │
                                └──► classifier_usage (by date, aggregate only)

users ──* user_location_scope *── locations
users 1──* digest_recipients
ops_notices (standalone, queried on admin ops page)
```

## Invariants under test

Expressed as one-line assertions that must always hold; each maps to a unit or integration test.

1. `SELECT COUNT(*) FROM t_logs WHERE is_current=1 GROUP BY tlog_id HAVING COUNT(*) > 1` — must be zero rows. (Enforced by the unique partial index; tested anyway.)
2. `SELECT COUNT(*) FROM flags WHERE severity NOT IN ('yellow','red')` — must be zero.
3. `SELECT COUNT(*) FROM flags WHERE source = 'ai_classifier' AND (model_name IS NULL OR prompt_version IS NULL OR reason IS NULL)` — must be zero. (Principle VI audit trail.)
4. `SELECT COUNT(*) FROM flags WHERE source = 'missing_schedule' AND tlog_id IS NOT NULL` — must be zero.
5. `SELECT COUNT(*) FROM t_logs WHERE is_current=1 AND classifier_attempt_count > 3` — must be zero. (Retry cap.)
6. Integration: load fixtures → run pipeline → Jamal Roberts (ANG007) has ≥ 12 `source='ai_classifier'` flags citing near-identical content. (Demo acceptance.)
7. Integration: load fixtures → run pipeline → `source='missing_schedule'` flags for Sunrise Day Program on 2026-03-27, 2026-04-03, 2026-04-10 exist with the expected individuals. (Demo acceptance.)
8. Code-grep: no module other than `src/lib/logger.ts` emits log lines containing `description`, `summary`, `reason`, `individual_name`, or `note_text`. Enforced by a unit test that scans `src/**/*.ts`.
