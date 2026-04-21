# Guardian Angel Compliance Monitor — PRD v1.0

**Client**: Alonzo Ford — Lowe's Guardian Angel | **Date**: 2026-04-16 | **Build Type**: New

---

## One-Line Summary

Eliminates the manual progress-note review chain by surfacing missing or out-of-tolerance Therap entries on a red/yellow/green compliance dashboard for Lowe's Guardian Angel's leadership team — so quality assurance stops being the bottleneck on growth.

---

## Build Spec

_Share this section with the customer for approval before starting the build._

- Pull daily progress notes from Therap automatically — no changes to how your angels document today
- Flag missing notes and out-of-tolerance content so compliance issues surface the day they happen, not at audit time
- Red/yellow/green dashboard with drill-down by location, manager, angel, individual, and shift
- Weekly summary emails to leadership and managers highlighting trends and items that need attention

---

## Company & Problem Context

_Researched from the customer's website and transcript._

**Company:** Lowe's Guardian Angel (LGA) is a CARF-accredited middle-market assisted-living and disability-services company based in Georgia, founded in 2005 and built on three generations of healthcare experience. They serve adults and children with disabilities, veterans, and seniors through host homes, group homes, day programs, and in-home care. They employ ~100 staff and contractors — referred to internally as "angels" — and serve slightly fewer than that number of individuals. CEO is Alonzo Q. Ford; Elaina Ford is VP/COO. Regulatory oversight comes from Georgia's Department of Behavioral Health and Developmental Disabilities (DBHDD).

**Problem:** Every day, LGA's angels (DSPs, nurses) are supposed to document each individual's care in Therap — the EMR system that DBHDD effectively requires every Georgia provider to use. Group-home managers are supposed to review those notes, and the VP of Operations is supposed to check behind the managers. In practice, this review chain is inconsistent, and there is no centralized visibility into what was filled out, what wasn't, and what raised a red flag. Alonzo can't see, on any given day, whether a note is missing or whether something concerning showed up in one. Today, problems surface during DBHDD audits or when a manager catches them by chance — too late. Alonzo described himself as a "growth CEO" who has had to *govern* growth specifically because compliance and quality assurance can't keep up. Removing this bottleneck is what unlocks scaling. The build replaces manual sampling with automatic ingestion, AI-graded red flags, and a dashboard the VP of Operations and managers can act on the same day.

---

## Developer Brief

_Quick context for the engineer._

