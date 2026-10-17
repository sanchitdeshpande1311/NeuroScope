# Setting up NeuroScope 3D from the project ZIP

The ZIP was made by `execution/package_project.py` (read-only; it never changes the project). The full list of files, their SHA-256 hashes and every excluded path are in `PACKAGE_MANIFEST.json`.

## What is inside
| Folder | Contents |
|---|---|
| `backend/` | FastAPI server (`main.py`) |
| `ml/` | Inference, preprocessing, refinement, spatial graph + Dijkstra, meshes, PDF reports |
| `frontend/` | Next.js workspace (source, `package.json`, `package-lock.json`) |
| `models/` | Trained checkpoints. **`baseline_checkpoints/best_metric_model.pth` is the one used for inference** (19.3 MB, SHA-256 starts `2decff1363f7861e`). The others are kept for provenance. |
| `configs/`, `data/splits/`, `data/processed/`, `metadata/`, `results/` | Configuration, data splits, derived graph files, evaluation results (no MRI images except one sample prediction mask in `results/sample_run_*`) |
| `tests/`, `execution/`, `scripts/`, `directives/` | Tests, tools, training/data scripts, SOPs |
| `docs/`, `pitch/`, `*.md`, `*.txt` | Documentation, including the pitching guide, Q&A, cheat sheet and feature status |
| `modules/` | Source of the four integrated projects (landing page, Locate, AI assistant, Tracker, with its MONAI SegResNet `model.pt`, Apache-2.0) and `_integration_patches/` |
| `start.ps1`, `scripts/start_integrations.ps1` | Start everything |

## Not included (and how to restore it)
| Excluded | Why | How to restore |
|---|---|---|
| `venv/`, every `node_modules/` | Regenerable dependencies (very large) | Steps 1–3 below |
| `data/raw/` (BraTS 2023 GLI, about 13 GB) | Third-party research dataset under the BraTS data-use terms; very large | Download from Synapse (BraTS 2023 GLI training data). It is needed only for tests and evaluation, not to run the app |
| `backend/runs/`, `backend/temp/`, `backend/results/`, `.tmp/` | Uploaded scans and generated intermediates | Regenerated when the app is used |
| Module build outputs (`.output/`, `dist/`) | Regenerable | Build commands below |
| Tracker `backend/storage/` | Uploaded studies and comparisons (MRI data) | Created automatically |
| All real `.env` files | May contain secrets (the Locate `.env` holds Google API keys) | Copy the `.env.example` templates; no key is required to run |
| `.git`, `.claude`, `skill-creator/`, `BACKUP_MANIFEST.json` | Version-control internals, local tool settings, unrelated tooling, backup metadata | — |
| The four original module ZIP archives | About 650 MB, and they contain a `.env` with API keys and uploaded MRI studies | Keep the originals separately (Desktop and backup folder) |

## Steps (Windows)
1. Unzip, then open PowerShell in the folder.
2. Python:
   - `python -m venv venv`
   - `venv\Scripts\pip install -r requirements.txt` (install the CUDA build of torch for a GPU)
3. Workspace: `cd frontend; npm ci; cd ..`
4. Modules: copy `modules\` to `C:\Users\<you>\NeuroScope3D_modules`, or set `NEUROSCOPE_MODULES_DIR`. Then, in each module folder:
   - **Landing page**, **AI assistant** (`screenshot-perfect-project-39`), **Tracker** (`tumor-tracker-nifti`):
     - `npm ci`
     - then `$env:NITRO_PRESET="node-server"; npx vite build`
     - for the Tracker, first set `$env:VITE_NEUROSCOPE_API_URL="http://localhost:8008"`
   - **Locate** (`location`): `npm ci` (it runs in Vite dev mode)
   - **Tracker API**: `venv\Scripts\pip install --target <modules>\_pydeps\tracker SimpleITK` (the other packages are already in the main venv)
5. Run: `powershell -ExecutionPolicy Bypass -File .\start.ps1`, then open http://localhost:3000. Use `-NoIntegrations` for the workspace and backend only.
6. Tests: `venv\Scripts\python -m pytest tests -q -p no:cacheprovider -W ignore` (needs `data/raw`).

Ports, variables and the integration details are in `INTEGRATION_REPORT.md`.
