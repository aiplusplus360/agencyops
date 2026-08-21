# AgencyOps — AI-COO Task Manager

**AgencyOps** is a **Closed-Loop AI Agency Operations Engine** built for marketing agencies — an automated executive (AI-COO) that ingests your raw campaign brain-dumps, decomposes them into a 15–90 day roadmap, auto-assigns tasks to the right specialists (content, paid media, social, design, web), grades every submission against a strict client-ready rubric, and self-heals the roadmap.

> **How simple is it for the agency owner?** Your main screen is a ChatGPT-style chat. You tell the AI what to do ("set up Google Ads for Vertex Fitness, give it to Bob"), the AI replies with a draft plan and suggests extras, and when you hit **Approve**, the tasks are created — named people get their tasks instantly, the rest go to the open pool for automatic routing. No forms, no spreadsheets.

---

## The Core Loop

```
[ Admin Brain-Dump ]
        │
        ▼
[ AI Ingestion Engine ] ──► [ 15-90 Day Roadmap Matrix ]
                                    │
                            (Auto-Allocates)
                                    │
                                    ▼
[ Worker Execution Queue ] ◄──(Revisions)── [ AI Evaluation Engine ]
        │                                          ▲
        └──────────────(Submits Work)──────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, Socket.IO, node-cron |
| AI | DeepSeek (OpenAI-compatible client) with deterministic fallback |
| Database | PostgreSQL, Prisma ORM |
| Frontend | React 18, Vite, Tailwind CSS, React Router |
| Email | Nodemailer (SMTP) for digests + worker notifications |
| Security | JWT (access + refresh), bcrypt, rate limiting, session revocation |

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (local install or Docker)

### 1. Database
A local PostgreSQL at `E:\PostgreSQL` (password `REDACTED`) is configured in `backend/.env`. The `task_manager` database already exists. To create it again if needed:

```bash
psql -U postgres -c "CREATE DATABASE task_manager;"
```

### 2. Backend

```bash
cd backend
npm install
npm run migrate       # applies prisma migrations
npm run seed          # creates demo users + product
npm run dev           # starts on http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev           # starts on http://localhost:5173
```

### 4. Configure AI + Email (`backend/.env`)

```env
DEEPSEEK_API_KEY=sk-...     # your DeepSeek key
SMTP_HOST=smtp.example.com  # for daily/weekly admin digests
SMTP_USER=...
SMTP_PASS=...
DIGEST_EMAIL=you@example.com
```

> **No API key / out of balance?** The AI engines degrade gracefully to deterministic fallbacks, so the whole closed loop still works for development.

---

## Demo Accounts (after seed)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@coo.app` | `admin123` |
| Worker | `alice@coo.app` | `worker123` |
| Worker | `bob@coo.app` | `worker123` |
| Worker | `carol@coo.app` | `worker123` |
| Worker | `dave@coo.app` | `worker123` |

---

## The Admin Experience (5-second scan)

1. **Command Dashboard** — workload, overdue, evaluations, team snapshot
2. **Assign Tasks** — pick tasks → see the AI's ranked compatibility shortlist → one click assign
3. **Roadmaps** — 15/30/60–90 day horizons with live progress
4. **Capability Registry** — skills, seniority, capacities, adaptive scaling
5. **Product Registry** — permanent product memory the AI references
6. **Leaderboard & Employee Intelligence** — who's most useful, on-time rates, estimation accuracy, action logs
7. **Evaluation Oversight** — override AI grades (the AI learns from your overrides) + handle appeals
8. **AI Decision Audit & Cost Monitor** — full transparency into autonomous decisions
9. **Digests** — daily/weekly email reports
10. **Global Search & Data Export**

## The Worker Experience (zero clutter)

- Strict linear queue with **ticking deadline countdowns**
- Status buttons: *Start working on it* / *Can't do it* (auto re-routes) / submit
- Work verification panel + execution logs → AI evaluation
- Grade appeals, availability self-service (auto-rebalances queue), brief-feedback flag
- Personal performance history

---

## Autonomous Behaviors (the "no prompts needed" parts)

| Engine | What it does |
|---|---|
| **Auto-Refill** | When a worker's queue drops below threshold, the AI generates + assigns new tasks automatically |
| **Self-Healing** | Failed submissions → revision tasks; passes → unlock next dependency |
| **Scaling** | Worker effective capacity adjusts up/down from quality + on-time trends |
| **Escalation Ladder** | Reminders at 24/4/1h, then overdue escalation, then admin flag |
| **Idle Watchdog** | Flags tasks not started within N hours |
| **Forecast** | Predicts overload risk 7 days ahead |
| **Deadline Discipline** | Strict deadlines graded into every evaluation (deadline weight 20%) |
| **Learning** | Rubric weights adjust from repeated admin overrides |
| **Duplicates** | Brain-dump cross-checked against existing work |

---

## Repo Layout

```
backend/
  prisma/schema.prisma    # 30+ models: users, workers, tasks, evaluations, AI decisions…
  src/
    services/ai/          # ingestion, matching, evaluation, scaling, auto-refill, learning…
    routes/               # 25+ REST route modules
    jobs/cron.js          # watchdog + digest + refill schedulers
    index.js              # Express + Socket.IO
frontend/
  src/pages/admin/        # full admin suite
  src/pages/worker/       # worker terminal
  src/pages/shared/       # search, notifications
  src/context/            # auth + socket
docker-compose.yml        # optional Docker dev stack
```

See `FEATURES.md` for the full specification.
