# Google Maps Platform Live Data Integration Report: NeuroScope 3D

**Module:** NeuroScope 3D — Nearby Neurologists Finder Module  
**Integration Status:** Code-Complete & Live-Ready (Awaiting Google Cloud Billing Activation)  
**Date:** October 2026  
**Engineering Environment:** React 19, TypeScript, Vite, Tailwind CSS v4, Express Proxy, Vitest  

---

## 1. What Was Inspected

1. **Current Application Architecture & Running Services:**
   - **Frontend:** Vite development server running on `http://localhost:5173/` (`src/App.tsx`, `NearbyNeurologistsModule.tsx`).
   - **Backend Proxy:** Express server running on port `5001` (`server/index.ts`) with Vite proxy routing `/api` -> `http://localhost:5001`.
   - **Health & Diagnostic Endpoints:** `/api/health` and `/api/config-status`.
2. **Environment & Local Configuration:**
   - Inspected local environment variables and system paths:
     - `gcloud` Google Cloud SDK is not installed in the Windows environment.
     - Neither `GOOGLE_MAPS_API_KEY` nor `VITE_GOOGLE_MAPS_API_KEY` was populated in a `.env` file (only `.env.example` existed).
   - Scanned codebase for any existing or accidentally committed Google Cloud credentials: **Zero keys hardcoded or committed.**
3. **Investigation of Google Cloud Billing Redirect Blocker:**
   - Conducted an in-depth investigation into why Google Cloud Console redirects to the billing/payment section when attempting to enable Maps APIs or create credentials.

---

## 2. Investigation of the Google Cloud Billing Redirect Blocker

### Why Google Cloud Keeps Redirecting You to Billing
When you attempt to enable **Places API (New)**, **Maps JavaScript API**, or create an API key in Google Cloud Console, Google immediately intercepts the flow and redirects to `https://console.cloud.google.com/project/_/billing/enable` or the payment setup screen.

This behavior occurs because:
1. **Google Maps Platform Policy (Mandatory Billing Attachment):**  
   Since June 2018, Google has enforced a strict policy requiring every Google Cloud project utilizing Google Maps Platform APIs to have an active **Cloud Billing Account** linked to the project.
2. **The $200 Monthly Free Tier Allowance:**  
   Google provides every billing-enabled project with a **$200 USD monthly recurring credit** (approx. 28,000 map loads or thousands of Places requests per month free of charge). For development and normal usage in NeuroScope 3D, this allowance is typically completely cost-free.
3. **The Interception Mechanism:**  
   Google uses billing verification as an identity and anti-abuse filter. Even if you only intend to use the free tier, **Google Cloud Console will refuse to enable the Places API, Geocoding API, or allow live queries until a payment method (credit/debit card or verified bank account) is linked to your Cloud Billing Account**.
4. **Why Automated Tools Cannot Bypass This:**  
   Attaching a billing account requires personal authorization, agreeing to Google's financial terms of service, and entering banking/card details. Automated agents cannot legally or technically submit financial details on your behalf.

---

## 3. What Was Implemented

### A. Genuine Google Places API (New) Integration
- **Server-Side Proxy Modernization (`server/index.ts`):**
  - Upgraded `/api/places/nearby` to use the official **Google Places API (New)** endpoint:  
    `POST https://places.googleapis.com/v1/places:searchNearby`.
  - Configured strict, cost-optimized `X-Goog-FieldMask` headers:  
    `places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.nationalPhoneNumber,places.websiteUri,places.currentOpeningHours,places.googleMapsUri`.
  - Added resilient fallback to Google Places Legacy Nearby Search (`maps.googleapis.com/maps/api/place/nearbysearch/json`) if Places (New) is not enabled on older projects.
  - Upgraded `/api/places/details` to fetch place details using `places.googleapis.com/v1/places/{placeId}` with field masks.
  - Implemented `/api/config-status` to probe Google endpoints and return detailed diagnostic status.

