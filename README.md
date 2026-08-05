# OttaTransit — a Transit-app clone for OC Transpo (buses + O-Train)

A website that reproduces the **Transit** app, scoped to Ottawa's **OC Transpo** network
(bus routes + the O-Train LRT lines), running on **real, live data**.

## Goals

Open the app and instantly see what's near you, on a live map, with a trip planner and
saved favorites — a close clone of Transit's look and feel.

- **Nearby + live arrivals** — your location pins nearby stops and shows every route with a
  live countdown ("Route 7 — 4 min, 19 min"). Transit's signature screen.
- **Live map** — dark map with colored route lines, stops, and bus/train dots that move in
  real time (updates ~every 15s).
- **Trip planner** — enter a destination, get real route options with times and transfers.
- **Favorites** — star regular stops and routes; pinned at the top and saved between visits.
- ~~**Service alerts** — banners when there's a disruption.~~ Not possible: OC Transpo does
  not publish a GTFS-Realtime Alerts feed (see [Data sources](#data-sources)).

## What the finished product looks like

A phone-shaped, dark, app-like web page:

- Full-screen dark map filling the background.
- A **bottom sheet** you can drag up, listing nearby routes with **colored number pills**
  and **big countdown numbers**.
- Tap a stop → all its departures. Tap a route → its line and live vehicles light up on the map.
- A search / trip-planner entry and a favorites row at the top.

## Tech stack

- **Frontend:** React + Vite, MapLibre GL JS (free dark basemap), TanStack Query, Zustand.
- **Backend:** Node + Express (required because the live feed is binary protobuf, needs an
  API key, and is CORS-blocked from browsers).
- **Routing:** OpenTripPlanner 2 (Docker) for the trip planner.

## Data sources

| Data | Source | Key needed? | Used for |
|------|--------|-------------|----------|
| **GTFS static** (routes, stops, schedules, line shapes) | [Open Ottawa](https://open.ottawa.ca/search?tags=gtfs) — downloadable `.zip` | No | Route list, stop locations, drawing lines on the map, scheduled times |
| **GTFS-Realtime — VehiclePositions** | OC Transpo [developer portal](https://nextrip-public-api.developer.azure-api.net/) (Azure) | **Yes (free)** | Live bus/train dots moving on the map |
| **GTFS-Realtime — TripUpdates** | Same portal | **Yes (free)** | Real countdown timers (predicted arrivals vs. schedule) |
| ~~GTFS-Realtime — Alerts~~ | — | — | **Not published by OC Transpo** — see below |

> **One-time action:** register at OC Transpo's developer portal for a free API key. It's
> stored in a git-ignored `.env` file, never committed. The old stop-based "API 2.0" was
> retired in April 2025; GTFS-Realtime is the current path.

### Realtime feed endpoints

The portal publishes two products only — **Vehicle Positions** and **Trip Updates**. There
is **no Alerts feed**; anything in this repo about service-alert banners is unbuildable
until OC Transpo adds one. `/api/alerts` returns an empty array so the frontend contract
holds if that changes.

Both take the key as an `Ocp-Apim-Subscription-Key` header and accept
`?format=protobuf` or `?format=json`:

```
https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-vp/beta/v1/VehiclePositions
https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates
```

Note the TripUpdates path segment is `gtfs-rt-tp`, not the `-tu` the naming pattern
suggests. The feeds refresh about every 40 seconds, so polling faster than that returns
identical data.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  React + Vite frontend   │  JSON   │  Node + Express backend      │
│  (browser)               │ <-----> │  (server/)                   │
│                          │  /api   │                              │
│  - Map (MapLibre GL)     │         │  - GTFS static → SQLite      │
│  - Nearby + arrivals     │         │    (via node-GTFS)           │
│  - Trip planner UI       │         │  - Polls GTFS-RT every ~15s, │
│  - Favorites (localStore)│         │    decodes protobuf → JSON   │
└─────────────────────────┘         │  - Proxies OpenTripPlanner   │
                                     │    for trip planning         │
                                     └──────────────────────────────┘
                                                   │
                                          ┌────────┴─────────┐
                                          │ OpenTripPlanner  │
                                          │ (Docker) routing │
                                          └──────────────────┘
```

### Why these libraries

- **[node-GTFS](https://github.com/BlinkTag-Inc/node-gtfs)** — imports the GTFS `.zip` into
  SQLite and provides query functions for stops, routes, shapes, and scheduled times.
  Since v4 it also fetches and decodes the GTFS-Realtime feeds into the same database, so
  predictions can be matched against scheduled times directly.
- **[gtfs-realtime-bindings](https://github.com/MobilityData/gtfs-realtime-bindings)** —
  protobuf decoder. Installed, but unused: node-GTFS covers realtime decoding itself.
- **[MapLibre GL JS](https://maplibre.org/)** — open-source map, no paid token, dark vector
  style via free [OpenFreeMap](https://openfreemap.org) tiles.
- **[TanStack Query](https://tanstack.com/query)** — polls the backend and keeps countdowns
  and vehicle positions fresh.
- **[OpenTripPlanner 2](https://www.opentripplanner.org/)** — standard engine for real
  multimodal trip planning over GTFS + street data.

## Project structure

```
ottatransit/
├─ server/                 # Node + Express backend
│  ├─ index.js             # Express app, routes
│  ├─ gtfs.js              # node-GTFS import + query wrappers
│  ├─ realtime.js          # poll GTFS-RT (vehicles, trip updates) + in-memory snapshot
│  ├─ routing.js           # proxy to OpenTripPlanner
│  ├─ config.json          # node-GTFS config (feed URL / path)
│  └─ .env                 # OC_TRANSPO_API_KEY  (git-ignored)
├─ src/                    # React + Vite frontend
│  ├─ main.jsx / App.jsx
│  ├─ components/
│  │  ├─ Map.jsx           # MapLibre map, route shapes, vehicle markers
│  │  ├─ NearbySheet.jsx   # bottom sheet: nearby routes + live countdowns
│  │  ├─ RoutePill.jsx     # colored route number badge (Transit style)
│  │  ├─ StopView.jsx      # all departures for one stop
│  │  ├─ TripPlanner.jsx   # origin/destination + itinerary results
│  │  └─ Favorites.jsx     # saved stops/routes
│  ├─ hooks/               # useNearby, useVehicles, useArrivals, useTripPlan
│  ├─ store/               # favorites (Zustand + localStorage)
│  └─ styles/              # Transit-like dark theme tokens
├─ vite.config.js          # dev proxy /api -> localhost:server
└─ package.json
```

## Setup

```bash
npm install
npm run dev        # starts Vite (http://localhost:5173) + Express (http://localhost:3000)
```

`npm run dev` runs both halves via `concurrently`; Vite proxies `/api/*` to the Express
server, so the frontend only ever talks to its own origin.

### API key

Copy `server/.env.example` to `server/.env` and paste in your free OC Transpo key from the
[developer portal](https://nextrip-public-api.developer.azure-api.net):

```
OC_TRANSPO_API_KEY=your-key-here
```

`server/.env` is git-ignored. The key is only needed from Phase 1 onward (GTFS-Realtime);
the static GTFS feed needs no key.

### GTFS static data

The feed lives at `data/oc-transpo-gtfs.zip` (git-ignored — ~55 MB). It's already downloaded;
to refresh it:

```bash
curl -L -o data/oc-transpo-gtfs.zip https://oct-gtfs-emasagcnfmcgeham.z01.azurefd.net/public-access/GTFSExport.zip
```

That URL is the one OC Transpo publishes through
[Open Ottawa → OC Transpo Schedules](https://open.ottawa.ca/documents/ottawa::oc-transpo-schedules/about);
if it ever moves, get the current `.zip` link from that dataset page and save it to the same
path. `server/config.json` points node-GTFS at that path and builds `data/oc-transpo.sqlite`.

> **Windows note:** `better-sqlite3` is pinned to `13.0.3` via a `package.json` override
> because `13.0.1` (the version node-GTFS depends on) has no prebuilt binaries and requires a
> full Visual Studio + Windows SDK toolchain to compile. `13.0.3` ships prebuilds.

## Build phases

Each phase ends with something visible/working.

- **Phase 0 — Setup & data.** Scaffold Vite React app + `server/`. Register for the API key.
  Download the GTFS static `.zip`. Verify the key with a test fetch of VehiclePositions.
- **Phase 1 — Backend foundation. ✅ Done.** node-GTFS imports the feed into SQLite on first
  boot (~32s: 2.9M stop_times, 5,587 stops, 71,388 trips, 125 routes). Endpoints:
  `/api/health`, `/api/routes`, `/api/stops/nearby`, `/api/stops/:id/arrivals`,
  `/api/vehicles`, `/api/shapes/:routeId`, `/api/alerts` (always empty — no feed exists).
  Realtime polls every 15s; TripUpdates are merged into arrivals for live countdowns.
- **Phase 2 — Nearby & live arrivals.** Dark map + draggable bottom sheet. Geolocation →
  nearby routes with colored pills and big live countdowns. Tap a stop → all departures.
- **Phase 3 — Map with live vehicles.** Draw route shapes and stops; animate live vehicle dots.
- **Phase 4 — Favorites.** Zustand + localStorage; star/unstar stops and routes; pinned view.
- **Phase 5 — Trip planner.** OpenTripPlanner in Docker (OC Transpo GTFS + Ottawa OSM extract).
  `POST /api/plan` proxies to OTP; render itineraries and draw them on the map.
- **Phase 6 — Polish.** Design pass to closely match Transit. The service-alert banners
  originally planned here are dropped — OC Transpo publishes no Alerts feed.

## Verification

- **Backend:** `curl http://localhost:3000/api/vehicles` returns live vehicles whose
  coordinates change between calls; `/api/stops/nearby` returns real Ottawa stops; arrivals
  include realtime-adjusted times.
- **Frontend:** load the site, allow location, confirm nearby routes + counting-down timers;
  confirm vehicle dots move over ~30–60s; save a favorite and reload to confirm it persists;
  run a trip plan (e.g. Tunney's Pasture → uOttawa) and confirm itineraries render.
- **Sanity check:** compare a countdown and live bus position to the official OC Transpo site.

## Risks / caveats

- **Trip planner is the heaviest piece** — OpenTripPlanner needs Java + Docker + an OSM
  extract. Phases 0–4 + 6 can ship first, with the planner as a follow-up.
- **API key & rate limits** — polling every ~15s with server-side caching stays within limits.
  The feeds only refresh every ~40s, so the interval can be relaxed to cut upstream calls.
- **No service alerts** — the portal publishes VehiclePositions and TripUpdates only, so the
  alerts feature cannot be built as originally planned.
- **Clones functionality, not proprietary assets** — Transit's logo/icons are not copied;
  equivalents are used for the "close clone" look.

## Sources

- [OC Transpo Developers](https://www.octranspo.com/en/plan-your-trip/travel-tools/developers/)
- [Open Ottawa — GTFS data](https://open.ottawa.ca/search?tags=gtfs)
- [Transit app — feature reference](https://transitapp.com/)
- [node-GTFS](https://github.com/BlinkTag-Inc/node-gtfs) · [MapLibre GL JS](https://maplibre.org/) · [OpenTripPlanner](https://www.opentripplanner.org/)
