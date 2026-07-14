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
| Operator | Check out an available knife; return it after use |
| Sanitation | Mark a used (dirty) knife cleaned |
| QA | Pass a cleaned knife back into service, or fail it (with a reason) back to sanitation |
| Admin | Add knives, retire/restore, manage workers & PINs, set the time limit, export the audit log |

A worker can hold multiple roles.

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

## Audit log

Every transition writes an immutable `KnifeEvent` (knife, action, from/to status, worker,
timestamp, note). View a single knife's history at `/knife/<number>`, or export the full
log to CSV from the Admin screen (`/api/export`).

## Ideas reserved for later

- QR/barcode scanning — the schema already has a `scanCode` field per knife.
- End-of-day sweep report, fleet turnaround metrics, and a wall-mounted kiosk view.
