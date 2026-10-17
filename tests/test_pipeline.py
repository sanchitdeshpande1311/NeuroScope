"""Unit + integration tests for labels, geometry, API flow, retention."""
import os
import time
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

from conftest import case_paths, synthetic_case, write_case
from ml.inference import (Segmenter, labels_to_regions, regions_to_labels, save_segmentation, validate_case,
                          volumes_ml)


def test_regions_to_labels_hierarchy():
    z = np.zeros((4, 4, 4), bool)
    wt, tc, et = z.copy(), z.copy(), z.copy()
    wt[0:3] = True; tc[1:3] = True; et[2] = True
    et[3, 0, 0] = True  # ET outside TC/WT -> promoted upward (ET implies TC implies WT)
    seg = regions_to_labels(tc, wt, et)
    assert set(np.unique(seg)) == {0, 1, 2, 4}
    assert (seg[0] == 2).all() and (seg[1] == 1).all() and (seg[2] == 4).all() and seg[3, 0, 0] == 4
    w, t, e = labels_to_regions(seg)
    assert np.all(e <= t) and np.all(t <= w)


def test_resample_identity():
    arr = np.random.default_rng(0).random((2, 10, 12, 8)).astype(np.float32)
    aff = np.diag([1.0, 1.0, 1.0, 1.0])
    out = Segmenter.resample_to_reference(arr, aff, aff, arr.shape[1:])
    assert np.allclose(out, arr, atol=1e-5)


def test_resample_flip_and_scale():
    """Processed grid = RAS 1mm; reference = LPS-like 2mm along z. Values land at the same world points."""
    proc = np.zeros((1, 20, 20, 20), np.float32)
    proc[0, 15, 4, 10] = 1.0
    a_proc = np.eye(4)
    a_ref = np.array([[-1, 0, 0, 19], [0, -1, 0, 19], [0, 0, 2, 0], [0, 0, 0, 1]], float)
    out = Segmenter.resample_to_reference(proc, a_proc, a_ref, (20, 20, 10), order=0)
    ijk = np.argwhere(out[0] > 0.5)[0]
    world = a_ref @ np.append(ijk, 1)
    assert np.allclose(world[:3], [15, 4, 10])


def test_save_segmentation_geometry(tmp_path):
    arrays, aff = synthetic_case(spacing=(0.9, 1.1, 2.0))
    aff[:3, 3] = [-30, 12, 7]
    case = validate_case(write_case(tmp_path, arrays, aff))
    seg = np.zeros(case.shape, np.uint8); seg[10:12, 10:12, 10:12] = 4
    p = save_segmentation(seg, case, tmp_path / "seg.nii.gz")
    img = nib.load(str(p))
    assert img.shape == case.shape and np.allclose(img.affine, aff) and img.get_data_dtype() == np.uint8
    assert volumes_ml(np.asarray(img.dataobj), img.header.get_zooms())["ET"] == pytest.approx(8 * 0.9 * 1.1 * 2 / 1000)


def test_affine_mismatch_refused(tmp_path):
    from ml.inference import InputValidationError
    arrays, aff = synthetic_case()
    p = write_case(tmp_path, arrays, aff)
    aff2 = aff.copy(); aff2[0, 3] += 5
    p["t2w"] = write_case(tmp_path / "b", {"t2w": arrays["t2w"]}, aff2)["t2w"]
    with pytest.raises(InputValidationError) as e:
        validate_case(p)
    assert e.value.code == "affine_mismatch"


