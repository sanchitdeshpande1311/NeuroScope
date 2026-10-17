import os
import sys
import uuid
import time
import shutil
import hashlib
import threading
from typing import Dict, Any, Optional, List
import numpy as np
import nibabel as nib

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
for p in [PROJECT_ROOT, BASE_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.config import (
    UPLOAD_DIR,
    OUTPUT_DIR,
    STUDY_STORE,
    COMPARISON_STORE,
    DEFAULT_MODEL_PATH,
    cleanup_expired_data,
    persist_store,
)
from backend.app.models_info import get_verified_model_info
from backend.app.validation import (
    validate_single_nifti,
    validate_study_collection,
    NiftiValidationError,
)
from backend.app.inference import run_study_segmentation, load_segmentation_model
from backend.app.registration import register_studies
from backend.app.volumes import compute_study_volumes, compute_volume_differences, evaluate_longitudinal_assessment
from backend.app.changemap import pack_visualization_grid, compute_spatial_change_counts
from backend.app.report import generate_comparison_pdf_report

app = FastAPI(
    title="NeuroScope 3D API",
    description="Quantitative 3D Brain MRI Longitudinal Segmentation & Registration Backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def prewarm_model():
    """Pre-warm MONAI SegResNet weights into memory on startup for instant inference."""
    try:
        load_segmentation_model()
    except Exception:
        pass


@app.middleware("http")
async def auto_cleanup_middleware(request: Request, call_next):
    # Periodically clean up data older than 24 hours
    try:
        cleanup_expired_data()
    except Exception:
        pass
    response = await call_next(request)
    return response


@app.get("/api/health")
def health_check():
    """
    Backend health inspection endpoint.
    Reports model verification, registration engine, and system readiness.
    """
    model_info = get_verified_model_info()
    weights_loaded = model_info.get("weights_loaded", False)

    status = "ok" if weights_loaded else "setup_required"
    messages = [
        "Pretrained MONAI SegResNet loaded and verified." if weights_loaded else "Model weights not found.",
        "SimpleITK Rigid3D mutual-information registration ready.",
        "Local-only computation active. Data remains private and deletes after 24 hours.",
    ]

    return {
        "status": status,
        "model": model_info if weights_loaded else None,
        "registration_backend": "SimpleITK Rigid3D (Mattes MI)",
        "messages": messages,
    }


@app.post("/api/studies/validate")
async def validate_study_endpoint(
    background_tasks: BackgroundTasks,
    request: Request,
    role: str = Form("previous"),
    label: str = Form(""),
    date: str = Form(""),
    T1: Optional[UploadFile] = File(None),
    T1Gd: Optional[UploadFile] = File(None),
    T2: Optional[UploadFile] = File(None),
    FLAIR: Optional[UploadFile] = File(None),
    t1: Optional[UploadFile] = File(None),
    t1gd: Optional[UploadFile] = File(None),
    t1c: Optional[UploadFile] = File(None),
    t2: Optional[UploadFile] = File(None),
    flair: Optional[UploadFile] = File(None),
    expert_mask: Optional[UploadFile] = File(None),
):
    """
    Receives and strictly validates 4 NIfTI sequences for a study:
    T1, T1Gd, T2, FLAIR, plus optional expert mask.
    Enforces shared spatial grid across all 4 sequences.
    """
    study_id = f"study_{uuid.uuid4().hex[:10]}"
    study_dir = os.path.join(UPLOAD_DIR, study_id)
    os.makedirs(study_dir, exist_ok=True)

    saved_paths: Dict[str, str] = {}
    input_hashes: Dict[str, str] = {}

    file_candidates = {
        "T1": T1 or t1,
        "T1Gd": T1Gd or t1gd or t1c,
        "T2": T2 or t2,
        "FLAIR": FLAIR or flair,
    }

    # Also inspect all form fields dynamically in case keys differ slightly
    try:
        form_data = await request.form()
        for k, v in form_data.items():
            if hasattr(v, "filename") and getattr(v, "filename", None):
                kl = str(k).lower().replace("_", "").replace("-", "")
                if kl in ("t1", "t1w") and not file_candidates.get("T1"):
                    file_candidates["T1"] = v
                elif kl in ("t1gd", "t1ce", "t1c", "t1post", "t1contrast") and not file_candidates.get("T1Gd"):
                    file_candidates["T1Gd"] = v
                elif kl in ("t2", "t2w") and not file_candidates.get("T2"):
                    file_candidates["T2"] = v
                elif kl in ("flair",) and not file_candidates.get("FLAIR"):
                    file_candidates["FLAIR"] = v
                elif "mask" in kl and expert_mask is None:
                    expert_mask = v
    except Exception:
        pass

    for seq_name, upload in file_candidates.items():
        if upload is not None and upload.filename:
            fn = upload.filename
            content = await upload.read()
            h = hashlib.sha256(content).hexdigest()
            save_p = os.path.join(study_dir, f"{seq_name}_{fn}")
            with open(save_p, "wb") as f:
                f.write(content)
            saved_paths[seq_name] = save_p
            input_hashes[seq_name] = h

    expert_mask_path = None
    if expert_mask is not None and expert_mask.filename:
        content = await expert_mask.read()
        save_p = os.path.join(study_dir, f"expert_{expert_mask.filename}")
        with open(save_p, "wb") as f:
            f.write(content)
        expert_mask_path = save_p
        input_hashes["expert_mask"] = hashlib.sha256(content).hexdigest()

    # Run multi-sequence validation
    is_valid, issues, info = validate_study_collection(saved_paths, expert_mask_path)

    if not is_valid:
        # Do not persist unreadable or invalid submissions
        shutil.rmtree(study_dir, ignore_errors=True)
        return {
            "study_id": study_id,
            "valid": False,
            "issues": issues,
        }

    # Record valid study in store
    STUDY_STORE[study_id] = {
        "study_id": study_id,
        "study_dir": study_dir,
        "created_at": time.time(),
        "role": role,
        "label": label or ("Previous Study" if role == "previous" else "Current Study"),
        "date": date or time.strftime("%Y-%m-%d"),
        "saved_paths": saved_paths,
        "expert_mask_path": expert_mask_path,
        "input_hashes": input_hashes,
        "shape": info.get("shape"),
        "affine": info.get("affine"),
        "spacing": info.get("spacing"),
        "sequence_reports": info.get("sequence_reports", {}),
        "issues": issues,
        "segmentation": None,
    }
    persist_store()

    return {
        "study_id": study_id,
        "valid": True,
        "issues": issues,
    }


_STUDY_LOCKS: Dict[str, threading.Lock] = {}


@app.post("/api/studies/{study_id}/segment")
def segment_study_endpoint(study_id: str):
    """
    Executes independent MONAI brain tumor segmentation on the uploaded study.
    Calculates WT, TC, and ET volumes in native coordinate space.
    Thread-safe to prevent multiple workers from running duplicate inferences.
    """
    if study_id not in STUDY_STORE:
        raise HTTPException(status_code=404, detail="Study not found or session expired.")

    study = STUDY_STORE[study_id]
    if study.get("segmentation") is not None and study["segmentation"].get("status") == "complete":
        return {"study_id": study_id, "status": "complete"}

    lock = _STUDY_LOCKS.setdefault(study_id, threading.Lock())
    with lock:
        # Re-check under lock in case another thread just completed it
        if study.get("segmentation") is not None and study["segmentation"].get("status") == "complete":
            return {"study_id": study_id, "status": "complete"}

        try:
            t0 = time.time()
            seg_res = run_study_segmentation(
                study["saved_paths"],
                deterministic=True,
                cache_dir=study.get("study_dir")
            )
            t_elapsed = time.time() - t0

            volumes = compute_study_volumes(seg_res["subregions"], seg_res["spacing"])

            study["segmentation"] = {
                "label_map": seg_res["label_map"],
                "subregions": seg_res["subregions"],
                "volumes": volumes,
                "shape": seg_res["shape"],
                "affine": seg_res["affine"],
                "spacing": seg_res["spacing"],
                "inference_time_sec": round(t_elapsed, 2),
                "status": "complete",
            }

            # Calculate expert volumes if mask provided
            if study.get("expert_mask_path"):
                try:
                    m_img = nib.load(study["expert_mask_path"])
                    m_arr = m_img.get_fdata(dtype=np.float32)
                    exp_sub = {
                        "WT": (m_arr > 0).astype(np.uint8),
                        "TC": np.isin(m_arr, [1, 4]).astype(np.uint8),
                        "ET": (m_arr == 4).astype(np.uint8),
                    }
                    study["segmentation"]["expert_volumes"] = compute_study_volumes(exp_sub, seg_res["spacing"])
                except Exception:
                    study["segmentation"]["expert_volumes"] = None

            persist_store()
            return {"study_id": study_id, "status": "complete"}

        except Exception as e:
            study["segmentation"] = {"status": "failed", "error": str(e)}
            persist_store()
            raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")


class CreateComparisonRequest(BaseModel):
    study_ids: List[str]


def execute_comparison_pipeline(comparison_id: str):
    """
    Synchronous pipeline runner for two-timepoint longitudinal MRI analysis.
    Executes segmentation, SimpleITK rigid registration, nearest-neighbor resampling,
    volume differences, and change map generation with accurate UI stage tracking.
    """
    comp = COMPARISON_STORE[comparison_id]
    comp["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        comp["stage"] = "validating"
        comp["progress"] = 0.08
        prev_id, cur_id = comp["study_ids"]

        if prev_id not in STUDY_STORE or cur_id not in STUDY_STORE:
            raise ValueError("One or both studies are not found in the storage repository.")

        prev_study = STUDY_STORE[prev_id]
        cur_study = STUDY_STORE[cur_id]

        comp["stage"] = "comparability_check"
        comp["progress"] = 0.16
        # Ensure both studies have valid primary sequences
        if "T1Gd" not in prev_study["saved_paths"] or "T1Gd" not in cur_study["saved_paths"]:
            raise ValueError("Both studies must include T1Gd sequence for anatomical registration.")

        # Stage: segment previous study
        comp["stage"] = "segmenting_previous"
        comp["progress"] = 0.32
        if not prev_study.get("segmentation") or prev_study["segmentation"].get("status") != "complete":
            segment_study_endpoint(prev_id)

        # Stage: segment current study
        comp["stage"] = "segmenting_current"
        comp["progress"] = 0.54
        if not cur_study.get("segmentation") or cur_study["segmentation"].get("status") != "complete":
            segment_study_endpoint(cur_id)

        comp["stage"] = "validating_segmentation"
        comp["progress"] = 0.65
        prev_seg = prev_study["segmentation"]
        cur_seg = cur_study["segmentation"]

        if prev_seg.get("status") != "complete" or cur_seg.get("status") != "complete":
            raise ValueError("Segmentation failed for one of the longitudinal studies.")

        # Rigid registration of Current (moving) to Previous (fixed) using SimpleITK
        comp["stage"] = "registering"
        comp["progress"] = 0.75

        fixed_mri_path = prev_study["saved_paths"]["T1Gd"]
        moving_mri_path = cur_study["saved_paths"]["T1Gd"]

        reg_result = register_studies(
            fixed_path=fixed_mri_path,
            moving_path=moving_mri_path,
            moving_masks=cur_seg["subregions"],
            fixed_spacing=prev_seg["spacing"],
            fixed_shape=prev_seg["shape"]
        )

        comp["stage"] = "resampling"
        comp["progress"] = 0.83
        resampled_cur_masks = reg_result["resampled_current_masks"]
        resampled_cur_mri = reg_result["resampled_current_mri"]
        reg_info = reg_result["registration_info"]

        # Volumes in original native geometry
        comp["stage"] = "volumes"
        comp["progress"] = 0.88
        vol_diffs = compute_volume_differences(prev_seg["volumes"], cur_seg["volumes"])
        longitudinal_assessment = evaluate_longitudinal_assessment(
            prev_seg["volumes"], cur_seg["volumes"], vol_diffs
        )

        # Change map and packed visualization grid
        comp["stage"] = "change_map"
        comp["progress"] = 0.92

        comp["stage"] = "visualization"
        comp["progress"] = 0.96
        prev_img = nib.load(fixed_mri_path)
        prev_mri = prev_img.get_fdata(dtype=np.float32)

        vis_grid = pack_visualization_grid(
            shape=tuple(prev_seg["shape"]),
            spacing=tuple(prev_seg["spacing"]),
            affine=np.array(prev_seg["affine"]),
            prev_masks=prev_seg["subregions"],
            cur_resampled_masks=resampled_cur_masks,
            prev_mri=prev_mri,
            cur_resampled_mri=resampled_cur_mri
        )

        comp["stage"] = "report"
        comp["progress"] = 0.98

        # Build StudySummaries
        def make_summary(study: Dict[str, Any], role_name: str) -> Dict[str, Any]:
            validation_list = []
            for seq_name, rep in study.get("sequence_reports", {}).items():
                validation_list.append({
                    "sequence": seq_name,
                    "file_name": os.path.basename(study["saved_paths"].get(seq_name, "")),
                    "valid": rep.get("valid", True),
                    "issues": rep.get("issues", []),
                })
            return {
                "study_id": study["study_id"],
                "role": role_name,
                "label": study["label"],
                "date": study["date"],
                "validation": validation_list,
                "input_hashes": study["input_hashes"],
                "volumes": study["segmentation"]["volumes"],
                "expert_volumes": study["segmentation"].get("expert_volumes"),
                "segmentation_status": "complete",
            }

        study_summaries = [
            make_summary(prev_study, "previous"),
            make_summary(cur_study, "current"),
        ]

        model_info = get_verified_model_info()

        results_payload = {
            "comparison_id": comparison_id,
            "studies": study_summaries,
            "model": model_info,
            "assessment": longitudinal_assessment,
            "preprocessing": [
                "Intensity normalization: nonzero z-score standardization ((x - μ) / σ)",
                "Foreground brain crop bounding box optimization",
                "SimpleITK Rigid3D mutual-information registration to baseline coordinates",
                "Nearest-neighbour categorical mask resampling",
            ],
            "registration": reg_info,
            "grid": vis_grid if reg_info["quality"] != "fail" else None,
            "warnings": reg_info["warnings"],
            "limitations": [
                "Research and educational prototype only. Not for clinical diagnosis or treatment planning.",
                "Model-predicted regions represent AI probability thresholds, not histopathological margins.",
                "Voxel differences indicate spatial variations in model segmentations, not biological growth or shrinkage.",
                "Anisotropic slice spacing may limit axial-to-coronal interpolation fidelity.",
            ],
            "processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        comp["results"] = results_payload
        comp["stage"] = "complete"
        comp["progress"] = 1.0
        comp["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        persist_store()

    except Exception as e:
        comp["stage"] = "failed"
        comp["error"] = {"code": "pipeline_error", "message": str(e), "retryable": True}
        comp["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        persist_store()


@app.post("/api/comparisons")
def create_comparison_endpoint(body: CreateComparisonRequest, background_tasks: BackgroundTasks):
    """
    Creates a new two-timepoint MRI comparison and launches pipeline processing.
    """
    if len(body.study_ids) != 2:
        raise HTTPException(status_code=400, detail="Exactly two study IDs (previous and current) are required.")

    comp_id = f"comp_{uuid.uuid4().hex[:10]}"
    comp_dir = os.path.join(OUTPUT_DIR, comp_id)
    os.makedirs(comp_dir, exist_ok=True)

    COMPARISON_STORE[comp_id] = {
        "comparison_id": comp_id,
        "comp_dir": comp_dir,
        "study_ids": body.study_ids,
        "created_at": time.time(),
        "stage": "uploaded",
        "progress": 0.0,
        "warnings": [],
        "error": None,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "results": None,
    }
    persist_store()

    # Execute pipeline
    background_tasks.add_task(execute_comparison_pipeline, comp_id)

    return {"comparison_id": comp_id}


@app.get("/api/comparisons/{comparison_id}/status")
def get_comparison_status(comparison_id: str):
    """
    Pollable status endpoint for tracking pipeline progress.
    """
    if comparison_id not in COMPARISON_STORE:
        raise HTTPException(status_code=404, detail="Comparison not found.")
    
    comp = COMPARISON_STORE[comparison_id]
    return {
        "comparison_id": comparison_id,
        "stage": comp.get("stage", "uploaded"),
        "progress": comp.get("progress"),
        "error": comp.get("error"),
        "warnings": comp.get("warnings", []),
        "updated_at": comp.get("updated_at", time.strftime("%Y-%m-%dT%H:%M:%SZ")),
    }


@app.get("/api/comparisons/{comparison_id}/results")
def get_comparison_results(comparison_id: str):
    """
    Retrieves full quantitative results, study summaries, and 3D visualization grid.
    Never returns successful analysis results when processing failed.
    """
    if comparison_id not in COMPARISON_STORE:
        raise HTTPException(status_code=404, detail="Comparison not found.")

    comp = COMPARISON_STORE[comparison_id]
    if comp.get("stage") == "failed":
        err_msg = comp.get("error", {}).get("message", "Processing failed.")
        raise HTTPException(status_code=500, detail=f"Comparison failed: {err_msg}")

    if comp.get("stage") != "complete" or not comp.get("results"):
        raise HTTPException(status_code=400, detail=f"Comparison still in progress (stage: {comp.get('stage')}).")

    return comp["results"]


@app.get("/api/comparisons/{comparison_id}/report.pdf")
def download_comparison_report(comparison_id: str):
    """
    Generates and downloads the ReportLab PDF evaluation report.
    """
    if comparison_id not in COMPARISON_STORE:
        raise HTTPException(status_code=404, detail="Comparison not found.")
    
    comp = COMPARISON_STORE[comparison_id]
    if comp.get("stage") != "complete" or not comp.get("results"):
        raise HTTPException(status_code=400, detail="Cannot generate report: comparison is not complete.")

    pdf_bytes = generate_comparison_pdf_report(comp["results"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="neuroscope-report-{comparison_id}.pdf"'}
    )


@app.delete("/api/comparisons/{comparison_id}")
def delete_comparison(comparison_id: str):
    """
    Secure deletion of comparison data and associated disk files.
    """
    if comparison_id in COMPARISON_STORE:
        comp = COMPARISON_STORE.pop(comparison_id)
        comp_dir = comp.get("comp_dir")
        if comp_dir and os.path.exists(comp_dir):
            shutil.rmtree(comp_dir, ignore_errors=True)
        persist_store()
    return {"deleted": True}
