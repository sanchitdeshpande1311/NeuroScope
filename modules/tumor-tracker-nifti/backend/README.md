# NeuroScope 3D — MRI Processing Backend

FastAPI processing pipeline for longitudinal multimodal brain tumour MRI segmentation (MONAI SegResNet) and SimpleITK rigid registration.

## Architecture

- **Framework**: FastAPI (Python 3.11+)
- **Deep Learning Model**: Pretrained MONAI SegResNet (`brats_mri_segmentation` bundle, Apache-2.0 License)
- **Input Channels (Strict Order)**: `[T1Gd, T1, T2, FLAIR]`
- **Output Channels**: `TC` (Tumor Core), `WT` (Whole Tumor), `ET` (Enhancing Tumor)
- **Label Mapping**: BraTS 2021 convention (0: Background, 1: Necrotic Core, 2: Peritumoral Edema, 4: Enhancing Tumor)
- **Registration**: SimpleITK Rigid3D (Euler3D) with Mattes Mutual Information and nearest-neighbor mask resampling
- **Report Generation**: ReportLab PDF generator

## Installation & Setup

1. **Create and activate Python virtual environment**:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Linux/macOS:
   source venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Verify Pretrained Model Checkpoint**:
   Ensure `models/brats_mri_segmentation/models/model.pt` exists and is verified.

4. **Start the Backend**:
   ```bash
   python run_backend.py
   ```
   Or using uvicorn directly:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

5. **Verify Health Endpoint**:
   ```bash
   curl http://localhost:8000/api/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "model": {
       "name": "BraTS MRI segmentation (MONAI SegResNet)",
       "version": "0.5.4",
       "licence": "Apache-2.0",
       "weights_loaded": true,
       "input_order": ["T1Gd", "T1", "T2", "FLAIR"],
       "output_channels": ["TC", "WT", "ET"],
       "device": "cpu"
     },
     "registration_backend": "SimpleITK Rigid3D (Mattes MI)",
     "messages": [...]
   }
   ```

## Frontend Configuration

In the frontend repository root (`tumor-tracker-nifti`), set in `.env`:
```env
VITE_NEUROSCOPE_API_URL=http://localhost:8000
```

## Running Tests

Run the comprehensive pytest suite:
```bash
pytest backend/tests/ -v
```

Tests cover:
- Invalid, corrupted, truncated, and non-NIfTI files
- Missing required sequences (T1, T1Gd, T2, FLAIR)
- Mismatched geometry and affine matrix deviations
- Registration quality pass/fail checks
- Anisotropic voxel spacing warnings
- Exact volume calculation and division-by-zero safeguards
- Deterministic inference repeatability

## Privacy & Data Retention

- **Strictly Local**: Scans are processed entirely on-device and are NEVER transmitted to external third-party AI services.
- **24-Hour Policy**: Temporary uploads and intermediate files are automatically purged after 24 hours.

## Disclaimer

**Research and teaching prototype only.** Displays model-predicted regions and estimated volumetric changes. Not for diagnostic use, clinical treatment planning, or medical decisions.
