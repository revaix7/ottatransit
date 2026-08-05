# OttaTransit — Full Build Guide (every step)

This document contains **every step** to build OttaTransit, broken into phases. Each phase
is written as a **self-contained prompt** you can hand to an AI coding model. The AI does not
need to see any prior conversation — each prompt restates the context it needs.

Work order: do the phases **in order**. Do not start a phase until the previous phase's
"Definition of done" is met. Phase 5 (trip planner) needs Docker and can be deferred without
blocking the others.

---

## Project at a glance

- **What:** a website that clones the **Transit** app for Ottawa's **OC Transpo** (buses +
  O-Train LRT), running on **real, live data**.
- **Repo:** local at `C:\Users\xvrma\ottatransit` (private GitHub repo `revaix7/ottatransit`).
- **Stack:** React + Vite (frontend), Node + Express (backend), MapLibre GL JS (map),
  TanStack Query (polling), Zustand + localStorage (favorites), OpenTripPlanner (routing).
- **Why a backend exists:** the live feed (GTFS-Realtime) is binary protobuf, needs a free
  API key, and is CORS-blocked from browsers — so a Node server fetches, decodes, and serves
  clean JSON to React.

### Data sources

| Data | Source | Key? | Used for |
|------|--------|------|----------|
| GTFS static (routes, stops, schedules, shapes) | Open Ottawa (`open.ottawa.ca/search?tags=gtfs`) — `.zip` | No | Route list, stop locations, map lines, scheduled times |
| GTFS-Realtime VehiclePositions | OC Transpo dev portal (Azure) | Yes (free) | Live vehicle dots |
| GTFS-Realtime TripUpdates | Same portal | Yes (free) | Real countdown timers |
| GTFS-Realtime Alerts | Same portal | Yes (free) | Service disruption banners |

### Final folder structure (target)

```
ottatransit/
├─ server/
│  ├─ index.js         # Express app + routes
│  ├─ gtfs.js          # node-GTFS import + query wrappers
│  ├─ realtime.js      # poll + decode GTFS-RT
│  ├─ routing.js       # proxy to OpenTripPlanner
│  ├─ config.json      # node-GTFS config
│  ├─ .env             # OC_TRANSPO_API_KEY (git-ignored)
│  └─ .env.example
├─ src/
│  ├─ main.jsx / App.jsx
│  ├─ components/  (Map, NearbySheet, RoutePill, StopView, TripPlanner, Favorites)
│  ├─ hooks/       (useNearby, useVehicles, useArrivals, useTripPlan)
│  ├─ store/       (favorites — Zustand + localStorage)
│  └─ styles/      (dark theme tokens)
├─ data/           # GTFS zip + built SQLite (git-ignored)
├─ vite.config.js
└─ package.json
```

---

## STEP 0 (you, the human) — Get the OC Transpo API key

This is the only step an AI can't do for you. ~5 minutes.

1. Go to **https://www.octranspo.com/en/plan-your-trip/travel-tools/developers/** and open
   the link to the **developer portal** (Azure-hosted: `nextrip-public-api.developer.azure-api.net`).
2. Click **Sign up** (top-right). Enter email, password, name. Submit.
3. Open the confirmation email, click the verification link, then sign in.
4. Open **Products** in the top menu → choose the **GTFS-Realtime** product → name the
   subscription anything → **Subscribe** (usually instant approval). Choose **non-commercial**
   if asked.
5. Open **Profile** (your name → Profile). Under **Subscriptions**, click **Show** on the
   **Primary key** and copy it.
6. Keep the key handy. You'll paste it into `server/.env` in Phase 1 (never commit it).

---

## PHASE 0 — Scaffold frontend + backend (no key needed)

````
# Task: Scaffold "OttaTransit" — Phase 0 setup

You are starting a web project called OttaTransit: a clone of the Transit app for Ottawa's
OC Transpo (buses + O-Train), using real live GTFS data. The repo already exists locally at
C:\Users\xvrma\ottatransit (a git repo with README.md and BUILD_GUIDE.md). Read those first.
Do all work inside that folder.

Stack (do not substitute): React + Vite (JavaScript), Node + Express, MapLibre GL JS,
TanStack Query, Zustand + localStorage.

Do THIS step (Phase 0 — setup only, no API key yet):
1. Read README.md and BUILD_GUIDE.md.
2. Scaffold the frontend with Vite's React template at the repo root (src/, index.html,
   vite.config.js, package.json at top level).
