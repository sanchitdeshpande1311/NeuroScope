# NeuroScope 3D — Integration of Landing Page, Locate, AI Assistant and Tracker (2026-10-17)

## 1. Summary
The four supplied projects run unchanged (one three-line patch, see §4) as their own services, and the NeuroScope 3D workspace connects to them:

| Module (supplied ZIP) | Where it appears | How it is integrated |
|---|---|---|
| Landing page (`NeuroBrain Landing page.zip`) | Public root `/` | Production node build; the workspace's Next.js server serves it at `/` (plus `/assets/*`, `/models/*`) through a rewrite. **Start Segmentation** → `/upload`. The header brand links back to `/`. |
| Locate (`location.zip`) | Header button **Locate**, left of Generate Report → `/locate` | Vite app + its Express API. `/locate` shows the module's own `/nearby-neurologists` page beside a panel with **Back to workspace**, service status and "Open in a new tab". |
| AI assistant (`screenshot-perfect-project-39.zip`) | Brain button at the bottom-right of every workspace page | Production node build. The button opens a floating drop-up panel that contains the module's own chat (`/chat/<thread>`). The panel floats above the page, never resizes it, and keeps the conversation when closed. |
| Tracker (`tumor-tracker-nifti (2).zip`) | 6th item of the circular navigation → `/tracker` | Production node build + its FastAPI backend. `/tracker` shows the module's own **New comparison** page beside a panel with Back to workspace and service status. |

Each module is shown in an iframe, so its styles and the workspace styles cannot collide, and nothing from the current case is sent to any module. If a service is not reachable, the page says which service to start; a missing address says which variable to set.

