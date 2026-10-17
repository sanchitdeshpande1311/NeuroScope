# Architecture and Data Flow (as implemented, 2026-10-16)

> Research and teaching use only. Not for clinical use.

## 1. Layout

```text
backend/main.py        FastAPI app: upload, validation errors, run storage, retention, file serving
ml/inference.py        validation, input sanity check, Segmenter (preprocess -> UNet -> back to original grid), labels, volumes, metrics
ml/pipeline.py         run_case(): validation -> inference -> refinement (comparison) -> graph/Dijkstra -> meshes -> PDF -> result.json
ml/graph_analysis.py   region component graph + multi-source Dijkstra geodesic extent (descriptive)
ml/meshes.py           marching cubes -> GIfTI surfaces in world mm
ml/report.py           PDF report (reportlab + Pillow snapshots)
ml/preprocessing.py, ml/dataset.py, ml/train.py   training pipeline (unchanged semantics)
ml/refinement.py, ml/graph_builder.py             original refinement / offline graph builder (not on the API path)
execution/             CLI tools: run_inference, evaluate_heldout, make_heldout_list, calibrate_input_sanity, audit_old_uploads, backup_project, make_marker_case
scripts/               original numbered data/training scripts (01-12)
configs/               heldout_cases.json (patient-disjoint), input_sanity_reference.json (40 training cases)
frontend/              Next.js 16 + React 19 + NiiVue 0.69 UI
tests/                 pytest: judging challenges + pipeline/API/retention
models/baseline_checkpoints/best_metric_model.pth   weights used for inference
```

## 2. Inputs
There are four co-registered 3D NIfTI files: `t1n` (T1), `t1c` (T1Gd), `t2w` (T2) and `t2f` (FLAIR). An expert mask is optional.

The UI detects which sequence each file is from its name, using both BraTS 2021 names (`_t1`, `_t1ce`, `_t2`, `_flair`, `_seg`) and BraTS 2023 names (`-t1n`, `-t1c`, `-t2w`, `-t2f`, `-seg`). The user can correct any assignment. The server always re-validates.

## 3. Request flow (`POST /api/predict`)
1. **Upload.** Each upload is streamed to `backend/runs/<uuid4 hex>/` and aborted above 1 GB.
2. **Validation** (`validate_case`) runs these checks:
   - Size ≤ 1 GB.
   - The whole gzip stream decompresses.
   - The NIfTI header is valid (sizeof_hdr 348/540).
   - The volume is 3D (or 4D with t = 1), with every axis ≥ 8 voxels.
   - All values are finite; the volume is not all zero and not constant.
   - The affine is valid and the spacing is > 0.
   - All four sequences have the same shape and the same affine (tolerance 0.01).

   Any failure returns HTTP 422 (413 for size) with a code. The run directory is deleted and no segmentation is produced.
3. **Input sanity check** (`input_sanity`) compares simple features with ranges measured on 40 training cases:
   - Foreground volume, size along each axis, ellipsoid fill.
   - Correlations between sequences.
   - Zero background around the field of view.

   Clear mismatches are refused (`not_skull_stripped`, `not_brain_like`); milder ones produce a warning. This is a heuristic, not a validated detector.
4. **Preprocessing**, identical to `ml/preprocessing.get_val_transforms`:
   - Stack the channels in the order t1n, t1c, t2w, t2f.
   - Orientation → RAS.
   - Spacing → 1.0 mm isotropic (bilinear).
   - NormalizeIntensity (non-zero voxels, per channel).
5. **Inference:**
   - Model: MONAI `UNet(3D, 4→3, channels 16–256, strides 2×4, 2 res units)`.
   - Sliding window over 128³ ROIs, overlap 0.25, fp32, deterministic cuDNN.
   - Output: sigmoid probabilities for TC, WT, ET.
6. **Back to the original grid.** The probabilities are resampled with `scipy.ndimage.affine_transform`, using `inv(A_processed) · A_original` (trilinear, 0 outside the field of view). This inverts the reorientation and resampling, including flips and anisotropic spacing. Thresholding at 0.5 happens on the original grid.
7. **Label mapping** (`regions_to_labels`):
   - Hierarchy enforced upward: ET ⇒ TC ⇒ WT.
   - Labels: 4 = ET, 1 = TC \ ET (NCR/NET), 2 = WT \ TC (edema), 0 = background.
