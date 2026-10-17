# NeuroScope 3D — Pitch Cheat Sheet (read 5 minutes before)

**One line:** Upload four brain MRI scans → our 3D U-Net predicts the tumour regions → explore in linked 2D/3D, analyse with a Dijkstra graph, compare with an expert, download a report.

**Problem:** 4 MRI sequences × about 155 slices each; tumours are hard to outline, measure and picture in 3D.

**Solution:** one browser workflow — validate → segment → measure → explore in 3D → graph analysis → expert comparison → PDF.

**Stack:**
- Python, FastAPI, PyTorch, MONAI, NiBabel, SciPy (Dijkstra), scikit-image (3D meshes), ReportLab (PDF).
- Next.js 16, React 19, TypeScript, NiiVue (WebGL viewer).

**Model:**
- MONAI 3D UNet, 4 inputs → 3 outputs (TC, WT, ET), about 4.8 M parameters, 19.3 MB checkpoint.
- Trained by us on BraTS 2023 GLI (1,251 scans): Dice loss, Adam 1e-4, cosine schedule, 50 epochs.

**Inputs:** T1, T1Gd (contrast), T2, FLAIR — NIfTI, all four required, same grid.

**Output:**
- `seg.nii.gz` on the original grid: labels 1 = necrotic/non-enhancing core, 2 = oedema, 4 = enhancing.
- WT/TC/ET volumes in mL, meshes, PDF.

**Graph Analysis (say it simply):**
- We turn the brain into a grid of points about 4 mm apart, joined to their neighbours by edges whose length is the real distance in mm.
- Each point knows which tissue the AI predicted there.
- Dijkstra finds the shortest route between two tumour parts and how much of it passes through non-tumour tissue.

**Why Dijkstra:** a weighted shortest path with non-negative edge lengths. It is a measurement, **not** a growth prediction.

**Expert Comparison:**
- Needs an expert mask upload.
- Gives Dice, sensitivity, precision, FP/FN voxels and the volume difference for WT/TC/ET.
- No IoU.

**Four modules:**
- **Landing page** (`/`) → Start Segmentation → `/upload`.
- **Locate** (header): find neurologists nearby with OpenStreetMap (tested: Pune → 19).
- **AI assistant** (brain button, bottom-right): Gemini through Lovable; explains concepts; never sees scans.
- **Tracker** (6th menu item): compares two timepoints with SegResNet + SimpleITK (tested through its API).

**Most defensible novelty:** "We combine original-grid AI segmentation, linked 2D/3D exploration, a millimetre-accurate brain lattice graph with Dijkstra paths between tumour components, expert metrics and automatic reporting in one browser workflow."

**Limitations (say them before judges do):**
- Development results only, no clinical validation.
- Over-predicts enhancing tumour in low-enhancement tumours.
- Adult pre-op glioma inputs only.
- Possible BraTS 2021/2023 overlap.
- RTX 3050 timing only.
- Not deployed.

### 30-second pitch
"Brain tumour MRI is four 3D scans and hundreds of slices. NeuroScope 3D takes those four scans, and our 3D U-Net, trained on BraTS 2023, predicts the tumour regions in about ten seconds. You explore them in linked 2D and 3D views, get the volumes, use a Dijkstra graph to measure how tumour parts connect through the brain, compare with an expert outline, and download a report. On 30 held-out cases our whole-tumour Dice is 0.875. It's a research and teaching prototype, not a diagnostic tool."

### Five key questions
1. **Clinical use?** No. Research/teaching prototype; not a medical device.
2. **Accuracy?** Dice WT 0.875, TC 0.833, ET 0.810 on 30 patient-disjoint BraTS 2023 development cases (`results/heldout_eval.json`).
3. **Why Dijkstra?** Weighted shortest path on a lattice with real-mm edge lengths; it describes connectivity, not growth.
4. **Missing sequence?** Refused with a clear message; all four are required.
5. **Chatbot and data?** It only gets typed text; no scans or case data are sent.

### Five facts to memorise
1. 4 inputs: T1, T1Gd, T2, FLAIR → labels 1/2/4 → WT/TC/ET.
2. 3D UNet, about 4.8 M parameters, trained by us on 1,251 BraTS 2023 GLI scans.
3. Dice WT 0.875 / TC 0.833 / ET 0.810 (30 held-out cases).
4. About 10 s per case on an RTX 3050 laptop GPU.
5. Scans are auto-deleted after 23 h; T1 and T2 are deleted right after processing.

### Confirm before presenting
- [ ] CPU-only runtime (never measured) — don't quote a number.
- [ ] Licence for our model weights (none chosen yet).
- [ ] Whether the judging data is BraTS 2021 (overlap question for the organisers).
- [ ] Whether any clinician has reviewed the app (only claim it if true).
- [ ] Before the demo, run `start.ps1`, open the site, and make sure the Tracker API has finished loading (about 30–40 s).
