# TRACE

TRACE is a **production website observation system**. It launches a real Chromium browser, loads the real site, and records what actually happened: console output, JavaScript exceptions, network traffic, performance, accessibility, security headers, cookies, and more.

TRACE is **not** a penetration-testing tool. It does not exploit applications, replay destructive HTTP methods, submit payment or account forms, or store secrets.

## Architecture

```
Client (Expo) → Fastify API → BullMQ (Redis) → Scanner worker → Playwright Chromium → target
                                         ↘ PostgreSQL (observations + reports)
```

Scans are queued. `POST /api/scans` returns `{ scanId, status: "queued" }` immediately. Progress is available via `GET /api/scans/:id/status` and SSE `GET /api/scans/:id/events`.

## Setup

```bash
cp .env.example .env
npm install
npx playwright install chromium
docker compose up -d postgres redis
npm run migrate
```

Local fixture scans require `ALLOW_LOCAL_TARGETS=true` in `.env`.

## Development

```bash
npm run docker:up
npm run migrate
npm run worker      # terminal 1
npm run dev         # terminal 2 — API on :3001
npm start           # Expo client
```

The Expo client uses `EXPO_PUBLIC_API_URL` (default `http://localhost:3001`).

## Docker

```bash
docker compose up --build
```

Services: PostgreSQL, Redis, API, worker (Playwright image). Artifacts persist in a volume.

## Environment

See `.env.example`. Required:

- `DATABASE_URL`
- `REDIS_URL`
- `API_BASE_URL` / `API_PORT`
- `ALLOW_LOCAL_TARGETS` (false in production)
- Scan limits: `SCAN_MAX_PAGES`, `SCAN_MAX_DURATION`, `SCAN_BROWSER_CONCURRENCY`

Never commit secrets. Never put secrets in the mobile app.

## API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/scans` | Create scan, returns queued |
| GET | `/api/scans` | List |
| GET | `/api/scans/:id` | Metadata |
| GET | `/api/scans/:id/status` | Status |
| GET | `/api/scans/:id/results` | Full observed report |
| GET | `/api/scans/:id/issues` | Deduplicated issues |
| GET | `/api/scans/:id/pages` | Pages |
| GET | `/api/scans/:id/network` | Network events |
| GET | `/api/scans/:id/console` | Console |
| GET | `/api/scans/:id/performance` | Vitals |
| GET | `/api/scans/:id/security` | Header/TLS/cookie findings |
| GET | `/api/scans/:id/accessibility` | axe-core |
| GET | `/api/scans/:id/export` | JSON export |
| GET | `/api/scans/:id/events` | SSE progress |
| POST | `/api/scans/:id/cancel` | Cancel |

Create body:

```json
{
  "url": "https://example.com",
  "options": {
    "maxPages": 20,
    "maxDepth": 3,
    "timeout": 30000,
    "device": "mobile",
    "interactions": true,
    "accessibility": true,
    "performance": true,
    "security": true
  }
}
```

## CLI

```bash
npm run scan -- https://example.com
```

Prints observed counts and a deterministic health score. Does not print cookies, tokens, or authorization headers.

## Scoring

Category scores are documented in `server/src/scoring/health.ts`. Overall is a **weighted average** of Runtime, Network, Console, Performance, Accessibility, Security, SEO, and Assets. Console noise uses:

`100 - errors*8 - warnings*3 - excessLogs*0.5 - duplicateGroups*1`

If a subsystem cannot run, TRACE reports `NOT TESTED` / `UNAVAILABLE` and may complete as `completed_with_warnings`. TRACE never fabricates metrics.

## Security model

- SSRF: DNS resolve, block private/reserved IPs, metadata hosts, `file:`, credentialed URLs. Redirect hops are re-checked.
- TLS verification is never disabled in production scanning.
- Safe probing is GET/HEAD/OPTIONS only, same-origin, rate-limited. POST/PUT/PATCH/DELETE are not replayed.
- Destructive UI labels are not clicked.
- Forms are inspected, not submitted.
- Cookies, tokens, and auth headers are redacted. Token-like storage keys are reported as `TOKEN-LIKE VALUE DETECTED` without values.
- Source maps: existence/metadata only in the default report.

## Limitations

- TRACE observes what executed during the crawl. It does not discover every API in an application.
- INP is often `NOT AVAILABLE` without a real user interaction.
- Accessibility uses axe-core on rendered pages; keyboard issues that require a human are not fully covered.
- Rate limits and page caps prevent using TRACE as a DoS tool.

## Testing

```bash
npm run test:unit
npm run test:e2e          # real Chromium vs test-fixture/
npm run test:integration  # requires DATABASE_URL + Redis
npm run verify
```

The fixture at `test-fixture/` is **only** for automated tests. It contains intentional console errors, uncaught exceptions, 500 APIs, 404 assets, and accessibility defects. The production scanner has no hard-coded fixture results.

## Production

Run API and worker as separate processes with Chromium concurrency `SCAN_BROWSER_CONCURRENCY=1` (or low). Put Postgres and Redis behind a private network. Keep `ALLOW_LOCAL_TARGETS=false`. Authenticate the API before exposing it publicly (users/API keys tables exist; v1 local mode is unauthenticated).
