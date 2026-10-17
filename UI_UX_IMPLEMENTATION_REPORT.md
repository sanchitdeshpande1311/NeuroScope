# NeuroScope 3D — UI/UX Implementation Report (2026-10-17)

> **Update — refinement round (later on 2026-10-17).** Sections 11–14 at the end describe the targeted refinements made after this report was first written: a deeper Cherry Cola, larger type, calmer cards, navigation moved into the cream panel, the case id removed from the header, Refinement hidden from navigation, Show Definitions, viewer framing, and a cleaner PDF. Where sections 1–10 disagree with sections 11–14, the later sections are current.

## 1. Executive summary
- **What changed.** The existing Next.js + FastAPI application was redesigned in place into a desktop-first workspace:
  - a compact Cherry Cola header;
  - a Vanilla Cream 25 % feature panel and a near-black 75 % imaging stage;
  - a circular-plus fan menu for the six features.
- **What stayed.** All scientific computation was kept: MONAI 3D U-Net inference, validation, NIfTI output, refinement, the spatial graph with Dijkstra, expert metrics and retention.
- **New backend feature.** The header **Generate Report** now builds a new branded PDF from the current case's real outputs, using the user's graph selection.
- **Verification.** Every visible control was checked in the browser against real application state.
- **Results.** 51/51 automated tests pass, and the production build succeeds.

**Design tools.** Figma and 21st.dev integrations were **not available** in this environment. The only design-related tool present, DesignSync, works only inside a user-started `/design-sync` session and was not used. No Figma file was created. The design system was implemented directly in the repository; visual checks were done in the Claude browser pane.

## 2. Design system (`frontend/src/app/globals.css`, `frontend/src/components/ui.tsx`)

| Area | Implementation |
|---|---|
| Brand tokens | Cherry Cola `#582B36` (with 700/600/300/100 steps); Vanilla Cream `#F6EBDD` (with 50/100/200/300 steps). |
| Ink | `#2B1D21`, `#5B474D`, muted `#8A757A`. |
| Semantic | Valid green `#2F8A57`, invalid red `#B93A32`, warning amber `#B97A10`, neutral grey. |
| Imaging | Stage `#070708`; glass `rgba(24,18,20,.74)` with blur, used only for controls floating over the viewer. |
| Labels | NCR/NET red, edema green, enhancing yellow, expert reference blue. |
| Type | Inter / Segoe UI Variable / system stack (no web-font download); 11.5–26 px scale; tabular numbers for metrics. |
| Shape and depth | Radii 6 / 10 / 14 px; two elevation levels plus a dark shadow; cream cards with 16 %-opacity Cherry borders. |
| Motion | 140 / 220 ms with one easing curve; all transitions disabled under `prefers-reduced-motion`. |
| Primitives | Buttons (primary, secondary, quiet, danger, header, dark, icon, sm/lg); action rows; status pills (Empty / Checking / Valid / Invalid); messages (error / warn / ok / info); custom select; segmented control; switch (`role="switch"`); range slider with a filled track and value readout; tooltips and info tips (hover + keyboard focus); progress bar (determinate / indeterminate); tables (light and dark); empty states; toast. |
| Icons | lucide-react outline icons throughout (already installed). |

## 3. Pages and components changed

| File | Change |
|---|---|
| `src/app/globals.css` | Rewritten: the whole design system. |
| `src/components/ui.tsx` | New: control primitives. |
| `src/components/AppShell.tsx` | Rewritten: header with real Generate Report; circular-plus fan navigation (Escape / outside-click close, disabled states, radial labels); mobile dock; toast. |
| `src/components/LayersMenu.tsx` | New: Layers popover (outside-click / Escape close), shared case layers (2D labels / 3D surface / masks), crosshair readout. |
| `src/components/RunContext.tsx` | Extended: workspace context and `useViewerConfig`, so pages configure the single persistent viewer. |
| `src/components/NiiVueViewer.tsx` | Model-prediction visibility setting; X-ray surfaces when the volume rendering is visible. The previous rendering logic is unchanged. |
| `src/lib/store.tsx` | Current case (sessionStorage), graph selection per case, `showPrediction`. |
| `src/lib/cursor.ts` | New: external store for the crosshair readout. |
| `src/app/layout.tsx` | Metadata. |
| `src/app/page.tsx` | Rewritten: Upload is the entry point (introduction page removed). |
| `src/app/upload/page.tsx` | Redirects to `/`. |
| `src/app/runs/[id]/layout.tsx` | Rewritten: case workspace, persistent viewer, opens at the tumour centroid. |
| `src/app/runs/[id]/page.tsx` | Results. |
| `src/app/runs/[id]/viewer/page.tsx` | Full-screen viewer. |
| `src/app/runs/[id]/graph/page.tsx` | Three cards + graph Layers. |
| `src/app/runs/[id]/refinement/page.tsx` | Before / After + table. |
| `src/app/runs/[id]/expert/page.tsx` | Comparison table + layers / empty state. |
| `src/app/runs/[id]/report/page.tsx` | Secondary route restyled. |
| `src/components/ViewerControls.tsx` | Deleted. It was replaced by LayersMenu, and no references remained; a copy is in the backup. |

