# Mimiclaw Admin Panel

React + Vite dashboard for Mimiclaw relay admin endpoints.

## Features

- Workforce overview (`/admin/workforce`)
- Boss/employee lists
- Tag-based grouping and tag filter
- Health/status view (online, heartbeat, self-report)
- Boss <-> employee communication logs (`/admin/communications`)

## Setup

```bash
cd admin
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Environment

Edit `.env.local`:

```env
VITE_RELAY_BASE_URL=/api
VITE_RELAY_AUTHKEY=change-me
```

The panel also allows editing base URL and auth key directly in the UI.
