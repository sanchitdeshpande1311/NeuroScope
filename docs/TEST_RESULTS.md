# NeuroScope 3D — Test Results

Date: 2026-10-16. Hardware: NVIDIA GeForce RTX 3050 6GB Laptop GPU, Windows 11, torch 2.6.0+cu124, MONAI 1.6.0.
**No T4 measurement was made.** All real-MRI tests use BraTS 2023 GLI development data (patient-disjoint held-out cases); none use hidden judging cases.

Raw evidence: `results/judging_tests.json` (written by the tests), `results/heldout_eval.json` (Test 1).

Commands (from the project root):

```
venv\Scripts\python -m pytest tests -q -p no:cacheprovider -W ignore      # 49 tests, ~75 s
venv\Scripts\python execution\evaluate_heldout.py --n 30                  # Test 1, ~3 min
```

Latest run (2026-10-16, after the multi-page UI work): **35 passed in 94 s**. That is the 28 original judging and pipeline tests, plus the retention-scope test, plus 6 tests in `tests/test_ui_backend.py`. Frontend: `tsc` OK, `eslint` OK, `next build` OK (9 routes).

| # | Requirement | Status | Type | Result |
|---|---|---|---|---|
| 1 | Held-out accuracy (≥10 labelled cases) | **PASS (development set only)**; organiser-baseline comparison **NOT TESTED** | Integration, real MRI | 30 patient-disjoint cases. Dice WT 0.875, TC 0.833, ET 0.810 (mean 0.839). Sensitivity WT 0.921, TC 0.904, ET 0.853. Organiser baseline numbers not available. |
| 2 | Volume cube 20³, label 2, 1×1×2 mm | PASS | Unit, synthetic | WT 16.000 mL, TC 0, ET 0 (spacing read from the header). Also passes through the expert-mask loader. |
| 3 | Anisotropic (every 2nd axial slice removed) | PASS | Integration, real MRI + synthetic resampling | BraTS-GLI-00360-000: WT 86.77 mL vs 87.72 mL → 1.1 % (target < 10 %). Axial axis found from the affine; affine column doubled. |
| 4 | L-R voxel flip + consistent affine (same anatomy) | PASS | Integration | Axis codes LPS → RPS; tumour side L → L (Δx −16.37 mm both); WT 86.77 → 86.77 mL (0 %); un-flipped masks Dice 1.0. |
| 5 | L-R voxel flip, affine unchanged (mirrored anatomy) | PASS | Integration | Tumour side L → R (Δx −16.4 → +16.5 mm). |
| 6 | Linked views + crosshair + readout | PASS (manual browser test) | Manual, real MRI + synthetic marker | Marker at voxel (170,150,100), world (−170, 89, 100) mm. After clicks: readout voxel (170,150,101), world (−169.6, 89.4, 100.5); max error 1 voxel. Axial, coronal, sagittal and 3D crosshair all moved; marker shown on the L / posterior / superior side, matching the affine. No console errors. Click targets were located with NiiVue's own `frac2canvasPosWithTile`, then real mouse clicks were sent. |
| 7 | Eight invalid inputs | PASS | Integration (API) | All refused with HTTP 422/413 and a specific code (`not_gzip`, `corrupt_gzip`, `missing_modality`, `shape_mismatch`, `not_3d`, `all_zero`, `non_finite`, `file_too_large`); no segmentation returned; run directory deleted; backend healthy afterwards; no paths in messages. **The >1 GB case is a logic test** (limit lowered to 50 kB); a real >1 GB upload was not performed. |
| 8 | Reproducibility | PASS | Integration | Two runs bit-identical; Dice 1.0 for WT/TC/ET (fp32, cuDNN deterministic). |
| 9 | Blind case | PASS (pipeline validity); segmentation quality mixed | Integration, real MRI | BraTS-GLI-01666-000 (not used in development, evaluation or other tests). Output shape/affine match T1Gd, labels {0,1,2,4}, uint8, ET ⊆ TC ⊆ WT, 6.7 s. Against the expert mask (read after prediction): Dice WT 0.894, TC 0.643, **ET 0.0** — the model predicted 6.0 mL enhancing tumour where the expert mask has none (see the investigation below). |
| 10 | Input sanity | PASS (synthetic inputs only) | Integration, synthetic | Synthetic non-skull-stripped head → refused (`not_skull_stripped`). Box phantom, small sphere and noise block → refused (`not_brain_like`). Real brain → accepted. Heuristic reference ranges from 40 training cases, not a validated brain detector. |

