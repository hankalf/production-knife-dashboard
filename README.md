# Safety Knife Checkout System

A tablet-first web app for tracking pre-numbered food-production safety knives through
their full lifecycle: **operator checkout → sanitation cleaning → QA inspection → back in
service**. A knife can only be checked out after it has passed QA, and any knife kept out
past its time limit (default one day) is flagged overdue. Every action is recorded for
food-safety auditing.

## Lifecycle

```
AVAILABLE ──checkout(operator)──▶ CHECKED_OUT ──return(operator)──▶ DIRTY
   ▲                                                                   │
   │                                                          clean(sanitation)
   │                                                                   ▼
   └────────────────── QA pass(QA) ◀───────────────────────────── CLEANED
                                                                       ▲
                                        QA fail(QA) ───────────────────┘ (back to DIRTY)
```

- **Overdue** is derived (a checked-out knife past its due time), shown in red with a banner.
- **Out of service** — admins can retire damaged/lost knives and restore them later.

## Roles (identified by PIN)

| Role | Can do |
|------|--------|
| Operator | Check out an available knife; return **their own** checked-out knife after use |
| Sanitation | Mark used (dirty) knives cleaned — one at a time or in a batch |
| QA | Pass cleaned knives back into service (single or batch), or fail one (with a reason) back to sanitation |
| Admin | Add knives, retire/restore, manage workers & PINs, set the time limit, export the audit log, return any knife |

A worker can hold multiple roles. Only the operator who checked a knife out (or an admin)
can return it, so returns are attributed to the right person.

## Screens

- **`/`** — live color-coded fleet board; tap a knife to act on it. Sanitation/QA get a
  **batch mode** to clear many knives at once.
- **`/reports`** *(any signed-in worker)* — end-of-day sweep of everything still checked out,
  plus fleet metrics: average sanitation→QA turnaround, QA fail rate, and most-used knives.
- **`/kiosk`** — full-screen status board for a wall-mounted display (auto-refreshes).
  Floor staff can check out, check in, and mark cleaned right on the kiosk, confirming
  each action with their PIN. A supervisor can **lock the kiosk to view-only** (from the
  kiosk with an admin PIN, or from Admin → Kiosk mode); locking is enforced server-side.
- **`/admin`** *(admin)* — add knives, retire/restore, manage workers, set the time limit,
  export the full audit log to CSV, and configure **email alerts** (see below).
- **`/knife/<number>`** — a single knife's complete lifecycle history.

## Tech stack

- **Next.js (App Router, TypeScript)** — single deployable full-stack app
- **PostgreSQL + Prisma** — managed database with versioned migrations
- **Tailwind CSS** — touch-friendly, tablet-first UI

## Getting started

You need a PostgreSQL database. The quickest way locally is the bundled Docker Compose file:

```bash
docker compose up -d      # starts Postgres on localhost:5432 (matches .env)
npm install
npm run db:migrate        # apply migrations (creates the tables)
npm run db:seed           # seed 42 knives (1–14, 51–64, 65–78) + starter workers
npm run dev               # http://localhost:3000
```

Already have a Postgres you'd rather use? Put its connection string in `DATABASE_URL`
(in `.env`) and skip the `docker compose` step.

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