**Backend.**
- `ml/report_full.py` (new): full PDF report.
- `backend/main.py`: `POST /api/runs/{id}/report`; `report_full.pdf` added to the served allow-list.
- `ml/spatial_graph.py`: bug fix, so a path from a vertex to itself no longer crashes (found by the new report test).

**Tests.**
- `tests/test_report_full.py` (new).
- A zero-length-path test added to `tests/test_spatial_graph.py`.

## 4. Features preserved
- Upload validation (per file + set).
- MONAI UNet inference.
- NIfTI labels 1/2/4 on the original grid.
- WT/TC/ET volumes.
- Linked axial / coronal / sagittal + 3D views with orientation labels and the world/voxel readout.
- Refined and expert layers.
- Spatial graph with modes A/B, lattice spacing, crosshair endpoints and the whole-brain lattice.
- The voxel-level geodesic extent (now in the report appendix; the API endpoint is unchanged).
- Refinement comparison.
- Expert metrics.
- The original processing PDF (`/runs/[id]/report`).
- Delete-now.
- Recent cases (collapsed section on Upload).
- 23 h retention.
- The project has no chatbot or neurologist-location feature at present. The earlier canned chatbot was removed in a previous round, so there was nothing to integrate.

## 5. Interactions (all verified in the browser unless noted)
- **Fan menu:** opens and closes (rotating +, staggered items); Escape and outside click close it; the active item is highlighted; items are disabled without a case; hover labels sit radially outward.
- **Upload:**
  - A fake `.nii.gz` → "Invalid" pill and the message "This file is not a valid T1 image: … not gzip-compressed NIfTI data."
  - Start Segmentation stays disabled with "Add a valid T1 file to continue."
  - Replace → Valid. All four + expert → Valid → enabled.
  - A **real click** ran the segmentation: progress went "Uploading sequences" → "Running segmentation", then Results opened automatically after 10.7 s (real inference, run `c9e61b4e…`).
- **Results:** real volumes (48.66 mL; WT/TC/ET 48.66 / 12.45 / 5.80).
- **Layers popover:** each control changed the matching renderer property (edema alpha 255 → 0; label opacity 0.5 → 0.9; TC surface hidden; surface opacity 0.3; prediction off → 0; Original/Refined swap; expert → 0.6); Escape closes it; volumes unchanged.
- **Graph:**
  - Exactly three cards.
  - Overlays drawn = API (2,127 vertices / 12,395 edges).
  - 3D+slices ↔ 3D-only; path toggle; Reset restores the camera (azimuth 110°, elevation 15°).
  - Mode B: 58.6 mm, 4.0 mm through non-tumour tissue (Mode A: 45.8 mm).
  - Returning to Results removes the graph overlays and restores slices and volume, with one canvas.
- **Refinement:** two linked viewers and a real table (28 voxels from 12 fragments; WT −0.028 mL; WT components 22 → 10); no expert metrics on the page.
- **Expert:** real table (Dice 0.755 / 0.727 / 0.766, precision, FP/FN) and the expert layer at 0.6.
- **Full-screen viewer:** the same viewer instance at full width; Layers, Browser full screen and Exit.
- **Header Generate Report:** real PDF (7 sections, 378 KB, application/pdf), toast with an Open link.
- **Narrow width** (375 px, mobile preset): the panel stacks above the viewer and the bottom dock offers all six features.
- **Console:** only the deliberate 422 from the fake-file test. Backend error log: empty.

## 6. Backend / API changes
- New: `POST /api/runs/{id}/report?src=&dst=&mode=&alpha=&target_mm=` → `{status, file, sections, seconds}`.
  - Invalid selection → 422 `graph_error`.
  - An unbuildable graph → the graph section is omitted.
  - Other failures → 500 `report_failed`, with no local paths in the message.
- Existing endpoints are unchanged.

