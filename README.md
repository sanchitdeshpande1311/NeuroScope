# NeuroScope 3D

> **Research and teaching use only.** This is not a medical device and is not validated for clinical use. It must not be used for diagnosis, prognosis or treatment decisions, and it does not replace a radiologist.

NeuroScope 3D takes four co-registered 3D MRI sequences (T1, T1Gd, T2, FLAIR) in NIfTI format. A 3D U-Net predicts the BraTS tumour sub-regions, and the app shows them in linked axial, coronal, sagittal and 3D views. The results are:

- `seg.nii.gz` on the **original input grid and affine**, with labels **1 = NCR/NET, 2 = edema, 4 = enhancing tumour**.
- Estimated WT, TC and ET volumes in mL.
- A PDF report with provenance and limitations.

## Quick start (Windows)

```
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Then open http://localhost:3000. That is the **landing page**; its **Start Segmentation** button opens the workspace at `/upload`. The backend runs on http://127.0.0.1:8000 (`/api/health`). `start.ps1` also starts the four integrated modules (landing page, Locate, AI assistant, Tracker; see `INTEGRATION_REPORT.md`). Use `-NoIntegrations` to start only the backend and the workspace; `/` then opens the workspace directly.

To start the parts separately:

```
venv\Scripts\python backend\main.py
cd frontend && npm run dev
```

The first-time environment setup is `python -m venv venv`, then `venv\Scripts\pip install -r requirements.txt` (CUDA build of torch recommended), then `cd frontend && npm install`.

## Website

The public entry point `/` is the NeuroScope 3D landing page; **Start Segmentation** opens the workspace at **Upload** (`/upload`). In the workspace, the compact Cherry Cola header has **Locate** (find neurologists nearby) and **Generate Report** (the full PDF for the current case); the brain mark links back to the landing page. A brain button at the bottom-right opens the **AI assistant** in a floating panel. A circular **+** button at the bottom-left of the cream panel opens the feature menu:
1. **Upload**: four sequence cards and an optional expert reference mask. Each file is validated by the server as soon as you choose it.
2. **Results**: estimated tumour volume, WT/TC/ET, actions, and the linked 3D + slice viewer with a **Layers** menu. Its last switch, **Show Definitions** (off by default), names the region, surface or graph element under the pointer.
3. **Full-screen 3D Viewer**.
4. **Graph Analysis**: brain-wide lattice graph and Dijkstra shortest paths. Descriptive spatial connectivity only; not a growth model.
5. **Expert Comparison**: Dice, sensitivity, precision and FP/FN against an uploaded reference.
6. **Tracker**: the longitudinal comparison tool (two studies of the same patient). It runs as its own service; nothing from the current case is sent to it.

Refinement Before & After is hidden from the menu for now; its route (`/runs/<id>/refinement`), data and report section still exist.

See `UI_UX_IMPLEMENTATION_REPORT.md` for the design system.

## Command-line inference

```
venv\Scripts\python execution\run_inference.py --t1 T1.nii.gz --t1gd T1Gd.nii.gz --t2 T2.nii.gz --flair FLAIR.nii.gz --out OUT [--expert seg.nii.gz]
```

The command exits with code 2 and a JSON reason when the input is refused.

## Pipeline (`ml/pipeline.py`)

1. **Validation** (`ml/inference.py`) refuses the input if any of these fail:
   - Each file is ≤ 1 GB, has a valid gzip stream and a NIfTI header, and is 3D.
   - Values are finite, not all zero and not constant.
   - All four sequences share the same shape and affine.
2. **Input sanity check:** reference ranges (from training cases) for skull-stripping and brain-likeness. Clear mismatches are refused; borderline ones produce a warning. This is a heuristic.
3. **Preprocessing, identical to training:**
   - Reorient to RAS.
   - Resample to 1 mm.
   - Z-score each channel over non-zero voxels.
   - Channel order: T1, T1Gd, T2, FLAIR.
4. **Inference:** MONAI UNet with a sliding window (deterministic), giving sigmoid TC/WT/ET probabilities.
5. **Back to the original grid:** probabilities are resampled through the two affines, thresholded at 0.5 and converted to labels 1/2/4 with ET ⊆ TC ⊆ WT.
6. **Volumes:** `voxel_count × sx × sy × sz / 1000` mL, with spacing from the T1Gd header.
7. **Graph analysis (`ml/graph_analysis.py`), descriptive only:**
   - A component graph of the regions.
   - A multi-source **Dijkstra** geodesic extent of WT from TC (scipy csgraph, physical edge lengths).
   - An optional small-component refinement, shown side by side. It is *not* the primary output because it made no meaningful difference on held-out data.
8. **Outputs:** world-mm GIfTI meshes (`ml/meshes.py`) and a PDF report (`ml/report.py`).

## Privacy and retention

- Each run gets an unguessable UUID directory under `backend/runs/`.
- The two inputs not needed for viewing (T1, T2) are deleted right after processing.
- Whole runs are deleted automatically after 23 h: the sweep runs at startup and every 15 min. It only removes run-ID folders and legacy upload copies (`backend/temp/<ts>/*.nii.gz`, `backend/results/<ts>_t1c.nii.gz`).
- "Delete my data now" in the UI, or `DELETE /api/runs/{id}`, removes a run immediately.
- A failed request leaves no files behind.
- Scans are never sent to external services.

## Tests and evaluation

```
venv\Scripts\python -m pytest tests -q -p no:cacheprovider -W ignore
venv\Scripts\python execution\evaluate_heldout.py --n 30
```

See [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) (51/51 automated tests pass; Test 6 and the UI checks were verified in the browser), [docs/MODEL_CARD.md](docs/MODEL_CARD.md) and [docs/DATA_AND_LICENCES.md](docs/DATA_AND_LICENCES.md).

Development-set results on 30 patient-disjoint BraTS 2023 GLI cases:

| | Dice | Sensitivity |
|---|---|---|
| WT | 0.875 | 0.921 |
| TC | 0.833 | 0.904 |
| ET | 0.810 | 0.853 |

These are **not** hidden-case or clinical performance figures.

## Layout

| Path | Contents |
|---|---|
| `backend/main.py` | FastAPI app |
| `ml/` | Inference, pipeline, graph analysis, meshes, report; training code |
| `execution/` | CLI tools: inference, evaluation, held-out list, sanity calibration, backup, marker fixture |
| `tests/` | Judging-challenge and pipeline tests |
| `configs/` | Held-out case list, sanity reference ranges |
| `frontend/` | Next.js + NiiVue UI |
| `results/` | Evaluation JSON, test evidence, sample report (`results/sample_run_BraTS-GLI-00360-000/`, development data) |

## Citation

BraTS 2021: Baid et al., arXiv:2107.02314; DOI 10.7937/jc8x-9874. See `docs/DATA_AND_LICENCES.md` for the full list.