8. **Output.** `seg.nii.gz` is written as uint8 with the T1Gd affine and qform/sform, then reopened to check its shape, affine and labels {0, 1, 2, 4}.
9. **Volumes** = voxel count × product of the header spacing / 1000 mL. WT = labels {1, 2, 4}, TC = {1, 4}, ET = {4}.
10. **Refinement** (comparison only). `remove_small_components` drops 26-connected WT components smaller than 10 mm³ and writes `seg_refined.nii.gz`. It is not the primary output, because on 30 held-out cases it changed WT Dice by only +0.0008.
11. **Graph analysis** (`ml/graph_analysis.py`, descriptive, never changes masks):
    - **Component graph.** Nodes are the connected components of WT, TC and ET, with volume in mL and world-mm centroid. Edges record which component sits inside which (ET → TC → WT).
    - **Dijkstra.** The WT voxels form a sparse graph: 26-neighbourhood, with edge weight = physical distance in mm, so anisotropic spacing is respected. `scipy.sparse.csgraph.dijkstra(min_only=True)` runs from all TC voxels at once. The result is the shortest-path distance through predicted tumour tissue from the core to every WT voxel. The max, 95th percentile and mean are reported.
12. **Meshes.** Brain, WT, TC and ET surfaces are built by marching cubes, mapped through the affine to world mm, and saved as GIfTI.
13. **Report and metadata.** `report.pdf` includes volumes, snapshots, provenance (model, checkpoint SHA-256, preprocessing, input SHA-256, code version, device, timings), expert comparison if supplied, limitations and the disclaimer. Everything is also saved in `result.json`.
14. **Clean-up.** The raw `t1n` and `t2w` uploads are deleted. `t1c` and `t2f` are kept so the viewer can show them.

## 4. Storage, privacy and retention
- **Run IDs** are `uuid4().hex`. Files are served only through `GET /api/runs/{id}/files/{name}`, with a fixed list of allowed names (no directory listing).
- **Automatic deletion** (`cleanup_expired`) runs at startup and every 15 minutes. It removes only:
  - run-ID-named directories in `backend/runs` older than 23 h;
  - legacy upload copies older than 23 h, matching `backend/temp/<ts>/{t1n,t1c,t2w,t2f}.nii.gz` and `backend/results/<ts>_t1c.nii.gz`.

  It cannot touch models, datasets, generated masks or reports, or any name outside those patterns. This is tested.
- **Manual deletion:** `DELETE /api/runs/{id}` removes a run immediately.
- **No external services:** scans are never sent anywhere else.

## 4b. API endpoints (backend/main.py)

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Status, GPU, retention. |
| `POST /api/validate-file` | Validate ONE uploaded sequence or expert mask right away (same checks as `validate_case`). Returns its shape, spacing, affine and axis codes. The file goes to a temporary directory that is deleted before the response. |
| `POST /api/validate-set` | Cross-sequence check (shape and affine, same tolerance) on the summaries from `validate-file`. Names the sequences that don't match. |
| `POST /api/predict` | Authoritative validation, then the full pipeline. |
| `GET /api/runs/{id}` | `result.json` plus the list of files. |
| `GET /api/runs/{id}/files/{name}` | Allowed files only. Cached privately for 1 h (run files never change); the PDF is served inline. |
| `GET /api/runs/{id}/refinement` | Before/after comparison computed from this run's saved `seg.nii.gz`, `seg_refined.nii.gz` and, if present, `expert.nii.gz`, using `ml/refinement_compare.py`. Cached as `refinement.json`. |
| `GET /api/runs/{id}/graph` | Component graph, Dijkstra summary, candidate destinations and the default path. Uses `GeodesicPathEngine`, held in a small in-memory cache (4 runs). |
| `GET /api/runs/{id}/graph/path?node=` or `?x=&y=&z=` (mm) | The exact predecessor-chain path Dijkstra computed to that WT voxel (or the nearest WT voxel to the point). Includes `length_mm` (Dijkstra distance) and `length_from_points_mm` (sum of segment lengths, as a check). |
| `GET /api/evidence/refinement` | Held-out summary from `results/refinement_eval_summary.json` (aggregate only). |
| `DELETE /api/runs/{id}` | Delete now. |

`ml/refinement_compare.py` gives explicit TP/FP/FN, Dice and sensitivity, the miss rate FN/(TP+FN) and the FP share FP/(TP+FP). Percentage changes use the before count as the denominator. The verdict comes from a fixed rule: |ΔDice| > 0.001.

