# OttaTransit

A live tracker for Ottawa's OC Transpo network (buses and the O-Train), modeled on the Transit app and running on real-time data.

## Features

- **Nearby stops and live arrivals.** Uses your location to find nearby stops and lists every route serving them, with a countdown to each departure. Countdowns use real-time predictions where the feed has them and fall back to the schedule otherwise.
- **Stop view.** Tap a stop to see all of its upcoming departures.
- **Live map.** A dark MapLibre map showing the O-Train lines, every stop in view once you zoom in, and the live position of each vehicle. Between feed updates, vehicles are animated by dead reckoning from their last reported speed and bearing, so they move smoothly instead of jumping.
- **Route view.** Tap a route to highlight its line and vehicles on the map.
- **Favourites.** Star stops and routes from the stop list, the stop screen or the route banner. Favourites are pinned above Nearby and saved between visits (Zustand persisted to localStorage).
- **Loading and empty states.** Skeleton placeholders while data loads, plus shared empty and error states.

## How it works

```
React + Vite frontend  <--JSON /api-->  Node + Express backend  <--protobuf-->  OC Transpo GTFS-Realtime
(MapLibre, TanStack Query)              (node-GTFS + SQLite)
```

The browser can't call OC Transpo's real-time feeds directly: they're binary protobuf, they need an API key, and they block cross-origin requests. The Express server handles all of that:

- On first start, node-GTFS imports the static schedule (about 2.9M stop times, 5,587 stops, 125 routes) into SQLite.
- Every 15 seconds, the server fetches the VehiclePositions and TripUpdates feeds, decodes them into the same database, and matches predictions against scheduled trips.
- Each refresh briefly empties the realtime tables, so the server takes an in-memory snapshot after every successful poll and serves reads from that. Requests that land mid-refresh never see an empty map.
- The API key stays on the server. The frontend only ever talks to its own origin.

### API

| Endpoint | Returns |
| --- | --- |
| `GET /api/stops/nearby?lat=&lon=` | Stops near a point |
| `GET /api/stops/:id/arrivals` | Upcoming departures with live predictions |
| `GET /api/stops/in-bounds` | Every stop inside the map viewport |
| `GET /api/rail` | O-Train line geometry |
| `GET /api/vehicles` | Live vehicle positions |
| `GET /api/routes` | All routes |
| `GET /api/routes/:routeId/stops` | Stops on a route |
| `GET /api/shapes/:routeId` | Route line geometry |
| `GET /api/health` | Server and feed status |

## Tech

- **Frontend:** React, Vite, MapLibre GL JS with OpenFreeMap tiles, TanStack Query, Zustand
- **Backend:** Node.js, Express, node-GTFS, SQLite
- **Data:** OC Transpo GTFS static schedule (Open Ottawa) and GTFS-Realtime feeds

## Running it

```bash
npm install
npm run dev
```

This starts Vite at http://localhost:5173 and Express at http://localhost:3000. Vite proxies `/api/*` to the server. If port 3000 is taken, set `PORT` in `server/.env`; `vite.config.js` reads the same file, so the proxy follows it.

### API key

Get a free key from the [OC Transpo developer portal](https://nextrip-public-api.developer.azure-api.net), then copy `server/.env.example` to `server/.env` and fill it in:

```
OC_TRANSPO_API_KEY=your-key-here
```

`server/.env` is git-ignored. Without a key, the app still runs on scheduled times.

### Schedule data

Download the static GTFS feed (about 55 MB, git-ignored) to `data/oc-transpo-gtfs.zip`:

```bash
curl -L -o data/oc-transpo-gtfs.zip https://oct-gtfs-emasagcnfmcgeham.z01.azurefd.net/public-access/GTFSExport.zip
```

If that URL moves, get the current link from [Open Ottawa → OC Transpo Schedules](https://open.ottawa.ca/documents/ottawa::oc-transpo-schedules/about).

> **Windows note:** `better-sqlite3` is pinned to 13.0.3 through a `package.json` override. Version 13.0.1, which node-GTFS depends on, has no prebuilt Windows binaries and needs a full Visual Studio toolchain to compile.

## Notes

- OC Transpo doesn't publish a GTFS-Realtime Alerts feed, so there are no service-alert banners. `/api/alerts` returns an empty list in case that changes.
- **Next up:** a trip planner built on OpenTripPlanner.
