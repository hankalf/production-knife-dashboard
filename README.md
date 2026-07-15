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
| Sanitation | Mark used (dirty) knives cleaned — one at a time or in a batch |
| QA | Pass cleaned knives back into service (single or batch), or fail one (with a reason) back to sanitation; open the admin panel |
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
  plus fleet metrics: average sanitation→QA turnaround, QA fail rate, and most-used knives.
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

## Run it on Docker Desktop (whole app)

With Docker Desktop running, one command builds the app image and starts it alongside
PostgreSQL:

```bash
docker compose up --build
```

Then open **http://localhost**. On first boot the app applies the database migrations
and seeds the fleet automatically, so it's ready to use. Sign in with the default PINs below.

- The app is published on **port 80**, so no `:3000` is needed in the URL.
- Data persists in the `knife_pgdata` volume across restarts.
- Stop with `Ctrl+C` (or `docker compose down`); wipe the database with `docker compose down -v`.
- Rebuild after code changes with `docker compose up --build`.

### A custom hostname on your LAN (e.g. `http://knives.local`)

Docker serves the app on port 80; the friendly **name** is resolved by your network. Point a
name at the Docker host with any one of:

- **mDNS** — name the host machine `knives`; it answers as `knives.local` on the LAN (no config
  on most networks).
- **Local DNS** — add a record on your router or Pi-hole/AdGuard: `knives.lan` → host IP.
- **Hosts file** — on a device, add `‹host-ip›  knives.local` to `/etc/hosts` (or the Windows
  hosts file).

Then browse to `http://knives.local`. (For a clean hostname **with HTTPS**, see the Caddy
reverse-proxy variant on the `claude/docker-url-caddy` branch.)

## Getting started (local dev without Docker for the app)

You need a PostgreSQL database. The quickest way is to run **just the database** from the
compose file and develop the app with `npm run dev`:

```bash
docker compose up db -d    # starts Postgres on localhost:5432 (matches .env)
npm install
npm run db:migrate         # apply migrations (creates the tables)
npm run db:seed            # seed 42 knives (1–14, 51–64, 65–78) + starter workers
npm run dev                # http://localhost:3000
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
