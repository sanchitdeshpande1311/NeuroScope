"""
NeuroScope 3D API (research / teaching use only).

POST /api/predict           four NIfTI sequences (t1n=T1, t1c=T1Gd, t2w=T2, t2f=FLAIR) + optional expert_mask
GET  /api/runs/{id}         result metadata
GET  /api/runs/{id}/files/{name}   whitelisted run files (NIfTI, meshes, report)
DELETE /api/runs/{id}       delete a run now
GET  /api/health

Every run lives in backend/runs/<uuid4 hex>/ and is deleted automatically once it is
older than RETENTION_HOURS (checked at startup and every CLEANUP_INTERVAL_S), always
within 24 hours. A failed request deletes its run directory before responding.
"""
import asyncio
import json
import logging
import tempfile
from collections import OrderedDict
import os
import re
import shutil
import sys
import threading
import time
import uuid
from pathlib import Path

import nibabel as nib
import torch
import numpy as np
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ml.graph_analysis import GeodesicPathEngine, component_graph  # noqa: E402
from ml.inference import (MAX_FILE_BYTES, MODALITY_NAMES, InputValidationError, Segmenter, check_set,  # noqa: E402
                          describe_volume)
from ml.pipeline import run_case  # noqa: E402
from ml.refinement_compare import expert_change, prediction_change  # noqa: E402
from ml.spatial_graph import CLASS_NAMES, GraphBuildError, SpatialGraph  # noqa: E402
from ml.inference import sha256_file  # noqa: E402
from scipy import ndimage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("neuroscope")

RUNS_DIR = Path(os.environ.get("NEUROSCOPE_RUNS_DIR", ROOT / "backend" / "runs"))
RETENTION_HOURS = float(os.environ.get("NEUROSCOPE_RETENTION_HOURS", "23"))
CLEANUP_INTERVAL_S = 15 * 60
RUNS_DIR.mkdir(parents=True, exist_ok=True)
RUN_ID_RE = re.compile(r"^[0-9a-f]{32}$")
SERVED_FILES = {"seg.nii.gz", "seg_refined.nii.gz", "t1c.nii.gz", "t2f.nii.gz", "expert.nii.gz", "refinement.json", "report_full.pdf",
                "mesh_brain.gii", "mesh_WT.gii", "mesh_TC.gii", "mesh_ET.gii", "report.pdf", "result.json"}
DISCLAIMER = "Research and teaching use only. Not for clinical diagnosis or treatment decisions."

app = FastAPI(title="NeuroScope 3D API", description=DISCLAIMER)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

_segmenter = None
_gpu_lock = threading.Lock()


def get_segmenter() -> Segmenter:
    global _segmenter
    if _segmenter is None:
        _segmenter = Segmenter()
        logger.info("Model loaded on %s", _segmenter.device)
    return _segmenter


LEGACY_TEMP = ROOT / "backend" / "temp"
LEGACY_RESULTS = ROOT / "backend" / "results"
LEGACY_UPLOAD_RE = re.compile(r"^(t1n|t1c|t2w|t2f)\.nii\.gz$")
LEGACY_RESULT_UPLOAD_RE = re.compile(r"^(\d{10})_t1c\.nii\.gz$")


def cleanup_expired(now: float | None = None) -> int:
    """
    Delete expired uploads. Returns the number of items removed. Only two things can ever be removed:
      - directories directly in RUNS_DIR whose name is a 32-hex run id and whose mtime is older than RETENTION_HOURS;
      - legacy (pre-2026-10-16 API) upload copies: backend/temp/<10-digit ts>/{t1n,t1c,t2w,t2f}.nii.gz and
        backend/results/<ts>_t1c.nii.gz, with ts older than RETENTION_HOURS.
    Anything else (models, data, sample reports, generated masks, non-matching names) is never touched.
    """
    now = now or time.time()
    limit = RETENTION_HOURS * 3600
    removed = 0
    for d in RUNS_DIR.iterdir():
        if d.is_dir() and not d.is_symlink() and RUN_ID_RE.match(d.name) and now - d.stat().st_mtime > limit:
            shutil.rmtree(d, ignore_errors=True)
            removed += 1
    if LEGACY_TEMP.is_dir():
        for d in LEGACY_TEMP.iterdir():
            if d.is_dir() and re.fullmatch(r"\d{10}", d.name) and now - int(d.name) > limit:
                for f in d.iterdir():
                    if f.is_file() and LEGACY_UPLOAD_RE.match(f.name):
                        f.unlink()
                        removed += 1
    if LEGACY_RESULTS.is_dir():
        for f in LEGACY_RESULTS.iterdir():
            m = LEGACY_RESULT_UPLOAD_RE.match(f.name)
            if f.is_file() and m and now - int(m.group(1)) > limit:
                f.unlink()
                removed += 1
    if removed:
        logger.info("Retention cleanup removed %d run(s)", removed)
    return removed