3. Create server/ with a minimal Express app (server/index.js) that listens on port 3000,
   has GET /api/health returning {"ok":true}, and empty stub files gtfs.js, realtime.js,
   routing.js.
4. Install deps — frontend: maplibre-gl, @tanstack/react-query, zustand; backend: express,
   cors, dotenv, gtfs (node-GTFS), gtfs-realtime-bindings; dev: concurrently so `npm run dev`
   starts BOTH Vite and Express together.
5. Configure vite.config.js to proxy /api to http://localhost:3000.
6. Create .gitignore (ignore node_modules, .env, *.sqlite, dist, data/), server/.env.example
   with `OC_TRANSPO_API_KEY=`, and server/config.json for node-GTFS pointing at
   ./data/oc-transpo-gtfs.zip.
7. Download the OC Transpo GTFS static zip (no key needed) from Open Ottawa
   (https://open.ottawa.ca/search?tags=gtfs) into ./data/oc-transpo-gtfs.zip. If the direct
   URL can't be found, skip and note in README where to get it and where to put it.

Definition of done:
- npm install completes cleanly.
- `npm run dev` starts Vite AND Express together.
- The Vite app shows its default page in the browser.
- curl http://localhost:3000/api/health returns {"ok":true}.
- Commit: "Phase 0: scaffold frontend + backend".

Do NOT implement features yet. Stop when done and report what you created.
````

---

## PHASE 1 — Backend foundation (needs the API key)

````
# Task: OttaTransit — Phase 1 backend

Context: OttaTransit is a Transit-app clone for Ottawa's OC Transpo, repo at
C:\Users\xvrma\ottatransit. Phase 0 (scaffold) is done: React+Vite frontend, Node+Express
backend on port 3000, deps installed (express, cors, dotenv, gtfs, gtfs-realtime-bindings).
Read README.md and BUILD_GUIDE.md first.

Prereq: the file server/.env must contain OC_TRANSPO_API_KEY=<the user's key>. The GTFS
static zip is at ./data/oc-transpo-gtfs.zip.

Do Phase 1:
1. In server/gtfs.js: use node-GTFS to import ./data/oc-transpo-gtfs.zip into a SQLite db
   (./data/gtfs.sqlite) on startup if not already imported. Export helper functions:
   getNearbyStops(lat, lon, radiusMeters), getRoutes(), getStopArrivals(stopId), and
   getRouteShapes(routeId). Use node-GTFS query functions; compute nearby via a bounding box
   then distance sort.
2. In server/realtime.js: fetch OC Transpo's GTFS-Realtime feeds (VehiclePositions,
   TripUpdates, Alerts) using OC_TRANSPO_API_KEY (sent as the required header/query param per
   the portal docs). Decode with gtfs-realtime-bindings. Poll every 15 seconds and cache the
   decoded results in memory. Export getVehicles(), getTripUpdates(), getAlerts().
3. In server/index.js add routes:
   - GET /api/routes                → all routes (id, short name, long name, color)
   - GET /api/stops/nearby?lat=&lon= → nearby stops with the routes serving each
   - GET /api/stops/:id/arrivals     → upcoming departures at a stop, MERGING scheduled times
     with TripUpdates so each shows a realtime-adjusted countdown (minutes from now)
   - GET /api/vehicles               → current live vehicles [{id, routeId, lat, lon, bearing}]
   - GET /api/shapes/:routeId        → GeoJSON LineString(s) for the route
   - GET /api/alerts                 → active service alerts
   Enable CORS for the dev origin.

Definition of done:
- `npm run dev` runs without errors.
- curl http://localhost:3000/api/vehicles returns live vehicles whose coordinates CHANGE
  between two calls ~20s apart.
- curl "http://localhost:3000/api/stops/nearby?lat=45.4215&lon=-75.6972" returns real Ottawa
  stops.
- A stop's /arrivals returns countdowns that look realtime-adjusted.
- Commit: "Phase 1: GTFS import + realtime API".

Stop when done and report the endpoints and a sample response from each.
````

---

## PHASE 2 — Nearby & live arrivals (Transit's core screen)

````
# Task: OttaTransit — Phase 2 frontend: nearby + live arrivals

