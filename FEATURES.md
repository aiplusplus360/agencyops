# AgencyOps — Complete Feature Specification

> **AgencyOps** is a Closed-Loop AI **Agency** Operations Engine built for marketing agencies, acting as an **Automated Executive (AI-COO)**.
> Core paradigm: **Vision Ingestion → AI Decomposition → Dynamic Matching → Automated Evaluation → Iterative Progression**.

---

## 1. System Philosophy & Operating Model

The system is **not** a passive task database. It is an active executive that:

1. **Ingests** a raw, unstructured "brain-dump" from the Admin (Strategic Thinker).
2. **Decomposes** it using internal industry knowledge into a **15–90 Day Roadmap Matrix**.
3. **Auto-allocates** granular tasks to the best-suited Worker (Tactical Executor).
4. **Evaluates** every submission with an objective AI grading loop.
5. **Self-heals** the roadmap: failed submissions spawn revision tasks; passing submissions unlock the next dependency automatically.

### The Foundational Behaviors

| Behavior | Description |
|---|---|
| **Context-Driven Autonomy** | The AI reads high-level business requirements and generates granular technical steps itself — no step-by-step instructions from the admin required. |
| **Asymmetric Dashboarding** | Admin panel = macro view (velocity, roadmaps, blockages, performance trends). Worker panel = micro view (strict, clean, linear queue of immediate tasks, zero clutter). |
| **Objective Grading Loop** | Continuous feedback engine critiques every submission on intent matching, completeness, and deadline adherence → strict quality score. |
| **Self-Healing Roadmaps** | Score below threshold → revision task auto-inserted into queue. Score passes → next sequential roadmap dependency unlocked without admin approval. |
| **Strict Timeline Discipline** | Every task carries a firm, AI-set deadline. Deadlines are strict (not lenient): late submissions lower the grade, breach triggers escalation, and the countdown is the worker's most prominent widget. |
| **Permanent Product Memory** | The admin maintains a Product Registry. The AI references these products on every ingestion, decomposition, and auto-generation call, so all work is grounded in the admin's actual products. |
| **Continuous Auto-Flow** | When a worker's queue runs low, the AI automatically generates the next batch of tasks for that worker (from roadmap backlog or product context) without any admin prompt, so work never stalls. |
| **Adaptive Workload Scaling** | The AI scales each worker's effective capacity and task complexity up or down based on their past progress (velocity, quality, on-time rate). Top performers automatically receive more and harder tasks; struggling workers are paced down to recover before being ramped back up. |

---

## 2. Roles & Access Model

| Role | Archetype | System View |
|---|---|---|
| **Admin** | Strategic Thinker | Full macro command suite: vision, roadmap, allocation, registry, leaderboard, evaluation oversight, settings. |
| **Worker** | Tactical Executor | Micro execution terminal: linear queue, deadline clock, verification panel, revision loop, personal score history. |

- Role-based access control enforced on every route (backend middleware + frontend route guards).
- Sessions via JWT (access + refresh tokens).
- Multiple admins allowed (team owners); workers are registered by the admin and/or self-register via invite.

---

## 3. PANEL A — ADMIN PANEL (Strategic Command Suite)

The Admin Panel is macro-focused: **velocity, roadmaps, team blockages, and performance scoring trends**. It consists of the following modules:

### 3.1 Strategic Vision Canvas (Ingestion Engine)

**The main screen is a ChatGPT-style AI Assistant (`/`).** The agency owner simply tells the AI what to do in plain words, and the AI-COO:
- Replies conversationally and (when work is described) produces a **draft campaign plan** — a 15/30/60–90 day roadmap with granular marketing tasks.
- **Suggests additional tasks** the owner didn't mention, each tickable.
- **Honors named assignees** — "give the landing page to Dave and the ads to Bob" assigns those tasks to those people; the rest stay in the open pool for the AI to route.
- On **Approve**, tasks are created and the discussed ones are assigned immediately; the remainder go to the unassigned pool for automatic routing.

A full strategic vision terminal (raw text, recordings, documents) remains available for deeper ingestion.

**Client Portfolio is the product page** — the sidebar `▣ Product` (`/products`). The AI-COO can also add clients for you: tell it about a new client in the chat (e.g. *"add a new client: an organic dog food brand called PupJoy, target millennial pet parents, they sell on Shopify"*). It will fill a client profile, ask for anything missing, and show an editable **Add to portfolio** card — click it and the client lands in the portfolio, ready to be linked to future campaigns. Duplicate names are detected and rejected.

**Employees can be added by talking to the AI too** — e.g. *"hire a senior graphic designer named Fiona Lee, strong in branding and Figma"*. The AI-COO detects the new hire, maps the role to skills, asks for their email, and shows an editable **Add employee** card (seniority tier, base capacity, skill chips). On confirm it creates their login (`/api/users`) so they can log in and see their Delivery Terminal queue. Duplicate emails are rejected.

- **Distraction-free input terminal** — full-screen, minimal UI, single focus input.
- **Multiple input modes:**
  - Raw text / paste of business requirements.
  - Audio recording upload → automatic transcription (voice brain-dump).
  - Document upload (PDF, DOCX, TXT, links) → text extraction.
