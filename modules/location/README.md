# NeuroScope 3D — Nearby Neurologists Finder Module (OpenStreetMap Edition)

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-cyan.svg)](https://react.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-green.svg)](https://leafletjs.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-teal.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-v5.0-green.svg)](https://vitest.dev/)
[![OpenStreetMap](https://img.shields.io/badge/Data-OpenStreetMap-brightgreen.svg)](https://www.openstreetmap.org/)

A standalone, production-ready **Nearby Neurologists Finder module** engineered for **NeuroScope 3D** (a brain tumour research and 3D visualization platform).

This module connects neuro-oncology research and patient diagnosis workflows directly to real-world clinical care. It queries legitimate, community-verified healthcare facilities from **OpenStreetMap** using the **Overpass API** and **Nominatim** geocoding, completely eliminating any dependency on Google Cloud billing, credit card requirements, or proprietary Google Maps API keys.

---

## Key Features

1. **Free, Legitimate Healthcare Discovery (OpenStreetMap Overpass API)**
   - Queries real mapped healthcare facilities across `amenity=hospital`, `amenity=clinic`, `amenity=doctors`, and `healthcare=*`.
   - Filters by genuine neurology specialty tags (`healthcare:speciality=neurology`, `healthcare:speciality=neurosurgery`).
   - Zero Google billing required. Zero artificial limits or credit card redirects.

2. **Honest Specialty Classification & Data Integrity**
   - Strictly distinguishes **Neurologists**, **Neurology Clinics**, **Hospitals**, and **Neurosurgeons** (surgical specialty).
   - If a hospital or clinic has no verified neurology specialty mapped in OSM, it is labeled **Specialty Unverified**—never assumed to be a neurologist.
   - **Zero fabricated ratings or reviews:** OpenStreetMap does not maintain user star ratings or review counts; the UI displays honest verification badges rather than manufactured stars.
   - **Consultation fees:** Only displayed if an official, verifiable fee schedule is published; otherwise marked as *"Consultation fee not publicly available in open directory."*

3. **Leaflet Interactive Map & OpenStreetMap Tiles**
   - Renders interactive Leaflet maps with official OpenStreetMap tiles and standard copyright attribution.
   - Fully compliant with the [OSM Foundation Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
   - Custom SVG markers for facilities and user origins.

4. **Turn-by-Turn Directions (OSRM)**
   - Generates working directions links using the OpenStreetMap OSRM routing engine (`engine=fossgis_osrm_car`) using genuine geographic coordinates.
   - Includes Google Maps directions link as an alternative without requiring API keys.

5. **Flexible Location Discovery**
   - **Device Geolocation:** Browser geolocation initiated upon user action, with graceful handling if permission is denied.
   - **Manual Geocoding:** Address, city, or ZIP code geocoded via public Nominatim proxy with caching and custom `User-Agent`.

6. **Radius Filtering & Ranking**
   - Supports **5 km**, **10 km** (default), and **25 km** radii using spherical Haversine distance calculations.
   - Ranks verified neurology specialists first, then sorts by closest geographic distance (proximity).

7. **Dedicated Two-Column Provider Details View**
   - **Left Column:** OSM Element ID, category badge, address, mapped telephone, official website, opening hours, fee disclosure, and direct link to OpenStreetMap node/way.
   - **Right Column:** Interactive Leaflet map centered on the facility, with user origin marker and routing link.

8. **Express Backend Proxy (`server/index.ts`)**
   - Express server on port 5001 provides caching (10-minute TTL) to protect public Overpass and Nominatim servers from repetitive traffic.
   - Built-in request timeouts (15s), input coordinate validation, and graceful service failure handling.

---

## Architecture & Endpoints

```
[ Frontend: React 19 + Leaflet (Port 5173) ]
                    │
                    ▼ (Vite Proxy / Local Fetch)
[ Express Discovery Server: server/index.ts (Port 5001) ]
         │                               │
         ▼ (Overpass QL)                 ▼ (JSON)
[ Overpass API (OSM Data) ]     [ Nominatim (Geocoding) ]
  https://overpass-api.de         https://nominatim.openstreetmap.org
```

### Backend Endpoints:
- `GET /api/places/nearby?lat=...&lng=...&radius=...` — Queries Overpass API for real healthcare facilities within the radius.
- `GET /api/geocode?address=...` — Converts city/address to coordinates via Nominatim.
- `GET /api/health` — Returns server mode (`openstreetmap_live`), cache stats, and uptime.
- `GET /api/config-status` — Confirms no Google API key is needed.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
In terminal 1, start the backend discovery proxy:
```bash
npm run server
```

In terminal 2, start the Vite frontend:
```bash
npm run dev
```

Open your browser at `http://localhost:5173/`.

### 3. Run Automated Tests
```bash
npm run test
```

### 4. Build Production Bundle
```bash
npm run build
```

---

## Environment Configuration

No keys are needed. The module is configured out of the box. Optional settings in `.env`:

```env
PORT=5001
OVERPASS_API_URL=https://overpass-api.de/api/interpreter
NOMINATIM_API_URL=https://nominatim.openstreetmap.org
OSM_USER_AGENT=NeuroScope3D-ClinicalFinder/2.0 (contact@neuroscope3d.internal)
```

---

## Attribution & Usage Policy Compliance

- **Map Data:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- **Tiles:** Rendered from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with caching and proper user-agent headers in accordance with the [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
- **Geocoding:** Nominatim queries are throttled and cached in accordance with the [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).
