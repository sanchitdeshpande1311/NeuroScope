# Integration Guide for Claude Code: NeuroScope 3D Nearby Neurologists Module

> **Audience:** This document is written specifically for **Claude Code** (or any engineering agent) tasked with integrating the **Nearby Neurologists Finder Module** into the main **NeuroScope 3D** application.

---

## 1. Executive Summary

This module is completely modular, self-contained, and exported from `src/index.ts`. It introduces no dependencies on MRI segmentation, 3D Canvas libraries (Three.js), or backend inference engines.

All healthcare discovery is powered by **OpenStreetMap (OSM) Overpass API** and **Nominatim** geocoding.
**Crucial Benefit:** The host application requires **zero Google Cloud billing accounts, credit cards, or proprietary API keys**.

---

## 2. Exported Artifacts & Entry Components

All components, types, and services are exported through `src/index.ts`:

| Export | Purpose | Usage Recommendation in NeuroScope 3D |
|---|---|---|
| `FindNearbyNeurologistsButton` | Primary entry CTA button | Place in NeuroScope 3D Navbar, Hero section, or bottom of Patient MRI Report |
| `NearbyNeurologistsModule` | Full search & discovery experience | Embed in a dedicated `/nearby-neurologists` page or inside a full-screen Modal |
| `NeurologistDetails` | Two-column details & Leaflet map view | Use as a sub-view or dedicated route `/nearby-neurologists/:id` |
| `NeurologistCard` | Individual healthcare provider card | Use if rendering custom healthcare lists |
| `OpenStreetMapView` | Leaflet map with OSM tiles & routing | Embed interactive maps for any facility coordinates |

---

## 3. Dependency Requirements

Ensure the host NeuroScope 3D project has the following packages installed:

```bash
npm install leaflet lucide-react
npm install -D @types/leaflet
```

Ensure Leaflet CSS is imported in your root CSS or entry file:
```css
@import "leaflet/dist/leaflet.css";
```

If the host project is using **React Router**:
```bash
npm install react-router-dom
```

If the host project is built with **Next.js (App Router or Pages Router)**:
`react-router-dom` is optional; you can directly render `<NearbyNeurologistsModule />` inside `app/nearby-neurologists/page.tsx` or wrap with client-side dynamic import (`dynamic(() => import(...), { ssr: false })` to avoid SSR window issues with Leaflet).

---

## 4. Backend Endpoints Integration

The module requires two backend endpoints, currently implemented in `server/index.ts`:
1. `GET /api/places/nearby?lat={lat}&lng={lng}&radius={radiusMeters}`
2. `GET /api/geocode?address={query}`

### Option A: Proxy to the standalone server (Port 5001)
If NeuroScope 3D uses Vite, add this to `vite.config.ts`:
```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5001',
      changeOrigin: true,
    },
  },
}
```

### Option B: Mount directly into NeuroScope 3D Express/Next.js backend
Copy the handlers from `server/index.ts` directly into your main Express app or Next.js route handlers (`app/api/places/nearby/route.ts` and `app/api/geocode/route.ts`).
The handlers use standard `fetch` with an in-memory cache to comply with OSM Foundation acceptable use policies.

---

## 5. Medical Safety & Privacy Isolation

> [!IMPORTANT]
> **Patient Privacy & HIPAA Compliance:**
> Under no circumstances should patient names, medical history, brain MRI DICOM files, or segmentation coordinates be transmitted to the location endpoints.
> Location requests must only ever send:
> - Latitude & longitude coordinates
> - Search radius (5, 10, or 25 km)
> - City name or ZIP code for geocoding

---

## 6. Example Usage in NeuroScope 3D

### Embedding into MRI Analysis Results Page:
```tsx
import React from 'react'
import { FindNearbyNeurologistsButton } from './location'

export const MriReportView: React.FC<{ patientReport: any }> = ({ patientReport }) => {
  return (
    <div className="report-container p-6 bg-slate-900 text-white rounded-2xl">
      <h2>NeuroScope 3D Analysis Complete</h2>
      <p>Tumour segmentation rendered in 3D canvas.</p>

      {/* Direct Clinical Referral Call-to-Action */}
      <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm">Need Clinical Follow-up?</h4>
          <p className="text-xs text-slate-400">Locate verified neurologists and clinics in your area.</p>
        </div>
        <FindNearbyNeurologistsButton
          onClick={() => window.location.href = '/nearby-neurologists'}
          variant="primary"
          size="md"
        />
      </div>
    </div>
  )
}
```
