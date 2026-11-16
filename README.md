# Outbox — Distributed Email Scheduler

A fault-tolerant email scheduling application built with **Node.js, Express, PostgreSQL, Redis, BullMQ, Nodemailer (Ethereal Email)** on the backend, and **React (Vite + Tailwind CSS)** on the frontend.

---

## Folder Structure (Monorepo)

```text
.
├── docker-compose.yml            # PostgreSQL 16 & Redis 7 (with AOF persistence enabled)
├── README.md                     # Setup, Architecture, Feature Checklist & Notes
├── backend/                      # Express API + BullMQ Producer, Worker & Crash Reconciler
│   ├── .env.example              # Template environment variables
│   ├── schema.sql                # PostgreSQL schema (also auto-initialized on server startup)
│   ├── package.json
│   └── src/
│       ├── index.js              # Express entrypoint + bootstrap sequence
│       ├── config/               # env.js, db.js (PostgreSQL), redis.js, mailer.js (Ethereal)
│       ├── middleware/           # JWT auth.js & API rateLimiter.js
│       ├── queues/               # emailQueue.js, emailWorker.js, reconciler.js
│       ├── routes/               # authRoutes.js, emailRoutes.js
│       └── scripts/              # generateEthereal.js CLI utility
└── frontend/                     # React 18 + Vite + Tailwind CSS Dashboard
    ├── .env.example
    ├── package.json
    └── src/
        ├── App.jsx               # Main dashboard view & live status polling
        ├── api/client.js         # Fetch wrapper with JWT bearer header
        ├── context/AuthContext.jsx
        └── components/           # LoginPage, Navbar, StatsBar, ComposeModal, EmailTable, EmailDetailModal
```

---

## 1. Step-by-Step Instructions to Run Locally

### Prerequisites
- **Node.js** (v18+ recommended) and **npm**
- **Docker & Docker Compose** (recommended for one-command Redis & PostgreSQL startup) — *or local instances of PostgreSQL (`:5432`) and Redis (`:6379`)*.

### Step 1: Start Redis and PostgreSQL
From the repository root, start the backing services using Docker Compose:
```bash
docker compose up -d
```
> **Note:** If you are running PostgreSQL and Redis natively without Docker, ensure a PostgreSQL database named `outbox_scheduler` exists and update `DATABASE_URL`, `REDIS_HOST`, and `REDIS_PORT` in `backend/.env`. The backend automatically runs `CREATE TABLE IF NOT EXISTS` on startup, so no manual migration step is required.

### Step 2: Configure & Start the Backend (Express + BullMQ Worker)
```bash
cd backend
npm install
cp .env.example .env
```

*(Optional)* Generate dedicated Ethereal Email SMTP credentials and automatically write them to `backend/.env`:
```bash
npm run generate-ethereal
```
*(If `ETHEREAL_USER` and `ETHEREAL_PASS` are left blank in `.env`, the backend will automatically provision a temporary Ethereal test account on startup and log the credentials to the console.)*

Start the backend server and embedded BullMQ worker:
```bash
npm run dev
```
The backend API and BullMQ worker will start on **`http://localhost:4000`**.

### Step 3: Configure & Start the Frontend (React + Vite)
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

### Step 4: Log In & Test
- Click **"1-Click Demo Login (`demo@outbox.io`)"** on the login page (or sign in with `demo@outbox.io` / `password123`, or register a new account).
- Click **"Compose & Schedule"** to schedule an email for a future time (or use the quick presets like `+15 sec`, `+1 min`).
- Click **"Simulate Bulk Load (12)"** in the top navigation bar to queue 12 emails simultaneously and watch BullMQ process them according to the concurrency and rate-limit settings.
- Once an email's status changes to **`SENT`**, switch to the **Sent Emails** tab and click **"View in Ethereal"** to open the rendered message directly on Ethereal Email.

---

## 2. How to Generate Ethereal Email Credentials & Configure `.env`

You can configure Ethereal SMTP credentials in two ways:

1. **Automated CLI Script (Recommended):**
   Run the included script inside `/backend`:
   ```bash
   cd backend
   npm run generate-ethereal
   ```
   This calls `nodemailer.createTestAccount()`, prints the SMTP credentials and web inbox login URL (`https://ethereal.email/login`), and automatically updates `ETHEREAL_USER` and `ETHEREAL_PASS` inside `backend/.env`.