## 7. Tests (actual)
| Command | Result |
|---|---|
| `venv\Scripts\python -m pytest tests -q -p no:cacheprovider -W ignore` | **51 passed in 87 s** |
| `cd frontend && npx tsc --noEmit -p .` | OK (no errors) |
| `npx eslint src` | OK (no warnings) |
| `npx next build` | OK (routes `/`, `/upload`, `/runs/[id]` + viewer / graph / refinement / expert / report) |
| Browser checks (Claude browser pane, 960×640 desktop emulation and 375×812 mobile) | As listed in §5 |

## 8. Screenshots
Screenshots were captured in the browser pane during review: Upload empty and filled, fan menu, Results, the Layers popover, Graph with its Layers, Refinement, Full-screen viewer and the mobile Results view. They were not saved as files in the repository.

Large desktop emulations (1440 px) render scaled into a corner of the pane's capture, so the desktop review used 960×640. Wide-monitor layouts were not screenshot-verified.

## 9. Known issues and limitations
- No human visual review. "Premium" polish was judged from pane screenshots only.
- The PDF was checked by reading its pages (layout, tables, figures). It was not tested in other PDF viewers.
- The 3D crosshair lines (NiiVue) are long and can feel busy in the 3D-only graph view.
- `window.open` from Generate Report may be blocked by some browsers. The toast always provides an Open link as a fallback.
- Fonts use the system stack (Segoe UI on Windows), not Inter, because no web-font download was added.
- The refinement view reloads the case viewer when you leave it (the two compare viewers replace it); the files come from the browser cache.
- T4 timing and model-eligibility questions from earlier rounds are still open.

## 10. Running it
```
powershell -ExecutionPolicy Bypass -File .\start.ps1
```
Open http://localhost:3000. The backend runs on http://127.0.0.1:8000. Keep the terminal open; Ctrl+C stops both.

---

## 11. Refinement round: integrations
- **Backup first:** `C:\Users\hp\NeuroScope3D_backups\backup_20261017_031531` (355/355 files SHA-256 verified).
- **Figma:** the Figma plugin is installed, but its MCP server requires authorisation that has not been granted in this session. No Figma file was read, created or modified.
- **21st.dev:** the `21st-ui` skill is installed, but no 21st.dev MCP tools (search / get_component) are loaded; the server needs an API key (`API_KEY_21ST`). No 21st.dev component was searched, installed or copied.
- **Result:** every component in this round is custom code in the existing design system; no dependency was added.

