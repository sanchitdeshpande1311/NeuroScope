"""
Automated versions of the organiser judging challenges (Tests 2-5, 7-10).
Test 1 (held-out accuracy) is execution/evaluate_heldout.py; Test 6 (linked views) is a
browser test documented in docs/TEST_RESULTS.md.

Real-MRI tests use patient-disjoint held-out BraTS 2023 GLI cases (skipped if data absent).
"""
import json
import time
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

from conftest import BLIND_CASE_INDEX, case_paths, load_case_arrays, synthetic_case, write_case
from ml.inference import (MODALITIES, InputValidationError, compare_to_reference, dice, input_sanity,
                          labels_to_regions, validate_case, volumes_ml)

RESULTS = {}


def record(name, **kw):
    RESULTS[name] = kw
    out = Path(__file__).resolve().parent.parent / "results" / "judging_tests.json"
    prev = json.loads(out.read_text()) if out.exists() else {}
    prev[name] = kw
    out.write_text(json.dumps(prev, indent=2, default=float))


def axis_for_world(affine, world_axis):
    """Voxel axis most aligned with world axis (0=x L-R, 1=y P-A, 2=z I-S). Uses the affine, not array order."""
    return int(np.argmax(np.abs(affine[world_axis, :3])))


def flip_voxels(arrays, affine, axis, update_affine):
    n = next(iter(arrays.values())).shape[axis]
    flipped = {m: np.flip(a, axis=axis).copy() for m, a in arrays.items()}
    new = affine.copy()
    if update_affine:  # same physical anatomy: i' = n-1-i
        new[:3, 3] = affine[:3, 3] + affine[:3, axis] * (n - 1)
        new[:3, axis] = -affine[:3, axis]
    return flipped, new


def world_centroid(mask, affine):
    c = np.argwhere(mask).mean(0)
    return (affine @ np.append(c, 1.0))[:3]


def tumour_side(seg, brain, affine):
    """'R' or 'L' from NIfTI RAS+ world x of the WT centroid relative to the brain centroid."""
    dx = world_centroid(seg > 0, affine)[0] - world_centroid(brain, affine)[0]
    return ("R" if dx > 0 else "L"), float(dx)


# --------------------------------------------------------------------------- Test 2
def test_02_volume_cube(tmp_path):
    shape = (64, 64, 40)
    seg = np.zeros(shape, np.uint8)
    seg[10:30, 20:40, 5:25] = 2
    aff = np.diag([1.0, 1.0, 2.0, 1.0])
    p = tmp_path / "cube.nii.gz"
    nib.save(nib.Nifti1Image(seg, aff), str(p))
    img = nib.load(str(p))  # spacing must come from the header
    v = volumes_ml(np.asarray(img.dataobj), img.header.get_zooms())
    record("test_02_volume_cube", WT_ml=v["WT"], TC_ml=v["TC"], ET_ml=v["ET"], expected="WT 16.0 +/-1%, TC 0, ET 0")
    assert abs(v["WT"] - 16.0) <= 0.16
    assert v["TC"] == 0 and v["ET"] == 0


def test_02b_volume_cube_via_expert_loader(tmp_path):
    """Same cube through the expert-mask path used by the app."""
    from ml.pipeline import load_expert
    arrays, aff = synthetic_case(shape=(64, 64, 40), spacing=(1, 1, 2))
    paths = write_case(tmp_path, arrays, aff)
    case = validate_case(paths)
    seg = np.zeros(case.shape, np.uint8)
    seg[10:30, 20:40, 5:25] = 2
    p = tmp_path / "expert.nii.gz"
    nib.save(nib.Nifti1Image(seg, aff), str(p))
    ref, et_label = load_expert(p, case)
    cmp = compare_to_reference(np.zeros_like(seg), ref, case.zooms, et_label)
    assert abs(cmp["WT"]["ref_ml"] - 16.0) <= 0.16 and cmp["TC"]["ref_ml"] == 0 and cmp["ET"]["ref_ml"] == 0