async def _cleanup_loop():
    while True:
        try:
            cleanup_expired()
        except Exception:  # noqa: BLE001
            logger.exception("cleanup failed")
        await asyncio.sleep(CLEANUP_INTERVAL_S)


@app.on_event("startup")
async def startup():
    cleanup_expired()
    asyncio.create_task(_cleanup_loop())
    if os.environ.get("NEUROSCOPE_LAZY_MODEL") != "1":
        get_segmenter()


@app.get("/api/health")
def health():
    return {"status": "ok", "gpu_available": torch.cuda.is_available(), "model_loaded": _segmenter is not None,
            "retention_hours": RETENTION_HOURS, "disclaimer": DISCLAIMER}


def _error(status: int, code: str, message: str, modality: str | None = None):
    return JSONResponse(status_code=status, content={"status": "error", "code": code, "message": message,
                                                     "modality": modality, "disclaimer": DISCLAIMER})


def _save_upload(upload: UploadFile, dest: Path, label: str):
    name = (upload.filename or "").lower()
    if not (name.endswith(".nii") or name.endswith(".nii.gz")):
        raise InputValidationError("bad_extension", f"{label}: file must be .nii or .nii.gz.", label)
    written = 0
    with open(dest, "wb") as out:
        while chunk := upload.file.read(1 << 20):
            written += len(chunk)
            if written > MAX_FILE_BYTES:
                raise InputValidationError("file_too_large", f"{label}: file exceeds the 1 GB limit.", label)
            out.write(chunk)


@app.post("/api/predict")
def predict(t1n: UploadFile | None = File(None), t1c: UploadFile | None = File(None),
            t2w: UploadFile | None = File(None), t2f: UploadFile | None = File(None),
            expert_mask: UploadFile | None = File(None)):
    run_id = uuid.uuid4().hex
    run_dir = RUNS_DIR / run_id
    inputs = {"t1n": t1n, "t1c": t1c, "t2w": t2w, "t2f": t2f}
    try:
        missing = [MODALITY_NAMES[m] for m, f in inputs.items() if f is None or not f.filename]
        if missing:
            raise InputValidationError("missing_modality",
                                       f"Missing required sequence(s): {', '.join(missing)}. All four (T1, T1Gd, T2, FLAIR) are required.")
        run_dir.mkdir(parents=True)
        paths = {}
        for m, f in inputs.items():
            ext = ".nii.gz" if f.filename.lower().endswith(".gz") else ".nii"
            paths[m] = run_dir / f"{m}{ext}"
            _save_upload(f, paths[m], MODALITY_NAMES[m])
        expert_path = None
        if expert_mask is not None and expert_mask.filename:
            ext = ".nii.gz" if expert_mask.filename.lower().endswith(".gz") else ".nii"
            expert_path = run_dir / f"expert{ext}"
            _save_upload(expert_mask, expert_path, "expert mask")
        with _gpu_lock:
            meta = run_case(paths, run_dir, get_segmenter(), run_id, expert_path=expert_path)
        # viewer background volumes are served as <name>.nii.gz; convert uncompressed uploads
        for src in [paths["t1c"], paths["t2f"]] + ([expert_path] if expert_path else []):
            if src.suffix != ".gz":
                nib.save(nib.load(str(src)), str(src.with_suffix(".nii.gz")))
                src.unlink()
        # raw inputs not needed for viewing are removed immediately
        for m in ("t1n", "t2w"):
            paths[m].unlink(missing_ok=True)
        files = sorted(p.name for p in run_dir.iterdir() if p.name in SERVED_FILES)
        meta["files"] = {n: f"/api/runs/{run_id}/files/{n}" for n in files}
        meta["disclaimer"] = DISCLAIMER
        logger.info("run %s complete in %.1fs", run_id, meta["timings_s"]["total_s"])
        return meta
    except InputValidationError as e:
        shutil.rmtree(run_dir, ignore_errors=True)
        logger.info("run %s refused: %s", run_id, e.code)
        status = 413 if e.code == "file_too_large" else 422
        return _error(status, e.code, e.message, e.modality)
    except Exception as e:  # noqa: BLE001
        shutil.rmtree(run_dir, ignore_errors=True)
        logger.error("run %s failed: %s", run_id, type(e).__name__)
        return _error(500, "internal_error", "Processing failed unexpectedly; no result was produced. Please check the inputs and try again.")


