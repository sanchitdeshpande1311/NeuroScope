"""Spatial lattice graph + Dijkstra: synthetic volumes with known geometry (tests 1-13, 16 of the graph spec)."""
import json
from pathlib import Path

import networkx as nx
import nibabel as nib
import numpy as np
import pytest

from ml.spatial_graph import CLASS_NAMES, GraphBuildError, SpatialGraph, sha256_array

S2, S3 = np.sqrt(2), np.sqrt(3)


def box(shape=(12, 12, 12)):
    return np.zeros(shape, np.int16), np.zeros(shape, bool)


def edge_set(g):
    return {tuple(sorted(p)) for p in zip(g.src.tolist(), g.dst.tolist())}


def vertex_at(g, vox):
    return int(np.argmin(np.linalg.norm(g.vox - np.asarray(vox, float), axis=1)))


# 1 ------------------------------------------------------------------ simple known shortest paths
def test_01_known_shortest_path():
    seg, brain = box()
    brain[1:11, 1:11, 1:11] = True
    g = SpatialGraph(seg, brain, np.eye(4), (1, 1, 1), target_mm=1)
    s, t = vertex_at(g, (2, 2, 2)), vertex_at(g, (7, 2, 2))
    p = g.shortest_path(s, t)
    assert p["reachable"] and p["n_edges"] == 5 and p["length_mm"] == pytest.approx(5.0)
    t2 = vertex_at(g, (5, 5, 5))
    p = g.shortest_path(s, t2)
    assert p["n_edges"] == 3 and p["length_mm"] == pytest.approx(3 * S3)      # pure diagonal moves
    t3 = vertex_at(g, (6, 4, 2))                                                 # 2 diagonal + 2 axial
    assert g.shortest_path(s, t3)["length_mm"] == pytest.approx(2 * S2 + 2)


# 2 ------------------------------------------------------------------ two routes, known minimum
def test_02_two_routes_minimum_cost_known():
    seg, brain = box((20, 9, 3))
    brain[:, :, 1] = True
    brain[3:17, 4, 1] = False                    # wall in the middle row, open at both ends
    # tumour corridor along the top row (y = 7..8), plain tissue along the bottom (y = 0..1)
    seg[:, 7:9, 1] = 2
    g = SpatialGraph(seg, brain, np.eye(4), (1, 1, 1), target_mm=1)
    s, t = vertex_at(g, (1, 4, 1)), vertex_at(g, (18, 4, 1))
    # mode A: a straight route along y=4 is blocked; the shortest goes around a wall end via row 3 or 5
    pa = g.shortest_path(s, t, "A")
    ys = np.array(pa["points_vox"])[:, 1]
    # analytic: (1,4)->(2,4) 1, diagonal to (3,3) sqrt2, 13 straight steps to (16,3), diagonal to (17,4) sqrt2, 1 to (18,4)
    assert pa["length_mm"] == pytest.approx(15 + 2 * S2, abs=1e-9)
    # mode B with a strong non-tumour penalty prefers the tumour corridor (y >= 7)
    pb = g.shortest_path(s, t, "B", alpha=50)
    assert max(np.array(pb["points_vox"])[:, 1]) >= 7 and pb["length_mm"] > pa["length_mm"]
    assert pb["length_by_class_mm"]["edema"] > pa["length_by_class_mm"]["edema"]
    # cross-check both costs with networkx
    for mode, alpha, p in (("A", 1, pa), ("B", 50, pb)):
        G = nx.Graph()
        for u, v, c in zip(g.src, g.dst, g.edge_cost(mode, alpha)):
            G.add_edge(int(u), int(v), weight=float(c))
        assert p["total_cost"] == pytest.approx(nx.dijkstra_path_length(G, s, t), abs=1e-9)
    assert set(ys.tolist()) != {4.0}


