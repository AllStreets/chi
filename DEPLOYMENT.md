# Deployment Guide

Chicago Explorer deploys as **one Vercel project** containing two services:

| Service    | Root        | Framework | Serves      |
|------------|-------------|-----------|-------------|
| `frontend` | `frontend/` | Vite      | the SPA     |
| `backend`  | `backend/`  | Express   | `/api/*`    |

Both sit behind a single domain, so the SPA calls `/api/...` on its own origin —
no CORS setup and no `VITE_API_URL` to keep in sync. Routing lives in
[`vercel.json`](./vercel.json).

---

## 1. Deploy

```bash
npm i -g vercel
vercel            # first run links/creates the project
vercel --prod
```

Or import the repo at [vercel.com/new](https://vercel.com/new) — `vercel.json`
is picked up automatically and both services are detected. No build settings
need to be entered in the dashboard.

---

## 2. Environment variables

Set these in **Project → Settings → Environment Variables** (Production and
Preview). [`.env.example`](./.env.example) is the same list in copyable form.

### API keys

| Variable | Required | Description |
|---|---|---|
| `OPENWEATHER_API_KEY` | Yes | OpenWeatherMap — [openweathermap.org](https://openweathermap.org) |
| `OPENWEATHER_KEY` | Yes | Same value again — two routes read different names |
| `CTA_API_KEY` | Yes | CTA Train Tracker — [transitchicago.com/developers](https://www.transitchicago.com/developers/) |
| `TICKETMASTER_KEY` | Yes | Ticketmaster Discovery — [developer.ticketmaster.com](https://developer.ticketmaster.com) |
| `TICKETMASTER_API_KEY` | Yes | Same value again |
| `OPENAI_API_KEY` | Yes | Powers the AI streaming — [platform.openai.com](https://platform.openai.com) |
| `ANTHROPIC_API_KEY` | No | Alternative AI provider |
| `YELP_API_KEY` | No | Place enrichment |

### Build-time (exposed to the browser)

| Variable | Required | Description |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | Yes | Mapbox public token — [mapbox.com](https://mapbox.com) |
| `VITE_API_URL` | No | **Leave unset.** The SPA calls `/api` on its own origin. Only set this if you host the API elsewhere. |

These are read at build time, so changing them needs a redeploy.

### Cron and push

| Variable | Required | Description |
|---|---|---|
| `CRON_SECRET` | Yes, for cron | Any long random string — `openssl rand -hex 32`. Without it `/api/cron/*` returns 503 rather than being publicly triggerable. |
| `VAPID_PUBLIC_KEY` | No | Web push — generate with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | No | " |
| `VAPID_EMAIL` | No | `mailto:you@example.com` |

### Optional

| Variable | Description |
|---|---|
| `FRONTEND_URL` | An extra browser origin to allow through CORS. Same-origin requests from the deployed SPA need nothing here. |
| `SQLITE_PATH` | Overrides the database location. Defaults to `/tmp/chicago.db` on Vercel, `backend/chicago.db` locally. |

---

## 3. Scheduled jobs

Locally, `server.js` starts two `setInterval` timers. On Vercel there is no
process between requests, so the same work runs through **Vercel Cron** hitting
guarded endpoints instead:

| Endpoint | Replaces | Does |
|---|---|---|
| `/api/cron/cta` | `lib/ctaRecorder.js` | One CTA train-position snapshot |
| `/api/cron/alerts` | `lib/alertEngine.js` | One pass of the push-alert condition checks |

Both require `Authorization: Bearer $CRON_SECRET`, which Vercel Cron sends
automatically. The schedules in `vercel.json` are **daily**, because that is the
Hobby plan's limit. On Pro, tighten them to match the original timers:

```json
"crons": [
  { "path": "/api/cron/cta",    "schedule": "* * * * *"   },
  { "path": "/api/cron/alerts", "schedule": "*/5 * * * *" }
]
```

---

## 4. Known limitation — storage is ephemeral

Vercel's filesystem is read-only apart from `/tmp`, and `/tmp` does not survive
cold starts or get shared between instances. `backend/db.js` therefore points at
`/tmp/chicago.db` in production.

Every table is created on demand, so this is safe — but it splits into two very
different behaviours:

**Works fine.** The API response caches (`yelp_cache`, `cta_routes_cache`). They
refill on the next request; a cold start just means one slower call.

**Does not meaningfully work.** Anything expected to persist:

- `me_favorites`, `me_visited`, `me_bucket` — a user's saved places reset on cold start
- `push_subscriptions` — subscriptions are lost, so the alert cron has nobody to notify
- `cta_snapshots` — the Transit time-machine reads from a different instance than the cron wrote to, so history stays empty
- `alert_log` — dedupe is best-effort, so an alert can repeat

The cron endpoints are correct and fully wired; they become genuinely useful the
moment those tables move to durable storage. Fixing this means putting those
tables on a real database — Vercel Postgres, Neon, or Turso (which keeps the
SQLite dialect, so `routes/me.js` and `routes/push.js` change least). The cache
tables can stay in `/tmp`.

If you need persistence now without that work, host `backend/` on a platform
with a disk (Railway, Fly, Render), set `VITE_API_URL` to that host, and deploy
only the frontend service to Vercel.

---

## Local development

```bash
npm run install:all

# terminal 1 — API on :3001
npm run dev:api

# terminal 2 — SPA on :5173
npm run dev
```

In dev the SPA falls back to `http://localhost:3001` automatically, so
`VITE_API_URL` can stay empty. Copy `backend/.env.example` → `backend/.env` and
`frontend/.env.example` → `frontend/.env` and fill in your keys. Both `.env`
files are gitignored.

```bash
npm test    # backend Jest + Supertest, then frontend Vitest
```