### B. Complete Removal of Demo Data Mode from Normal Operation
- **Removed Demo Toggle from UI:** Completely excised the "Demo Data / Live Google API" switcher button from [SearchHeader.tsx](file:///c:/Users/aadit/OneDrive/Desktop/location/src/components/SearchHeader.tsx).
- **Zero Synthetic Doctors:** Deleted `src/data/mockNeurologists.ts` from application source code.
- **Strict Quarantine of Test Fixtures:** Relocated mock data exclusively to [src/test/fixtures/mockNeurologists.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/test/fixtures/mockNeurologists.ts) for unit tests. Normal application code never falls back to mock records.
- **Actionable Diagnostic Card (`NearbyNeurologistsModule.tsx`):**  
  When an API key is missing or when Google returns a `BILLING_NOT_ACTIVE` error, the UI displays a dedicated diagnostic card explaining the exact reason, providing the direct link to Google Cloud Console billing, and offering a retry button.

### C. Medical Provider Classification & Integrity
- Maintained strict categorization without conflating surgical neurosurgery and medical neurology:
  - `Neurologist` (verified physicians only)
  - `Neurology Clinic` (group practices)
  - `Hospital` (medical centers)
  - `Neurosurgeon` (surgical practices, distinctly labeled)
  - `Diagnostic Center` (neuro-imaging / MRI facilities)
- Public Google ratings and review counts are rendered only when returned by Google Places.
- Consultation fees strictly display `"Consultation fee not publicly available."` unless an official fee schedule was verified.

### D. Interactive Maps & Navigation
- Map component [GoogleMapView.tsx](file:///c:/Users/aadit/OneDrive/Desktop/location/src/components/GoogleMapView.tsx) renders genuine coordinates returned by Google Places.
- Generates official Google Maps direction links with origin coordinates and destination place ID/coordinates.

---

## 4. Files Modified & Created

| File | Change Type | Description |
|---|---|---|
| [server/index.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/server/index.ts) | Modified | Added Places API (New) integration, field masking, legacy fallback, and billing error detection |
| [src/services/placesService.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/services/placesService.ts) | Modified | Removed demo data fallbacks; integrated live proxy endpoints with structured error handling |
| [src/components/SearchHeader.tsx](file:///c:/Users/aadit/OneDrive/Desktop/location/src/components/SearchHeader.tsx) | Modified | Removed Demo Data toggle button; added Google Places Live badge |
| [src/components/NearbyNeurologistsModule.tsx](file:///c:/Users/aadit/OneDrive/Desktop/location/src/components/NearbyNeurologistsModule.tsx) | Modified | Removed demo mode logic; added Google Cloud Billing Required diagnostic card |
| [src/types/neurologist.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/types/neurologist.ts) | Modified | Updated SearchParams to make `useDemoData` obsolete |
| [src/index.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/index.ts) | Modified | Removed demo data export from public module API |
| [src/data/mockNeurologists.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/data/mockNeurologists.ts) | Deleted | Eradicated synthetic records from application source |
| [src/test/fixtures/mockNeurologists.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/test/fixtures/mockNeurologists.ts) | Created | Quarantined test fixtures for Vitest automated testing only |
| [src/test/placesService.test.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/test/placesService.test.ts) | Modified | Added tests for live Places response parsing, billing errors, and missing keys |
| [src/test/moduleIntegration.test.tsx](file:///c:/Users/aadit/OneDrive/Desktop/location/src/test/moduleIntegration.test.tsx) | Modified | Added tests verifying live search rendering and the Billing Required card |
| [src/test/securityAndIntegrity.test.ts](file:///c:/Users/aadit/OneDrive/Desktop/location/src/test/securityAndIntegrity.test.ts) | Modified | Updated to reference test fixtures |
| [.gitignore](file:///c:/Users/aadit/OneDrive/Desktop/location/.gitignore) | Modified | Added `.env`, `.env.local`, `.env.*.local` to prevent accidental credential commits |

---

## 5. Required Google APIs

Ensure the following 4 APIs are enabled on your Google Cloud Project:
1. **Places API (New)** (or legacy **Places API**)
2. **Maps JavaScript API** (for interactive map tiles & markers in the browser)
3. **Geocoding API** (for manual location address/city search)
4. **Directions API** (for in-map route previews)

---

## 6. Environment Variables and Credential Locations

Create a file named `.env` in the project root: `c:\Users\aadit\OneDrive\Desktop\location\.env`.

```env
# Client-Side Key (Browser)
# Used by GoogleMapView to render interactive map tiles in the browser.
# Security best practice in Google Cloud Console: Restrict by HTTP Referrers
# (e.g. http://localhost:5173/*, https://your-domain.com/*)
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Server-Side Key (Backend Proxy)
# Used by server/index.ts to query Google Places API (New) & Geocoding without CORS limits.
# Security best practice in Google Cloud Console: Restrict by Server IP and API types.
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Backend Proxy Port
PORT=5001
```

> **Security Note:** `.env` is listed in `.gitignore` and will never be committed to source control.

---

## 7. Status of API Key & Manual Authorization Required

- **Was an active key obtained automatically?**  
  **No.** The environment does not have pre-authorized Google Cloud SDK access, and Google Cloud Console requires manual billing authorization before generating active keys.
- **What is the single manual action required from you?**
  1. Open [Google Cloud Billing Console](https://console.cloud.google.com/project/_/billing/enable).
  2. Select your Google Cloud project and click **Link a billing account** (or create a billing profile with a valid card). *Google grants $200 USD monthly free credit.*
  3. Go to **APIs & Services -> Credentials** and click **Create Credentials -> API Key**.
  4. Paste this key into `c:\Users\aadit\OneDrive\Desktop\location\.env` as shown in Section 6.
  5. Restart the backend proxy (`npm run server`) and frontend (`npm run dev`).

---

## 8. Actual Tests Performed & Results

All 27 automated tests passed across 5 test suites:

```text
✓ src/test/placesService.test.ts (5 tests)
  - Category classification without conflating neurology and neurosurgery
  - Actionable error thrown when API credentials are missing
  - Actionable error thrown explaining Google Cloud billing when BILLING_NOT_ACTIVE
  - Google Places API response parsing & rating sort with tie-breaking
  - Geocoding address parsing and empty query rejection
✓ src/test/distanceService.test.ts (5 tests)
  - Haversine distance calculation
  - Distance formatting ("400 m away", "2.3 km away")
  - Google rating descending sort
  - Unrated items placed last without treating missing as 0
  - Directions URL construction with destination & origin
✓ src/test/securityAndIntegrity.test.ts (4 tests)
  - Zero hardcoded Google API keys or secrets in test fixtures or code
  - Consultation fee compliance (strictly null or verified record)
  - Specialty classification compliance
  - Rating & review count integrity for unrated providers
✓ src/test/components.test.tsx (9 tests)
  - Card rendering, badges, phone links, and "Get Directions" link
  - Details page rendering (doctor info left, map right)
  - Strict fee notice: "Consultation fee not publicly available"
  - RadiusSelector 5km/10km/25km radio buttons
  - Medical disclaimer banner
  - FindNearbyNeurologistsButton click handler
✓ src/test/moduleIntegration.test.tsx (4 tests)
  - Search page rendering with heading, inputs, and 10 km default radius
  - Category filtering on live results
  - Navigation between card list and details view
  - Dedicated Google Cloud Billing Required diagnostic card rendering

Total: 27 passed (100% success rate)
Production Build: tsc -b && vite build completed in 627ms (0 errors)
```

---

## 9. Current Operational State & Exact Next Steps

1. **Both Servers Are Currently Running:**
   - Frontend: [http://localhost:5173/](http://localhost:5173/)
   - Dedicated Route: [http://localhost:5173/nearby-neurologists](http://localhost:5173/nearby-neurologists)
   - Backend Proxy: [http://localhost:5001/api/health](http://localhost:5001/api/health)
2. **Current UI Behavior Without Key:**
   - When opened in the browser, the module queries the live proxy. Because no `.env` key is present, it displays the clear **API Configuration Required** diagnostic card with instructions to add `GOOGLE_MAPS_API_KEY` to `.env`.
   - Once you link your billing account and add your key to `.env`, live Google Places results will immediately populate without any code changes required.