Context: OttaTransit, repo at C:\Users\xvrma\ottatransit. Phases 0–1 done: the backend
serves /api/routes, /api/stops/nearby, /api/stops/:id/arrivals, /api/vehicles,
/api/shapes/:routeId, /api/alerts. Frontend is React+Vite with MapLibre GL JS, TanStack
Query, Zustand installed. /api is proxied to the backend. Read README.md and BUILD_GUIDE.md.
Match the Transit app's look: dark UI, colored route pills, big countdown numbers, a
draggable bottom sheet.

Do Phase 2:
1. App layout (src/App.jsx): a full-screen dark MapLibre map as the background using a free
   dark basemap (OpenFreeMap dark style, no API key), centered on Ottawa. Over it, a
   draggable bottom sheet (collapsed shows a handle + first rows; expanded covers most of the
   screen).
2. Wrap the app in TanStack Query's QueryClientProvider.
3. Get the browser's geolocation (fallback to downtown Ottawa 45.4215,-75.6972 if denied).
4. Hook src/hooks/useNearby.js → GET /api/stops/nearby; hook useArrivals(stopId) →
   /api/stops/:id/arrivals, refetching every 15s.
5. Components:
   - RoutePill.jsx — a rounded badge showing the route number, background = the route's GTFS
     color, readable text color.
   - NearbySheet.jsx — the bottom-sheet content: list of nearby stops, each with its routes as
     pills and the next 1–2 live countdowns in large numbers (e.g. "4 · 19 min"). Sort by
     distance. Tapping a stop opens StopView.
   - StopView.jsx — all upcoming departures for one stop, each row: route pill, headsign,
     and a big live countdown; auto-refreshes every 15s. A back control returns to the list.
6. Style with a dark theme (src/styles). Countdowns should feel prominent, like Transit.

Definition of done:
- `npm run dev`, open the app, allow location: nearby routes appear with colored pills and
  countdown numbers.
- Countdowns tick/refresh (values change over ~30–60s).
- Tapping a stop shows all its departures; back returns to the list.
- Commit: "Phase 2: nearby stops + live arrivals UI".

Verify by loading the site in a browser. Stop when done and report what you built.
````

---

## PHASE 3 — Map with live vehicles

````
# Task: OttaTransit — Phase 3: route shapes + live vehicles on the map

Context: OttaTransit, repo at C:\Users\xvrma\ottatransit. Phases 0–2 done: dark MapLibre map
+ bottom sheet with nearby stops and live arrivals. Backend has /api/vehicles (live vehicle
positions) and /api/shapes/:routeId (route GeoJSON). Read README.md and BUILD_GUIDE.md.

Do Phase 3:
1. src/hooks/useVehicles.js → GET /api/vehicles, refetch every 10–15s.
2. In Map.jsx, render live vehicles as markers/dots colored by their route. On each refetch,
   animate/transition each vehicle from its old position to the new one (smooth, not jumpy).
   Show route number on or beside the dot.
3. When a user selects a route or stop, fetch /api/shapes/:routeId and draw the route line(s)
   on the map in the route color; highlight the stops on that route.
4. Selecting a route filters the visible vehicles to that route; clearing shows nearby again.
5. Keep it performant with hundreds of vehicles (use MapLibre GeoJSON sources/layers, not
   hundreds of DOM markers, if needed).

Definition of done:
- Vehicle dots appear on the map and visibly MOVE over ~30–60s.
- Selecting a route draws its line and shows only that route's vehicles.
- Commit: "Phase 3: live vehicles + route shapes on map".

Verify in a browser (watch dots move). Stop when done and report.
````

---

## PHASE 4 — Favorites (save stops & routes)

````
# Task: OttaTransit — Phase 4: favorites

Context: OttaTransit, repo at C:\Users\xvrma\ottatransit. Phases 0–3 done. Zustand is
installed. Read README.md and BUILD_GUIDE.md. Match Transit's style.

Do Phase 4:
1. src/store/favorites.js — a Zustand store persisted to localStorage, tracking favorite stop
   IDs and favorite route IDs, with add/remove/toggle actions and selectors.
2. Add a star/unstar control on stop rows (StopView / NearbySheet) and on route pills/headers.
3. Favorites.jsx — a section pinned at the TOP of the bottom sheet showing saved stops (with
   their live countdowns, same as nearby) and saved routes. Empty state with a hint.
4. Favorites must survive a page reload (localStorage).

Definition of done:
- Starring a stop/route adds it to a Favorites section at the top.
- Reloading the page keeps favorites and their live countdowns.
- Commit: "Phase 4: favorites (saved stops + routes)".