Additional tests:
- Label hierarchy mapping.
- Resampling: identity, and flip plus scaling.
- Output NIfTI geometry.
- Refusal of mismatched affines.
- API end-to-end with an expert mask: path traversal and unknown run IDs return 404, and delete works.
- 23-hour retention clean-up.
- **Retention scope:** even with a misconfigured runs folder, the sweeper does not touch `models/`, `data/`, sample reports, generated masks or any name outside the run-ID and legacy-upload patterns.

## Runtime (RTX 3050, not T4)

- Full API request (upload → report, including meshes, Dijkstra and PDF): **9.3–9.5 s**.
- Held-out evaluation mean (validation, inference and resampling): 3.0 s per case.
- Typical breakdown: validation 0.7 s, preprocessing 0.2 s, inference 1.2–1.6 s, resampling and labels 1.2 s, graph and Dijkstra 1.6 s, meshes 1.3 s, report 0.1 s.
- CPU-only and T4 timings: **NOT TESTED**.

## Graph refinement vs baseline (30 held-out cases)

| | WT Dice | TC Dice | ET Dice |
|---|---|---|---|
| Model output | 0.8746 | 0.8333 | 0.8098 |
| Refined (WT components < 10 mm³ removed) | 0.8754 | 0.8333 | 0.8098 |

The refinement changes almost nothing, so the unrefined prediction is the primary output and the refined one is shown for comparison only. The Dijkstra geodesic extent is a descriptive measurement and does not change any mask.

## Blind-case ET false positive — investigation (no tuning performed)
- **Source.** The 6.0 mL of predicted ET comes directly from the model's ET channel at high confidence (median probability 0.955). At thresholds 0.7 and 0.9 it would still be 4.95 and 3.63 mL, so changing the threshold would not fix it.
- **Mapping is not the cause.** Every predicted ET voxel is already inside the model's own TC, so `regions_to_labels` never creates ET.
- **Location.** 99% of the predicted ET lies inside the expert WT, and 65% inside the expert NCR (label 1). The model calls mildly enhancing necrotic or non-enhancing core "enhancing": mean T1Gd is +0.57 SD in the predicted ET, against −0.68 SD in the expert NCR.
- **Same tendency elsewhere.** In the 30-case development evaluation, the two cases with small expert ET were over-predicted: BraTS-GLI-00140-000 had 2.6 mL expert vs 5.9 mL predicted (Dice 0.61), and BraTS-GLI-00155-000 had 1.1 vs 4.8 mL (Dice 0.34).
- **Conclusion.** This is a genuine model limitation: false or over-predicted ET in tumours with little or no enhancement. Under BraTS scoring, any ET predicted where the expert has none gives Dice 0.
- **Possible fix, not applied.** A common post-processing rule relabels small total ET as NCR. Its threshold would have to be chosen on a separate development subset, never on the blind or hidden cases, and validated before any claim is made.

## Upload-to-report workflow (2026-10-16, after backend restart)
- **Valid upload:** `curl` POST of 4 sequences plus an expert mask returned HTTP 200 in 9.3 s. WT/TC/ET were 86.77 / 54.57 / 43.49 mL, matching the earlier CLI sample, and the PDF downloaded with HTTP 200 (110,659 bytes).
- **Invalid upload:** a file named `.nii.gz` that was not NIfTI was refused with HTTP 422 `not_gzip`, and no run directory was left behind.
- **Website upload:** one run was also created through the website at 21:29 (not by me), and it completed.
- **Hardware:** all timings are on an RTX 3050. **T4 timing: NOT TESTED.**

## Organiser-data evaluation (ready, not run)
`venv\Scripts\python execution\evaluate_dataset.py --data-dir <organiser 40-case folder> --baseline-json <organiser baseline values>`
- It was self-tested on 2 held-out cases converted to BraTS 2021 layout (`_t1/_t1ce/_t2/_flair/_seg`, ET = 4). File-name detection and label handling worked.
- The baseline values in that self-test were placeholders made up for testing only. No organiser baseline comparison has been made.

## Not tested / limitations

- Hidden-case performance and the organiser baseline comparison.
- T4 runtime.
- A real >1 GB upload.
- Real non-skull-stripped or non-brain scans (only synthetic ones).
- Browser file upload driven by me. The browser tool cannot attach files; uploads were tested through the API, and one owner-initiated website upload completed.