- **AI Processing Flow:** Brain-dump submitted → AI Ingestion Engine parses → produces a **preview of the extracted roadmap** (vision statement, objectives, milestones) → Admin **approves / edits / regenerates** before it becomes live.
- **Draft autosave** — unfinished visions are saved as drafts.
- **Vision history** — all past brain-dumps browsable, re-ingestable, and reusable.
- **Product memory reference** — attach one or more products from the Product Registry so the AI decomposes and generates work with your actual products in mind.

### 3.2 Temporal Horizon Matrix (Roadmap)

- **Three time-block columns (the board):**
  - **15-Day Runway** — immediate sprints, quick wins.
  - **30-Day Milestones** — medium-range deliverable milestones.
  - **60–90 Day Horizons** — long-range strategic goals.
- **AI auto-decomposition** — each roadmap item is broken into granular, actionable technical tasks (with descriptions, acceptance criteria, dependencies, effort estimates, priority).
- **Dependency graph** — visual linking; a task unlocks only when its predecessors pass evaluation.
- **Drag-and-drop reprioritization** — admin can move items across time-blocks and reorder.
- **Milestone management** — create, edit, merge, archive milestones.
- **Progress tracking** — automatic % progress computed from task evaluation outcomes.
- **Self-healing visibility** — auto-inserted revision tasks are shown distinctly (amber) so the admin sees healing activity.
- **Filter & search** — by status, time-block, assignee, priority, tag.

### 3.3 Smart Allocation / Assignment Panel

This is the operational heart of the admin suite — the AI routing layer.

- **Unassigned Task Pool** — all decomposed tasks awaiting a resource, with required-skill tags.
- **Compatibility Matrix Engine** — for every open task, the AI computes a **compatibility score** against every eligible worker using:
  - Skill/tag match against task requirements.
  - Seniority tier fit vs. task difficulty.
  - **Effective capacity** (adaptive: scales with past progress) minus current backlog load.
  - Historical quality score & submission speed.
- **One-Click Auto-Assign** — accept the AI's best match, or view a ranked shortlist of next-best options.
- **Manual override** — assign any task to any worker manually (with reason).
- **Reassignment** — move a task to another worker with full reassignment history.
- **Score breakdown tooltip** — every suggestion shows *why* (skill 90% · load 70% · seniority 100% · history 85%).
- **Bandwidth Protection Filter** — a worker whose active queue exceeds their configured capacity is **flagged red / excluded** from auto-assignment and surfaces an alert on the admin dashboard (burnout prevention).
- **Queue view per worker** — see every worker's current queue, deadlines, and load at a glance.
- **Batch assignment** — assign multiple tasks in one operation.
- **Admin notes on tasks** — leave a brief comment on any task; it appears to the assigned worker in their task detail (lightweight channel, zero dashboard clutter).
- **Adaptive capacity in matching** — overload and "too idle" are judged against each worker's scaled effective capacity, not a static number, so scaling directly steers assignment.

### 3.4 Capability Registry (Worker Database)

- **Worker CRUD** — add, edit, deactivate, delete workers.
- **Skill profile** — tag each worker with distinct skill sets (e.g., React, DevOps, UI/UX, QA).
- **Seniority tier** — Junior / Mid / Senior / Lead (or custom tiers).
- **Task capacity** — max concurrent active tasks.
- **Strengths & notes** — free-text strengths, weaknesses, preferences.
- **Availability status** — Active / At capacity / On leave.
- **Per-worker performance history** — quality score trend, velocity, on-time rate.
- **Effective capacity** — the live, AI-scaled capacity (base capacity × scaling factor) shown per worker, with a "scaling up / steady / scaling down" indicator and an admin lock/override.

### 3.5 Operational Performance Leaderboard

- **Team rankings** — sortable table of workers ranked by:
  - Live AI-generated **quality score** (aggregate of evaluation grades).
  - **Historical submission speed** (avg hours to completion).
  - **Active workload volume** (current open task count).
- **Trend charts** — per-worker and team quality-score over time.
- **Time-range filters** — 7d / 30d / 90d / all-time.
- **Export** — leaderboard to CSV/PDF.

### 3.6 AI Evaluation Oversight

- **Evaluation inbox** — every AI-graded submission visible to the admin.
- **Score transparency** — each grade shows the rubric breakdown (intent match / completeness / deadline adherence) with AI rationale.
- **Admin override** — approve, adjust, or veto an AI score when human judgment is needed.
- **Revision history** — full loop per task: submission → evaluation → revision → re-evaluation.

### 3.7 Health, Alerts & Dashboard

- **Executive overview dashboard** — one screen, sub-5-second scan:
  - Active tasks, in-evaluation count, overdue count, unassigned tasks.
  - Team velocity (tasks completed per day/week).
  - Blockage list (overdue tasks, stalled queues, overloaded workers).
- **Alert feed** — bandwidth overload flags, overdue escalations, evaluation verdicts.
- **Activity log** — audit trail of all system actions.
- **Predictive Workload Forecast** — the AI projects each worker's load a few days ahead from current deadlines and flags "Worker Y reaches full capacity by Thursday" before it happens.
- **Worker Start Watchdog** — an alert fires when an assigned task sits untouched for a configurable number of hours (catches idle workers early).

