# Safety Knife Checkout System

A tablet-first web app for tracking pre-numbered food-production safety knives through
their full lifecycle: **operator checkout → sanitation cleaning → back in service**. A knife
kept out past its time limit (default one day) is flagged overdue. Every action is recorded
for food-safety auditing.

## Lifecycle

```
AVAILABLE ──checkout(operator)──▶ CHECKED_OUT ──return(operator)──▶ DIRTY
   ▲                                                                   │
   └──────────────── clean & return to service(sanitation) ◀──────────┘
```

Cleaning returns a knife straight to service — there is no separate QA-inspection step.

- **Overdue** is derived (a checked-out knife past its due time), shown in red with a banner.
- **Out of service** — admins/QA can retire damaged/lost knives and restore them later.

### Knife type

Each knife is **Food Contact (FC)** or **Non-Food Contact (NFC)**, shown as a corner badge on
every tile — **blue FC**, **silver NFC** — on both the board and the kiosk (the tile fill still
shows lifecycle status). Set the type when adding a knife, or change it later from the knife's
action modal (admin/QA). New knives default to FC.

## Roles (identified by PIN)

| Role | Can do |
|------|--------|
| Operator | Check out an available knife; return **their own** checked-out knife after use |
| Sanitation | Clean used (dirty) knives, returning them straight to service — one at a time or in a batch |
| QA | Supervisory role with admin-panel access (there is no separate QA inspection step) |
| Admin | **Everything** — all operator/sanitation/QA functions, plus add knives, retire/restore, manage workers & PINs, set the time limit, lock the kiosk, and export the audit log |

A worker can hold multiple roles, and **admins implicitly have every capability**. Only the
operator who checked a knife out (or an admin) can return it, so returns are attributed to the
right person.

## Access & the admin panel

- The whole app **except the kiosk** is gated: visiting the board, reports, or a knife's
  history shows a **full-screen PIN sign-in** first — nothing is viewable until you enter a
  valid PIN. The **`/kiosk`** wall display stays open (no sign-in) so a shared screen can
  always show status.
- The **admin panel** (`/admin`) is limited to **admins and QA**, and requires its own PIN
  entry each visit (a short re-auth) even if you're already signed in on the board.
- Floor actions on the board and kiosk are gated by role — each person only sees the actions
  they're allowed to take.

## Screens

- **`/`** — live color-coded fleet board; tap a knife to act on it. Sanitation/QA get a
  **batch mode** to clear many knives at once.
- **`/reports`** *(any signed-in worker)* — end-of-day sweep of everything still checked out,
  plus fleet metrics: average return→clean turnaround, total cleanings, and most-used knives.
- **`/kiosk`** — full-screen status board for a wall-mounted display (auto-refreshes).
  Floor staff can check out, check in, and mark cleaned right on the kiosk, confirming
  each action with their PIN and optionally **adding a note** (e.g. sanitation flagging
  residue) that lands in the audit trail. A supervisor can **lock the kiosk to view-only**
  (from the kiosk with an admin/QA PIN, or from Admin → Kiosk mode); locking is enforced
  server-side.
- **`/admin`** *(admin)* — add knives, retire/restore, manage workers, set the time limit,
  export the full audit log to CSV, and configure **email alerts** (see below).
- **`/knife/<number>`** — a single knife's complete lifecycle history.

## Tech stack

- **Next.js (App Router, TypeScript)** — single deployable full-stack app
- **PostgreSQL + Prisma** — managed database with versioned migrations
- **Tailwind CSS** — touch-friendly, tablet-first UI

> **Deployment targets:** `main` is set up for **Railway** and **Render** (see below), which
> build the app with their native Node builders. The full **Docker Desktop** setup
> (Dockerfile + Compose) lives on the **`claude/docker-desktop`** branch, so it doesn't
> interfere with those hosts.

## Getting started (local dev)

You need a PostgreSQL database. Start a throwaway one with Docker (or use any Postgres and
put its URL in `.env`), then run the app:

```bash
docker run -d --name knife-db \
  -e POSTGRES_USER=knife -e POSTGRES_PASSWORD=knife -e POSTGRES_DB=knifedb \
  -p 5432:5432 postgres:16       # or use your own Postgres + set DATABASE_URL in .env
npm install
npm run db:migrate               # apply migrations (creates the tables)
npm run db:seed                  # seed 42 knives (1–14, 51–64, 65–78) + starter workers
npm run dev                      # http://localhost:3000
```

To run the whole app in containers instead, use the **`claude/docker-desktop`** branch
(`docker compose up --build`).

### Default PINs (change these in Admin)

| Role | PIN |
|------|-----|
| Admin (all roles) | `0000` |
| Operator | `1111` |
| Sanitation | `2222` |
| QA | `3333` |

### Useful scripts

- `npm run db:migrate:dev` — create a new migration after editing the schema
- `npm run db:reset` — drop, re-migrate, and re-seed the database
- `npm run build && npm start` — production build/run
- `npx prisma studio` — inspect the database (knives, events, workers)

## Deploy on Render (Blueprint)

The repo includes a `render.yaml` Blueprint that provisions the web service **and** a
PostgreSQL database together.

1. In [Render](https://render.com): **New → Blueprint**, connect this repo, pick `main`, and
   **Apply**. Render reads `render.yaml` and creates the `safety-knife-checkout` web service
   plus the `knife-db` Postgres, wiring `DATABASE_URL` automatically.
2. On first deploy the app applies migrations and seeds the fleet, then serves. Open the URL
   Render gives you and sign in with the default PINs below.

The Blueprint uses Render's entry paid plans (`starter` web + `basic-256mb` Postgres) so the
service stays awake and the database is persistent; adjust the `plan:` values to size up/down.

## Deploy on Railway

Railway gives you a public URL you can open on any device (including a floor tablet), and
this repo is set up so it deploys with almost no configuration. `start:prod` applies
database migrations and seeds the fleet on every boot.

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   and pick `production-knife-dashboard` (choose the branch you want to deploy).
2. In the same project, click **New → Database → Add PostgreSQL**. Railway provisions it and
   exposes its connection string as a `DATABASE_URL` variable.
3. Open your app service → **Variables** → add a reference variable
   **`DATABASE_URL`** = `${{Postgres.DATABASE_URL}}` (Railway autocompletes this once the
   Postgres service exists), so the app points at the database.
4. Railway builds with `npm run build`, then runs `npm run start:prod` (migrate → seed →
   serve). When it's green, open **Settings → Networking → Generate Domain** for your URL.
5. Sign in with the default PINs — **Admin `0000`, Operator `1111`, Sanitation `2222`,
   QA `3333`** — and change them in Admin.

Data lives in the Postgres service and persists across redeploys. The seed is idempotent,
so redeploys never duplicate knives or workers.

## Audit log

Every transition writes an immutable `KnifeEvent` (knife, action, from/to status, worker,
timestamp, note). View a single knife's history at `/knife/<number>`, or export the full
log to CSV from the Admin screen (`/api/export`).

## Email alerts (setup only — delivery not connected yet)

The Admin screen has an **Email alerts** panel where you can set the recipient
addresses and choose what to be notified about (a knife going overdue, and/or the
end-of-day sweep of knives still checked out). These preferences are saved to the
`Setting` store (`email.*` keys), but **no emails are sent yet** — the sending layer
(SMTP/provider + a scheduled job for the daily sweep) is intentionally left unwired.
Hooking it up later means reading these settings and adding a mailer; the config UI is
already in place.

## Ideas reserved for later

- QR/barcode scanning — the schema already has a `scanCode` field per knife.
- Connecting the email/SMS delivery layer to the alert preferences above.