## 5. Frontend (Next.js 16 App Router, redesigned 2026-10-17, refined the same day)

**Shell** (`src/components/AppShell.tsx`, used by `src/app/layout.tsx`):
- A compact Cherry Cola (`#4A202B`) header with only the brand and **Generate Report**. The case id is not shown (it stays in state, URLs, API calls and the PDF). The report button calls `POST /api/runs/{id}/report` with the user's current graph selection and opens the returned PDF.
- Below it, a workspace grid: left feature panel (`clamp(350px, 27vw, 480px)`) and a near-black stage. In full-screen mode the panel is hidden.
- The left panel ends in an opaque **panel dock** (`PanelDock`, 84 px, sticky) holding the one-line research note.
- A circular-plus **feature navigation** sits on that dock at the bottom-left of the cream panel (in the full-screen viewer, where the panel is hidden, at the stage's bottom-left). It is `position: fixed`, so no panel overflow can clip it.
  - It expands upward and to the right in a balanced quarter circle: Upload, Results, Full-screen 3D Viewer, Graph Analysis, Expert Comparison.
  - **Refinement Before & After is hidden from the navigation and from Results** for now; its route, API, masks and report section are unchanged.
  - Labels are placed radially outward, so they never cover an icon. A dim scrim covers the app while it is open.
  - The menu closes on Escape or an outside click. Case features are disabled until a case exists.
  - Below 900 px the fan is replaced by a bottom dock with the same five items.
- The app opens directly on Upload (`/`). The old introduction page was removed, and `/upload` redirects to `/`.

**Design system**:
- `src/app/globals.css` holds the tokens: brand colours (`--cherry` and `--cherry-rgb`, so every tint derives from one value), semantic colours, a presentation-sized type scale (13–40 px), radii, three elevation levels, focus ring, motion, and `prefers-reduced-motion` handling.
- Cards come in three weights: `.card` (default), `.card.feature` (the page's primary card) and `.card.flat` (supporting information). Metric tiles share one surface divided by hairlines, and the Results actions are one grouped list.
- `src/components/ui.tsx` holds the primitives: Switch, Slider, Select, Segmented, StatusPill, Tip, InfoTip.
- No new dependencies were added; icons come from lucide-react.

**State**:
- `src/lib/store.tsx` holds:
  - the upload slots (File objects);
  - shared viewer settings (2D labels, 3D surfaces, opacities, prediction / refined / expert);
  - the current case id (sessionStorage);
  - the graph selection per case (also used by the report);
  - the crosshair per case;
  - **Show Definitions** (in memory only, so it is off in every fresh session; shared by all Layers menus).
- `src/lib/cursor.ts` is a small external store for the crosshair readout, so only the readout re-renders.

**Routes**:

| Route | Left panel | Stage |
|---|---|---|
| `/` Upload | Four sequence cards (T1, T1Gd, T2, FLAIR) and a separate optional expert-mask card. Each card shows Empty / Checking / Valid / Invalid, Replace and Remove. A file is validated by the server as soon as it is chosen; a set check follows. **Start Segmentation** shows real upload progress, then an indeterminate state during processing. Recent cases are listed in a collapsed section. | Empty, black. |
| `/runs/[id]` Results | Hero estimated tumour volume with its NCR/NET · edema · enhancing composition (from the reported nested volumes), WT/TC/ET tiles, the Full-screen viewer action, then Graph, Expert, Generate Report and Download SEG.nii.gz, delete. | Persistent case viewer + **Layers** popover (2D labels / 3D surface / masks / Show Definitions) + readout. |
| `/runs/[id]/viewer` | Hidden (full width). | Same persistent viewer + Layers + Browser full screen + Exit. |
| `/runs/[id]/graph` | Exactly three cards: **Path settings** (source and destination components or crosshair, which can't be the same; cost mode A/B with α; lattice spacing; the path result inline), **Graph overview** (vertices / edges / components), **Tumour components** (ID, mL, centroid, distance from source, path status; click to highlight). | Persistent viewer with graph overlays + graph Layers popover (Visibility / Opacity / View). |
| `/runs/[id]/refinement` | Hidden route (not linked from the navigation or Results). Status (changed / no change, voxels), operation. | Two linked viewers (Before = `seg.nii.gz`, After = `seg_refined.nii.gz`) + comparison table. |
| `/runs/[id]/expert` | Comparison table (volumes, Dice, sensitivity, precision, FP/FN voxels) + Model / Expert layer switches. Without a reference: an empty state with "Go to Upload". | Persistent viewer with the expert layer. |
| `/runs/[id]/report` | Secondary route, not in the navigation: the saved processing PDF and provenance. | The PDF. |

**Persistent viewer**:
- `src/app/runs/[id]/layout.tsx` mounts ONE `NiiVueViewer` per case in the stage. Pages describe what they need through `useViewerConfig(...)`: mode, `hide3DVolume`, connectome / tract overlays, setting overrides, which Layers menu to show, or `hidden` (Refinement, Report).
- Moving between Results, Viewer, Graph and Expert therefore never reloads the MRI.
- Page-specific stage overlays are rendered into a portal slot in the stage.
- The viewer opens at the centroid of the largest predicted WT component. Occluded surfaces are drawn with NiiVue X-ray (0.35) when the volume rendering is visible.
- The stage has a 50 px toolbar (Layers left, crosshair readout centre, page actions right), so controls never sit on the images. The viewer sits below it with a small inset; NiiVue's `multiplanarPadPixels` separates the four views, and each view gets a faint frame and name positioned from NiiVue's own tile geometry (`screenSlices`).
- Crosshair: softened cyan, 1 px in 2D and a 0.6 mm rod in 3D; it still marks the true linked coordinate. Orientation letters use `fontMinPx` 15 and a light cream colour.

**Show Definitions** (`src/lib/picking.ts`, used by `NiiVueViewer`):
- Off by default; the switch is the last control of every Layers menu (Results, Full-screen viewer, Expert, Graph).
- 2D views: NiiVue's own canvas-to-volume mapping (`canvasPos2frac` → `frac2mm` → `mm2vox`) and the value of the drawn label volumes (expert reference over prediction; hidden labels and hidden layers ignored). Names: NCR/NET, Edema, Enhancing Tumor, Expert Reference. MRI intensity is never named.
- 3D view: a ray unprojected with NiiVue's MVP matrix for that tile (its orthographic depth range is reversed: ndc z = +1 is the camera side), intersected with the tumour/brain surface triangles, the spheres and cylinders NiiVue builds from each graph layer's JSON, and graph line segments (4 px screen tolerance). Priority: solid graph objects > thin graph lines > tumour surfaces > brain; nearest wins within a class.
- Pointer handling is passive, timer-throttled (≤ ~20 picks/s), hidden while dragging, and removed on unmount. Measured pick time on the graph page: median 7.5 ms, max 25 ms.

**Report** (`ml/report_full.py`, `POST /api/runs/{id}/report`):
- A branded PDF (A4, Cherry Cola header band, "Page X of Y", one disclaimer callout; the running footer carries only the report name and page number). Wording was trimmed on 2026-10-17: no small-component notes, removal-rule restatements, removed-voxel figure, geodesic note or repeated warnings.
- Sections: overview and findings; MRI sequences (metadata + T1Gd/FLAIR previews); segmentation (volumes + 3-plane overlay); refinement (before/after table only); graph (stats, largest 8 components, the selected Dijkstra path, tissue breakdown, top-down figure); expert comparison (only with a reference); technical appendix (model, methods, development evaluation, hashes, limitations).
- Sections without data are omitted. An invalid graph selection returns 422 and is never silently replaced.
- Output: `report_full.pdf` in the run directory (served by the allow-list).

### Earlier frontend versions (kept in the backups)
The earlier version lives in the backups (`C:\Users\hp\NeuroScope3D_backups\backup_20261016_220130`). It showed upload, viewer, numbers, graph summary and refinement on one screen.
- **Page:** `frontend/src/app/page.tsx` uploads with `XMLHttpRequest` so it can show upload progress. A result is shown only when the backend reports `status=complete` and `seg.nii.gz` exists. `?run=<id>` reopens a run.
- **Viewer:** `NiiVueViewer.tsx` uses one NiiVue canvas laid out as a 2×2 grid: coronal, sagittal, axial and a 3D render. All four share one crosshair.
  - Orientation letters come from the affine.
  - Neurological convention: patient right on screen right.
  - The label overlay uses a colour map (1 red, 2 green, 4 yellow) with per-label toggles and opacity.
  - Brain/WT/TC/ET meshes have toggles and opacity; the expert overlay is blue.
  - The readout shows world mm and the voxel index on the original grid, computed from the inverse of the input affine.
- **Panels:** volume cards with the formula, model-vs-refined table (Δ mL, Δ %), expert Dice/sensitivity, graph and Dijkstra summary, PDF and NIfTI download, "Delete my data now", and the disclaimer bar and footer.

## 7. Spatial graph analysis (ml/spatial_graph.py) — graph construction, coordinates, costs, Dijkstra

**Purpose.** A descriptive spatial connectivity analysis of the CURRENT prediction. It is not a growth or invasion model, and no simulation of spread is implemented.

**Inputs.**
- The run's `seg.nii.gz`, i.e. the model prediction, labels 0/1/2/4.
- The brain domain: the non-zero voxels of the run's `t1c.nii.gz` OR `t2f.nii.gz` (skull-stripped inputs), with holes filled.
- The expert mask is never read (tested).

**Graph G = (V, E, W).**
- **Vertices V.**
  - The grid is tiled into blocks of s_a = max(1, round(target_mm / spacing_a)) voxels per axis. The default target is 4 mm; 3 and 6 mm are selectable. This gives a near-isotropic physical lattice for anisotropic voxels.
  - A block is a vertex if ≥ 50 % of its voxels are brain, or if it contains any predicted-tumour voxel.
  - Each vertex stores: id; block-centre voxel coordinates (i,j,k, may be .5); world mm = A·[i,j,k,1] (affine applied once); class = the majority predicted label of its brain voxels (0 non-tumour brain, 1 NCR/NET, 2 edema, 4 enhancing); per-label fractions; the WT component holding most of its voxels; its graph connected component; its degree.
- **Tumour components.**
  - 26-connected components of predicted WT at voxel level, with volume, centroid and per-label volumes.
  - Representative vertex = the component's vertex nearest its centroid. It is used when the user picks a component as an endpoint.
- **Edges E.**
  - 26-neighbour adjacency between existing block-vertices (face, edge and corner neighbours). This is the only rule; nothing bridges gaps, and disconnected parts stay disconnected.
  - Each edge is stored once (13 half-offsets).
- **Edge length** = ‖A[:3,:3]·(Δblock ⊙ s)‖ in mm, so axial, face-diagonal and corner steps differ and anisotropy is handled. For the 1 mm BraTS grid at 4 mm the lengths are 4.0, 5.657 and 6.928 mm.
- **Cost W.**
  - Mode A: cost = length.
  - Mode B (EXPERIMENTAL, hypothetical): cost = length × (w_u + w_v)/2, with w = 1 for tumour-class vertices and w = α (1–100, user-chosen) otherwise. It only encodes a stated preference for staying inside the predicted tumour; it is not a biological resistance model.
- **Integrity checks**, reported with every graph: valid vertex references; no self-loops; no duplicate edges; finite positive lengths; finite non-negative costs; finite coordinates.
- **Statistics:** vertices, edges, connected components (scipy `connected_components`), largest component, isolated vertices, degree min/mean/max, vertices per class, build time.

**Dijkstra workflow.**
1. **Resolve the endpoints.** `v<id>` = a vertex; `c<id>` = a component's representative vertex; `mm:x,y,z` = the nearest vertex to a world point (the snap distance is reported).
2. **Run Dijkstra.** `scipy.sparse.csgraph.dijkstra(csr, directed=False, indices=source, return_predecessors=True)` on the cost matrix. All costs are non-negative.
3. **Unreachable destination** (a different connected component): `reachable: false` with the reason. No path is drawn.
4. **Reconstruct the path.** Follow the predecessor chain to get the exact vertex sequence. The response returns `points_mm` and `points_vox` of those vertices, plus:
   - total cost and the check `cost_from_steps`;
   - physical length (sum of segment lengths) and the straight-line distance;
   - length per tissue class (each edge split half/half between its endpoint classes);
   - vertex and edge counts, and compute time.
5. **Draw.** The frontend draws the path only from `points_mm` and `vertex_class`.
   - Segments with both ends in tumour are blue; segments touching non-tumour tissue are orange (they can be hidden with the "Non-tumour path segments" toggle).
   - Cyan and magenta spheres mark the source and destination.

**Correctness.**
- Cross-checked against networkx in tests.
- The drawn path equals the returned vertices in the browser (0 mm deviation).
- Every drawn edge is a stored graph edge.

**Rendering (frontend).**
- Vertices are NiiVue connectome nodes (one layer per class).
- Edges are tract meshes built in the browser from the returned edge list, as an MRtrix `.tck` buffer with one 2-point streamline per edge. They are thin cylinders (radius 0.12–0.15 mm), so per-layer opacity works.
- Drawn by default: tumour vertices, their 26-neighbour shell, and the edges with ≥ 1 tumour endpoint. Boundary edges are a separate toggle, off by default. The optional whole-brain lattice shows ALL edges as 1-pixel lines; its opacity is fixed by NiiVue.
- In 3D-only view the opaque volume rendering is hidden and the semi-transparent brain surface gives context. In 3D + slices the slices stay visible and occluded meshes are drawn with NiiVue's X-ray pass (opacity 0.35).

**Coordinates.**
- Everything is in NIfTI RAS+ world mm, the frame NiiVue, the GIfTI surfaces and the crosshair use. The affine is applied exactly once (tested against the brain-surface mesh built with the same affine).
- The readout voxel = inverse affine of the world point.

**Caching and provenance.**
- Graphs are cached in memory per (run, spacing). They are reused only if the SHA-256 of `seg.nii.gz`, `t1c.nii.gz` and `t2f.nii.gz` is unchanged; otherwise they are rebuilt (tested).
- Responses include: run id; the source-file SHA-256s; the segmentation array SHA-256; spacing, affine, axis codes and coordinate convention; and whether the cache was used.

**Endpoints.**
- `GET /api/runs/{id}/spatial-graph?target_mm=`: overview, checks, components, drawn subgraph, default path between the two largest components.
- `GET /api/runs/{id}/spatial-graph/path?src=&dst=&mode=A|B&alpha=&target_mm=`
- `GET /api/runs/{id}/spatial-graph/lattice?target_mm=`: the full graph, for the whole-brain layer.
- Invalid input returns HTTP 422 `graph_error`.

## 6. Offline / evaluation
- `execution/evaluate_heldout.py` evaluates on patient-disjoint held-out cases (`configs/heldout_cases.json`).
- `execution/summarize_refinement_eval.py` writes `results/refinement_eval_summary.json`: per-case before/after metrics, improved/worse/unchanged counts and runtime overhead.
- `execution/evaluate_dataset.py` runs the evaluation on any labelled BraTS-style folder (for the organiser's 40-case subset), with an optional `--baseline-json` comparison.
- `execution/audit_old_uploads.py` runs a dry-run (or narrowly scoped) clean-up of legacy upload copies.
- `scripts/05_extract_graphs.py` (offline demonstration only; nothing reads its output) now uses the deterministic validation transforms and writes `data/processed/graphs_v2/`. The old `data/processed/graphs/` came from random training crops and has T1/T1Gd means swapped. It is deprecated and kept, not deleted.

## 6. Integrated modules (2026-10-17)
Four supplied projects run as their own services and are connected to the workspace; see `INTEGRATION_REPORT.md` for ports, commands, variables, verification and recovery.
- **Landing page** at the public root `/`: `next.config.ts` rewrites `/`, `/assets/*` and `/models/*` to the landing service (`NEUROSCOPE_LANDING_ORIGIN`). Its Start Segmentation button opens `/upload`, where the Upload page now lives. Without a landing service, `src/app/page.tsx` redirects `/` to `/upload`; `/?run=<id>` links still open their case.
- **Locate** (header button) → `/locate`; **Tracker** (6th navigation item) → `/tracker`. Both use `src/components/ModuleFrame.tsx`: a left panel (Back to workspace, description, service status, open in a new tab) and the module in an iframe on the stage. The service is probed first, with clear offline / not-configured states.
- **AI assistant**: `src/components/ChatAssistant.tsx`, rendered once by `AppShell`. A bottom-right launcher with the same brain mark as the header (`BrandMark.tsx`) opens a fixed drop-up panel holding the module's chat in an iframe. The frame is created on first open and kept, and the thread id is kept in `localStorage`.
- Module URLs come from `src/lib/integrations.ts` (`NEXT_PUBLIC_*`, set in `next.config.ts`; localhost defaults only under `next dev`).
- No case data is passed to any module; iframes isolate their styles from the workspace.