# 3 + 4 -------------------------------------------------------------- disconnected graph, isolated vertex
def test_03_04_disconnected_and_isolated():
    seg, brain = box((20, 6, 6))
    brain[0:5, 0:5, 0:5] = True
    brain[8:13, 0:5, 0:5] = True                 # gap of 3 voxels -> no adjacency
    brain[18, 2, 2] = True                       # single isolated voxel
    g = SpatialGraph(seg, brain, np.eye(4), (1, 1, 1), target_mm=1)
    st = g.stats()
    assert st["connected_components"] == 3 and st["isolated_vertices"] == 1 and st["degree"]["min"] == 0
    p = g.shortest_path(vertex_at(g, (1, 1, 1)), vertex_at(g, (10, 1, 1)))
    assert p["reachable"] is False and "different connected components" in p["reason"]
    assert g.shortest_path(vertex_at(g, (18, 2, 2)), vertex_at(g, (1, 1, 1)))["reachable"] is False


# 5 ------------------------------------------------------------------ anisotropic spacing
def test_05_anisotropic_edge_lengths():
    seg, brain = box((6, 6, 6))
    brain[:] = True
    g = SpatialGraph(seg, brain, np.diag([1, 1, 2.5, 1]), (1, 1, 2.5), target_mm=1)
    assert g.step.tolist() == [1, 1, 1]
    expect = sorted({1.0, S2, 2.5, np.sqrt(1 + 6.25), np.sqrt(2 + 6.25)})
    assert np.allclose(sorted(np.unique(g.length.round(9))), expect)
    g5 = SpatialGraph(np.zeros((20, 20, 8), np.int16), np.ones((20, 20, 8), bool), np.diag([1, 1, 2.5, 1]), (1, 1, 2.5), 5)
    assert g5.step.tolist() == [5, 5, 2] and np.allclose(g5.stats()["lattice_spacing_mm"], [5, 5, 5])
    p = g5.shortest_path(vertex_at(g5, (2, 2, 0.5)), vertex_at(g5, (2, 2, 4.5)))
    assert p["length_mm"] == pytest.approx(10.0)  # two z-steps of 2 voxels x 2.5 mm


# 6 + 7 -------------------------------------------------------------- voxel <-> world, alignment with brain surface
def test_06_07_world_coordinates_and_alignment():
    from ml.meshes import mask_to_gifti
    seg, brain = box((24, 20, 16))
    brain[2:22, 2:18, 2:14] = True
    seg[4:8, 5:9, 5:9] = 2                        # tumour at low i
    A = np.array([[-1.0, 0, 0, 30], [0, -1.2, 0, 40], [0, 0, 2.0, -10], [0, 0, 0, 1]])  # LPS-like, anisotropic, offset
    g = SpatialGraph(seg, brain, A, (1.0, 1.2, 2.0), target_mm=2)
    assert np.allclose(g.mm, g.vox @ A[:3, :3].T + A[:3, 3])     # affine applied exactly once
    inv = np.linalg.inv(A)
    back = (np.c_[g.mm, np.ones(g.n)] @ inv.T)[:, :3]
    assert np.allclose(back, g.vox)
    # tumour at low i maps to the patient's right in RAS+ here? A[0,0] = -1 -> world x = 30 - i: low i -> large +x = RIGHT
    comp = g.components[0]
    assert comp["centroid_mm"][0] > 20                           # x = 30 - 5.5 = 24.5
    # every vertex lies inside the brain surface's bounding box built with the same affine
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        mask_to_gifti(brain, A, Path(td) / "b.gii")
        verts = nib.load(str(Path(td) / "b.gii")).darrays[0].data
    lo, hi = verts.min(0) - 1e-3, verts.max(0) + 1e-3
    assert np.all((g.mm >= lo) & (g.mm <= hi))
    v, d = g.nearest_vertex(g.mm[17] + 0.1)
    assert v == 17 and d < 0.2