def _run_dir(run_id: str) -> Path:
    if not RUN_ID_RE.match(run_id):
        raise HTTPException(404, "Not found")
    d = RUNS_DIR / run_id
    if not (d / "result.json").exists():
        raise HTTPException(404, "Not found (runs are deleted automatically within 24 hours)")
    return d


@app.post("/api/validate-file")
def validate_file(file: UploadFile = File(...), modality: str = Form(...)):
    """Validate ONE uploaded sequence (or the expert mask) immediately; the file is deleted before responding."""
    if modality not in ("t1n", "t1c", "t2w", "t2f", "expert"):
        return _error(422, "bad_modality", "Unknown sequence slot.")
    label = MODALITY_NAMES.get(modality, "expert mask")
    with tempfile.TemporaryDirectory(prefix="ns3d_val_") as td:
        name = (file.filename or "").lower()
        dest = Path(td) / ("upload.nii.gz" if name.endswith(".gz") else "upload.nii")
        try:
            _save_upload(file, dest, label)
            info = describe_volume(dest, modality)
            if modality == "expert":
                vals = np.asarray(nib.load(str(dest)).dataobj)
                if not np.allclose(vals, np.round(vals)):
                    raise InputValidationError("expert_labels", "Expert mask must contain integer labels.", "expert")
                labs = sorted(int(v) for v in np.unique(np.round(vals)))
                if not set(labs) <= {0, 1, 2, 3, 4} or (3 in labs and 4 in labs):
                    raise InputValidationError("expert_labels", f"Unsupported expert labels {labs}; expected BraTS labels 0/1/2/4 (or 0/1/2/3).", "expert")
                info["labels"] = labs
        except InputValidationError as e:
            return _error(413 if e.code == "file_too_large" else 422, e.code, e.message, modality)
        except Exception as e:  # noqa: BLE001
            logger.error("validate-file failed: %s", type(e).__name__)
            return _error(422, "unreadable", f"{label}: the file could not be read as a NIfTI image.", modality)
    return {"status": "valid", "filename": file.filename, **info}


@app.post("/api/validate-set")
def validate_set(summaries: dict = Body(..., embed=True)):
    """Cross-sequence compatibility (shape, affine) for the summaries returned by /api/validate-file."""
    clean = {m: summaries[m] for m in ("t1n", "t1c", "t2w", "t2f") if m in summaries}
    issues = check_set(clean)
    if "expert" in summaries and "t1c" in summaries:
        e, r = summaries["expert"], summaries["t1c"]
        if list(e["shape"]) != list(r["shape"]) or not np.allclose(np.array(e["affine"]), np.array(r["affine"]), atol=1e-2):
            issues.append({"code": "expert_geometry", "modalities": ["expert", "t1c"],
                           "message": "Expert mask grid/affine does not match T1Gd."})
    return {"compatible": not issues, "issues": issues}


def _files_map(run_id: str, d: Path) -> dict:
    return {p.name: f"/api/runs/{run_id}/files/{p.name}" for p in sorted(d.iterdir()) if p.name in SERVED_FILES}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    d = _run_dir(run_id)
    meta = json.loads((d / "result.json").read_text())
    meta["files"] = _files_map(run_id, d)
    meta["disclaimer"] = DISCLAIMER
    return meta


def _load_masks(d: Path):
    seg_img = nib.load(str(d / "seg.nii.gz"))
    seg = np.asarray(seg_img.dataobj)
    ref = np.asarray(nib.load(str(d / "seg_refined.nii.gz")).dataobj) if (d / "seg_refined.nii.gz").exists() else None
    exp = et = None
    if (d / "expert.nii.gz").exists():
        exp = np.round(np.asarray(nib.load(str(d / "expert.nii.gz")).dataobj)).astype(np.int16)
        et = 3 if (exp == 3).any() and not (exp == 4).any() else 4
    return seg, ref, exp, et, seg_img.affine, seg_img.header.get_zooms()[:3]