2. **Manual Generation via Ethereal Website:**
   - Visit [https://ethereal.email/](https://ethereal.email/) and click **"Create Ethereal Account"**.
   - Copy the generated **Username** and **Password** into `backend/.env`:
     ```env
     ETHEREAL_HOST=smtp.ethereal.email
     ETHEREAL_PORT=587
     ETHEREAL_USER=your_generated_user@ethereal.email
     ETHEREAL_PASS=your_generated_password
     ```

### Complete `backend/.env` Reference
| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `4000` | Express server port |
| `JWT_SECRET` | `super_secret_outbox_jwt_key...` | Secret key used to sign authentication tokens |
| `DATABASE_URL` | `postgresql://postgres:postgrespassword@localhost:5432/outbox_scheduler` | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ |
| `REDIS_PORT` | `6379` | Redis port for BullMQ |
| `ETHEREAL_USER` | *(auto-generated if empty)* | Ethereal SMTP username |
| `ETHEREAL_PASS` | *(auto-generated if empty)* | Ethereal SMTP password |
| `WORKER_CONCURRENCY` | `5` | Number of BullMQ jobs processed concurrently |
| `RATE_LIMIT_MAX` | `10` | Max emails allowed within `RATE_LIMIT_WINDOW_MS` |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit time window in milliseconds (60,000ms = 1 min) |
| `MIN_SEND_DELAY_MS` | `500` | Minimum pacing delay (ms) between SMTP dispatches |

---

## 3. Architecture Overview

### A. How Scheduling Works (`emailQueue.js`)
1. When a user schedules an email via `POST /api/emails/schedule`, the backend first writes a record to PostgreSQL (`scheduled_emails` table) with `status = 'PENDING'` and a deterministic `job_id = email-<uuid>`.
2. Next, the scheduler computes the exact millisecond delay:
   ```js
   const delay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());
   ```
3. The job is added to the BullMQ queue (`outbox-email-queue`) with `{ jobId, delay }`. BullMQ stores delayed jobs in a Redis sorted set (`ZSET`) scored by their target execution timestamp and automatically promotes them to the active waiting list as soon as the timestamp arrives.

### B. How Persistence Across Crashes & Restarts is Handled (`reconciler.js` + Dual Storage)
Persistence is guaranteed through a **three-layer defense**:
1. **PostgreSQL Source of Truth:** Every scheduled email is committed to PostgreSQL *before* being queued in BullMQ.
2. **Redis AOF Persistence:** In `docker-compose.yml`, Redis runs with `--appendonly yes --maxmemory-policy noeviction` so BullMQ delayed jobs survive Redis container restarts.
3. **Startup Crash Reconciler (`reconcilePendingEmails`):** Whenever the Node.js server starts up (or recovers from a crash), `reconciler.js` queries PostgreSQL for all emails in `PENDING` or `PROCESSING` state:
   - It inspects BullMQ to check whether each deterministic `jobId` (`email-<uuid>`) still exists in Redis.
   - If a job is missing (e.g., Redis was wiped) or was interrupted mid-flight (`PROCESSING` during a process crash), the reconciler resets its status to `PENDING` and re-queues it with `delay = Math.max(0, scheduledAt - Date.now())`. If `scheduledAt` passed while the server was down, `delay` evaluates to `0` and the email is sent immediately upon startup.
   - **Idempotency Guard:** Before sending, the worker executes an atomic `UPDATE ... WHERE id = $1 AND status IN ('PENDING', 'PROCESSING') RETURNING *`. If an email was already marked `SENT` or `CANCELLED`, the worker skips it, preventing duplicate deliveries.

### C. How Rate Limiting & Concurrency Are Configured (`emailWorker.js` & `rateLimiter.js`)
1. **Worker Concurrency (`WORKER_CONCURRENCY=5`):** Configured on the BullMQ `Worker` instance (`concurrency: config.queue.workerConcurrency`). Controls the maximum number of email jobs processed in parallel.
2. **Queue-Level Rate Limiting (`RATE_LIMIT_MAX=10`, `RATE_LIMIT_WINDOW_MS=60000`):** Configured using BullMQ's native token-bucket limiter (`limiter: { max: 10, duration: 60000 }`). When a bulk spike occurs (e.g., 50 emails scheduled for the same second), BullMQ processes up to 10 emails within the 60-second window and automatically delays the remaining jobs into the next window without dropping any jobs.
3. **SMTP Pacing (`MIN_SEND_DELAY_MS=500`) & Connection Pooling:** Nodemailer is configured with `pool: true` and `maxConnections: WORKER_CONCURRENCY`, alongside a configurable pacing delay (`500ms`) so rapid bursts do not trigger upstream SMTP throttling.
4. **HTTP API Rate Limiting (`express-rate-limit`):** Protects the Express REST endpoints (`/api/emails/schedule`) against request flooding.

---

## 4. Feature Checklist

| Requirement | Component / File | Status |
| :--- | :--- | :---: |
| **Backend: Node.js + Express** | `backend/src/index.js`, `backend/src/routes/*` | ✅ Implemented |
| **Backend: PostgreSQL Database** | `backend/src/config/db.js`, `backend/schema.sql` | ✅ Implemented |
| **Backend: Redis + BullMQ Job Queue** | `backend/src/config/redis.js`, `backend/src/queues/emailQueue.js` | ✅ Implemented |
| **Email Service: Ethereal Email + Nodemailer** | `backend/src/config/mailer.js`, `backend/src/scripts/generateEthereal.js` | ✅ Implemented |
| **Core Backend: Future Time Scheduler** | `POST /api/emails/schedule` + `scheduleEmailJob()` delayed jobs | ✅ Implemented |
| **Core Backend: Crash & Restart Persistence** | PostgreSQL + Redis AOF + `backend/src/queues/reconciler.js` | ✅ Implemented |
| **Core Backend: Rate Limiting & Concurrency** | BullMQ `concurrency` & `limiter` in `emailWorker.js` + `rateLimiter.js` | ✅ Implemented |
| **Core Frontend: User Authentication (Login)** | `frontend/src/components/LoginPage.jsx` + JWT auth + 1-click Demo Login | ✅ Implemented |
| **Core Frontend: Compose & Schedule Modal** | `frontend/src/components/ComposeModal.jsx` (single/multi recipient, presets) | ✅ Implemented |
| **Core Frontend: Scheduled & Sent Tables** | `frontend/src/components/EmailTable.jsx`, `StatsBar.jsx`, Ethereal links | ✅ Implemented |

---

## 5. Notes: Assumptions, Shortcuts & Trade-offs

1. **Co-located Express Server & BullMQ Worker:**
   - *Trade-off:* For simplicity in local evaluation, the BullMQ Worker (`startEmailWorker()`) is started inside the main Express process (`backend/src/index.js`) so a reviewer only needs to run `npm run dev` in `/backend`.
   - *Production Evolution:* In a high-scale production deployment, `emailWorker.js` can be run as a separate microservice process scaled horizontally across multiple containers while sharing the same Redis & PostgreSQL instances.
2. **Polling vs. WebSockets for Dashboard Updates:**
   - *Trade-off:* The React dashboard polls `GET /api/emails` every 3 seconds (and runs a 1-second local countdown timer) to reflect job transitions from `PENDING` → `PROCESSING` → `SENT` automatically. This avoids WebSocket/Socket.IO connection state complexity while still providing near-instant visual feedback.
3. **Automatic Schema Initialization & Ethereal Account Fallback:**
   - *Shortcut for Developer Experience:* To reduce setup friction during grading, `initDatabase()` automatically creates the PostgreSQL tables and seeds a `demo@outbox.io` user on startup, and `initMailer()` automatically provisions a live Ethereal test account if `ETHEREAL_USER` / `ETHEREAL_PASS` are left blank in `.env`.
4. **Plain-Text / Auto-HTML Email Body:**
   - *Assumption:* Users compose plain-text bodies in the modal, which the mailer sends as both `text` and basic HTML-formatted `<div>` content.

---

## 6. Packaging & GitHub Submission Commands

To push this monorepo to a private GitHub repository and grant collaborator access to **`Mitrajit`**:

```bash
git init
git add .
git commit -m "feat: complete Outbox email scheduler with BullMQ, Redis, PostgreSQL, Ethereal, and React dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-private-repo>.git
git push -u origin main
```
Then in your GitHub repository:
1. Go to **Settings → Collaborators → Add people**.
2. Enter GitHub username **`Mitrajit`** and send the invitation.
