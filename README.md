# WEBB ETD Dashboard

Small Express dashboard for showing IntelliEvent inventory change activity on a TV-style display.

The browser loads a static dashboard from `public/`. The Express server calls IntelliEvent, normalizes the changelog rows, groups them by show/client/job, and returns the data from `/api/changes`.

## Requirements

- Node.js 18 or newer
- npm
- Access to the WEBB token service

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file. Do not commit it.

```bash
WEBB_TOKEN_BEARER=your_token_service_bearer_token

# Optional defaults:
WEBB_TOKEN_URL=https://api.wearewebb.com/token
IE_API_BASE=https://webapi2ui.ielightning.net
HOST=127.0.0.1
PORT=5050

# Optional filters:
OFFICE_IDS=
JOB_TYPE_IDS=

# Dashboard windows:
EVENT_DAYS_BACK=45
PREP_DAYS_PAST=30
PREP_DAYS_FUTURE=60
PAGE_SIZE=500
REFRESH_SECONDS=300
```

`WEBB_TOKEN_BEARER` can be either the raw token or the full `Bearer ...` header value.

## Run

```bash
npm start
```

Then open:

```text
http://localhost:5050
```

By default the server binds to `127.0.0.1`, so it is only reachable from the Mac running the dashboard. That is the safer setup for a TV display machine with outbound internet access. If the dashboard must be reachable from another device on the local network, set `HOST=0.0.0.0` intentionally and use network/firewall rules to limit who can reach it.

## Settings

Open the gear button on the dashboard, or go to:

```text
http://localhost:5050/settings.html
```

Editable settings:

- Event days back
- Prep days past
- Prep days future
- Page size
- Refresh seconds
- Offices
- Job types

The `.env` values are startup defaults. Changes made on the settings page are saved to `config/dashboard-settings.json`, which is ignored by Git. The saved settings take priority on the next server start.

Office and job type filters are shown by name in the browser. The server maps those names back to the IntelliEvent IDs when it calls the IE API. Auth settings are intentionally not editable from the browser.

For local development with automatic server restarts:

```bash
npm run dev
```

## Test

```bash
npm test
```

The current test coverage is intentionally small. It covers the note parsing logic that decides the item text and whether a row is treated as added, changed, deleted, or neutral.

## Useful Files

- `server/server.js` - Express app, token-service auth, IntelliEvent API call, filtering, and grouping
- `server/dashboardSettings.js` - editable dashboard setting defaults, validation, and persistence
- `server/referenceCodes.js` - office and job type names mapped to IntelliEvent IDs
- `server/noteParser.js` - changelog note parsing helper
- `public/app.js` - browser rendering, refresh, clock, and card auto-scroll
- `public/settings.html` - local settings page
- `public/styles.css` - dashboard layout and colors