## 2. Services and ports (local)
| Service | Command (run by `scripts/start_integrations.ps1`) | Port |
|---|---|---|
| Workspace (Next.js) | `npm run dev` in `frontend` | 3000 |
| NeuroScope backend (FastAPI) | `venv\Scripts\python backend\main.py` | 8000 |
| Landing page | `node server/index.mjs` in `<modules>\NeuroBrain Landing page\.output` (PORT=3101) | 3101 |
| AI assistant | `node server/index.mjs` in `<modules>\screenshot-perfect-project-39\.output` (PORT=3102) | 3102 |
| Tracker web | `node server/index.mjs` in `<modules>\tumor-tracker-nifti\.output` (PORT=3103) | 3103 |
| Tracker API | `venv\Scripts\python run_backend.py` in `<modules>\tumor-tracker-nifti\backend` (PYTHONPATH=`<modules>\_pydeps\tracker`) | 8008 (fixed by the module) |
| Locate web | `npx vite --port 3104 --strictPort` in `<modules>\location` | 3104 |
| Locate API | `npx tsx server/index.ts` in `<modules>\location` (PORT=5001) | 5001 (the module's Vite proxy expects it) |

`<modules>` = `C:\Users\hp\NeuroScope3D_modules` (override with `NEUROSCOPE_MODULES_DIR`). The modules live outside OneDrive because each ships with its own `node_modules` (about 140,000 files in total).

**Start everything:** `powershell -ExecutionPolicy Bypass -File .\start.ps1`, then open **http://localhost:3000** (landing page). `-NoIntegrations` starts only the backend and the workspace (`/` then redirects to `/upload`).

## 3. Configuration (no secrets are stored in the project)
| Variable | Used by | Purpose |
|---|---|---|
| `NEUROSCOPE_LANDING_ORIGIN` | `frontend/next.config.ts` | Landing-page service origin, served at `/`. Dev default `http://localhost:3101`; `off` disables it. |
| `NEXT_PUBLIC_LOCATE_URL` / `NEXT_PUBLIC_CHATBOT_URL` / `NEXT_PUBLIC_TRACKER_URL` | `frontend/next.config.ts` → `src/lib/integrations.ts` | Module addresses. Dev defaults `http://localhost:3104` / `:3102` / `:3103`. **A production build gets no defaults**, so no localhost address can leak into a deployment. |
| `VITE_WORKSPACE_URL` (landing build) | landing page | Only if the landing page is served from a different origin than the workspace; default is the same-origin `/upload`. |
| `VITE_NEUROSCOPE_API_URL` (Tracker build) | Tracker web | Tracker API address. The working copy was built with `http://localhost:8008`; the supplied `.env` points to `:8005`, which does not match the module's own backend port, so the build-time value overrides it (the file is unchanged). |
| `LOVABLE_API_KEY` (optional, server-side) | AI assistant | If set in the environment of the assistant service, it calls the Lovable AI Gateway (Gemini) directly. **Not set here.** The module then forwards chat requests to its own cloud deployment (`https://screenshot-perfect-project-39.lovable.app/api/chat`) — this is the module's existing behaviour, and it is how the responses in §6 were produced. Messages typed into the assistant therefore leave this machine. `GEMINI_API_KEY` is listed in the module's `.env.example` but its code does not read it. |
| Locate | — | Uses free OpenStreetMap services (Overpass, Nominatim); no key needed. Its `.env` holds Google keys that the current code does not need. |

## 4. Changes to the supplied projects (working copies only)
The original ZIP archives were never modified (SHA-256 verified before and after — see §7).
1. **Landing page — `src/components/site/HeroSection.tsx`**: the Start Segmentation button's empty handler (`// TODO: Connect to the segmentation backend…`) now runs `window.location.assign(import.meta.env.VITE_WORKSPACE_URL || "/upload")`. Saved as `<modules>\_integration_patches\landing_HeroSection.patch`. No other source change in any module.
2. **Build outputs**: landing page, assistant and Tracker web were rebuilt with `NITRO_PRESET=node-server` (the supplied `.output` targeted Cloudflare Workers, which cannot run under Node). The Tracker web build used `VITE_NEUROSCOPE_API_URL=http://localhost:8008`.
3. **SimpleITK** (needed by the Tracker API, missing from the main venv) was installed into `<modules>\_pydeps\tracker` with `pip --target`; the main venv is unchanged.
4. Test runs added studies and one comparison to the Tracker working copy's `backend/storage` (BraTS-GLI-00008-000/-001, local only).

## 5. Changes to NeuroScope 3D
- **New:** `frontend/src/lib/integrations.ts`, `frontend/src/components/{ModuleFrame,ChatAssistant,BrandMark}.tsx`, `frontend/src/app/locate/page.tsx`, `frontend/src/app/tracker/page.tsx`, `scripts/start_integrations.ps1`, this report.
- **Changed:**
  - `frontend/next.config.ts`: rewrites, module URLs, dev badge off.
  - `frontend/src/app/page.tsx`: fallback redirect.
  - `frontend/src/app/upload/page.tsx`: the Upload page moved here from `/`.
  - `frontend/src/components/AppShell.tsx`: Tracker nav item, fan radius 176 px for six items, Locate button, brand → landing, assistant.
  - `frontend/src/app/runs/[id]/{page,layout}.tsx` and `expert/page.tsx`: "Go to Upload" → `/upload`.
  - `frontend/src/app/globals.css`: integration styles.
  - `start.ps1`, `README.md`, `ARCHITECTURE.md`, `CLAUDE_PROGRESS_HANDOFF.txt`.
- **Not changed:** model, checkpoints, inference, calculations, graph algorithms, report generation, backend API, data.

## 6. Verification (actually run)
| Check | Result |
|---|---|
| Workspace `npx tsc --noEmit` / `npx eslint src` / `npx next build` | OK / OK / OK (routes `/`, `/upload`, `/locate`, `/tracker`, `/runs/[id]/*`) |
| Backend `pytest tests` | **51 passed** |
| Module tests | Locate vitest 53/53; landing 1/1; assistant 1/1; Tracker web 1/1; Tracker backend pytest 14/14 |
| Landing | `/` serves the landing page (title "NeuroScope 3D — Unfolding the Unseen", 3D brain model loads through `/models`). Clicking **Start Segmentation** opened `/upload`. Direct loads of `/upload`, `/locate`, `/tracker` and every `/runs/<id>/…` route return 200 (refresh-safe); `/?run=<id>` still opens that case. |
| End to end | Landing → Start Segmentation → four real BraTS files (BraTS-GLI-00419-000) → Start Segmentation → Results in 12 s (48.66 mL, identical to the earlier run). Generate Report: "Report ready — 6 sections". The viewer crosshair responds; Graph Analysis gives 45.8 mm. |
| Locate | Button left of Generate Report on the same row. `/locate` shows the module; status Online. A search for "Pune" returned live suggestions and 19 facilities. Back to workspace returned to the case. |
| AI assistant | The launcher's SVG is identical to the header brand's. One launcher on every page. The panel opens above the page; the workspace width is unchanged (1440). A real question received a real streamed answer, and the follow-up "And TC?" was answered in context. Close and reopen keep the same chat frame and thread; the closed panel is `inert`. |
| Tracker | 6th fan item (neighbouring buttons 55 px apart) and 6th mobile dock item. `/tracker` shows the module's New comparison page with "AI pipeline & SimpleITK connected". A real comparison through the Tracker API (BraTS-GLI-00008 timepoints 000 → 001) completed in 12 s with results and a PDF, and the module's results page rendered it. |
| Error states | With Tracker web stopped: "Tumor Tracker is not available … Start Tracker web (port 3103) and its API" + Offline; after restarting, **Try again** loaded the module. |
| Mobile 375 px | No horizontal scroll (after making Locate icon-only on small screens); the panel fits the viewport; the launcher sits above the dock. |
| ZIP archives | All four SHA-256 sums unchanged (Desktop originals and backup copies). |

## 7. Backups and recovery
- **Full backup before integration:** `C:\Users\hp\NeuroScope3D_Backup_Before_Integration_2026-10-17_06-41\backup_20261017_064127` — 380/380 files SHA-256 verified. It includes the model checkpoints (`models/baseline_checkpoints/*.pth`), configs, frontend/backend source and docs.
  - Original ZIPs: `…\original_zips\` (4 archives + `SHA256SUMS.txt`, verified).
  - Excluded (as in every earlier backup): `venv`, `frontend/node_modules`, `frontend/.next` (all regenerable), `backend/runs` (temporary cases, auto-deleted), `data/raw` (13 GB read-only source dataset, unchanged), `.git/objects` (no commits exist).
- **Checkpoint after integration:** `C:\Users\hp\NeuroScope3D_backups\backup_20261017_072051` (405/405 verified).
- Separate checkpoints before each of the four integrations were **not** made. The integration was done in one pass with new files kept separate, so it can be undone file by file (§5).
- **To restore the pre-integration project:**
  1. Stop all services.
  2. Copy the contents of `backup_20261017_064127` over the project folder (or into an empty folder).
  3. Delete the files listed as "New" in §5 if you restore over the existing folder.
  4. Run `cd frontend && npm install` if `node_modules` is missing.
  5. Optional: delete `C:\Users\hp\NeuroScope3D_modules` (working copies only; the ZIPs are untouched).
- Neither backup will be deleted without your decision.

## 8. Known issues and deployment blockers
- **No public deployment exists.** The website link is **http://localhost:3000** on this machine; a public URL needs hosting for the workspace, the backend (GPU), and the four module services, plus the environment variables in §3.
- The Tracker web build has `http://localhost:8008` baked in at build time; rebuild it with the production API URL before deploying.
- **AI assistant privacy:** without `LOVABLE_API_KEY`, chat messages go through the module's own cloud deployment (third-party AI). It receives no case data from the workspace; the module's optional case bridge is not used.
- Escape closes the assistant only while focus is in the workspace; inside the chat frame use the × button (browsers do not pass keys out of a cross-origin frame).
- The Tracker's built-in **Load Sample Studies (BraTS Demo)** fails on its own backend ("not a gzip file"): the module generates uncompressed data under `.nii.gz` names. This is a defect in the supplied module and was not patched. Real uploads work (§6).
- The Tracker presents results with clinical wording of its own ("Disease Progression", "RANO 2.0", risk labels). It was left unchanged, as required; it is a research tool, like the rest of NeuroScope 3D.
- The assistant service, Locate (Vite dev mode) and Tracker web start in a few seconds; the Tracker API needs about 30–40 s to load its model.
