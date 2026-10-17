"""
End-to-end case pipeline shared by the API (backend/main.py) and the CLI (execution/run_inference.py).

    run_case(paths, out_dir, segmenter, expert_path=None) -> metadata dict

Writes into out_dir:
    seg.nii.gz            primary output: model prediction, labels {0,1,2,4}, original grid + affine
    seg_refined.nii.gz    optional comparison: small-component removal applied
    mesh_{brain,WT,TC,ET}.gii  world-mm surface meshes for the 3D view
    report.pdf, result.json
On any exception the caller must delete out_dir (no partial result survives).
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import time
from pathlib import Path

import nibabel as nib
import numpy as np
import torch
from scipy import ndimage

from .graph_analysis import component_graph, geodesic_extent
from .inference import (MODALITIES, InputValidationError, Segmenter, compare_to_reference, input_sanity,
                        labels_to_regions, remove_small_components, save_segmentation, sha256_file,
                        validate_case, volumes_ml)
from .meshes import mask_to_gifti
from .report import build_pdf

ROOT = Path(__file__).resolve().parent.parent
REFINE_MIN_MM3 = 10.0

LIMITATIONS = [
    "Model trained by the project team on BraTS 2023 GLI training data (adult glioma, pre-operative, skull-stripped, "
    "co-registered, 1 mm). Performance on other tumour types, post-operative scans, paediatric data or other "
    "acquisition protocols is unknown.",
    "Development-set Dice/sensitivity (results/heldout_eval.json) are from patient-disjoint BraTS 2023 GLI cases; they "
    "are not hidden-case or clinical performance.",
    "BraTS 2023 GLI training data overlaps the BraTS 2021 training collection; if evaluation cases come from that "
    "collection, some may have been seen in training.",
    "Labels 1/2/4 are derived from nested TC/WT/ET predictions (ET -> 4, TC minus ET -> 1, WT minus TC -> 2).",
    "Input sanity checks (skull-stripping, brain-likeness) are heuristic reference-range checks, not validated detectors.",
    "Volumes are estimates from the predicted mask; partial-volume effects and segmentation errors are not reflected "
    "in any uncertainty interval.",
]


def code_version() -> str:
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=5)
        if sha.returncode == 0 and sha.stdout.strip():
            dirty = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, timeout=10)
            return f"git {sha.stdout.strip()}" + (" (+ uncommitted changes)" if dirty.stdout.strip() else "")
    except Exception:  # noqa: BLE001
        pass
    return "no git commit exists; working tree is untracked (see BACKUP_MANIFEST.json)"


def load_expert(path: Path, case) -> np.ndarray:
    img = nib.load(str(path))
    if img.shape[:3] != tuple(case.shape) or not np.allclose(img.affine, case.affine, atol=1e-2):
        raise InputValidationError("expert_geometry", "Expert mask grid/affine does not match the MRI sequences.", "expert")
    d = np.asarray(img.dataobj)
    if d.ndim == 4 and d.shape[3] == 1:
        d = d[..., 0]
    if not np.all(np.isfinite(d)) or not np.allclose(d, np.round(d)):
        raise InputValidationError("expert_labels", "Expert mask must contain integer labels.", "expert")
    d = np.round(d).astype(np.int16)
    labs = set(np.unique(d).tolist())
    if labs <= {0, 1, 2, 4}:
        return d, 4
    if labs <= {0, 1, 2, 3}:
        return d, 3  # BraTS 2023 convention (ET = 3)
    raise InputValidationError("expert_labels", f"Unsupported expert labels {sorted(labs)}; expected BraTS labels 0/1/2/4.", "expert")


def run_case(paths: dict, out_dir: Path, segmenter: Segmenter, run_id: str, expert_path: Path | None = None,
             enforce_sanity: bool = True) -> dict:
    t_start = time.perf_counter()
    out_dir = Path(out_dir)
    timings = {}
    t0 = time.perf_counter()
    case = validate_case(paths)
    sanity = input_sanity(case)
    timings["validation_s"] = time.perf_counter() - t0
    if enforce_sanity and sanity["status"] == "refuse":
        i = next(x for x in sanity["issues"] if x["level"] == "refuse")
        raise InputValidationError(i["code"], i["message"])
    expert = expert_label = None
    if expert_path is not None:
        expert, expert_label = load_expert(Path(expert_path), case)

    pred = segmenter.predict(case)
    timings.update(pred["timings"])
    seg = pred["seg"]
    t0 = time.perf_counter()
    refined = remove_small_components(seg, case.zooms, REFINE_MIN_MM3)
    timings["refinement_s"] = time.perf_counter() - t0
    save_segmentation(seg, case, out_dir / "seg.nii.gz")
    save_segmentation(refined, case, out_dir / "seg_refined.nii.gz")

    t0 = time.perf_counter()
    graph = component_graph(seg, case.affine, case.zooms)
    geo = geodesic_extent(seg, case.zooms)
    timings["graph_s"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    meshes = {}
    fg = np.any(np.stack([case.data[m] for m in MODALITIES]) != 0, 0)
    fg = ndimage.binary_fill_holes(fg)
    meshes["brain"] = mask_to_gifti(fg, case.affine, out_dir / "mesh_brain.gii", step=2, smooth_sigma=1.0)
    for name, mask in zip(("WT", "TC", "ET"), labels_to_regions(seg)):
        meshes[name] = mask_to_gifti(mask, case.affine, out_dir / f"mesh_{name}.gii", step=1, smooth_sigma=0.5)
    timings["mesh_s"] = time.perf_counter() - t0

    vb, vr = volumes_ml(seg, case.zooms), volumes_ml(refined, case.zooms)
    diff = {k: {"abs_ml": vr[k] - vb[k], "pct": (100.0 * (vr[k] - vb[k]) / vb[k]) if vb[k] > 0 else 0.0} for k in ("WT", "TC", "ET")}
    meta = {
        "run_id": run_id,
        "timestamp_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "status": "complete",
        "wording": "Suspected tumour region predicted by the model; volumes are estimates.",
        "shape": list(case.shape), "voxel_spacing_mm": list(case.zooms),
        "affine": np.round(case.affine, 6).tolist(),
        "axcodes": list(nib.aff2axcodes(case.affine)),
        "labels": {"0": "background", "1": "NCR/NET", "2": "edema", "4": "enhancing tumour"},
        "volumes_ml": {"baseline": vb, "refined": vr, "refined_minus_baseline": diff},
        "refinement": {"method": f"remove WT connected components (26-conn) smaller than {REFINE_MIN_MM3} mm^3",
                       "applied_to_primary_output": False,
                       "voxels_removed": int(vb["voxels"]["WT"] - vr["voxels"]["WT"]),
                       "components_baseline": graph["n_components"]},
        "graph": graph, "geodesic": geo,
        "input_sanity": sanity, "input_sha256": case.sha256,
        "model": segmenter.info.__dict__, "checkpoint_sha256": segmenter.checkpoint_sha256,
        "device": torch.cuda.get_device_name(0) if segmenter.device.type == "cuda" else "cpu",
        "code_version": code_version(),
        "meshes": meshes,
        "limitations": LIMITATIONS,
    }
    if expert is not None:
        meta["expert_comparison"] = compare_to_reference(seg, expert, case.zooms, ref_et_label=expert_label)
        meta["expert_comparison_refined"] = compare_to_reference(refined, expert, case.zooms, ref_et_label=expert_label)
        meta["expert_volumes_ml"] = {k: meta["expert_comparison"][k]["ref_ml"] for k in ("WT", "TC", "ET")}
    t0 = time.perf_counter()
    meta["timings_s"] = timings
    build_pdf(out_dir / "report.pdf", meta, bg=case.data["t1c"], seg=seg, affine=case.affine)
    timings["report_s"] = time.perf_counter() - t0
    timings["total_s"] = time.perf_counter() - t_start
    (out_dir / "result.json").write_text(json.dumps(meta, indent=2, default=float))
    return meta