### 3.8 System Settings (Admin-Only)

- **Grading rubric configuration** — weights for intent matching, completeness, deadline adherence; **quality threshold** for pass/fail and auto-revision trigger.
- **AI behavior settings** — decomposition verbosity, industry context hints.
- **Team settings** — seniority tiers, capacity defaults, business hours.
- **Notifications preferences** — what the admin gets alerted on and how (in-app and/or email).
- **Email (SMTP) configuration** — SMTP host, port, username/password, from address, and a **"Send test email"** button to verify the setup.
- **Digest schedule** — enable/disable the **daily** and **weekly** admin digests, set the delivery time, and choose the recipient email(s).
- **Escalation policy** — configurable reminder ladder (e.g., 24h / 4h / 1h before deadline) and the overdue window after which a task auto-escalates or auto-reassigns.
- **Adaptive scaling policy** — enable/disable auto-scaling, min/max capacity multipliers, ramp-up/ramp-down thresholds (velocity and quality targets that trigger a scale step), and per-worker manual lock.

### 3.9 Product Registry (Permanent Product Memory)

- **Product CRUD** — add, edit, archive products; each product is permanent system memory.
- **Product profile** — name, description, target users, tech stack, goals, key files/docs links, notes.
- **AI reference** — the AI automatically uses registered products as context on every ingestion, decomposition, task generation, and evaluation call.
- **Vision attachment** — when ingesting a brain-dump, admin selects which products it relates to.
- **Knowledge Base (RAG)** — attach actual docs/files to a product; the AI retrieves the relevant snippets when decomposing or generating tasks about that product, so the work is grounded in your real documentation.

### 3.10 Employee Intelligence & Utilization Logs

- **Full per-employee log timeline** — every task's start, submit, and confirm timestamps plus all status changes and scores.
- **Most useful / least useful identification** — ranked identification of top and bottom performers per week/month by completion rate, quality, on-time %, and velocity.
- **Monthly task report** — per-task, per-month breakdown (task, month, status, delivered/deployed, score) for every employee.
- **Drill-down** — click any employee to see their complete work history, evaluation scores, and timeline.
- **Scaling history** — a record of every capacity/complexity adjustment per worker (when the AI scaled up or down and why), visible in the drill-down.

### 3.11 Recurring Task Templates

- **Template CRUD** — admin defines reusable task templates (title, description, acceptance criteria, skill tags, estimated effort, cadence).
- **Auto-scheduling** — recurring deliverables (monthly reports, scheduled releases, routine maintenance) are auto-created on their cadence and fed into the auto-assign flow.
- **Product linkage** — a template can be bound to a product so every instance is generated with product context.

### 3.12 AI Decision Audit Trail

- **Every AI action recorded** — assignments, evaluations, auto-generated tasks, revision insertions, reassignments — each stored with the full reasoning the AI used.
- **Replayable** — admin opens any AI decision to see *why* it chose a worker, gave a score, or generated a task.
- **Filterable** — by date, worker, task, and decision type.

### 3.13 AI Cost & Usage Monitor

- **API call tracking** — every DeepSeek/AI call is logged by engine (ingestion, decomposition, matching, evaluation, auto-refill, forecast).
- **Estimated cost** — per-call and cumulative cost estimate shown in the dashboard.
- **Budgets** — optional monthly budget with warning alerts when approaching the limit.
- **Per-engine breakdown** — see which engine consumes the most calls/credits.

---

## 4. PANEL B — WORKER PANEL (Execution Terminal)

The Worker Panel is micro-focused: **a strict, clean, linear queue of immediate tasks with zero operational clutter**.

### 4.1 Linear Task Queue

- **Only active assignments** — no project management clutter.
- **Priority-ordered list** — urgent tasks and revision loops float to the top.
- **Linear progression** — one task flow at a time; completed tasks leave the queue.
- **Status management** — Accept → In Progress → Submitted (per task).
- **Search within own queue** — find a specific task quickly.
- **No cross-team noise** — workers only see their own assignments.

### 4.2 Task Detail & Ticking Deadline Indicator

- **Full task brief** — requirements, acceptance criteria, context, and links to dependent/source material.
- **Prominent countdown** — large, always-visible **"Xh Ym remaining"** clock.
- **Urgency states** — safe (blue) → warning (amber, < 25% time left) → critical (red, overdue).
- **Deadline adherence is part of the grade** — the clock is the worker's single most important widget.
- **Admin notes visible** — any admin note on the task appears here.
- **Full task timeline** — created → assigned → started → submitted → confirmed, with timestamps, so the worker always knows where the task stands.

### 4.3 Work Verification Panel (Submission)

- **Structured submission window:**
  - **Text comments** — what was done, approach notes.
  - **Execution logs** — paste or upload logs.
  - **Output results** — links, screenshots, files, deliverables.
- **Auto-submit guard** — prevents empty/blank submissions.
- **Submit for AI Evaluation** — one click sends the work into the grading loop.
- **Submission confirmation** — worker immediately sees "Submitted — under evaluation."

### 4.4 Revision & Feedback Loop