## Multi-page UI verification (2026-10-16)

**How it was tested.** These are browser tests in the Claude browser pane: Next dev server plus FastAPI, Chromium/ANGLE on an AMD Radeon 740M iGPU, Windows 11.
- The pane was often hidden, so most checks read the page DOM and the NiiVue renderer state (`window.__nv`, development builds only) instead of screenshots. One screenshot of the Results page was captured.
- Uploads were exercised by injecting real BraTS files into each slot's file input through DataTransfer, using the same code path as a user's file choice. The fixtures were removed afterwards.
- Clicks were dispatched as pointer and mouse events at positions computed with NiiVue's own `frac2canvasPosWithTile`.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| U1 | Four separate upload slots (+ optional expert) | PASS | Slots T1, T1Gd, T2, FLAIR and Expert mask, each with its own picker, drop zone, Replace and Remove. |
| U2 | Immediate, independent validation | PASS | A fake `.nii.gz` in T1 went Validating → Error ("not gzip-compressed NIfTI") right away, while T1Gd validated as Valid on its own. |
| U3 | Replace an invalid file without losing others | PASS | Replacing T1 made it Valid, and T1Gd stayed Valid. |
| U4 | Cross-sequence check names the incompatible inputs | PASS | "T2 shape (240, 240, 150) differs from T1Gd (240, 240, 155)." The Run button stayed disabled. The API test also covers affine mismatch and a missing sequence. |
| U5 | Overlay opacity changes the real overlays | PASS | Prediction layer opacity 0.5 → 0.9 in the renderer. |
| U6 | Surface opacity changes the real 3D surfaces | PASS | WT/TC/ET mesh opacity 0.6 → 0.25. |
| U7 | NCR/NET, edema and ET toggles are independent | PASS | Label-table alpha: edema 255 → 0 → 255; NCR/NET and ET → 0 while edema stayed 255. |
| U8 | WT, TC, ET and brain surface toggles are independent | PASS | TC and brain hidden while WT and ET stayed visible; all four can be hidden. |
| U9 | Refined toggle shows the real refined mask | PASS | Prediction layer 0.9 → 0 and refined layer 0 → 0.9; label "Showing: refined mask". The toggle is disabled when no refined file exists. |
| U10 | Full-screen four-panel viewer keeps the case | PASS | Single canvas with coronal, sagittal, axial and 3D tiles; the run, the crosshair (−121, 121, 77 mm) and display settings were kept after navigation. |
| U11 | Crosshair synchronisation (Test 6, full-screen viewer) | PASS | Marker at (170,150,100). Axial click → voxel (171,150,77). Coronal click → voxel (171,150,100), T1Gd value 7025 (marker cube). Maximum error 1 voxel. Two bugs found and fixed along the way: a page scroll of 4 px and readout line-wrapping, which shifted the canvas between clicks and caused a 3-voxel error. |
| U12 | Graph analysis has its own workspace | PASS | `/runs/<id>/graph`: 3D render with WT/TC/ET/brain surfaces plus the component graph (22 nodes = 10 WT + 6 TC + 6 ET components) and the Dijkstra path. |
| U13 | Dijkstra paths match the calculation | PASS | Displayed path 43.75 mm over 33 voxels; the sum of drawn segment lengths is also 43.75 mm. A second destination gave 10.66 mm, matching its segment sum. Dijkstra distances match an independent networkx multi-source Dijkstra (unit test with anisotropic spacing and a wall). |
| U14 | Refinement comparison shows real before/after metrics | PASS | Run 5d16…: WT 86,769 → 86,760 voxels (9 removed, 0 added); components 10 → 8; FP 12,438 → 12,430; FN 4,063 → 4,064; Dice 0.9001 → 0.9001; verdict "No meaningful change" computed by rule. The two viewers share one crosshair: a left click moved the right view to the same mm point. NiiVue's built-in sync needed canvas focus and didn't fire, so an explicit link was added. |
| U15 | FP/FN only when a valid expert mask exists | PASS | The run without an expert mask (e7164f1e…) shows no expert metrics. |
| U16 | Without an expert: removed voxels only, no error-reduction claim | PASS | The page states that removed voxels are not confirmed false positives and that a smaller volume isn't automatically more accurate. |
| U17 | Display changes never alter outputs or volumes | PASS | Volume cards 86.77 / 54.57 / 43.49 mL unchanged after every control change. The display code has no write path. |
| U18 | Navigation doesn't re-run inference or refetch | PASS | Run metadata fetched once across pages; NIfTI re-requests served from the browser cache (0 bytes transferred); no `/api/predict` call. |
| U19 | PDF and NIfTI downloads | PASS | `report.pdf`: HTTP 200, `application/pdf`, inline (embedded on the Report page). `seg.nii.gz` link present. API tests check the downloads. |
| U20 | Production build | PASS | `next build` succeeded with 9 routes. |
| U21 | No critical console errors / backend exceptions | PASS (after fixes) | Three viewer bugs found and fixed: (a) layer names without an extension broke loading; (b) releasing a reused canvas's WebGL context broke the re-mounted viewer; (c) disposed viewers kept drawing on released contexts (15,500 "blur/sobel shader" errors) → now `nv.cleanup()` runs, and the context is released only after the load settles. Final loop over all pages, leaving mid-load, and a resize: 0 console errors. Backend error log: none. |
| U22 | Disclaimer on every page | PASS | The disclaimer bar is in the shared shell and was present on every page checked. |
| — | Invalid or expired run links | PASS | All-zero ID → "This run is not available…"; malformed ID → "This is not a valid run link." |
| — | Browser back/forward | PASS | Back returned to the previous run page and rendered it. |

