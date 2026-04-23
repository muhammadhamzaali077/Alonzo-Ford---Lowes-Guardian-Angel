-- Guardian Angel Compliance Monitor — schema v1.
-- Source of truth: specs/001-compliance-monitor/data-model.md.
--
-- Conventions:
--   * All timestamps stored as ISO-8601 UTC text. ET conversion happens at flag-compute time only.
--   * Therap IDs (LOC*, ANG*, IND*, MGR*, TLOG*) preserved verbatim as TEXT.
--   * Booleans are INTEGER NOT NULL CHECK(col IN (0,1)).
--   * Soft-deletes use `deleted_at TEXT` on entities that carry references (locations, angels, individuals, managers).
--
-- Note on vocabulary: "angels" is LGA's term for caregivers (DSP / Nurse / Manager). Kept as a
-- separate entity from `managers` because Therap's fixture uses disjoint ID spaces (ANG* vs MGR*).
-- Decision documented in data-model.md §managers.

-- -------------------------------------------------------------------------------------------------
-- Core org
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS managers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('group_home','host_home','day_program')),
  manager_id  TEXT REFERENCES managers(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS angels (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK(role IN ('DSP','Nurse','Manager')),
  location_id  TEXT REFERENCES locations(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_angels_location ON angels(location_id);

CREATE TABLE IF NOT EXISTS individuals (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  location_id  TEXT REFERENCES locations(id),
  dob          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_individuals_location ON individuals(location_id);

CREATE TABLE IF NOT EXISTS shift_schedule (
  id             INTEGER PRIMARY KEY,
  individual_id  TEXT NOT NULL REFERENCES individuals(id),
  shift_name     TEXT NOT NULL CHECK(shift_name IN ('Day','Swing','Overnight')),
  start_time     TEXT NOT NULL,  -- 'HH:MM' in America/New_York
  end_time       TEXT NOT NULL,  -- 'HH:MM' in America/New_York; may cross midnight
  days_of_week   TEXT NOT NULL,  -- csv like 'mon,tue,wed,thu,fri,sat,sun'
  active_from    TEXT NOT NULL DEFAULT (date('now')),
  active_to      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_individual ON shift_schedule(individual_id);

-- -------------------------------------------------------------------------------------------------
-- T-Logs (the workhorse) — composite PK + is_current + unique partial index
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS t_logs (
  tlog_id                    TEXT NOT NULL,
  version                    INTEGER NOT NULL DEFAULT 1,
  is_current                 INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
  individual_id              TEXT NOT NULL REFERENCES individuals(id),
  program_id                 TEXT NOT NULL REFERENCES locations(id),
  created_by_id              TEXT REFERENCES angels(id),
  manager_id                 TEXT REFERENCES managers(id),
  reported_date              TEXT NOT NULL,
  reported_time              TEXT,
  time_in                    TEXT NOT NULL,
  time_out                   TEXT NOT NULL,
  shift_name                 TEXT NOT NULL CHECK(shift_name IN ('Day','Swing','Overnight')),
  notification_level         TEXT NOT NULL CHECK(notification_level IN ('Low','Medium','High')),
  type                       TEXT NOT NULL,
  summary                    TEXT,
  description                TEXT NOT NULL,           -- PHI, never logged
  status                     TEXT NOT NULL DEFAULT 'Submitted',
  acknowledged               INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)),
  similarity_score           REAL,
  similar_match_tlog_ids     TEXT,                    -- JSON array, up to 3
  classifier_status          TEXT CHECK(classifier_status IN ('pending','ok','retry','permanent_failure')),
  classifier_error_code      TEXT,
  classifier_attempt_count   INTEGER NOT NULL DEFAULT 0,
  classifier_last_attempt_at TEXT,
  ingested_at                TEXT NOT NULL DEFAULT (datetime('now')),
  superseded_at              TEXT,
  PRIMARY KEY (tlog_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tlogs_current
  ON t_logs(tlog_id) WHERE is_current = 1;

CREATE INDEX IF NOT EXISTS idx_tlogs_individual_date
  ON t_logs(individual_id, reported_date) WHERE is_current = 1;

CREATE INDEX IF NOT EXISTS idx_tlogs_author
  ON t_logs(created_by_id) WHERE is_current = 1;

CREATE INDEX IF NOT EXISTS idx_tlogs_program_date
  ON t_logs(program_id, reported_date) WHERE is_current = 1;

CREATE INDEX IF NOT EXISTS idx_tlogs_classifier_retry
  ON t_logs(classifier_status) WHERE classifier_status = 'retry';

-- -------------------------------------------------------------------------------------------------
-- Rules (versioned, editable)
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rule_config (
  id                INTEGER PRIMARY KEY,
  rule_key          TEXT NOT NULL,
  version           INTEGER NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  prompt_template   TEXT NOT NULL,
  config_json       TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT,  -- references users(id) when auth lands; nullable for seed rows
  UNIQUE (rule_key, version)
);
CREATE INDEX IF NOT EXISTS idx_rule_active ON rule_config(rule_key) WHERE is_active = 1;

-- -------------------------------------------------------------------------------------------------
-- Flags (source enum locked by constitution v1.0.1; display_category drives UI labels)
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS flags (
  id                     INTEGER PRIMARY KEY,
  tlog_id                TEXT,
  tlog_version           INTEGER,
  individual_id          TEXT NOT NULL REFERENCES individuals(id),
  location_id            TEXT NOT NULL REFERENCES locations(id),
  manager_id             TEXT REFERENCES managers(id),
  angel_id               TEXT REFERENCES angels(id),
  scheduled_shift_date   TEXT,
  scheduled_shift_name   TEXT,
  severity               TEXT NOT NULL CHECK(severity IN ('yellow','red')),
  source                 TEXT NOT NULL CHECK(source IN (
                            'notification_level',
                            'missing_schedule',
                            'ai_classifier'
                         )),
  display_category       TEXT NOT NULL CHECK(display_category IN (
                            'missing_note',
                            'high_priority',
                            'medium_priority',
                            'pattern_detected',
                            'system_review'
                         )),
  rule_id                INTEGER REFERENCES rule_config(id),
  rule_version           INTEGER,
  reason                 TEXT NOT NULL,
  model_name             TEXT,
  model_version          TEXT,
  prompt_version         INTEGER,
  resolution             TEXT NOT NULL DEFAULT 'open'
                         CHECK(resolution IN ('open','superseded_by_rerun','resolved_by_late_submission')),
  resolved_at            TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tlog_id, tlog_version) REFERENCES t_logs(tlog_id, version)
);
CREATE INDEX IF NOT EXISTS idx_flags_severity_created ON flags(severity, created_at);
CREATE INDEX IF NOT EXISTS idx_flags_tlog             ON flags(tlog_id, tlog_version);
CREATE INDEX IF NOT EXISTS idx_flags_individual       ON flags(individual_id);
CREATE INDEX IF NOT EXISTS idx_flags_location         ON flags(location_id);
CREATE INDEX IF NOT EXISTS idx_flags_angel            ON flags(angel_id);
CREATE INDEX IF NOT EXISTS idx_flags_open_source      ON flags(source) WHERE resolution = 'open';

-- -------------------------------------------------------------------------------------------------
-- Auth + scoping (Better Auth manages its own account/session/verification tables at Phase 11)
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  name               TEXT,
  role               TEXT NOT NULL CHECK(role IN ('admin','leadership','manager','demo')),
  scope_location_id  TEXT REFERENCES locations(id),  -- legacy single-scope; authoritative is user_location_scope
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_location_scope (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id  TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, location_id)
);

-- Session table. Phase 11 ships with the prototype's simple random-id session
-- scheme; the long-run plan per research R4 is to swap to Better Auth's
-- session management, keeping this same column shape.
CREATE TABLE IF NOT EXISTS user_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- -------------------------------------------------------------------------------------------------
-- Digest recipients + ops tables
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS digest_recipients (
  id           INTEGER PRIMARY KEY,
  user_id      TEXT REFERENCES users(id),
  email        TEXT NOT NULL,
  scope        TEXT NOT NULL,              -- 'all' or a location_id
  cadence      TEXT NOT NULL DEFAULT 'weekly' CHECK(cadence IN ('weekly')),
  day_of_week  INTEGER NOT NULL DEFAULT 1 CHECK(day_of_week BETWEEN 0 AND 6),
  hour_et      INTEGER NOT NULL DEFAULT 8 CHECK(hour_et BETWEEN 0 AND 23),
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_digest_recipients_active
  ON digest_recipients(is_active, day_of_week, hour_et);

CREATE TABLE IF NOT EXISTS classifier_usage (
  date                TEXT PRIMARY KEY,          -- 'YYYY-MM-DD' UTC
  total_calls         INTEGER NOT NULL DEFAULT 0,
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_errors        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ops_notices (
  id           INTEGER PRIMARY KEY,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  category     TEXT NOT NULL CHECK(category IN (
                  'digest_suppressed',
                  'classifier_permanent_failure',
                  'ingestion_gap',
                  'sftp_failure',
                  'upload_partial'
               )),
  message      TEXT NOT NULL,
  context_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_ops_notices_category_time
  ON ops_notices(category, created_at DESC);

-- -------------------------------------------------------------------------------------------------
-- flag_feedback (T124) — user-submitted thumbs-up/down on flags during demos
-- or review passes. One row per (flag, user); a user toggling their verdict
-- updates in place via UPSERT. Server-side only per Principle X (no client
-- storage). Accepts feedback on any flag source (not just ai_classifier) so
-- managers can flag "missing-note detection is wrong here" too.
-- -------------------------------------------------------------------------------------------------

-- -------------------------------------------------------------------------------------------------
-- app_settings (T123) — tiny key/value store for UI-scope settings that need
-- to survive process restarts. Currently used for `current_scenario`; future
-- uses (demo mode toggles, feature flags) should live here too.
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flag_feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_id     INTEGER NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict     TEXT    NOT NULL CHECK (verdict IN ('up','down')),
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(flag_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_flag_feedback_flag ON flag_feedback(flag_id);

-- -------------------------------------------------------------------------------------------------
-- Schema bookkeeping
-- -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_versions (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