# --------------------------------------------------------------------------- Test 3
def test_03_anisotropic(segmenter, geometry_case, tmp_path):
    sid, paths, _ = geometry_case
    arrays, aff = load_case_arrays(paths)
    ax = axis_for_world(aff, 2)  # axial slices are perpendicular to world z
    sl = [slice(None)] * 3
    sl[ax] = slice(0, None, 2)
    thin = {m: a[tuple(sl)] for m, a in arrays.items()}
    aff2 = aff.copy()
    aff2[:3, ax] = aff[:3, ax] * 2  # slice 0 kept, so origin unchanged; spacing doubled
    p2 = write_case(tmp_path, thin, aff2, "aniso")
    c1, c2 = validate_case(paths), validate_case(p2)
    assert c2.zooms[ax] == pytest.approx(2 * c1.zooms[ax])
    v1 = volumes_ml(segmenter.predict(c1)["seg"], c1.zooms)["WT"]
    v2 = volumes_ml(segmenter.predict(c2)["seg"], c2.zooms)["WT"]
    rel = abs(v2 - v1) / v1
    record("test_03_anisotropic", case=sid, axial_axis=ax, wt_original_ml=v1, wt_every_second_slice_ml=v2, rel_diff=rel, target="<0.10")
    assert v1 > 1.0
    assert rel < 0.10


# --------------------------------------------------------------------------- Tests 4 & 5
def _brain(arrays):
    return np.any(np.stack(list(arrays.values())) != 0, 0)


def test_04_orientation_same_anatomy(segmenter, geometry_case, tmp_path):
    sid, paths, _ = geometry_case
    arrays, aff = load_case_arrays(paths)
    ax = axis_for_world(aff, 0)
    f_arrays, f_aff = flip_voxels(arrays, aff, ax, update_affine=True)
    pf = write_case(tmp_path, f_arrays, f_aff, "flipaff")
    c0, c1 = validate_case(paths), validate_case(pf)
    s0, s1 = segmenter.predict(c0)["seg"], segmenter.predict(c1)["seg"]
    v0, v1 = volumes_ml(s0, c0.zooms)["WT"], volumes_ml(s1, c1.zooms)["WT"]
    side0, dx0 = tumour_side(s0, _brain(arrays), aff)
    side1, dx1 = tumour_side(s1, _brain(f_arrays), f_aff)
    # same anatomy => flipping the voxels back must give the same mask
    d_back = dice(np.flip(s1, axis=ax) > 0, s0 > 0)
    axc0, axc1 = "".join(nib.aff2axcodes(aff)), "".join(nib.aff2axcodes(f_aff))
    rel = abs(v1 - v0) / v0
    record("test_04_orientation_same_anatomy", case=sid, lr_axis=ax, axcodes_original=axc0, axcodes_flipped=axc1,
           side_original=side0, side_flipped=side1, dx_mm=[dx0, dx1], wt_ml=[v0, v1], rel_diff=rel,
           dice_after_unflip=d_back, target="same side, |dV| <= 2%")
    assert axc0 != axc1  # the voxel axis direction really changed
    assert side0 == side1
    assert abs(dx0 - dx1) < 2.0
    assert rel <= 0.02


def test_05_orientation_mirrored_anatomy(segmenter, geometry_case, tmp_path):
    sid, paths, _ = geometry_case
    arrays, aff = load_case_arrays(paths)
    ax = axis_for_world(aff, 0)
    f_arrays, f_aff = flip_voxels(arrays, aff, ax, update_affine=False)
    pf = write_case(tmp_path, f_arrays, f_aff, "mirror")
    c0, c1 = validate_case(paths), validate_case(pf)
    s0, s1 = segmenter.predict(c0)["seg"], segmenter.predict(c1)["seg"]
    side0, dx0 = tumour_side(s0, _brain(arrays), aff)
    side1, dx1 = tumour_side(s1, _brain(f_arrays), f_aff)
    record("test_05_orientation_mirrored_anatomy", case=sid, side_original=side0, side_mirrored=side1, dx_mm=[dx0, dx1],
           wt_ml=[volumes_ml(s0, c0.zooms)["WT"], volumes_ml(s1, c1.zooms)["WT"]], target="tumour moves to opposite side")
    assert abs(dx0) > 5.0, "tumour too close to midline for a meaningful side test"
    assert side0 != side1


