# SG Haze Watch

## Project overview

Singapore air quality monitor that shows NEA (government), AQICN, and PurpleAir (community) sensor data on a Leaflet map. All readings are standardised to µg/m³ using NEA's 1-hr PM2.5 bands.

Live: https://sg-haze.vercel.app
Repo: https://github.com/mantariksh/sg-haze

## Architecture

- **Frontend**: Vanilla JS + Leaflet + MarkerCluster. No build step. Served from `public/`.
- **Backend**: Vercel Serverless Functions in `api/`. Proxies all upstream APIs to hide keys.
- **Database**: Turso (LibSQL) in Tokyo region. Stores historical readings and API call metrics.
- **Hosting**: Vercel (Hobby plan).

## Key files

- `lib/sources.js` — Fetches from NEA, AQICN, PurpleAir. Converts AQICN AQI values to µg/m³.
- `lib/db.js` — Turso client singleton.
- `lib/metrics.js` — Fire-and-forget API call counter (writes to `api_metrics` table).
- `api/readings.js` — Main endpoint. Fetches all sources, filters to last 24h, CDN-cached 60s.
- `api/history.js` — Queries Turso for historical data. CDN-cached 5 min.
- `api/cron/collect.js` — Writes snapshots to Turso. Requires `Authorization: Bearer <CRON_SECRET>`.
- `public/app.js` — Map, markers, clustering, popups, history table, polling.
- `public/style.css` — Dark theme. Panel uses `padding: max()` for centred content on wide screens.
- `bruno/` — Bruno API collection for testing upstream APIs.

## Running locally

```bash
pnpm install
# Ensure .env exists with all keys (see .env.sample)
pnpm exec vercel dev
```

Vercel dev reads `.env` (not `.env.local` — that didn't work). The cron job doesn't run locally; trigger it manually:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3456/api/cron/collect
```

## Deploying

```bash
pnpm exec vercel --prod --yes
```

Environment variables are set in the Vercel dashboard (already configured). After deploying, push to GitHub:
```bash
git push origin main
```

## Cron job

Vercel Hobby plan only allows daily crons. The `vercel.json` cron runs once at midnight UTC. For more frequent collection, use an external cron service (e.g. cron-job.org) to hit `/api/cron/collect` with the auth header every 15 minutes.

## Data sources

| Source | API | Auth | Units | Notes |
|--------|-----|------|-------|-------|
| NEA | `api-open.data.gov.sg/v2/real-time/api/psi` and `/pm25` | `x-api-key` header | µg/m³ native | 5 regions, updates every 15 min |
| AQICN | `api.waqi.info/feed/{station_id}/` | Token in query string | US EPA AQI (converted to µg/m³) | 2 stations: A538438 (Seaside Residences), A477646 (NASA GSFC Rutgers) |
| PurpleAir | `api.purpleair.com/v1/sensors` | `X-API-Key` header | µg/m³ native | Bounding box: NW(1.47,103.6) SE(1.22,104.05), max_age=86400 |

## Database tables

**readings**: source, station, timestamp, pm25_1hr, pm25_24hr, pm10_24hr, o3_8hr, co_8hr, so2_24hr, no2_1hr, psi, latitude, longitude, raw_json, collected_at

**api_metrics**: endpoint, date, count (primary key: endpoint+date)

## Commands

- `pnpm exec bru run --env production` — Run Bruno API tests (from `bruno/` dir)
- `pnpm exec vercel dev` — Local dev server
- `pnpm exec vercel --prod --yes` — Deploy to production
- `turso db shell sg-haze` — Interactive SQL shell

## Important notes

- AQICN values are AQI index values, not raw concentrations. `lib/sources.js` converts them to µg/m³ using EPA breakpoint tables.
- PurpleAir already returns µg/m³ — no conversion needed.
- The readings endpoint filters out any data with timestamps older than 24h.
- CDN caching (`s-maxage`) means the serverless function runs at most once per 60s globally for `/api/readings`.
- On mobile, the map legend is collapsible (hidden by default, tap to open, × to close).
- The panel sections (Bands, History, About) use `<details>` elements — collapsed by default.