# 8 + 9 -------------------------------------------------------------- returned sequence is the drawn path; selection
def test_08_09_path_sequence_and_selection():
    seg, brain = box((30, 12, 12))
    brain[1:29, 1:11, 1:11] = True
    seg[3:7, 4:8, 4:8] = 4
    seg[22:26, 4:8, 4:8] = 1                     # two separated tumour components
    g = SpatialGraph(seg, brain, np.diag([1.0, 1.0, 1.5, 1]), (1, 1, 1.5), target_mm=2)
    assert len(g.components) == 2
    for c in g.components:
        rv = g.resolve(f"c{c['id']}")["vertex"]
        assert g.vertex_component[rv] == c["id"] and g.cls[rv] > 0
    p = g.shortest_path(g.resolve(f"c{g.components[0]['id']}")["vertex"], g.resolve(f"c{g.components[1]['id']}")["vertex"])
    E = edge_set(g)
    seq = p["vertices"]
    assert all(tuple(sorted(e)) in E for e in zip(seq[:-1], seq[1:]))          # only real graph edges
    assert np.allclose(p["points_mm"], g.mm[seq], atol=1e-3)                   # drawn points = vertex coordinates
    assert p["length_mm"] == pytest.approx(np.linalg.norm(np.diff(g.mm[seq], axis=0), axis=1).sum())
    assert p["total_cost"] == pytest.approx(p["cost_from_steps"])
    assert p["length_by_class_mm"]["non_tumour_brain"] > 0                     # crosses tissue between components
    assert sum(p["length_by_class_mm"].values()) == pytest.approx(p["length_mm"])
    assert g.resolve("v5")["vertex"] == 5
    r = g.resolve(f"mm:{g.mm[40][0]},{g.mm[40][1]},{g.mm[40][2]}")
    assert r["vertex"] == 40 and r["snap_mm"] < 1e-6
    for bad in ("v999999", "c99", "mm:1,2", "zz"):
        with pytest.raises(GraphBuildError):
            g.resolve(bad)


