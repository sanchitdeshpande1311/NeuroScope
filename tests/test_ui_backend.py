"""Tests for the endpoints behind the multi-page UI: per-file/set validation, refinement comparison, graph/Dijkstra."""
import json
from pathlib import Path

import networkx as nx
import nibabel as nib
import numpy as np
import pytest

from conftest import synthetic_case, write_case
from ml.graph_analysis import GeodesicPathEngine
from ml.inference import remove_small_components
from ml.refinement_compare import expert_change, prediction_change

RUN = "d" * 32


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import importlib
    import backend.main as bm
    monkeypatch.setenv("NEUROSCOPE_LAZY_MODEL", "1")
    importlib.reload(bm)
    monkeypatch.setattr(bm, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(bm, "LEGACY_TEMP", tmp_path / "no_legacy_temp")
    monkeypatch.setattr(bm, "LEGACY_RESULTS", tmp_path / "no_legacy_results")
    (tmp_path / "runs").mkdir()
    from fastapi.testclient import TestClient
    with TestClient(bm.app) as c:
        yield c, bm, tmp_path / "runs"


def _post_file(c, path, slot):
    with open(path, "rb") as f:
        return c.post("/api/validate-file", files={"file": (Path(path).name, f, "application/octet-stream")}, data={"modality": slot})


# ------------------------------------------------------------------ per-file + set validation
def test_validate_file_each_slot_independently(client, tmp_path):
    c, bm, runs = client
    arrays, aff = synthetic_case()
    files = write_case(tmp_path / "ok", arrays, aff)
    for slot, p in files.items():
        r = _post_file(c, p, slot)
        assert r.status_code == 200 and r.json()["status"] == "valid" and r.json()["shape"] == [64, 64, 48]
    bad = tmp_path / "fake.nii.gz"
    bad.write_text("not nifti")
    r = _post_file(c, bad, "t1n")
    assert r.status_code == 422 and r.json()["code"] == "not_gzip" and r.json()["modality"] == "t1n"
    nan = arrays["t2w"].copy(); nan[1, 1, 1] = np.nan
    r = _post_file(c, write_case(tmp_path / "nan", {"t2w": nan}, aff)["t2w"], "t2w")
    assert r.json()["code"] == "non_finite"
    assert list(runs.iterdir()) == []  # validation never leaves files behind


def test_validate_expert_labels(client, tmp_path):
    c, *_ = client
    seg = np.zeros((64, 64, 48), np.uint8); seg[10:20, 10:20, 10:20] = 2; seg[12:15, 12:15, 12:15] = 4
    p = tmp_path / "seg.nii.gz"; nib.save(nib.Nifti1Image(seg, np.eye(4)), str(p))
    r = _post_file(c, p, "expert")
    assert r.status_code == 200 and r.json()["labels"] == [0, 2, 4]
    seg[0, 0, 0] = 7
    nib.save(nib.Nifti1Image(seg, np.eye(4)), str(p))
    r = _post_file(c, p, "expert")
    assert r.status_code == 422 and r.json()["code"] == "expert_labels"


def test_validate_set_names_incompatible_sequences(client, tmp_path):
    c, *_ = client
    arrays, aff = synthetic_case()
    files = write_case(tmp_path / "ok", arrays, aff)
    summaries = {s: _post_file(c, p, s).json() for s, p in files.items()}
    assert c.post("/api/validate-set", json={"summaries": summaries}).json() == {"compatible": True, "issues": []}
    short = _post_file(c, write_case(tmp_path / "s", {"t2w": arrays["t2w"][:, :, :40]}, aff)["t2w"], "t2w").json()
    r = c.post("/api/validate-set", json={"summaries": {**summaries, "t2w": short}}).json()
    assert not r["compatible"] and r["issues"][0]["code"] == "shape_mismatch" and set(r["issues"][0]["modalities"]) == {"t2w", "t1c"}
    moved = dict(summaries["t2f"]); moved["affine"] = (np.array(moved["affine"]) + np.array([[0, 0, 0, 3]] + [[0] * 4] * 3)).tolist()
    r = c.post("/api/validate-set", json={"summaries": {**summaries, "t2f": moved}}).json()
    assert r["issues"][0]["code"] == "affine_mismatch" and "FLAIR" in r["issues"][0]["message"]
    r = c.post("/api/validate-set", json={"summaries": {k: v for k, v in summaries.items() if k != "t1n"}}).json()
    assert r["issues"][0]["code"] == "missing_modality" and r["issues"][0]["modalities"] == ["t1n"]


# ------------------------------------------------------------------ refinement comparison (known answers)
def _synthetic_masks():
    seg = np.zeros((40, 40, 40), np.uint8)
    seg[5:25, 5:25, 5:25] = 2          # edema block
    seg[10:20, 10:20, 10:20] = 1       # core
    seg[13:17, 13:17, 13:17] = 4       # enhancing
    seg[33, 33, 33] = 2                # isolated 1-voxel blob (1 mm^3 < 10 mm^3 -> removed by the rule)
    seg[35:37, 35, 35] = 2             # isolated 2-voxel blob
    expert = seg.copy()
    expert[33, 33, 33] = 0             # the 1-voxel blob is a true false positive
    expert[35:37, 35, 35] = 2          # the 2-voxel blob is real tumour (rule removes a true positive)
    return seg, expert


def test_refinement_numbers_known_answer():
    seg, expert = _synthetic_masks()
    ref = remove_small_components(seg, (1, 1, 1), 10.0)
    pc = prediction_change(seg, ref, np.eye(4), (1, 1, 1))
    assert pc["regions"]["WT"]["removed_voxels"] == 3 and pc["regions"]["WT"]["added_voxels"] == 0
    assert pc["regions"]["WT"]["components_baseline"] == 3 and pc["regions"]["WT"]["components_refined"] == 1
    assert pc["regions"]["TC"]["removed_voxels"] == 0 and len(pc["removed_components"]) == 2
    ex = expert_change(seg, ref, expert, 4, (1, 1, 1))
    w = ex["regions"]["WT"]
    assert (w["baseline"]["fp"], w["refined"]["fp"]) == (1, 0)      # FP 1 -> 0
    assert (w["baseline"]["fn"], w["refined"]["fn"]) == (0, 2)      # FN 0 -> 2: rule also removed real tumour
    assert w["delta"]["fp_pct_change"] == -100.0 and w["delta"]["fn_pct_change"] is None  # baseline FN 0 -> undefined %
    assert ex["regions"]["TC"]["verdict"] == "no_meaningful_change"
    tp = int(((seg > 0) & (expert > 0)).sum())
    assert w["baseline"]["dice"] == pytest.approx(2 * tp / (2 * tp + 1 + 0))


def test_refinement_endpoint_and_no_expert(client):
    c, bm, runs = client
    seg, expert = _synthetic_masks()
    d = runs / RUN; d.mkdir()
    nib.save(nib.Nifti1Image(seg, np.eye(4)), str(d / "seg.nii.gz"))
    nib.save(nib.Nifti1Image(remove_small_components(seg, (1, 1, 1), 10.0), np.eye(4)), str(d / "seg_refined.nii.gz"))
    (d / "result.json").write_text(json.dumps({"refinement": {"method": "rule"}}))
    r = c.get(f"/api/runs/{RUN}/refinement").json()
    assert r["expert"] is None and r["prediction_change"]["regions"]["WT"]["removed_voxels"] == 3
    (d / "refinement.json").unlink()
    nib.save(nib.Nifti1Image(expert, np.eye(4)), str(d / "expert.nii.gz"))
    r = c.get(f"/api/runs/{RUN}/refinement").json()
    assert r["expert"]["regions"]["WT"]["refined"]["fp"] == 0 and r["expert_label_convention"] == "ET=4"


# ------------------------------------------------------------------ Dijkstra correctness
def test_dijkstra_matches_independent_networkx():
    seg = np.zeros((14, 12, 10), np.uint8)
    seg[2:12, 2:10, 2:8] = 2
    seg[4:6, 4:6, 3:5] = 1
    seg[2:12, 6, 2:8] = 0                 # a wall forcing paths around it (geodesic > euclidean)
    seg[11, 6, 2:8] = 2                   # opening in the wall
    zooms = (1.0, 1.5, 2.0)               # anisotropic spacing -> physical edge weights
    aff = np.diag([*zooms, 1.0])
    eng = GeodesicPathEngine(seg, aff, zooms)
    G = nx.Graph()
    wt = np.argwhere(seg > 0)
    S = set(map(tuple, wt))
    for v in S:
        for o in np.ndindex(3, 3, 3):
            o = np.array(o) - 1
            u = tuple(np.array(v) + o)
            if u != v and u in S:
                G.add_edge(v, u, weight=float(np.sqrt(((o * np.array(zooms)) ** 2).sum())))
    src = [tuple(x) for x in np.argwhere(np.isin(seg, (1, 4)))]
    ref = nx.multi_source_dijkstra_path_length(G, src)
    for node in range(0, eng.n, 7):
        assert eng.dist[node] == pytest.approx(ref[tuple(eng.coords[node])], abs=1e-9)
    far = int(np.argmax(np.where(np.isfinite(eng.dist), eng.dist, -1)))
    p = eng.path_to(far)
    assert p["reachable"] and p["length_mm"] == pytest.approx(p["length_from_points_mm"], abs=1e-6)
    steps = np.diff(np.array(p["points_mm"]), axis=0)
    assert np.all(np.linalg.norm(steps, axis=1) <= np.linalg.norm(zooms) + 1e-6)   # every step is a 26-neighbour move
    assert p["length_mm"] > p["euclidean_mm"]  # the wall forces a detour
    assert eng.nearest_node(eng.world(far)) == far
