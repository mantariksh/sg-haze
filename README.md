# SG Haze Watch

Live air quality map for Singapore that shows government and community sensor data side by side.

**Live site: [sg-haze.vercel.app](https://sg-haze.vercel.app)**

## Why

I experienced haze in real life, but when I checked official government data sources, they told me that haze levels were normal. I wasn't the only one; others on Reddit were reporting the same thing. So I wanted to be able to see government and non-government data sources for haze side by side.

## Data sources

| Source | Type | What it provides |
|--------|------|-----------------|
| [NEA](https://data.gov.sg) | Official | PSI, PM2.5, PM10, O3, CO, SO2, NO2 across 5 regions |
| [AQICN](https://aqicn.org) | Community | PM2.5, PM10 from 2 stations (converted from US EPA AQI to µg/m³) |
| [PurpleAir](https://www.purpleair.com) | Community | PM2.5, PM10 from sensors active in the last 24h |

All readings are standardised to µg/m³ and colour-coded using NEA's 1-hour PM2.5 bands:

| 1-hr PM2.5 (µg/m³) | Band | Descriptor |
|---------------------|------|------------|
| 0–55 | 1 | Normal |
| 56–150 | 2 | Elevated |
| 151–250 | 3 | High |
| ≥251 | 4 | Very High |

## Tech stack

- **Frontend**: Vanilla JS + [Leaflet](https://leafletjs.com) with [MarkerCluster](https://github.com/Leaflet/Leaflet.markercluster)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: [Turso](https://turso.tech) (LibSQL) for historical data and API metrics
- **Hosting**: [Vercel](https://vercel.com)

## Setup

```bash
pnpm install
cp .env.sample .env
# Fill in your API keys in .env
pnpm exec vercel dev
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `NEA_API_KEY` | [data.gov.sg](https://data.gov.sg) API key |
| `AQICN_TOKEN` | [aqicn.org](https://aqicn.org/data-platform/token/) API token |
| `PURPLEAIR_API_KEY` | [PurpleAir](https://develop.purpleair.com) READ API key |
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `CRON_SECRET` | Secret for authenticating cron job requests |

### API collection

Bruno API requests are in the `bruno/` folder. To run them:

```bash
cp bruno/.env.sample bruno/.env
# Fill in your API keys in bruno/.env
pnpm exec bru run --env production
```

## License

MIT