# 10 + 11 ------------------------------------------------------------ integrity, costs, degree statistics
def test_10_11_integrity_and_degrees():
    seg, brain = box((7, 7, 7))
    brain[1:6, 1:6, 1:6] = True                   # 5x5x5 block of vertices
    seg[3, 3, 3] = 2
    g = SpatialGraph(seg, brain, np.eye(4), (1, 1, 1), target_mm=1)
    assert g.validate()["all_passed"]
    st = g.stats()
    assert st["vertices"] == 125 and st["degree"]["max"] == 26 and st["degree"]["min"] == 7
    assert st["edges"] == int(g.degree.sum() // 2)
    assert np.all(g.edge_cost("B", 4) >= g.edge_cost("A") - 1e-12) and np.all(g.edge_cost("B", 4) >= 0)
    for bad in (0.5, -1, np.nan, 1000):
        with pytest.raises(GraphBuildError):
            g.edge_cost("B", bad)
    with pytest.raises(GraphBuildError):
        g.edge_cost("C")


# 13 ----------------------------------------------------------------- invalid input
@pytest.mark.parametrize("case", ["shape", "labels", "empty", "spacing", "affine"])
def test_13_invalid_input(case):
    seg, brain = box()
    brain[2:8, 2:8, 2:8] = True
    A, t = np.eye(4), 2.0
    if case == "shape":
        brain = brain[:, :, :5]
    elif case == "labels":
        seg[3, 3, 3] = 3
    elif case == "empty":
        brain[:] = False
    elif case == "spacing":
        t = 0
    elif case == "affine":
        A = np.zeros((4, 4))
    with pytest.raises(GraphBuildError):
        SpatialGraph(seg, brain, A, (1, 1, 1), target_mm=t)


# 12 + 16 + expert isolation via the API ---------------------------------
@pytest.fixture()
def client(tmp_path, monkeypatch):
    import importlib
    import backend.main as bm
    monkeypatch.setenv("NEUROSCOPE_LAZY_MODEL", "1")
    importlib.reload(bm)
    monkeypatch.setattr(bm, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(bm, "LEGACY_TEMP", tmp_path / "x1")
    monkeypatch.setattr(bm, "LEGACY_RESULTS", tmp_path / "x2")
    (tmp_path / "runs").mkdir()
    from fastapi.testclient import TestClient
    with TestClient(bm.app) as c:
        yield c, tmp_path / "runs"


def _make_run(runs, seg, t1c, expert=None):
    d = runs / ("e" * 32)
    d.mkdir(exist_ok=True)
    A = np.diag([1.0, 1.0, 1.0, 1.0])
    nib.save(nib.Nifti1Image(seg.astype(np.uint8), A), str(d / "seg.nii.gz"))
    nib.save(nib.Nifti1Image(t1c.astype(np.float32), A), str(d / "t1c.nii.gz"))
    if expert is not None:
        nib.save(nib.Nifti1Image(expert.astype(np.uint8), A), str(d / "expert.nii.gz"))
    (d / "result.json").write_text(json.dumps({"timestamp_utc": "test"}))
    return d


def test_12_16_regeneration_no_mutation_and_no_expert(client):
    c, runs = client
    seg = np.zeros((30, 16, 16), np.int16)
    seg[4:9, 5:10, 5:10] = 2
    seg[20:25, 5:10, 5:10] = 4
    t1c = np.zeros(seg.shape); t1c[1:29, 1:15, 1:15] = 100
    expert = np.zeros_like(seg); expert[10:15, 5:10, 5:10] = 1          # deliberately different from the prediction
    d = _make_run(runs, seg, t1c, expert)
    rid = d.name
    before = (d / "seg.nii.gz").read_bytes()
    r1 = c.get(f"/api/runs/{rid}/spatial-graph", params={"target_mm": 2}).json()
    assert r1["checks"]["all_passed"] and len(r1["components"]) == 2
    assert r1["provenance"]["segmentation_array_sha256"] == sha256_array(np.asarray(nib.load(str(d / "seg.nii.gz")).dataobj).astype(np.int16))
    assert "expert.nii.gz" not in r1["provenance"]["source_files_sha256"]
    tumour_vertices = [v for v in r1["render"]["vertices"] if v[4] > 0]
    assert all(v[1] < 10 or v[1] > 19 for v in tumour_vertices)        # expert-only region (i 10..14) is not tumour
    p = c.get(f"/api/runs/{rid}/spatial-graph/path", params={"src": "c1", "dst": "c2", "target_mm": 2}).json()
    assert p["reachable"] and p["length_by_class_mm"]["non_tumour_brain"] > 0
    assert (d / "seg.nii.gz").read_bytes() == before                    # path analysis never modifies the prediction
    assert c.get(f"/api/runs/{rid}/spatial-graph", params={"target_mm": 2}).json()["provenance"]["cached"] is True
    seg2 = seg.copy(); seg2[20:25, 5:10, 5:10] = 0                       # prediction changes -> graph must be rebuilt
    nib.save(nib.Nifti1Image(seg2.astype(np.uint8), np.eye(4)), str(d / "seg.nii.gz"))
    r2 = c.get(f"/api/runs/{rid}/spatial-graph", params={"target_mm": 2}).json()
    assert r2["provenance"]["cached"] is False and len(r2["components"]) == 1
    assert r2["provenance"]["segmentation_array_sha256"] != r1["provenance"]["segmentation_array_sha256"]
    bad = c.get(f"/api/runs/{rid}/spatial-graph/path", params={"src": "c1", "dst": "nope"})
    assert bad.status_code == 422 and bad.json()["code"] == "graph_error"
    assert c.get(f"/api/runs/{rid}/spatial-graph", params={"target_mm": 0.1}).status_code == 422


def test_class_names_cover_labels():
    assert set(CLASS_NAMES) == {0, 1, 2, 4}


def test_path_to_itself_is_zero_length():
    seg, brain = box()
    brain[2:10, 2:10, 2:10] = True
    seg[4:7, 4:7, 4:7] = 2
    g = SpatialGraph(seg, brain, np.eye(4), (1, 1, 1), target_mm=2)
    v = g.resolve("c1")["vertex"]
    p = g.shortest_path(v, v)
    assert p["reachable"] and p["n_vertices"] == 1 and p["n_edges"] == 0 and p["length_mm"] == 0.0