Verify in a browser (star, reload, confirm persistence). Stop when done and report.
````

---

## PHASE 5 — Trip planner (needs Docker)

````
# Task: OttaTransit — Phase 5: trip planner via OpenTripPlanner

Context: OttaTransit, repo at C:\Users\xvrma\ottatransit. Phases 0–4 done. Read README.md and
BUILD_GUIDE.md. This phase adds real A-to-B routing using OpenTripPlanner 2 (OTP) in Docker.
Docker must be installed.

Do Phase 5:
1. Set up OTP in Docker:
   - Download an Ottawa/Ontario OSM extract (e.g. Geofabrik Ontario) and place it with the OC
     Transpo GTFS zip in an otp/ folder.
   - Build the OTP graph and run the OTP server (document the exact docker commands in
     BUILD_GUIDE or a docker-compose.yml). OTP exposes a routing API (GTFS GraphQL or the
     REST plan endpoint).
2. server/routing.js — POST /api/plan taking {fromLat, fromLon, toLat, toLon, time?} and
   proxying to OTP, returning simplified itineraries: [{duration, legs:[{mode, routeId,
   routeShortName, from, to, startTime, endTime, geometry}]}].
3. src/components/TripPlanner.jsx + src/hooks/useTripPlan.js:
   - Origin/destination inputs. Support searching stops by name and/or dropping pins on the
     map. "Use my location" for origin.
   - Show itinerary options (departure/arrival, total time, transfers) with route pills per
     leg. Tapping an itinerary draws its legs on the map (walk legs dashed, transit legs in
     route color).

Definition of done:
- OTP runs and answers routing requests.
- POST /api/plan returns itineraries for a known pair (e.g. Tunney's Pasture → University of
  Ottawa).
- The UI renders those itineraries and draws them on the map.
- Commit: "Phase 5: trip planner (OpenTripPlanner)".

Verify by planning a real Ottawa trip in the browser. Stop when done and report.
````

---

## PHASE 6 — Alerts & design polish

````
# Task: OttaTransit — Phase 6: service alerts + polish

Context: OttaTransit, repo at C:\Users\xvrma\ottatransit. Phases 0–5 done. Backend has
/api/alerts (GTFS-Realtime service alerts). Read README.md and BUILD_GUIDE.md. Goal: finish
the "close clone of Transit" look and add alerts.

Do Phase 6:
1. src/hooks/useAlerts.js → GET /api/alerts. Show active alerts as dismissible banners at the
   top of the sheet, and mark affected routes (e.g. a warning icon on the route pill). Tapping
   an alert shows details and affected routes/stops.
2. Design polish pass to closely match Transit:
   - Consistent dark theme tokens (backgrounds, text, dividers), route colors from GTFS.
   - Typography and spacing that mirror Transit; large, legible countdowns.
   - Smooth bottom-sheet drag with snap points; subtle motion on vehicle updates and sheet
     transitions.
   - Responsive/mobile-first; looks like a phone app in a desktop browser too.
   - Loading skeletons and empty/error states.
3. Update README with run instructions and a screenshot/GIF if possible.

Definition of done:
- Active alerts show as banners and flag affected routes.
- The app visually reads as a close clone of Transit (dark, pills, big countdowns, bottom
  sheet).
- Commit: "Phase 6: alerts + design polish".

Verify in a browser. Stop when done and report.
````

---

## Global rules for whichever AI executes these

- Work only inside `C:\Users\xvrma\ottatransit`. Read `README.md` and `BUILD_GUIDE.md` before
  each phase.
- Never commit `server/.env` or the API key. Keep `.env` in `.gitignore`.
- One phase per run. Meet the phase's "Definition of done", commit with the stated message,
  then stop and report.
- If the OC Transpo realtime feed URL or exact auth header is unclear, consult the OC Transpo
  developer portal docs (`nextrip-public-api.developer.azure-api.net`) rather than guessing.
- Prefer the libraries named in this guide; don't swap the stack.

## Sources

- OC Transpo Developers — https://www.octranspo.com/en/plan-your-trip/travel-tools/developers/
- Open Ottawa (GTFS) — https://open.ottawa.ca/search?tags=gtfs
- Transit app — https://transitapp.com/
- node-GTFS — https://github.com/BlinkTag-Inc/node-gtfs
- MapLibre GL JS — https://maplibre.org/
- OpenTripPlanner — https://www.opentripplanner.org/
