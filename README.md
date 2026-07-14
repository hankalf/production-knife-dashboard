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
- **`/kiosk`** — full-screen, read-only status board for a wall-mounted display (auto-refreshes).
- **`/admin`** *(admin)* — add knives, retire/restore, manage workers, set the time limit,
  export the full audit log to CSV, and configure **email alerts** (see below).
- **`/knife/<number>`** — a single knife's complete lifecycle history.

## Tech stack

- **Next.js (App Router, TypeScript)** — single deployable full-stack app
- **SQLite + Prisma** — file-based database, no external services
- **Tailwind CSS** — touch-friendly, tablet-first UI

## Getting started

```bash
npm install
npm run db:push     # create the SQLite schema
npm run db:seed     # seed 42 knives (1–14, 51–64, 65–78) + starter workers
npm run dev         # http://localhost:3000
```

### Default PINs (change these in Admin)

| Role | PIN |
|------|-----|
| Admin (all roles) | `0000` |
| Operator | `1111` |
| Sanitation | `2222` |
| QA | `3333` |

### Useful scripts

- `npm run db:reset` — wipe and re-seed the database
- `npm run build && npm start` — production build/run
- `npx prisma studio` — inspect the database (knives, events, workers)

## Deployment (recommended)

Run as a **single self-hosted app** on one machine on the plant network:

```bash
npm run build
npm start   # serves on port 3000
```

Point tablets/desktops at `http://<that-machine>:3000`. Keeps working without internet,
keeps data on-site, and the whole database is one file (`prisma/dev.db`) that's trivial to
back up nightly.

## Deploy a test on Railway

Railway gives you a public URL you can open on any device (including a floor tablet).
The repo is already set up for it (`railway.json` + a `start:prod` script that creates the
schema and seeds the fleet on boot).

1. Push this branch to GitHub (already done).
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** →
   pick `production-knife-dashboard` and the `claude/safety-knife-checkout-system-999z8h` branch.
3. Railway auto-detects Next.js, runs `npm run build`, then `npm run start:prod`. When the deploy
   finishes, open **Settings → Networking → Generate Domain** to get your public URL.
4. Sign in with the default PINs (Admin `0000`, Operator `1111`, Sanitation `2222`, QA `3333`).

**Data persistence (optional but recommended).** This app uses a single SQLite file. Without a
volume, Railway's disk is ephemeral, so your test data resets on each redeploy (the fleet is
re-seeded on every boot, so the app still works fine — you just lose in-progress checkouts).
To keep data across deploys:

- Add a **Volume** to the service, mounted at `/data`.
- Set an environment variable `DATABASE_URL=file:/data/prod.db`.

That's it — the seed is idempotent, so redeploys won't duplicate knives or workers.

> For a permanent multi-user production install, prefer Postgres (Railway one-click) over
> SQLite; ask and I'll switch the Prisma datasource and add migrations.

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
