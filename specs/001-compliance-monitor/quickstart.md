# Quickstart — Guardian Angel Compliance Monitor

**Feature**: 001-compliance-monitor | **Date**: 2026-04-21

This is the "zero-to-demo" path. Follow it top-to-bottom and you reach the hero narrative Alonzo will walk through.

---

## Prerequisites

- **Node.js 20+** (constitution P1 binding minimum).
- **An OpenRouter API key**. The only external dependency the prototype needs.
- **macOS / Linux / WSL2**. Native Windows works but `better-sqlite3` binary resolution is easier on POSIX.

No Therap credentials, no Google Workspace admin access, no email-provider key needed for the demo.

---

## First run (local)

```bash
# 1. Clone + install
git clone <repo-url> guardian-angel-compliance-monitor
cd guardian-angel-compliance-monitor
npm install

# 2. Copy the env template and fill in the one thing you need
cp .env.example .env
# Open .env and set OPENROUTER_API_KEY=sk-or-...

# 3. Seed the database with synthetic fixtures
npm run seed

# 4. Start the server
npm run dev
```

Then open `http://localhost:3000` and sign in with:

```
email:    demo@lowesguardianangel.com
password: demo
```

(The password is set by `DEMO_LOGIN_PASSWORD` in `.env.example`; change it if you like.)

---

## What seeding does

`npm run seed` is idempotent and reads from `fixtures/`:

- `fixtures/lga_org_structure.csv` → `locations`, `angels`, `individuals` rows. Managers are derived from the TLOG CSV's `MANAGER_ID` + `MANAGER_NAME` columns (the org CSV doesn't have manager rows — known fixture shape).
- `fixtures/lga_synthetic_tlogs.csv` → `t_logs` rows (648, dates 2026-03-15 through 2026-04-14). Every TLOG is inserted with `version=1, is_current=1`.
- Seeded default rules (from `src/rules/default-rules.ts`) are inserted into `rule_config`.
- Seeded default shift schedules are inserted into `shift_schedule` per the per-location pattern (Day/Swing/Overnight for group homes, Day-only for host home, Day-only weekdays for day program).
- The full flagging pipeline runs: missing → notification_level → similarity pre-pass → AI classifier. At concurrency = 5 against ~650 notes this completes in under a minute.

Re-running `npm run seed` is a no-op if the DB is already populated. To reseed from scratch: delete the SQLite file (`/data/gam.db` in Railway; `./dev.db` locally per `.env.example`) and run `npm run seed` again.

---

## The hero demo narrative

Once seeded:

1. **Open the dashboard at `/`.** Period defaults to last 7 days → switch to "Last 30 days" to see the full fixture window. Riverside Group Home shows yellow (a mix of high-severity notes and AI-flagged copy-paste content). Sunrise Day Program shows red (the Friday missing-note pattern plus some incidents).
2. **Drill into Riverside** (click the location row or cell). The per-angel view surfaces **Jamal Roberts (ANG007)** with the highest AI-classifier flag count — his copy-paste cluster is the driver.
3. **Click Jamal** → see the individuals he wrote notes for (Sarah K., David P., Brittany L.). Sarah K. shows the biggest cluster.
4. **Click a specific flagged note** (e.g., `TLOG000016` — the "Same as yesterday." note). The note page shows:
   - full original text (`description`),
   - structured fields,
   - two flags: one deterministic (notification_level = Low means no det flag — so actually only an AI flag here), one AI (`source='ai_classifier'`) with reasoning like "near-identical content to 8 previous notes from this angel" and the pinned `model_name`, `model_version`, `prompt_version`.
5. **Go to `/rules` (rules config)**. Open the `copy_paste` rule. See: prompt template, similarity threshold (default 0.7), window size (default 20).
6. **Edit the rule**: change the threshold from 0.7 to 0.6 (more aggressive). Save. A "saved, v2 active" confirmation appears with a "Re-run on last 7 days" button.
7. **Click "Re-run".** An htmx SSE stream shows progress; in under 10 seconds the dashboard repaints with updated flag counts. Jamal's cluster grows — the lower threshold catches borderline near-dupes.
8. **Navigate back to the dashboard** → **open Sunrise Day Program**. Filter to `source = missing_schedule`. The Friday pattern is visible:
   - 2026-03-27: IND012 (Chris A.) missing
   - 2026-04-03: IND008 (James O.) missing
   - 2026-04-10: IND011 (Nicole F.) missing