**Browser upload-to-results.** BraTS-GLI-00360-000 with expert mask took 9.2 s (click → Results page). The backend run itself is ~9 s on the RTX 3050.

**Viewer performance (same machine, pane hidden, so timings may be pessimistic).**
- Load of 4 volumes + 4 meshes: 11.9 s before → 4.0 s after fixing redundant refreshes.
- One display change: 3.1–5.6 s before → median 107 ms, max 207 ms after.
- Cause: NiiVue's `setMeshProperty` refreshes every volume on each call, and 8 calls were made per change. Mesh properties are now set directly, and settings are diffed.
- T4 / other hardware: **NOT TESTED**.

## Refinement evidence (re-run 2026-10-16 on the current code)
- **Source.** `execution/evaluate_heldout.py --n 30` reproduced the earlier baseline exactly: Dice WT 0.8746, TC 0.8333, ET 0.8098.
- **Summary file.** `execution/summarize_refinement_eval.py` wrote `results/refinement_eval_summary.json`.
- **Dice change, refined − baseline** (unweighted mean over cases): WT +0.00079, TC 0, ET 0.
- **Cases improved / worse / unchanged** (|ΔDice| ≤ 0.001 counts as unchanged): WT 7 / 0 / 23; TC and ET 0 / 0 / 30.
- **WT voxel totals across the 30 cases:** false positives 366,666 → 361,502 (−1.41 %); false negatives 274,042 → 274,069 (+0.01 %).
- **Runtime overhead:** 0.136 s per case.
- **Conclusion:** no meaningful change. The unrefined prediction stays the primary output.
- **Unit test.** A hand-built case shows the rule can also remove real tumour (FN 0 → 2), so a lower FP count doesn't by itself mean better agreement.

## Spatial graph analysis (2026-10-16)

**Automated tests** (`tests/test_spatial_graph.py`): 14 passed. The whole suite is now **49 passed**.