- **Revision requests** — tasks that fail the threshold return to the worker's queue with an **amber Revision badge**.
- **AI feedback view** — exactly why it failed (per rubric dimension) with actionable critique.
- **Resubmission** — revised work goes back through evaluation; loop repeats until pass (max attempts configurable).
- **Revision trail** — worker sees all past attempts and scores on that task.
- **Grade appeal** — one appeal per failed task; the worker explains why the grade is unfair and gets an admin/AI re-review.

### 4.5 Personal Performance Profile

- **My scores** — personal quality score history and trend.
- **My velocity** — tasks completed, average time, on-time rate.
- **Leaderboard position** — where I stand among teammates.
- **Completed work archive** — everything I've submitted, with final verdicts.

### 4.6 Task Status Updates (Live Reporting)

- **Working on it** — one tap marks the task active; the system records the exact start-of-work timestamp.
- **Can't do it / Blocked** — one tap flags the task as impossible; the AI instantly re-routes it to the best alternative worker and alerts the admin.
- **Completed** — marks the task done and opens the Work Verification Panel for submission.
- **Every change is logged** — each status transition appears on the task timeline visible to the worker and the admin.

### 4.7 My Availability (Self-Service)

- **Set my availability** — the worker marks themselves as Available / At capacity / On leave / Back tomorrow (with an optional return date).
- **Leave period** — a worker on leave is excluded from new assignments automatically.
- **AI auto-rebalance** — when a worker goes on leave or at capacity, the AI redistributes their active queue to the best-suited teammates and alerts the admin.
- **Admin visibility** — availability changes appear instantly in the Capability Registry and feed the matching engine.

### 4.8 Brief Feedback (Clarity Flag)

- **Flag unclear tasks** — a worker can mark a task brief as unclear/blocked-by-ambiguity with a note.
- **Feedback loop** — flagged briefs feed back to the AI decomposition engine so future task descriptions are clearer.
- **Admin notification** — the admin is alerted when a brief is flagged, with the worker's note attached.

---

## 5. TASK LIFECYCLE, TIME TRACKING & STRICT DEADLINE POLICY

- **Strict AI-set deadlines** — every task gets a firm deadline from the AI based on effort estimates and priority. Deadlines are strict, not soft targets.
- **Task activity timeline** — a full audit log per task: created, assigned, started work, status changes, submitted, evaluated, confirmed (PASS).
- **Time tracking** — exact timestamps recorded when the worker started, when they submitted, and when the work was confirmed (evaluated and passed).
- **Lateness discipline** — late submission lowers the Deadline Adherence score; repeated or critical lateness raises an admin escalation alert.
- **Cannot-do flow** — a "Can't do it" status re-routes the task through the matching engine to the next-best worker automatically.
- **Confirmed work** — "Confirmed" means the evaluation PASSED; only confirmed tasks count toward roadmap progress and employee metrics.
- **Deadline Escalation Ladder** — automatic enforcement: reminders at 24h / 4h / 1h before deadline; once overdue, the worker and admin are warned; past the configured overdue window the task auto-escalates to the admin and can auto-reassign to the next-best worker.
- **Lateness history** — every overdue event is recorded per worker and feeds their on-time rate metric.

---

## 6. SHARED PANELS (Both Roles)

- **Authentication** — login, registration, forgot/reset password, session expiry handling.
- **Profile** — name, avatar, contact, change password.
- **Notifications center** — per-role alerts (new assignment, evaluation verdict, revision required, overload warning).
- **Onboarding** — first-login guided tour (minimal, role-specific).
- **Real-time engine** — WebSocket push: new assignments, evaluation verdicts, revision requests, and alerts appear instantly without refreshing.
- **Global search** — one search box across tasks, employees, products, and visions.
- **Daily & Weekly Admin Digest** — auto-generated summaries delivered **in-app and by email (SMTP)**:
  - **Daily digest** — today's picture: newly assigned tasks, overdue items, in-evaluation count, idle/overload flags, and any escalations from the past 24 hours.
  - **Weekly digest** — the big picture: velocity, quality trends, top/bottom performers, revision counts, forecast warnings, and overdue summary for the week.
- **Worker email notifications (optional)** — the same SMTP transport can email workers for new assignments, evaluation verdicts, revision requests, and escalations; each worker opts in/out in their profile.

---

## 7. BACKEND — THE AI ENGINE SUBSYSTEMS (non-UI)

These power all the panels above.

### 7.1 AI Ingestion Engine
- Brain-dump (text/transcript/documents) → structured **Vision + Objectives + Roadmap skeleton**.
- Industry-knowledge-aware decomposition of business requirements into phases and milestones.
- **Duplicate pre-check** — cross-references the brain-dump against existing tasks/roadmaps before decomposition (see 7.19).

### 7.2 AI Decomposition Engine
- Roadmap item → **granular technical tasks**: title, description, acceptance criteria, estimated effort, priority, skill tags, dependency list.

### 7.3 AI Matching (Compatibility) Engine
- Task-requirement vs worker-capability scoring → ranked shortlist → best-fit assignment.