@app.get("/api/runs/{run_id}/refinement")
def get_refinement(run_id: str):
    """Baseline vs refined numbers computed from the saved masks of THIS run (cached in refinement.json)."""
    d = _run_dir(run_id)
    cache = d / "refinement.json"
    if cache.exists():
        return json.loads(cache.read_text())
    seg, ref, exp, et, aff, zooms = _load_masks(d)
    if ref is None:
        raise HTTPException(404, "No refined mask for this run")
    t0 = time.perf_counter()
    out = {"run_id": run_id, "method": json.loads((d / "result.json").read_text())["refinement"]["method"],
           "primary_output": "baseline (unrefined model prediction)",
           "prediction_change": prediction_change(seg, ref, aff, zooms),
           "expert": expert_change(seg, ref, exp, et, zooms) if exp is not None else None,
           "expert_label_convention": None if exp is None else f"ET={et}"}
    out["compute_s"] = time.perf_counter() - t0
    cache.write_text(json.dumps(out, indent=2))
    return out


@app.get("/api/evidence/refinement")
def refinement_evidence():
    """Held-out development summary of baseline vs refined (results/refinement_eval_summary.json); aggregate only."""
    p = ROOT / "results" / "refinement_eval_summary.json"
    if not p.exists():
        raise HTTPException(404, "Evidence summary not generated (run execution/summarize_refinement_eval.py)")
    d = json.loads(p.read_text())
    d.pop("cases", None)
    return d


_engines = OrderedDict()  # run_id -> (GeodesicPathEngine, seg, affine, zooms); small in-memory LRU


def _engine(run_id: str):
    if run_id in _engines:
        _engines.move_to_end(run_id)
        return _engines[run_id]
    d = _run_dir(run_id)
    seg, _, _, _, aff, zooms = _load_masks(d)
    _engines[run_id] = (GeodesicPathEngine(seg, aff, zooms), seg, aff, zooms)
    while len(_engines) > 4:
        _engines.popitem(last=False)
    return _engines[run_id]


@app.get("/api/runs/{run_id}/graph")
def get_graph(run_id: str):
    eng, seg, aff, zooms = _engine(run_id)
    out = {"run_id": run_id, "component_graph": component_graph(seg, aff, zooms), "dijkstra": eng.summary(),
           "edge_weight": "physical distance between 26-neighbour voxel centres (mm), from the NIfTI spacing",
           "note": "Descriptive spatial analysis of the predicted mask. Not a model of tumour growth or invasion."}
    if eng.ok:
        dests = eng.destinations(seg)
        out["destinations"] = dests
        out["default_path"] = eng.path_to(dests[0]["node"]) if dests else None
    return out


# ---------------------------------------------------------------- brain-wide spatial lattice graph
_spatial = OrderedDict()  # (run_id, target_mm) -> (provenance key, SpatialGraph); small in-memory LRU
_spatial_lock = threading.Lock()


def _spatial_graph(run_id: str, target_mm: float):
    """Build (or reuse) the lattice graph for THIS run. Reused only if the prediction file and the MRI files
    it was built from are byte-identical (SHA-256); otherwise it is rebuilt. The expert mask is never read."""
    d = _run_dir(run_id)
    sources = {"seg.nii.gz": sha256_file(d / "seg.nii.gz")}
    for f in ("t1c.nii.gz", "t2f.nii.gz"):
        if (d / f).exists():
            sources[f] = sha256_file(d / f)
    key = (run_id, round(float(target_mm), 3))
    prov_key = tuple(sorted(sources.items()))
    with _spatial_lock:
        hit = _spatial.get(key)
        if hit and hit[0] == prov_key:
            _spatial.move_to_end(key)
            return hit[1], sources, True
        seg_img = nib.load(str(d / "seg.nii.gz"))
        seg = np.asarray(seg_img.dataobj).astype(np.int16)
        brain = np.zeros(seg.shape, bool)
        for f in ("t1c.nii.gz", "t2f.nii.gz"):
            if (d / f).exists():
                img = nib.load(str(d / f))
                if img.shape[:3] != seg.shape or not np.allclose(img.affine, seg_img.affine, atol=1e-3):
                    raise GraphBuildError(f"{f} is not on the segmentation grid")
                brain |= np.asarray(img.dataobj) != 0
        brain = ndimage.binary_fill_holes(brain)
        g = SpatialGraph(seg, brain, seg_img.affine, seg_img.header.get_zooms()[:3], target_mm)
        _spatial[key] = (prov_key, g)
        while len(_spatial) > 4:
            _spatial.popitem(last=False)
        return g, sources, False