- **Pull daily progress notes from Therap**: Angels log notes per individual in Therap (specifically the T-Log module — Therap's name for daily shift notes). Per Therap research, T-Log content is **not** available via Therap's public REST API (which only covers Demographics & Users). The realistic ingestion path is **Therap's External Data Feed (ExDF)** — SFTP CSV files refreshed multiple times per day. ExDF requires the customer to subscribe with Therap and Sagan to execute Therap's Trading Partner Agreement (NDA + BAA). Plan ~4–8 weeks of contracting before bytes flow. Until then, prototype against synthetic data; a manual Therap UI Excel export is a viable bridge if the customer wants production data sooner.
- **Flag missing notes and out-of-tolerance content**: Two distinct detection paths. (1) **Missing-note rules** — given a configured shift schedule per individual, detect gaps. (2) **Content red-flag classifier** — Lightweight-tier model classifies each note as green/yellow/red based on safety incidents, medication issues, behavioral events, vague/copy-paste patterns, or unresolved prior issues. T-Log records already include structured `notification level` (Low/Medium/High) and `type` fields — use these as deterministic pre-flags before any AI runs. The actual rule definitions ("what counts as out of tolerance for LGA") need to come from Alonzo's Chief Administrative Officer and VP of Operations — Alonzo flagged this as a kickoff input. Build the rules as editable configuration, not hardcoded prompts.
- **Red/yellow/green dashboard**: Replaces the invisible manual review chain. Top-level: status by location and by manager. Drill down: location → angel → individual → note. Filter by date range, shift, severity. Free-text search across note content. Trend view: WoW/MoM compliance score per location. Mobile-responsive — managers check from phones in the field. Last-refresh timestamp visible (since ExDF runs ~multi-times/day, not real-time).
- **Weekly email summaries**: Railway cron (per stack.md — never n8n for scheduling). Default weekly cadence; configurable recipients. Each email shows: notes submitted vs. expected, top flagged locations/angels, week-over-week change, deep links into the dashboard for any flagged item.

---

## Prototype

_The first deliverable. Feature-complete with synthetic data and demo mode — no Therap access, BAA, or customer data needed to build it. Alonzo plays with this and approves before any contracting starts._

**What the prototype delivers:**
- A working dashboard pre-loaded with ~30 days of synthetic data: 4 simulated locations (3 group homes + 1 day program), ~20 synthetic angels with manager assignments, ~12 synthetic individuals, and a realistic distribution of T-Logs (most green/routine, some short/vague yellow, some incident-flavored red, some missing-on-schedule).
- Full red/yellow/green status by location with drill-down: location → angel → individual → note. Filters: date range, severity, shift, manager. Search across note text.
- The AI red-flag classifier running live against synthetic notes, with each flagged note showing the model's classification reason so Alonzo can sanity-check what the AI is calling "out of tolerance."
- A compliance-rules config screen Alonzo can edit during the demo — change a rule, watch flags update. This is the hook that invites his CAO + VP Ops to hand over their mental model.
- A "send weekly digest" button that renders the digest email **in-app preview** (no actual sending). Demonstrates layout, content, and links so leadership can react to it.
- Trend chart: compliance score by location over the synthetic 30 days.

**What's simulated (demo mode):**
- Therap ingestion is replaced by a pre-loaded synthetic CSV that mirrors the expected ExDF T-Log shape: individual ID, staff ID (angel), date, shift/time, location, note type, notification level (Low/Medium/High), note text. Engineer should match field names to ExDF's published schema once the Trading Partner Agreement is signed.
- AI runs against synthetic note text — real Lightweight-tier model, real classifications. Cost is negligible at ~30 days × ~12 individuals.
- Email "send" intercepted — preview rendered in-app instead of going to real recipients.
- Auth: simple demo login (no Google SSO) so Alonzo and team can poke around without setup.

**To complete (what's needed from the customer after prototype approval):**
- LGA subscribes to Therap ExDF (Alonzo/Adrian contacts Therap GA support — gasupport@therapservices.net — to request and confirm scope). Confirm whether T-Log is included in their ExDF feed list today, or whether Case Note feed is the substitute.
- Sagan executes Therap Trading Partner Agreement (NDA + BAA). Customer-side ExDF subscription is the prerequisite.
- BAA between Sagan and LGA (Sagan processes PHI on LGA's behalf).
- ExDF SFTP credentials (host, username, SSH key) from Therap.
- LGA org data: location list, angel→location mapping, manager→location mapping, individual roster, expected shift schedule per individual.
- Compliance rule definitions from LGA's CAO + VP of Operations — what "out of tolerance" means in LGA's context. Alonzo acknowledged this as a kickoff dependency.
- Real recipient email addresses and cadence for the weekly digest.
- (If using Google Workspace SSO for production auth) Google admin consent for the Sagan app.

---

## Stack Suggestions

_Recommended tools and services, grounded in [stack.md](references/stack.md). The engineer may diverge if the project calls for it._

| Layer | Tool | Rationale |
|-------|------|-----------|
| Hosting | Railway | Sagan default per stack.md. One service handles dashboard, ExDF SFTP poller, AI classification, and weekly email cron. |
| Frontend | HTML + Tailwind CSS + htmx | Sagan default per stack.md. Dashboard is server-rendered fragments — filtering, drill-down, search all work cleanly via htmx. Mobile-responsive without a build step. Managers check from phones. |
| Backend | Hono (Node.js + TypeScript) | Sagan default per stack.md. Lightweight API, htmx fragment routes, scheduled job entry points. |
| Database | SQLite on Railway volume | Per stack.md — low-medium volume default. ~100 angels × ~12 individuals × daily notes is well within SQLite's range. Rate-limit / Postgres complexity not justified. |
| Integrations | Direct (SFTP from backend) | Therap ExDF is SFTP-only with no webhooks. A scheduled SFTP pull from the Hono backend is simpler than n8n for this. Use n8n later if/when integration count grows. |
| Scheduling | Railway cron | Per stack.md — never n8n for scheduling. Cron triggers ExDF pull (every few hours), runs the classifier on new rows, sends the weekly digest. |
| AI | Lightweight tier (via OpenRouter) | Per stack.md AI tiers. Note classification is high-frequency, structured pattern detection — fits the Lightweight tier squarely. SoTA not justified at the per-note volume LGA will hit. |
| Auth | Better Auth + Google Workspace SSO | Per stack.md — never roll your own. LGA's working email is on `lowesguardianangel.com`; Google Workspace likely. Restrict via `hd` parameter, validate server-side. Confirm during kickoff. |
| Email | Resend or equivalent | Not in stack.md but a standard transactional provider — engineer's choice. Volume is trivial (a handful of weekly digests). |

**Environment Variables**: `THERAP_SFTP_HOST`, `THERAP_SFTP_USER`, `THERAP_SFTP_PRIVATE_KEY_PATH`, `OPENROUTER_API_KEY`, `EMAIL_API_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `DATABASE_PATH`

---

## Screen Share Timestamps

_No screen sharing occurred in this call (audio-only, no screenshots available)._

The conversation was verbal — Alonzo, Erin, and Adrian did not demo Therap or any other system on screen. Engineer should request a recorded walkthrough of the Therap T-Log entry flow (and the in-Therap T-Log Excel export, in case it's needed as a manual ingestion fallback) from Adrian or LGA's IT associate during kickoff.

---

## Key Definitions

_Domain terms the engineer needs to understand._

| Term | Meaning | Examples |
|------|---------|----------|
| Angel | LGA's term for caregivers — covers DSPs, nurses, and managers | A DSP working a swing shift in a group home |
| Individual | A person receiving care from LGA | A resident in a host home; a participant in the day program |
| DSP | Direct Support Professional — front-line caregiver who provides hands-on support to individuals with IDD | The role that fills out most daily progress notes |
| Daily Progress Note | A narrative entry an angel logs in Therap at the end of a shift, documenting the individual's status, activities, incidents, medications, and needs | "John refused lunch but ate dinner. No incidents. Bowel movement noted." |
| Therap | EMR / documentation system used across the IDD care industry (therapservices.net). LGA's system of record; billing pulls from Therap. | Each angel has an individual login; selects an individual, writes a T-Log |
| T-Log | Therap's module name for daily shift notes / progress notes. Has structured `type` and `notification level` (Low/Medium/High) fields plus freetext content. | The T-Log "notification level" is a deterministic pre-flag the dashboard can use before any AI runs |
| ExDF | Therap External Data Feed — Therap's productized data export. SFTP delivery, CSV format, refreshed multiple times per day. Requires customer subscription + vendor Trading Partner Agreement. | The realistic ingestion path for this build |
| Out of Tolerance | A note (or missing note) that indicates a compliance concern requiring management review | Missing note for a shift; mention of injury or medication refusal; copy-paste / vague entries |
| Host Home | Residential care setting where an individual lives in a host caregiver's private home | One individual living with one host family |
| Group Home | Residential care setting with multiple individuals and rotating staff shifts | 3-4 individuals with DSPs working day/swing/overnight shifts |
| Day Program | Daytime adult day-services setting; individuals come in for activities and support | Anthony King's program (mentioned by Alonzo) |
| DBHDD | Georgia Department of Behavioral Health and Developmental Disabilities — state regulator that mandates Therap usage and audits provider documentation | Publishes "Therap Bulletins" defining Georgia-specific compliance expectations |
| CARF | Commission on Accreditation of Rehabilitation Facilities — LGA's industry accreditation, held since inception | Independent of DBHDD; both shape what "compliant documentation" means |

---

## User Stories

_Each user story maps to a Build Spec bullet. Implementation Considerations flag gotchas, risks, data dependencies, and soft tool suggestions — not prescriptive specs. The assigned engineer will review the transcript independently and make their own implementation decisions._

### User Story 1: Pull daily progress notes from Therap automatically

**Implementation Considerations:**
- **No public REST API for T-Logs.** Therap's "External API" is publicly marketed but covers Demographics & Users only. The realistic path is **Therap's External Data Feed (ExDF)** — SFTP CSV files refreshed multiple times per day. Confirm during kickoff that LGA subscribes to ExDF and that the **T-Log feed (or Case Note as substitute)** is included for their state.
- **Contracting is the gating dependency.** Plan ~4–8 weeks: customer requests ExDF from Therap, Sagan executes Therap's Trading Partner Agreement (NDA + BAA), customer ↔ Sagan BAA signed. Build the prototype against synthetic data so Alonzo can approve while contracting runs in parallel.
- **A Therap UI Excel export is the bridge** if Alonzo wants production data before ExDF is live. T-Log search results in Therap can be exported to Excel by an LGA admin and uploaded to the app. Ask Adrian to walk the engineer through the export flow during kickoff.
- **Use T-Log's structured fields as deterministic pre-flags before any AI runs.** Per Therap docs (verified in South Dakota's Therap Handbook), each T-Log carries `notification level` (Low / Medium / High) and `type`. Anything Medium/High is auto-yellow/red without LLM calls — saves cost and is more defensible.
- **Don't login-proxy or scrape the Therap portal.** Technically feasible but almost certainly violates Therap's EULA and breaks under MFA changes.
- **Therap GA support exists.** `gasupport@therapservices.net` per Therap's Georgia state page — Adrian should be the customer-side liaison during the ExDF setup.

### User Story 2: Flag missing notes and out-of-tolerance content

**Implementation Considerations:**
- **Two detection paths, not one.** (a) **Missing-note rules** are pure schedule logic — given expected notes per individual per shift, detect gaps. (b) **Content red flags** are AI classification on note text. Build them as separate components.
- **Compliance rule definitions are a kickoff input from LGA leadership.** Alonzo explicitly said: "we probably need to document what's in the head of our chief administrative officer as well as our vice president of operations." Treat the rule set as editable configuration in the app — not hardcoded prompt text — so LGA's CAO and VP Ops can iterate.
- **Lightweight tier (per stack.md) is the right model fit.** Note classification is high-frequency structured pattern detection — Flash/Nano-class models handle this fine. Don't reach for SoTA.
- **DBHDD has Georgia-specific compliance content.** DBHDD publishes "Therap Bulletins" via dbhdd.zendesk.com and the DBHDD Provider Manual defines required progress-note elements. Engineer should pull these and reflect them in the default rule set — auditors literally check note content against the manual.
- **Flag attribution matters.** Each flag should be attributable to the responsible angel AND their manager (since the manager is the first-line reviewer Alonzo wants to alert).
- **Always preserve the original note text.** AI classifications are supplementary, never replacements. Store the model's reasoning so leadership can audit any flag.

### User Story 3: Red/yellow/green dashboard with drill-down and filtering

**Implementation Considerations:**
- **Drill-down path:** location → angel → individual → note. Each level shows aggregate red/yellow/green counts plus the underlying flagged items.
- **Filters:** date range, severity, shift, manager, location, individual. Free-text search across note content. Alonzo specifically called out wanting trends "by location, by nurse, by weekend shifts versus dates."
- **Trend view:** week-over-week and month-over-month compliance score per location and per manager. This is what gives Alonzo the confidence-to-scale signal he asked for.
- **Mobile-responsive is non-negotiable.** Managers check from phones in the field. HTML + Tailwind + htmx (per stack.md) handles this without a build step.
- **Show last data refresh timestamp prominently.** ExDF refreshes multi-times-per-day, not real-time — leadership needs to know how current the picture is.
- **Org structure (angel↔location, manager↔location, individual↔location) is initial config.** May not come cleanly from ExDF — likely needs an admin screen where Adrian can populate from LGA's roster.

### User Story 4: Weekly summary emails to leadership and managers

**Implementation Considerations:**
- **Railway cron only** — per stack.md, never n8n for scheduling.
- **Default cadence is weekly**, configurable. Alonzo agreed in-call to "every week gets emailed to their boss or to your head of ops."
- **Recipients are configurable:** Alonzo, Erin (Chief People Officer), VP of Operations, location managers. Different recipients may want different scopes (e.g., manager only sees their own locations).
- **Email content:** notes submitted vs. expected for the week, top flagged locations/angels, WoW change, deep links into the dashboard for any flagged item.
- **Resend or equivalent transactional provider** — volume is trivial. Engineer's choice. Make sure links route through the app's auth so recipients have to log in to see PHI.

---

## Data Sources

_All external systems the build connects to._

| Source | Type | Direction | Integration Method | Notes |
|--------|------|-----------|-------------------|-------|
| Therap (T-Log via ExDF) | EMR feed | In | SFTP CSV pull, multi-times-per-day, scheduled via Railway cron | Customer must subscribe to ExDF; Sagan must execute Therap Trading Partner Agreement (NDA + BAA). T-Log inclusion in customer's specific ExDF feed list must be confirmed with Therap. |
| Therap UI (T-Log Excel export) | Manual file upload | In | User upload via dashboard | Bridge path while ExDF is being set up. Admin exports from Therap T-Log search → Excel → uploads. |
| OpenRouter (Lightweight tier) | API | Out | Direct HTTP from backend | Note classification. Per stack.md — Anthropic BAA needed if using Claude on PHI; otherwise verify the chosen provider's HIPAA posture. |
| Email service (Resend or equivalent) | API | Out | Direct HTTP | Weekly digest emails. Choose a provider with HIPAA support if any PHI ends up in email body — prefer email body to be summary stats with deep-links rather than PHI. |
| Google Workspace (likely) | OAuth / SSO | In | Better Auth | LGA staff log in via Google. Restrict to `lowesguardianangel.com` domain via `hd` parameter and validate server-side. Confirm Google Workspace usage at kickoff (vs. Microsoft 365). |

---

## Discussed But Not Confirmed

_These items came up in the transcript but were not explicitly committed to. Verify with the customer before including in the build._

- **Nurse-specific compliance checks**: Alonzo separately mentioned "things that nurses should be able to write or check every day" alongside the DSP daily progress notes. Unclear whether nurse documentation lives in the same Therap T-Log workflow or in a different module (e.g., Health Tracking, ISP Data). Verify with Adrian before assuming a single ingestion stream covers both.
- **Anthony King's host-home oversight**: Alonzo said "I think about what Anthony King is doing for host homes, which the managers should be doing for the group homes, but I really have no idea because I presume Vivian is overlooking the managers." This suggests host homes may have a different review cadence/responsibility model than group homes — which would change what "expected notes" looks like for that location type. Confirm during kickoff.
- **Per-manager alerts beyond the weekly digest**: Jon mentioned "you could set up alerts per manager... if somebody didn't fill one out, I can look for patterns." Alonzo seemed receptive but the conversation didn't land on whether real-time/per-event alerts are in scope or whether weekly digest is sufficient for v1. Default plan: ship weekly digest only; add granular alerting if Alonzo asks after seeing the prototype.

---

## Out of Scope (Future Phases)

_These were discussed but explicitly deferred. Preserved here so nothing is lost._

- **Email and calendar management for Alonzo**: Erin championed this strongly ("I need him to be even more focused and present... we hate email"). Alonzo agreed it's important. Jon explicitly recommended deferring it: "I think email and calendar management is a great second phase two one because there's definitely some dependencies in there." Phase 2.
- **HR / BambooHR compliance docs**: Erin raised compliance for documents stored in BambooHR — driver's licenses, I-9s, certifications. Jon called HR "a big can of worms" and "a more ambitious thing." Separate, larger build.
- **Phone-based dictation for daily notes**: Jon proposed an inbound phone number where angels dictate notes and AI transcribes/structures them. Alonzo and Erin both initially loved it. Alonzo then explicitly walked it back for the first build: "I probably would prefer to not have to have behavioral change. But just have system updates in the background. For this first project." Out for v1; revisit later.
- **Phone-based reporting for field sales**: Alonzo briefly riffed on the idea ("I might need a number for the field sales to call"). Mentioned once, never circled back. Future build.
- **Clockify time-tracking ROI**: Alonzo mentioned launching Clockify six months ago and getting "no ROI out of that." Offered to share data, conversation moved on without commitment. Future analysis if Alonzo wants it.
- **Auto-write back to Therap**: This build is read-only from Therap. Writing flags, comments, or follow-up tasks back into Therap is not in scope and was not discussed.
- **Predictive / multi-week trend analytics**: Beyond simple WoW/MoM trend lines, deeper pattern analysis (e.g., "weekend shift compliance is X% lower than weekday") would benefit from weeks/months of accumulated data. Revisit after launch.

---

## Confidence Score

_How well-scoped is this build? Scored across three dimensions, each out of 5. Overall = the lowest score._

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope Definition | 4/5 | Single committed feature set; transcript is unambiguous about what was chosen and what was deferred. The one wrinkle: the AI's specific compliance rules depend on LGA's CAO/VP Ops mental model — Alonzo flagged this as a known kickoff input. Treated as configuration, not blocker. |
| Technical Feasibility | 3/5 | Therap is the constraint. ExDF is real and works, but: (a) requires customer to subscribe (sales process + cost), (b) Sagan must execute Trading Partner Agreement (NDA + BAA — multi-week legal lead time), (c) T-Log inclusion in the ExDF feed list for LGA's contract is not publicly verifiable — must confirm with Therap directly. The prototype path (synthetic data) is solid; the production cutover is not 1-week work. |
| Customer Impact | 5/5 | Alonzo explicitly tied this to growth: "we have governed our growth because of concerns about our compliance and our quality assurance... yes, the quality assurance piece will create capacity for our vice president of operations, create capacity for our managers, create capacity for our nurses, and it'll give me more confidence that the organization is ready to handle scale." Direct growth enabler with named stakeholders. |
| **Overall** | **3/5** | **= lowest of the three (Technical Feasibility)** |

Solid build with high customer impact. The Therap data path is the entire risk surface — engineer should treat the ExDF Trading Partner Agreement and T-Log feed confirmation as the longest-pole item and start the customer-side conversation with Therap GA support immediately, in parallel with prototype construction.

---

## Audit Notes

All four user stories trace cleanly to the transcript:
- **Story 1 (Therap ingestion)**: Alonzo — "they log in [to Therap], they all have their individual login... it's like an electronic medical record." Plus his preference to "not have to have behavioral change... just have system updates in the background."
- **Story 2 (red flag detection)**: Alonzo — "we need the agent to identify red flags when either there was not a note. Or something was out of tolerance."
- **Story 3 (dashboard)**: Alonzo — "a playbook going that can bubble up to become a dashboard. Of key, like red, yellow, green items. From each day or each week or each month." Plus Jon describing trends "by location... by nurse... by weekend shifts versus dates."
- **Story 4 (weekly emails)**: Jon — "every week gets emailed to their boss or to your head of ops" — Alonzo did not object and engaged with the framing.

**Items moved to "Discussed But Not Confirmed" during audit:** nurse-specific checks (raised but workflow unclear), Anthony King's host-home model (alluded to but not specified), per-manager real-time alerts (Jon proposed, didn't land).

**Items correctly deferred to Out of Scope:** email/calendar (Jon: "great phase two"), HR/BambooHR (Jon: "big can of worms"), phone dictation (Alonzo explicitly walked it back for v1), field sales phone CRM (mentioned once), Clockify (mentioned once, no commitment).

**Prototype audit:** The prototype demonstrates the full value chain — ingest → flag → dashboard → email — without any Therap or LGA credentials. Synthetic data is realistic enough to surface real classifier behavior. The compliance-rules config screen is the deliberate hook that invites Alonzo's CAO/VP Ops to participate. To-Complete items are all real post-prototype dependencies traced to either the transcript or the Therap research. No red flags found.

**Therap research note:** Public sources (Therap product pages, Nebraska state RFP technical response, Alaska EVV vendor requirements, DBHDD-published Therap Bulletins, multiple Georgia QEPR audit reports) confirm the ExDF/SFTP path and the Trading Partner Agreement requirement. The single biggest unverified item — whether T-Log specifically (vs. Case Note) is included in LGA's Georgia ExDF feed list today — must be confirmed in a sales/dev conversation with Therap GA support; the public 2022 feed list does not include T-Log by name and Therap has expanded feeds since.