### 7.4 AI Evaluation Engine (Objective Grading Loop)
- **Grading rubric (weighted, configurable):**
  - Intent Matching (did the work target the task's true purpose?)
  - Completeness (were all acceptance criteria met?)
  - Deadline Adherence (was it submitted on time?)
- Output: per-dimension scores, **overall quality score (0–100)**, verdict (PASS / REVISE), and written critique.

### 7.5 Self-Healing Roadmap Engine
- **FAIL** (below threshold) → auto-insert a **revision task** into the assigned worker's queue (no admin needed).
- **PASS** → mark task complete → **auto-unlock the next sequential dependency** into allocation flow.
- Emits alerts/notifications at every state transition.

### 7.6 AI Auto-Refill Engine (Continuous Work Flow)

- **Queue watchdog** — when a worker's active task count drops below their threshold, the engine automatically generates the next tasks for that worker.
- **Source of new work** — unassigned roadmap backlog first; if empty, it generates fresh tasks from the worker's skill profile and the admin's registered products.
- **Autonomous assignment** — newly generated tasks are auto-matched and assigned with no admin prompt; worker and admin are notified.
- **Monthly cadence** — auto-generation respects monthly patterns (monthly deliverables, recurring product work) so the worker always has work.

### 7.7 Utilization & Reporting Engine

- **Per-employee metrics** — completion rate, quality score trend, on-time %, velocity, workload volume.
- **Most / least useful ranking** — computed monthly and overall.
- **Monthly task report** — tasks grouped by task and month with delivered/deployed (DEP) status.
- **Activity timeline** — every task's started / submitted / confirmed timestamps for full traceability.

### 7.8 Real-Time Engine

- **Socket.IO (or SSE)** — live push of assignments, verdicts, revision requests, escalations, and alerts to the correct role/worker.
- **Room-per-worker + room-per-admin** — workers get only their own queue events; admins get team-wide events.

### 7.9 AI Decision Audit Trail Service

- Records every AI decision (assignment choice + rationale, evaluation rubric breakdown, auto-generated task, revision insertion, reassignment) as a structured record with model input/output snapshot.
- Exposed to the admin via the AI Decision Audit Trail panel.

### 7.10 Escalation & Watchdog Services

- **Deadline reminder scheduler** — emits reminders at 24h / 4h / 1h before deadlines.
- **Overdue escalation** — marks tasks overdue, warns worker + admin, and auto-reassigns after the configured overdue window.
- **Start watchdog** — alerts when a task sits unstarted past the idle threshold.

### 7.11 Daily & Weekly Digest Service

- Runs on a configurable schedule (default: daily at a chosen hour + weekly).
- **Daily digest** aggregates the past 24 hours: newly assigned tasks, overdue items, in-evaluation count, idle/overload flags, escalations, and revision insertions.
- **Weekly digest** aggregates the week: velocity, quality trends, top/bottom performers, revision counts, forecast warnings, and overdue summary.
- Delivered in-app (stored in `digests`) and **emailed to the configured admin recipient(s) via SMTP**.

### 7.12 Global Search Service

- Full-text search across tasks, employees, products, and visions with role-based scoping (workers only search their own queue; admins search everything).

### 7.13 RAG / Knowledge Base Service

- Ingests product-attached documents into an embeddings store; retrieves the most relevant snippets as context for ingestion, decomposition, auto-refill, and evaluation calls.
- Graceful degradation: if no knowledge base configured, the system works with product profiles alone.

### 7.14 Recurring Template Engine

- Instantiates task templates on their configured cadence, applies product context, and routes the instances into the assignment flow automatically.

### 7.15 Adaptive Workload & Complexity Scaling Engine

- **Progress telemetry** - continuously measures each worker's velocity (tasks confirmed per week), quality (average AI score trend), on-time rate, and revision count.
- **Capacity scaling** - computes an **effective capacity** = base capacity x scaling factor. Sustained high velocity + high quality pushes the factor up (worker receives more concurrent tasks); repeated failures/lateness/revisions push it down (worker is paced to recover).
- **Complexity scaling** - beyond volume, task difficulty ramps with progress: a worker who consistently passes mid-seniority tasks is auto-promoted to harder tasks; a struggling worker is handed simpler, well-scoped tasks until their scores recover.
- **Auto-refill integration** - the refill engine uses effective capacity and measured throughput to decide how many tasks to generate and when, so fast workers are refilled sooner and slower workers are not flooded.
- **Self-correcting loops** - scaling decisions are recorded in the AI Decision Audit Trail (type `capacity_scaling`) with their rationale, are visible in Employee Intelligence, and can be overridden by the admin via a per-worker lock.
- **Safety bounds** - scaling respects configured min/max multipliers so nobody is ever overloaded or left idle by policy.

### 7.16 Email Delivery Service (SMTP)

- **SMTP transport** — connects to the admin's SMTP server (host, port, user, pass, from address) via Nodemailer.
- **Digest emails** — renders and sends the daily and weekly digests as clean, light-theme HTML emails with a plain-text fallback.
- **Test email** — one-click "Send test email" from Settings verifies the SMTP configuration.
- **Delivery log** — every email sent is recorded (to, subject, status) for troubleshooting.
- **Opt-in extension** — the same transport can deliver critical alerts (overload, overdue escalation) and **worker notifications** (new assignment, verdict, revision) via email without extra setup.

### 7.17 Adaptive Learning from Admin Overrides

- **Override capture** — every time the admin adjusts an AI score, reassigns a task, or vetoes a decision, the deviation is recorded (AI decision + admin correction).
- **Pattern detection** — the system looks for recurring overrides (e.g., the AI consistently over-grades submissions of a certain type, or consistently under-weights a skill).
- **Behavior adjustment** — detected patterns automatically tune rubric weights and matching preferences so future AI decisions align with the admin's judgment.
- **Transparency** — every learned adjustment is logged in the AI Decision Audit Trail (type `learning_adjustment`) and can be reverted.

### 7.18 Estimation Accuracy Engine

- **Estimate vs actual** — compares the AI's effort estimate (and derived deadline) to the actual time from assignment to confirmation for every task.
- **Accuracy metric** — per-engine and per-worker estimation accuracy tracked over time.
- **Deadline calibration** — when estimates systematically run short or long, the AI automatically adjusts future effort estimates and deadlines.
- **Admin visibility** — estimation accuracy appears in Employee Intelligence and the cost/usage monitor.

### 7.19 Duplicate Detection Engine

- **Overlap check** — before a brain-dump is decomposed, its intent is compared against existing tasks, roadmaps, and completed work.
- **Duplicate flags** — the AI surfaces "this looks like it overlaps with task X" (similar title, intent, or acceptance criteria) as suggestions during breakdown review, so duplicate work is never created.
- **Opt-in create** — the admin can still choose to create the task anyway (e.g., a variant), with the flag dismissed.

### 7.20 Availability & Auto-Rebalance Service

- **Worker availability events** — workers set their own availability (available / at capacity / on leave / back tomorrow).
- **Queue rebalance** — on leave or at-capacity, the service reassigns the worker's active queue through the matching engine to the best-suited available teammates.
- **Conflict handling** — tasks that cannot be rebalanced are flagged to the admin; nothing silently drops.
- **Integration** — availability flows into matching, bandwidth protection, auto-refill, and forecasting in real time.

### 7.21 AI Cost & Usage Monitor Service

- **Usage log** — every AI API call is recorded (engine, model, tokens, estimated cost).
- **Rollups** — daily/monthly cost per engine and overall, with trending.
- **Budget alerts** — optional monthly budget; warning notification when approaching it.
- **Export** — usage and cost data exportable alongside the data export.

### 7.22 Data Export Service

- **Full backup** — exports users, workers, products, visions, roadmaps, tasks, assignments, submissions, evaluations, activities, and audit trails as JSON.
- **Report export** — CSV/PDF export for leaderboards, utilization reports, and digests.
- **Security** — export is admin-only and logged.

---

## 8. DATA MODEL (PostgreSQL tables)

| Table | Key fields |
|---|---|
| `users` | id, name, email, password_hash, role (admin/worker), avatar, active |
| `workers` | user_id, seniority_tier, base_capacity, effective_capacity, scaling_factor, scaling_state (up/steady/down), scaling_locked, availability, strengths_notes |
| `skills` | id, name |
| `worker_skills` | worker_id, skill_id, proficiency |
| `visions` (brain-dumps) | id, admin_id, raw_text, transcript, file_refs, status (draft/processing/live), ingested_at |
| `roadmaps` | id, vision_id, horizon (15d/30d/60-90d), title, description, start/end dates, status |
| `tasks` | id, roadmap_id, product_id, title, description, acceptance_criteria, skill_tags, priority, effort, dependencies, status (pending/working_on_it/blocked/submitted/in_revision/completed), quality_threshold, deadline, auto_generated |
| `assignments` | id, task_id, worker_id, compatibility_score, rationale, assigned_by (ai/admin), assigned_at, started_at, submitted_at, confirmed_at, active |
| `submissions` | id, task_id, worker_id, text, logs, output_links, files, submitted_at, attempt_no |
| `evaluations` | id, submission_id, intent_score, completeness_score, deadline_score, quality_score, verdict, critique, evaluated_at, overridden_by |
| `revisions` | id, task_id, worker_id, reason, critique_ref, created_at |
| `notifications` | id, user_id, type, title, body, read, created_at |
| `activity_logs` | id, user_id, action, entity_type, entity_id, meta, created_at |
| `products` | id, name, description, target_users, tech_stack, goals, file_refs, active |
| `product_documents` | id, product_id, file_ref, extracted_text, embeddings_ref, uploaded_at |
| `task_activities` | id, task_id, worker_id, type (assigned/started/status_change/submitted/evaluated/confirmed/reassigned), note, created_at |
| `task_notes` | id, task_id, author_id, body, created_at |
| `appeals` | id, task_id, worker_id, reason, status (pending/upheld/rejected), reviewed_by, created_at |
| `ai_decisions` | id, type (assignment/evaluation/auto_generate/revision/reassign/forecast/capacity_scaling/learning_adjustment), entity_id, decision, rationale, snapshot, created_at |
| `task_templates` | id, name, title, description, acceptance_criteria, skill_tags, effort, cadence, product_id, active |
| `digests` | id, admin_id, period (daily/weekly), payload, delivered_at, email_status, created_at |
| `recurring_instances` | id, template_id, task_id, scheduled_for, status |
| `email_logs` | id, to_email, subject, status (sent/failed), error, sent_at |
| `availability_logs` | id, worker_id, status, from, until, note, created_at |
| `brief_feedback` | id, task_id, worker_id, note, created_at |
| `api_usage_logs` | id, engine, model, tokens_in, tokens_out, est_cost, created_at |
| `learning_adjustments` | id, ai_decision_ref, override_type, adjustment, applied, created_at |

---

## 9. TECH STACK (as requested)

- **Backend:** Node.js + Express (REST API), PostgreSQL, Prisma ORM, JWT auth, file upload (Multer), AI provider SDK (DeepSeek via OpenAI-compatible API — pluggable), Socket.IO for real-time, node-cron for scheduler jobs (evaluations, escalation, digests, auto-refill), Nodemailer for SMTP email delivery, express-rate-limit for rate limiting, embeddings store for RAG (pgvector or in-process).
- **Frontend:** React (Vite), Tailwind CSS, React Router, Axios, Socket.IO client, state management (Zustand/Context), recharts for the leaderboard/dashboard charts.
- **Deployment:** Docker Compose (API + Postgres + web) or simple single-host setup with environment-config.

## 9.1 Security Hardening

- **Rate limiting** — express-rate-limit on auth and AI-heavy endpoints to prevent abuse.
- **Brute-force protection** — login attempt throttling and lockout after repeated failures.
- **Session management** — refresh-token rotation, session revocation on password change, admin can revoke any session.
- **Input validation** — strict validation on all request bodies (zod/joi).
- **Secret hygiene** — API/SMTP credentials only in `.env`, never returned to the client.

---

## 10. UX / UI DESIGN SYSTEM (Strict Light-Mode)

- **Strict light-mode, premium SaaS aesthetic** — no dark components, no pitch-black backgrounds.
- **Backgrounds:** ultra-light slates/grays for maximum scannability.
- **Cards & structures:** pure white with soft, modern box-shadows.
- **Semantic colors:**
  - **Royal blue** — primary system actions (assign, submit, navigate).
  - **Soft emerald green** — successful approvals / passed evaluations.
  - **Amber** — revision states, warnings, near-deadline.
  - Red reserved for critical/overdue/overload.
- **Data layout:** high-density information with ample whitespace, clean borders, clear typographic hierarchy — **admin scans whole-team status in under five seconds**.

---

## 11. PHASE-2 / FUTURE ENHANCEMENTS (not in v1)

- Slack/email notifications.
- Team/board multi-project support.
- Advanced analytics: bottleneck heatmaps, capacity forecasting dashboards.
- Mobile-responsive worker terminal.

---

## 12. IMPLEMENTATION STATUS (v1 — LIVE)

The system is fully implemented and verified end-to-end. Live demo accounts: `admin@coo.app / admin123` (Agency Owner) and workers `alice@coo.app, bob@coo.app, carol@coo.app, dave@coo.app, elena@coo.app` (all `/ worker123`). Seeded as a **marketing agency**: client accounts (Aurora Skincare, GreenLeaf Organics, Vertex Fitness), specialist skills, and a live Aurora launch campaign on the Vision Canvas.

### Backend (Express + Prisma + PostgreSQL)
- ✅ 20+ models (User, Session, Worker, Skill, Product, Vision, Roadmap, Task, TaskDependency, Assignment, Submission, Evaluation, Revision, Appeal, AiDecision, LearningAdjustment, ApiUsageLog, TaskTemplate, RecurringInstance, Digest, EmailLog, Notification, ActivityLog, AvailabilityLog, BriefFeedback, Setting, Memory, Conversation, ConversationMessage)
- ✅ AI engine with graceful fallback: ingestion, decomposition, matching, evaluation, self-healing, auto-refill, scaling, learning, duplicates detection, RAG indexing, template scheduling
- ✅ 3-pass reasoning pipeline (research dossier → think → answer → self-review) with deterministic fallbacks at every stage
- ✅ Real-time Socket.IO with role-based rooms (`user:{id}`, `admins`) and events: `notification`, `queue_update`, `team_update`, `alert`
- ✅ Cron jobs: deadline watchdog (reminders/escalations), idle watchdog, evaluation queue, auto-refill, scaling, forecast, recurring templates, daily/weekly digests
- ✅ Worker email notifications via Nodemailer (SMTP opt-in), digest emails, password-reset emails
- ✅ Security: JWT (access+refresh) with session rotation, brute-force lockout (5 fails → 15 min lock), express-rate-limit, role-based access control, bcrypt
- ✅ Data export: full JSON backup + `tasks.csv` + `workers.csv`
- ✅ AI cost & usage monitor with configurable monthly USD budget + admin alerts
- ✅ Task dependencies: sequential roadmap deps created on vision approval; self-healing unlocks the next dependency when all blockers pass

### Frontend (React + Vite + Tailwind + recharts)
- ✅ **Chat-first home screen** — ChatGPT-style AI Assistant at `/` (admin): type a campaign brief, get a conversational reply + draft roadmap with AI-suggested tasks, tick extras, approve → tasks created and discussed assignees assigned automatically
- ✅ **AI-assisted client onboarding** — tell the AI about a new client; it builds a profile (name, description, target audience, platforms & channels, goals), asks for anything missing, and offers an editable "Add to portfolio" card (duplicate names rejected with a 409)
- ✅ **AI-assisted employee onboarding** — tell the AI about a new hire (e.g. *"hire a senior graphic designer named Fiona Lee"*); it detects the role, maps it to skills (designer → Graphic Design/Figma/Branding, social → Social Media/Community, etc.), asks for the missing email, and offers an editable "Add employee" card with seniority/capacity/skill chips — creates the login atomically and rejects duplicate emails
- ✅ **Collapsible sidebar** — collapse to icon-only rail with tooltips (state persisted in localStorage)
- ✅ **Intelligence layer** — every AI-chat reply is grounded in a live OPERATIONS SNAPSHOT (team load vs capacity, open-pool work, deadlines, skill gaps, historical pass rates). A deterministic recommendation engine ALWAYS surfaces data-driven advice (overloaded/idle workers, 48h deadline risk, skill gaps that block work, best-fit assignees per task by skill match + load) — so the assistant stays sharp even if the LLM is unreachable; LLM recommendations are merged with the data-driven ones
- ✅ **Research engine** — before every reply the AI-COO pulls a live RESEARCH DOSSIER of exactly what the owner is talking about: mentioned employees (load, skills, recent verdicts, pass rate), mentioned products (profile + recent work), mentioned skills, team load, deadlines in flight, open pool, recent evaluations, recently completed work and past AI decisions. The dossier is injected as evidence so the AI never guesses or forgets
- ✅ **Claude-Code-style reasoning** — a 3-pass pipeline: **THINK** (step-by-step analysis: intent, understanding, evidence, gaps, risks, plan) → **ANSWER** (final reply/draft grounded in the thinking + dossier) → **REVIEW** (a self-check pass that catches invented people, contradictions and missing details; issues surface as recommendations and in the UI). The thinking trace is persisted per message and shown as a collapsible "How the AI-COO thought about this" panel in the chat
- ✅ **Autonomous web research** — Claude-Code-style search-then-fetch: the AI-COO decides when it needs live data and calls `web_search` (DuckDuckGo HTML endpoint, free, no API key) + `web_fetch` (reads a specific page) in a bounded tool-calling loop (max 3 rounds / 6 calls). Findings are grounded into the answer, shown as a "Web sources consulted" panel (queries + clickable sources) in the chat, and persisted with the conversation. Fully fail-open: any search/fetch error degrades to the internal-knowledge answer. SSRF-safe (blocks localhost/private IPs), 15-min cache + ~600ms throttle to respect rate limits, and a `webResearchEnabled` toggle in Settings (default on, also controlled by `WEB_RESEARCH_ENABLED` in `.env`)
- ✅ **Model selection (DeepSeek V4 Pro / V4 Flash)** — choose Auto, V4 Pro or V4 Flash from a dropdown in the AI Assistant (and a default in Settings). **Auto** routes by task: V4 Flash handles the cheap think/review passes and quick Q&A, while planning, onboarding and strategy get V4 Pro (deepseek-v4-pro / deepseek-v4-flash — the retired deepseek-chat/reasoner aliases are no longer used). The model actually used is shown on each chat message, persisted with the conversation, and API usage logging tracks Pro/Flash at their real V4 prices
- ✅ **Persistent long-term memory** — the AI-COO extracts durable knowledge from every conversation (facts, preferences, decisions, lessons) via an LLM pass with deterministic fallback, dedupes near-duplicates, and injects the most relevant memories into every future chat — so it truly "knows everything" told to it in the past, across conversations and restarts
- ✅ **Persistent conversations** — every chat is saved to a thread (Conversations menu in the AI Assistant). Start a new chat, switch back to any past conversation, rename or delete threads; loaded threads restore the full transcript and any draft plan
- ✅ **AI Memory page** (`/memory`) — browse, search, filter by type, edit, delete, and pin memories; pinned memories are always injected into the AI context. Memories can also be added manually (e.g. "we never run ads without client approval")
- ✅ **Reliable AI transport** — retry-with-backoff + 60s timeout + native Node fetch for the OpenAI-compatible client (fixes DeepSeek "Premature close" on slow streaming responses, which previously caused silent fallback to generic drafts)
- ✅ **Assign Tasks wizard** (brain-dump → AI breakdown review → compatibility ranking with overrides → batch assign)
- ✅ Admin: Command Dashboard (live alerts), Vision Canvas, Roadmaps (dependency indicators), Capability Registry, Product Registry, Leaderboard (recharts quality trend), Employee Intelligence, Evaluation Oversight, AI Decision Audit, AI Cost Monitor, Task Templates, Digest History, Settings (rubric, escalation, scaling, auto-refill, AI budget, learning-adjustment revert), Data Export (JSON + CSV)
- ✅ Worker: My Queue (live socket reload, countdowns), Task Detail (status updates, work verification panel, timeline, evaluation verdict, appeal, brief-flag), My Performance, My Availability, Profile (email-notif toggle)
- ✅ Shared: Global Search, Profile (name/password), Forgot/Reset password
- ✅ Role-based route guards + auth context with token refresh