# --------------------------------------------------------------------------- Test 7 (API)
@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEUROSCOPE_LAZY_MODEL", "1")
    import importlib
    import backend.main as bm
    importlib.reload(bm)
    monkeypatch.setattr(bm, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(bm, "LEGACY_TEMP", tmp_path / "no_legacy_temp")  # never touch the real project folders
    monkeypatch.setattr(bm, "LEGACY_RESULTS", tmp_path / "no_legacy_results")
    (tmp_path / "runs").mkdir()
    from fastapi.testclient import TestClient
    with TestClient(bm.app) as c:
        yield c, bm, tmp_path / "runs"


def _post(c, files):
    return c.post("/api/predict", files={k: (Path(p).name, open(p, "rb"), "application/octet-stream") for k, p in files.items()})


def _good_synth(tmp_path):
    arrays, aff = synthetic_case()
    return write_case(tmp_path / "good", arrays, aff), arrays, aff


INVALID = ["non_nifti", "corrupt_gzip", "three_sequences", "mismatched_shapes", "image_2d", "all_zero", "nan", "over_1gb"]


@pytest.mark.parametrize("kind", INVALID)
def test_07_invalid_inputs(kind, client, tmp_path, monkeypatch):
    c, bm, runs = client
    files, arrays, aff = _good_synth(tmp_path)
    bad = tmp_path / "bad"
    bad.mkdir()
    expected = {"non_nifti": "not_gzip", "corrupt_gzip": "corrupt_gzip", "three_sequences": "missing_modality",
                "mismatched_shapes": "shape_mismatch", "image_2d": "not_3d", "all_zero": "all_zero",
                "nan": "non_finite", "over_1gb": "file_too_large"}[kind]
    if kind == "non_nifti":
        p = bad / "t2f.nii.gz"; p.write_text("this is a text file, not a NIfTI image\n" * 20); files["t2f"] = p
    elif kind == "corrupt_gzip":
        raw = Path(files["t2f"]).read_bytes()
        p = bad / "t2f.nii.gz"; p.write_bytes(raw[: len(raw) // 3]); files["t2f"] = p
    elif kind == "three_sequences":
        files.pop("t2f")
    elif kind == "mismatched_shapes":
        files["t2f"] = write_case(bad, {"t2f": arrays["t2f"][:, :, :40]}, aff)["t2f"]
    elif kind == "image_2d":
        files["t2f"] = write_case(bad, {"t2f": arrays["t2f"][:, :, 24:25]}, aff)["t2f"]
    elif kind == "all_zero":
        files["t2f"] = write_case(bad, {"t2f": np.zeros_like(arrays["t2f"])}, aff)["t2f"]
    elif kind == "nan":
        a = arrays["t2f"].copy(); a[30, 30, 20] = np.nan
        files["t2f"] = write_case(bad, {"t2f": a}, aff)["t2f"]
    elif kind == "over_1gb":
        # Logic test: the limit is lowered so a small file exceeds it. A real >1 GB upload is not performed.
        monkeypatch.setattr(bm, "MAX_FILE_BYTES", 50_000)
    r = _post(c, files)
    body = r.json()
    ok = (r.status_code in (413, 422) and body.get("status") == "error" and body.get("code") == expected
          and "files" not in body and "volumes_ml" not in body and list(runs.iterdir()) == []
          and "\\" not in body["message"] and "/Users" not in body["message"])
    record(f"test_07_invalid_{kind}", http_status=r.status_code, code=body.get("code"), message=body.get("message"),
           run_dirs_left=len(list(runs.iterdir())), passed=ok,
           note="limit lowered to 50 kB to exercise the 1 GB code path" if kind == "over_1gb" else "")
    assert ok, body
    assert c.get("/api/health").json()["status"] == "ok"  # backend still alive


def test_07_size_check_unit(tmp_path, monkeypatch):
    import ml.inference as inf
    p = tmp_path / "x.nii"
    p.write_bytes(b"\0" * 2000)
    monkeypatch.setattr(inf, "MAX_FILE_BYTES", 1000)
    with pytest.raises(InputValidationError) as e:
        inf.check_file_bytes(p, "t1n")
    assert e.value.code == "file_too_large"


# --------------------------------------------------------------------------- Test 8
def test_08_reproducibility(segmenter, geometry_case):
    sid, paths, _ = geometry_case
    c = validate_case(paths)
    a, b = segmenter.predict(c)["seg"], segmenter.predict(c)["seg"]
    ds = {k: dice(x, y) for k, x, y in zip(("WT", "TC", "ET"), labels_to_regions(a), labels_to_regions(b))}
    record("test_08_reproducibility", case=sid, dice=ds, identical=bool(np.array_equal(a, b)), target=">=0.99")
    assert min(ds.values()) >= 0.99


# --------------------------------------------------------------------------- Test 9
def test_09_blind_case(segmenter, tmp_path):
    from ml.pipeline import run_case
    sid, paths, label = case_paths(BLIND_CASE_INDEX)
    t0 = time.perf_counter()
    meta = run_case(paths, tmp_path, segmenter, run_id="blindtest")
    elapsed = time.perf_counter() - t0
    out = nib.load(str(tmp_path / "seg.nii.gz"))
    ref_img = nib.load(str(paths["t1c"]))
    seg = np.asarray(out.dataobj)
    wt, tc, et = labels_to_regions(seg)
    gt = np.asarray(nib.load(str(label)).dataobj)
    cmp = compare_to_reference(seg, gt, out.header.get_zooms(), ref_et_label=3)
    record("test_09_blind_case", case=sid, seconds=elapsed, shape_ok=out.shape == ref_img.shape,
           affine_ok=bool(np.allclose(out.affine, ref_img.affine)), labels=sorted(np.unique(seg).tolist()),
           dtype=str(out.get_data_dtype()), volumes_ml={k: meta["volumes_ml"]["baseline"][k] for k in ("WT", "TC", "ET")},
           dice_vs_expert={k: cmp[k]["dice"] for k in cmp}, sensitivity_vs_expert={k: cmp[k]["sensitivity"] for k in cmp},
           note="Blind w.r.t. development: not in train/val, not in the 30 evaluation cases or other tests. Expert mask read only after prediction.")
    assert out.shape == ref_img.shape and np.allclose(out.affine, ref_img.affine)
    assert set(np.unique(seg).tolist()) <= {0, 1, 2, 4}
    assert np.all(et <= tc) and np.all(tc <= wt)
    assert wt.sum() > 0
    assert (tmp_path / "report.pdf").stat().st_size > 10_000
    assert elapsed < 120


# --------------------------------------------------------------------------- Test 10
def test_10a_not_skull_stripped(geometry_case, tmp_path):
    """Synthetic 'head': fills the zero background with scalp/skull-like signal and noise."""
    from scipy import ndimage
    sid, paths, _ = geometry_case
    arrays, aff = load_case_arrays(paths)
    brain = _brain(arrays)
    head = ndimage.binary_dilation(brain, iterations=12)
    rng = np.random.default_rng(1)
    out = {}
    for m, a in arrays.items():
        b = a.copy()
        scalp = head & ~brain
        b[scalp] = np.percentile(a[brain], 90) + 20 * rng.standard_normal(scalp.sum())
        bg = ~head
        b[bg] = np.abs(5 * rng.standard_normal(bg.sum()))  # Rician-like air noise, never exactly 0
        out[m] = b
    res = input_sanity(validate_case(write_case(tmp_path, out, aff, "head")))
    record("test_10a_not_skull_stripped", case=sid, status=res["status"], issues=res["issues"],
           note="Synthetic non-skull-stripped volume derived from a real case.")
    assert res["status"] == "refuse"


@pytest.mark.parametrize("kind", ["box_phantom", "small_sphere", "random_noise_block"])
def test_10b_not_a_brain(kind, tmp_path):
    rng = np.random.default_rng(2)
    shape = (240, 240, 155)
    vol = np.zeros(shape, np.float32)
    if kind == "box_phantom":
        vol[20:220, 20:220, 40:100] = 100 + 5 * rng.standard_normal((200, 200, 60))
    elif kind == "small_sphere":
        g = np.indices(shape).astype(np.float32)
        vol[((g[0] - 120) ** 2 + (g[1] - 120) ** 2 + (g[2] - 77) ** 2) < 25 ** 2] = 300
    else:
        vol[60:180, 30:210, 20:140] = rng.gamma(2.0, 50.0, (120, 180, 120))
    arrays = {m: vol * (1 + 0.2 * i) + (i * (vol > 0)) for i, m in enumerate(MODALITIES)}
    res = input_sanity(validate_case(write_case(tmp_path, arrays, np.eye(4), kind)))
    record(f"test_10b_not_brain_{kind}", status=res["status"], issues=res["issues"], features=res["features"],
           note="Synthetic non-brain input.")
    assert res["status"] == "refuse"


def test_10c_real_brain_accepted(geometry_case):
    sid, paths, _ = geometry_case
    res = input_sanity(validate_case(paths))
    record("test_10c_real_brain_accepted", case=sid, status=res["status"], issues=res["issues"])
    assert res["status"] in ("ok", "warn")