9. **Click `/digest/preview`.** Two envelopes render:
   - To: `alonzo@lowesguardianangel.com` — scope: all locations
   - To: `vivian@lowesguardianangel.com` — scope: Peachtree only (plus one for each of the other three location managers)

   Each envelope shows the Monday-morning digest exactly as it would be sent: compliance score per location, top-flagged angels and locations, WoW change, deep links into the dashboard. **No note text in any body.** The banner at top reads "Preview only — no emails will be sent."

That's the full demo. If it works end-to-end, the prototype meets SC-004.

---

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | `tsx --watch src/server.ts` — dev server with reload |
| `npm run build` | `tsc --project tsconfig.json` → emits `dist/` |
| `npm start` | `node dist/server.js` — production boot (what Railway runs) |
| `npm run seed` | `tsx src/jobs/seed.ts` — reads fixtures, populates DB, runs full flagging pipeline |
| `npm test` | `node --test --import tsx tests/**/*.test.ts` |
| `npm run job:digest` | `tsx src/jobs/weekly-digest.ts` — runs digest generation on demand |
| `npm run job:retry` | `tsx src/jobs/classifier-retry.ts` — manually retry classifier-failed notes |

---

## Environment variables

All variables listed in `.env.example`. The only one required for the prototype:

| Var | Required when | Default / notes |
|-----|---------------|-----------------|
| `OPENROUTER_API_KEY` | Always | No default — app refuses to boot without this |
| `OPENROUTER_MODEL` | Always | Defaults to `google/gemini-flash-lite-2.0`; override to swap |
| `DATABASE_PATH` | Always | `./dev.db` locally, `/data/gam.db` on Railway |
| `BETTER_AUTH_SECRET` | Always | Auto-generated on first `npm run seed` if absent; persisted to `.env` |
| `APP_URL` | Always | `http://localhost:3000` locally, set to the Railway URL in prod |
| `PROTOTYPE_MODE` | Always | Defaults to `true`. Set to `false` only in production deploys. |
| `DEMO_LOGIN_PASSWORD` | Prototype | Defaults to `demo` |
| `THERAP_SFTP_HOST`, `THERAP_SFTP_USER`, `THERAP_SFTP_PRIVATE_KEY_PATH` | Production only | Scaffolded, not wired. Empty when `PROTOTYPE_MODE=true`. |
| `EMAIL_API_KEY` | Production only | For Resend |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Production only | Enables the Google SSO button |

---

## Deploy to Railway

1. Push the repo to GitHub.
2. Create a new Railway project, link the GitHub repo.
3. Add a persistent **Volume** mounted at `/data`.
4. Set environment variables (at minimum `OPENROUTER_API_KEY`, `APP_URL` with the Railway-generated hostname, `BETTER_AUTH_SECRET`).
5. Let Railway build — the `start` command is `npm start`; `build` runs `npm run build`.
6. After first boot, visit `/healthz` and `/readyz` to confirm. Run `npm run seed` via Railway's one-off-command shell to populate fixtures.
7. Cron entries declared in `railway.json` auto-register with Railway.

**Switching to production mode**: set `PROTOTYPE_MODE=false`, fill in the production env vars (Therap SFTP, Google SSO, Resend), and restart. Fixtures stay in place but subsequent SFTP pulls will start appending.

---

## Known prototype caveats (honest expectation-setting)

1. **Tailwind runs via the Play CDN.** FOUC for ~200 ms on first paint of a session. Production hardening switches to a build-time Tailwind purge (`TODO(post-prototype)` noted in `.env.example`).
2. **Missing-note angel attribution is best-effort.** When a location has multiple DSPs, the attributing code can't uniquely identify who was on duty, and the flag shows "angel: unattributed". This will be fixed when real shift-assignment data is available. Noted in README and in `src/flagging/missing.ts`.
3. **SFTP ingestion is scaffolded, not wired.** Therap's Trading Partner Agreement (NDA + BAA) is the gating step. See `TODO(post-BAA)` markers in `src/ingestion/sftp-poller.ts`.
4. **No E2E browser tests.** Demo is eyeballed. If the hero narrative regresses, a manual walk-through is the check.
5. **AI classifications on seeded data will produce small variance.** OpenRouter Lightweight models are deterministic at temperature 0 but occasionally return different severities on borderline notes between model versions; the reason text also varies slightly. Flag counts are consistent, individual reasoning strings are not byte-identical across runs.

---

## What this app is explicitly NOT

Repeating from the PRD / constitution Principle VIII so no one gets confused in demo Q&A:

- Not an email/calendar manager for Alonzo (that was Erin's phase-2 idea).
- Not an HR / BambooHR compliance tool.
- Not a phone-dictation system for angels.
- Not a write-back integration with Therap.
- Not predictive analytics.
- Not a real-time per-event alerting system.

Adding any of those requires a new feature spec.