@pytest.fixture()
def real_client(tmp_path, monkeypatch):
    import importlib
    import backend.main as bm
    monkeypatch.setenv("NEUROSCOPE_LAZY_MODEL", "1")
    importlib.reload(bm)
    monkeypatch.setattr(bm, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(bm, "LEGACY_TEMP", tmp_path / "no_legacy_temp")  # never touch the real project folders
    monkeypatch.setattr(bm, "LEGACY_RESULTS", tmp_path / "no_legacy_results")
    (tmp_path / "runs").mkdir()
    from fastapi.testclient import TestClient
    with TestClient(bm.app) as c:
        yield c, bm, tmp_path / "runs"


def test_api_end_to_end_real_case(real_client):
    c, bm, runs = real_client
    sid, paths, label = case_paths(41)
    t0 = time.perf_counter()
    files = {m: (p.name, open(p, "rb"), "application/octet-stream") for m, p in paths.items()}
    files["expert_mask"] = (label.name, open(label, "rb"), "application/octet-stream")
    r = c.post("/api/predict", files=files)
    elapsed = time.perf_counter() - t0
    assert r.status_code == 200, r.text
    meta = r.json()
    run_id = meta["run_id"]
    assert len(run_id) == 32
    for name in ("seg.nii.gz", "report.pdf", "mesh_WT.gii", "t1c.nii.gz"):
        assert name in meta["files"]
        assert c.get(meta["files"][name]).status_code == 200
    assert not (runs / run_id / "t1n.nii.gz").exists()  # unneeded raw inputs removed
    seg = nib.load(str(runs / run_id / "seg.nii.gz"))
    ref = nib.load(str(paths["t1c"]))
    assert seg.shape == ref.shape and np.allclose(seg.affine, ref.affine)
    assert meta["expert_comparison"]["WT"]["dice"] > 0.5
    assert c.get(f"/api/runs/{run_id}/files/..%2Fsecret").status_code == 404
    assert c.get("/api/runs/" + "0" * 32).status_code == 404
    assert c.delete(f"/api/runs/{run_id}").status_code == 200
    assert not (runs / run_id).exists()
    print(f"API end-to-end {sid}: {elapsed:.1f}s, timings {meta['timings_s']}")
    assert elapsed < 120


def test_retention_cleanup(real_client):
    c, bm, runs = real_client
    old, new = runs / ("a" * 32), runs / ("b" * 32)
    old.mkdir(); new.mkdir()
    past = time.time() - 24.5 * 3600
    os.utime(old, (past, past))
    assert bm.cleanup_expired() == 1
    assert not old.exists() and new.exists()
    assert bm.RETENTION_HOURS < 24


def test_retention_scope_cannot_touch_other_files(real_client, tmp_path, monkeypatch):
    """The sweeper only removes run-id directories and legacy upload copies, even if misconfigured."""
    c, bm, runs = real_client
    past = time.time() - 48 * 3600
    # Simulate a misconfigured RUNS_DIR containing project-like folders and files
    for name in ("models", "data", "results", "sample_run_x"):
        (runs / name).mkdir()
        (runs / name / "keep.pth").write_bytes(b"x")
        os.utime(runs / name, (past, past))
    (runs / "notes.txt").write_text("keep")
    expired_run = runs / ("c" * 32); expired_run.mkdir(); (expired_run / "t1c.nii.gz").write_bytes(b"x")
    os.utime(expired_run, (past, past))
    # Legacy layout
    lt, lr = tmp_path / "legacy_temp", tmp_path / "legacy_results"
    old_ts, new_ts = str(int(past)), str(int(time.time()))
    (lt / old_ts).mkdir(parents=True); (lt / new_ts).mkdir(parents=True); lr.mkdir()
    for m in ("t1n", "t1c", "t2w", "t2f"):
        (lt / old_ts / f"{m}.nii.gz").write_bytes(b"x"); (lt / new_ts / f"{m}.nii.gz").write_bytes(b"x")
    (lt / old_ts / "other.txt").write_text("keep")
    for n in (f"{old_ts}_t1c.nii.gz", f"{new_ts}_t1c.nii.gz", f"{old_ts}_baseline.nii.gz", f"{old_ts}_refined.nii.gz"):
        (lr / n).write_bytes(b"x")
    monkeypatch.setattr(bm, "LEGACY_TEMP", lt)
    monkeypatch.setattr(bm, "LEGACY_RESULTS", lr)
    assert bm.cleanup_expired() == 1 + 4 + 1
    assert not expired_run.exists()
    for name in ("models", "data", "results", "sample_run_x"):
        assert (runs / name / "keep.pth").exists()
    assert (runs / "notes.txt").exists() and (lt / old_ts / "other.txt").exists()
    assert not any((lt / old_ts / f"{m}.nii.gz").exists() for m in ("t1n", "t1c", "t2w", "t2f"))
    assert all((lt / new_ts / f"{m}.nii.gz").exists() for m in ("t1n", "t1c", "t2w", "t2f"))
    assert not (lr / f"{old_ts}_t1c.nii.gz").exists() and (lr / f"{new_ts}_t1c.nii.gz").exists()
    assert (lr / f"{old_ts}_baseline.nii.gz").exists() and (lr / f"{old_ts}_refined.nii.gz").exists()