| # | Spec test | Status | Evidence |
|---|---|---|---|
| G1 | Simple graph, known shortest path | PASS | Straight 5 steps = 5.000 mm; 3 diagonal steps = 3√3 mm; 2 diagonal + 2 axial = 2√2 + 2 mm. |
| G2 | Two routes, known minimum | PASS | Wall with openings: Mode A length = 15 + 2√2 mm, matching the analytic value. Mode B (α = 50) switches to the tumour corridor (longer, more edema). Both costs equal networkx Dijkstra. |
| G3 | Disconnected graph → no path | PASS | 3 graph components; `reachable: false`, reason "different connected components". |
| G4 | Isolated vertex | PASS | isolated_vertices = 1, minimum degree 0, unreachable. |
| G5 | Anisotropic edge lengths | PASS | Spacing 1×1×2.5 mm → lengths exactly {1, √2, 2.5, √7.25, √8.25}. A 5 mm target gives blocks 5×5×2 and a 5×5×5 mm lattice; a z path is 10.0 mm. |
| G6 | Voxel ↔ world | PASS | Flipped, anisotropic, offset affine: mm = A·vox exactly, and the inverse round-trips. Low i maps to +x (patient right) as the affine dictates. |
| G7 | Geometry on the 3D brain | PASS | All vertices lie within the brain-surface mesh built with the same affine (no double or missing affine). |
| G8 | Path drawn from the returned sequence | PASS | Every consecutive pair is a stored edge; points_mm = vertex coordinates; length = sum of segments; cost = sum of step costs; class lengths sum to the length. |
| G9 | Source/destination selection | PASS | `c<id>` → a vertex of that component; `mm:` snaps to the exact vertex; `v<id>` works; invalid specs raise errors. |
| G10 | No invalid edges or negative costs | PASS | `validate()` all passed; Mode B cost ≥ length ≥ 0; α < 1, NaN or > 100 rejected; unknown mode rejected. |
| G11 | Component and degree statistics | PASS | 5×5×5 block: 125 vertices, maximum degree 26, minimum 7 (corner), edges = Σdegree / 2. |
| G12 | Rebuild when the segmentation changes | PASS | API: second request cached; after `seg.nii.gz` changed the graph is rebuilt (`cached: false`, new hash, 2 → 1 components). |
| G13 | Invalid input | PASS | Shape mismatch, label 3, empty brain, spacing 0 and singular affine all raise `GraphBuildError`; API returns 422 `graph_error`. |
| G16 | Analysis does not modify the segmentation | PASS | `seg.nii.gz` bytes identical after graph building and path queries. |
| — | Expert mask never used | PASS | Run with a deliberately different `expert.nii.gz`: not in provenance; tumour vertices follow the prediction only. |

**Browser tests** (Claude browser pane, run f3fb5573…, BraTS-GLI-00419-000; the prediction has two components of 24.0 mL and 19.3 mL; no expert mask):

| # | Spec test | Status | Evidence |
|---|---|---|---|
| G14 | Every graph control has a visible effect | PASS | Each control was toggled while measuring rendered pixels (canvas readback); all restored to 0 changed pixels after undo. Changed pixels: vertices 4,448; tumour edges 4,199; boundary edges 5,551; surfaces 3,031; brain 33,119; path 292; non-tumour path segments 179; brain opacity 33,686; tumour opacity 2,542; edge opacity 3,696; path opacity 183. The renderer flags matched each control (visible, opacity). |
| G15 | 3D and slice coordinates agree | PASS | Crosshair placed at the path source (−137.5, 133.5, 37.5) mm → readout shows the same mm and voxel (138, 106, 38) = rounded `points_vox` (137.5, 105.5, 37.5). |
| — | Drawn data = API data | PASS | 2,127 vertex markers = 2,127 drawn vertices; 12,395 edge streamlines = 12,395 drawn edges (verifies the `.tck` encoding); path nodes = API points with 0 mm deviation (default path and a crosshair-chosen path). |
| — | Component select, crosshair destination, Mode B, spacing, lattice, reset | PASS | Highlight = 68 nodes = the component's 68 vertices; the crosshair moved to its centroid. Crosshair destination path 32.78 mm (snap 1.95 mm). Mode B: 58.63 mm vs 45.76 mm in Mode A, with less non-tumour tissue. 6 mm spacing: 779 vertices / 3,611 edges drawn = API. Whole-brain lattice: 284,916 edges in 1.1 s. Reset restored camera, layers, opacities, Mode A and the default path. |
| — | Console / backend errors | PASS | 0 console errors across load, view switches and navigation; backend error log empty. |

**Visual problem found and fixed.** NiiVue's 3D tile volume-renders the T1Gd as an opaque brain, which hid every mesh inside it. This was the main reason the earlier graph looked like scattered dots. The 3D-only view now hides the volume rendering and uses the semi-transparent brain surface; the 3D + slices view keeps the slices and uses X-ray drawing.

**Representative-vertex fix.** "Block with most component voxels" moved the default path from 54.6 to 69.7 mm between 4 and 6 mm spacing. "Vertex nearest the component centroid" gives 45.8–49.8 mm across 3/4/6 mm.

**Measured performance** (RTX 3050 laptop; backend on CPU; browser on AMD Radeon 740M iGPU):
- Graph build: 1.1–1.3 s for 3/4/6 mm lattices (6,588 / 22,196 / 52,521 vertices on BraTS-GLI-00360-000).
- `/spatial-graph` request: 1.9–2.1 s first time (includes the default path), 0.2 s cached.
- Dijkstra path: 3 ms (6 mm), 11–13 ms (4 mm), 25 ms (3 mm).
- Graph page in the browser until all layers were drawn: 7.9–12.8 s with the pane partly hidden.