## 12. Refinement round: what changed
| Area | Change |
|---|---|
| Tokens (`globals.css`) | Cherry Cola deepened to `#4A202B` and centralised with `--cherry-rgb`, so every tint, border and focus ring derives from one value. New surface tokens (surface / raised / sunken), hairlines, three shadow levels, focus ring, stage tokens. Label colours unchanged. |
| Typography | Scale raised for presentation: 13 / 14 / 15 / 16 / 18.5 / 25 / 40 px (was 11.5 / 12.5 / 13.5 / 15 / 18 / 26). Secondary text +2.5–3 px, body and buttons +2.5 px, card titles +3.5 px, headings and metric values +7 px, hero +14 px. Panel widened to `clamp(350px, 27vw, 480px)`. |
| Cards | Three weights (`.card`, `.card.feature`, `.card.flat`). WT/TC/ET are one surface split by hairlines, with a colour dot and the unit beside the value. Results actions: the Full-screen viewer as a primary bar, the rest as one grouped list with hairline dividers. Sequence cards: status bar on the left edge, file row with name and size. Tables: muted headers, hairline rows, selected-row accent. Status badges use 7 px radii instead of pills. |
| Header | Brand + Generate Report only; the case id and header note were removed (the case id stays in state, URLs and the PDF). |
| Navigation | The existing circular-plus nav was moved onto an opaque dock at the bottom of the cream panel (`PanelDock`). Five items in a balanced quarter circle; dim scrim while open; radial labels. Full-screen viewer: bottom-left of the stage. |
| Refinement | Removed from the navigation (fan and mobile dock) and from Results. The route, API, masks, report section and tests are unchanged. |
| Viewer | A 50 px stage toolbar (Layers · readout · page actions) keeps controls off the images; the viewer is inset; `multiplanarPadPixels` 10 separates the views; each view has a faint frame and name taken from NiiVue's tile geometry; the crosshair is softened (1 px 2D, 0.6 mm 3D rod, cyan at 62 %) but still marks the true linked point; orientation letters ≥ 15 px in light cream. |
| Show Definitions | New last switch in every Layers menu (Results, Full-screen viewer, Expert, Graph), off by default and session-only. See ARCHITECTURE §5 for the method (renderer mapping in 2D, ray casting with NiiVue's MVP in 3D). |
| Upload | Start Segmentation card is sticky above the dock, so the action is always visible; cards can no longer be squeezed when the panel overflows. |
| PDF (`ml/report_full.py`) | Deeper Cherry; footer no longer repeats a warning on every page (the disclaimer appears once); removed the ≥1 mL component clause, the privacy/implementation note, the volume formula outside the appendix, the refinement method restatement, the "not confirmed errors" note and the removed-voxel figure, the "further components" note, the projection wording, the block-voxel/26-neighbour/scipy details and the geodesic note; shorter captions; the development-evaluation conclusion is one sentence. 5 pages for the test case (was 5–6). |
| Dev only | `next.config.ts`: the Next.js dev badge moved to bottom-right (bottom-left is the navigation). |

**Files changed:** `frontend/src/app/globals.css`, `frontend/src/app/page.tsx`, `frontend/src/app/runs/[id]/{layout,page}.tsx`, `frontend/src/app/runs/[id]/{graph,expert}/page.tsx`, `frontend/src/components/{AppShell,LayersMenu,NiiVueViewer,ui}.tsx`, `frontend/src/lib/store.tsx`, `frontend/src/lib/picking.ts` (new), `frontend/next.config.ts`, `ml/report_full.py`, `ARCHITECTURE.md`, `README.md`, this report, `CLAUDE_PROGRESS_HANDOFF.txt`. Model, inference, graph algorithms, calculations and API contracts were not changed.

## 13. Refinement round: verification (actually run)
| Check | Result |
|---|---|
| `venv\Scripts\python -m pytest tests -q -p no:cacheprovider -W ignore` | **51 passed** (86 s) |
| `npx tsc --noEmit -p .` / `npx eslint src` / `npx next build` | OK / OK (0 warnings) / OK (all routes, including the hidden refinement route) |
| Show Definitions, 2D | The value read at the hovered point matched NiiVue's own reported value for the same location at all 4 test points; a real mouse hover over edema showed "Edema"; default OFF confirmed after a fresh load on Results and Graph. |
| Show Definitions, 3D surfaces | Hovering the projected centre vertex of the WT, TC and ET meshes returned "WT" (WT encloses the others); with WT hidden, the TC region returned "TC" and the surroundings "Brain". |
| Show Definitions, graph | Over the real Dijkstra path: Path Source, Path Destination, Shortest Path and Non-tumour Path Segment where they are frontmost; Vertex where a vertex sphere is in front; a tumour edge returned "Tumour Edge"; background returned nothing. Real-mouse hover showed "Path Destination". Pick time median 7.5 ms, max 25 ms. |
| Navigation | Fan opens from the panel corner, labels radial, Escape closes it; five items in the fan and in the mobile dock. |
| Report | Real header-button run: "Report ready — 7 sections", `application/pdf`, 326 KB, 5 pages; every page was read back and the removed wording is absent. Path 45.8 mm and Dice 0.755 / 0.727 / 0.766 match the app. |
| Viewports (browser pane) | 1440×900 (Results, Upload, Graph), 960×640 (Expert, Graph Layers, Full-screen viewer), 375×812 (Results). No horizontal scroll at 960 or 375. Fixed during review: cards squeezed in the scrolling panel, the readout overlapping the full-screen buttons at 960, the header wrapping at 375, the dev badge over the navigation. |
| Console / server | No console errors on the pages checked; backend error log empty. |

## 14. Refinement round: known issues and not verified
- **Not re-run this round:** a new end-to-end upload and segmentation. Upload logic is unchanged (only its presentation); it was last verified in the previous round.
- Show Definitions was mostly exercised with synthetic pointer events at projected coordinates; real-mouse hover was checked on two points (Edema, Path Destination).
- In the 3D view, MRI volume-rendering pixels are not named (only meshes are); this is deliberate.
- The 3D crosshair still spans the volume extent (NiiVue draws it that way); it is thinner and softer but not shortened.
- Hot-reloading the viewer module during development can leave the hover listener detached until a page reload (dev only).
- Wide monitors above 1440 px were not screenshot-checked; the pane cannot show them unscaled.
- The browser pane was intermittently hidden, so some screenshots were stale; checks that depended on them were repeated after the pane became visible.
- Figma and 21st.dev remain unavailable until they are authorised (§11).