def _graph_error(e: Exception):
    return _error(422, "graph_error", str(e))


@app.get("/api/runs/{run_id}/spatial-graph")
def get_spatial_graph(run_id: str, target_mm: float = 4.0):
    try:
        t0 = time.perf_counter()
        g, sources, cached = _spatial_graph(run_id, target_mm)
    except GraphBuildError as e:
        return _graph_error(e)
    sub = g.render_subgraph()
    ids = np.array(sub["vertex_ids"], dtype=np.int64)
    meta = json.loads((_run_dir(run_id) / "result.json").read_text())
    comps = []
    for c in g.components:
        comps.append({**c, "graph_component": int(g.cc_label[c["representative_vertex"]]),
                      "representative_mm": g.mm[c["representative_vertex"]].round(2).tolist()})
    default = None
    if len(g.components) >= 2:
        a, b = g.components[0], g.components[1]
        default = g.shortest_path(a["representative_vertex"], b["representative_vertex"], "A")
        default["source_how"] = f"representative vertex of tumour component {a['id']}"
        default["destination_how"] = f"representative vertex of tumour component {b['id']}"
    return {
        "run_id": run_id,
        "provenance": {"run_id": run_id, "source_files_sha256": sources, "segmentation_array_sha256": g.seg_sha256,
                       "segmentation": "model prediction seg.nii.gz (labels 0/1/2/4); expert mask NOT used",
                       "brain_domain": "non-zero voxels of the run's T1Gd OR FLAIR, holes filled",
                       "target_spacing_mm": g.target_mm, "block_voxels": g.step.tolist(),
                       "affine": np.round(g.affine, 6).tolist(), "axcodes": "".join(nib.aff2axcodes(g.affine)),
                       "coordinates": "world = NIfTI affine applied once to voxel (i,j,k) of the original input grid; "
                                      "NIfTI RAS+ millimetres, the same frame used by the viewer and surfaces",
                       "cached": cached, "request_s": time.perf_counter() - t0, "created_utc": meta.get("timestamp_utc")},
        "stats": g.stats(), "checks": g.validate(), "class_names": CLASS_NAMES,
        "components": comps,
        "render": {"rule": sub["rule"],
                   "vertices": [[int(v), *[float(x) for x in g.mm[v].round(2)], int(g.cls[v]), int(g.vertex_component[v])] for v in ids],
                   "edges": sub["edges"]},
        "default_path": default,
        "cost_modes": {"A": "cost = physical edge length (mm). Dijkstra returns the minimum-distance route.",
                       "B": "EXPERIMENTAL, hypothetical: cost = length × (w_u + w_v)/2 with w = 1 for predicted-tumour "
                            "vertices and w = α for non-tumour vertices. It expresses a user-chosen preference for staying "
                            "inside the predicted tumour; it is not a biological resistance model."},
        "explanation": "Dijkstra's algorithm finds the lowest-cost path between selected vertices in the constructed graph. "
                       "Results depend on graph connectivity and the defined edge costs. The path describes spatial "
                       "connectivity, not predicted biological tumour spread.",
    }


@app.get("/api/runs/{run_id}/spatial-graph/path")
def get_spatial_path(run_id: str, src: str, dst: str, mode: str = "A", alpha: float = 1.0, target_mm: float = 4.0):
    try:
        g, sources, _ = _spatial_graph(run_id, target_mm)
        s, t = g.resolve(src), g.resolve(dst)
        res = g.shortest_path(s["vertex"], t["vertex"], mode, alpha)
    except GraphBuildError as e:
        return _graph_error(e)
    res.update({"source_how": s["how"], "source_snap_mm": s["snap_mm"], "destination_how": t["how"],
                "destination_snap_mm": t["snap_mm"], "segmentation_array_sha256": g.seg_sha256})
    return res


@app.post("/api/runs/{run_id}/report")
def generate_report(run_id: str, src: str | None = None, dst: str | None = None, mode: str = "A",
                    alpha: float = 1.0, target_mm: float = 4.0):
    """Generate the full case report (report_full.pdf) from THIS run's saved outputs. Graph results use the
    selection passed by the UI (src/dst/mode/alpha/spacing) or, without one, the path between the two
    largest components. Sections without data are omitted, never filled with placeholders."""
    from ml.report_full import build_full_report, graph_figure
    d = _run_dir(run_id)
    t0 = time.perf_counter()
    try:
        meta = json.loads((d / "result.json").read_text())
        refinement = get_refinement(run_id) if (d / "seg_refined.nii.gz").exists() else None
        graph = None
        try:
            g, _, _ = _spatial_graph(run_id, target_mm)
        except GraphBuildError as e:  # graph cannot be built for this case -> section omitted
            logger.info("report: graph section omitted (%s)", e)
            g = None
        if g is not None:  # an invalid user selection raises GraphBuildError -> 422 (never silently replaced)
            path = None
            if src and dst:
                s, t = g.resolve(src), g.resolve(dst)
                path = g.shortest_path(s["vertex"], t["vertex"], mode, alpha)
                path["source_how"], path["destination_how"] = s["how"], t["how"]
            elif len(g.components) >= 2:
                a, b = g.components[0], g.components[1]
                path = g.shortest_path(a["representative_vertex"], b["representative_vertex"], "A")
                path["source_how"] = f"component {a['id']} (representative vertex)"
                path["destination_how"] = f"component {b['id']} (representative vertex)"
            seg = np.asarray(nib.load(str(d / "seg.nii.gz")).dataobj).astype(np.int16)
            brain = np.zeros(seg.shape, bool)
            for f in ("t1c.nii.gz", "t2f.nii.gz"):
                if (d / f).exists():
                    brain |= np.asarray(nib.load(str(d / f)).dataobj) != 0
            fig = graph_figure(ndimage.binary_fill_holes(brain), seg, g.affine,
                               path["points_mm"] if path and path.get("reachable") else None,
                               path.get("vertex_class") if path and path.get("reachable") else None)
            graph = {"stats": g.stats(), "checks": g.validate(), "components": g.components, "path": path, "figure": fig}
        ev_path = ROOT / "results" / "refinement_eval_summary.json"
        evidence = json.loads(ev_path.read_text()) if ev_path.exists() else None
        out = build_full_report(d / "report_full.pdf", meta, d, refinement, graph, evidence)
    except GraphBuildError as e:
        return _graph_error(e)
    except Exception as e:  # noqa: BLE001
        logger.error("report for %s failed: %s", run_id, type(e).__name__)
        return _error(500, "report_failed", "The report could not be generated. Please try again.")
    return {"status": "ok", "file": f"/api/runs/{run_id}/files/report_full.pdf", "sections": out["sections"],
            "seconds": time.perf_counter() - t0}


@app.get("/api/runs/{run_id}/spatial-graph/lattice")
def get_spatial_lattice(run_id: str, target_mm: float = 4.0):
    """Whole graph (all vertices and edges) for the optional whole-brain lattice layer."""
    try:
        g, *_ = _spatial_graph(run_id, target_mm)
    except GraphBuildError as e:
        return _graph_error(e)
    return {"run_id": run_id, "segmentation_array_sha256": g.seg_sha256, **g.lattice_arrays()}


@app.get("/api/runs/{run_id}/graph/path")
def get_path(run_id: str, node: int | None = None, x: float | None = None, y: float | None = None, z: float | None = None):
    eng, *_ = _engine(run_id)
    if not eng.ok:
        raise HTTPException(409, f"Dijkstra not available: {eng.reason}")
    if node is None:
        if None in (x, y, z):
            raise HTTPException(422, "Give node or x,y,z (world mm)")
        node = eng.nearest_node([x, y, z])
    if not 0 <= node < eng.n:
        raise HTTPException(422, "node out of range")
    return eng.path_to(int(node))


@app.get("/api/runs/{run_id}/files/{name}")
def get_file(run_id: str, name: str):
    if name not in SERVED_FILES:
        raise HTTPException(404, "Not found")
    p = _run_dir(run_id) / name
    if not p.exists():
        raise HTTPException(404, "Not found")
    media = "application/pdf" if name.endswith(".pdf") else "application/octet-stream"
    # Run files never change after a run completes, so a short private browser cache lets the multi-page UI
    # move between pages without re-downloading the MRI (max 1 h, well inside the 24 h retention window).
    return FileResponse(p, media_type=media, filename=name, headers={"Cache-Control": "private, max-age=3600"},
                        content_disposition_type="inline" if name.endswith(".pdf") else "attachment")


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str):
    d = _run_dir(run_id)
    _engines.pop(run_id, None)
    for k in [k for k in _spatial if k[0] == run_id]:
        _spatial.pop(k, None)
    shutil.rmtree(d, ignore_errors=True)
    return {"deleted": run_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000)
