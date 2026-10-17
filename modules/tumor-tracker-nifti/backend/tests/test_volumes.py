import pytest
import numpy as np
from backend.app.volumes import compute_study_volumes, compute_volume_differences


def test_volume_calculations():
    # 1. Isotropic spacing: 1.0 x 1.0 x 1.0 mm (voxel volume = 1.0 mm³)
    mask = np.zeros((10, 10, 10), dtype=np.uint8)
    mask[:5, :5, :4] = 1  # 5 * 5 * 4 = 100 voxels

    subregions = {
        "WT": mask,
        "TC": mask[:3, :3, :3],  # 27 voxels
        "ET": np.zeros((10, 10, 10), dtype=np.uint8),  # 0 voxels
    }

    res = compute_study_volumes(subregions, [1.0, 1.0, 1.0])
    assert res["WT"]["voxels"] == 100
    assert res["WT"]["voxelVolumeMm3"] == 1.0
    assert res["WT"]["volumeMl"] == 0.1  # 100 * 1 / 1000 = 0.1 mL

    assert res["TC"]["voxels"] == 27
    assert res["TC"]["volumeMl"] == 0.027

    assert res["ET"]["voxels"] == 0
    assert res["ET"]["volumeMl"] == 0.0

    # 2. Anisotropic spacing: 1.0 x 1.5 x 2.0 mm (voxel volume = 3.0 mm³)
    res_aniso = compute_study_volumes(subregions, [1.0, 1.5, 2.0])
    assert res_aniso["WT"]["voxelVolumeMm3"] == 3.0
    assert res_aniso["WT"]["volumeMl"] == 0.3  # 100 * 3 / 1000 = 0.3 mL


def test_zero_previous_volume_handling():
    # Baseline previous volume is 0.0 mL, current volume is 5.0 mL
    prev_vols = {
        "WT": {"voxels": 0, "voxelVolumeMm3": 1.0, "volumeMl": 0.0},
        "TC": {"voxels": 0, "voxelVolumeMm3": 1.0, "volumeMl": 0.0},
        "ET": {"voxels": 0, "voxelVolumeMm3": 1.0, "volumeMl": 0.0},
    }
    cur_vols = {
        "WT": {"voxels": 5000, "voxelVolumeMm3": 1.0, "volumeMl": 5.0},
        "TC": {"voxels": 2000, "voxelVolumeMm3": 1.0, "volumeMl": 2.0},
        "ET": {"voxels": 1000, "voxelVolumeMm3": 1.0, "volumeMl": 1.0},
    }

    diffs = compute_volume_differences(prev_vols, cur_vols)
    wt_diff = next(d for d in diffs if d["region"] == "WT")

    # Safe percentage check: percent is None, status is "undefined_zero_previous"
    assert wt_diff["status"] == "undefined_zero_previous"
    assert wt_diff["percent"] is None
    assert wt_diff["absoluteMl"] == 5.0
    assert wt_diff["direction"] == "increase"
    assert "undefined" in wt_diff["note"].lower()


def test_volume_increase_and_decrease():
    prev_vols = {
        "WT": {"voxels": 10000, "voxelVolumeMm3": 1.0, "volumeMl": 10.0},
        "TC": {"voxels": 6000, "voxelVolumeMm3": 1.0, "volumeMl": 6.0},
        "ET": {"voxels": 4000, "voxelVolumeMm3": 1.0, "volumeMl": 4.0},
    }
    cur_vols = {
        "WT": {"voxels": 15000, "voxelVolumeMm3": 1.0, "volumeMl": 15.0},  # +50%
        "TC": {"voxels": 3000, "voxelVolumeMm3": 1.0, "volumeMl": 3.0},   # -50%
        "ET": {"voxels": 4000, "voxelVolumeMm3": 1.0, "volumeMl": 4.0},   # 0%
    }

    diffs = compute_volume_differences(prev_vols, cur_vols)
    
    wt = next(d for d in diffs if d["region"] == "WT")
    assert wt["status"] == "ok"
    assert wt["absoluteMl"] == 5.0
    assert wt["percent"] == 50.0
    assert wt["direction"] == "increase"

    tc = next(d for d in diffs if d["region"] == "TC")
    assert tc["status"] == "ok"
    assert tc["absoluteMl"] == -3.0
    assert tc["percent"] == -50.0
    assert tc["direction"] == "decrease"

    et = next(d for d in diffs if d["region"] == "ET")
    assert et["status"] == "ok"
    assert et["absoluteMl"] == 0.0
    assert et["percent"] == 0.0
    assert et["direction"] == "no change"


def test_longitudinal_assessment_betterment_improvement():
    from backend.app.volumes import evaluate_longitudinal_assessment

    # 1. Marked Improvement (Enhancing tumour drops by 60%)
    prev_vols = {
        "WT": {"voxels": 10000, "voxelVolumeMm3": 1.0, "volumeMl": 10.0},
        "TC": {"voxels": 6000, "voxelVolumeMm3": 1.0, "volumeMl": 6.0},
        "ET": {"voxels": 5000, "voxelVolumeMm3": 1.0, "volumeMl": 5.0},
    }
    cur_vols_improvement = {
        "WT": {"voxels": 8000, "voxelVolumeMm3": 1.0, "volumeMl": 8.0},
        "TC": {"voxels": 3000, "voxelVolumeMm3": 1.0, "volumeMl": 3.0},
        "ET": {"voxels": 2000, "voxelVolumeMm3": 1.0, "volumeMl": 2.0},  # -60%
    }
    res_imp = evaluate_longitudinal_assessment(prev_vols, cur_vols_improvement)
    assert res_imp["isImprovement"] is True
    assert res_imp["bettermentStatus"] == "significant_improvement"
    assert res_imp["riskLevel"] == "low"
    assert "Significant Betterment" in res_imp["bettermentHeadline"]

    # 2. Progression / High Risk (Enhancing tumour increases by 40%)
    cur_vols_progression = {
        "WT": {"voxels": 14000, "voxelVolumeMm3": 1.0, "volumeMl": 14.0},
        "TC": {"voxels": 8000, "voxelVolumeMm3": 1.0, "volumeMl": 8.0},
        "ET": {"voxels": 7000, "voxelVolumeMm3": 1.0, "volumeMl": 7.0},  # +40%
    }
    res_prog = evaluate_longitudinal_assessment(prev_vols, cur_vols_progression)
    assert res_prog["isImprovement"] is False
    assert res_prog["bettermentStatus"] == "progression"
    assert res_prog["riskLevel"] == "high"
    assert "Progression" in res_prog["bettermentHeadline"]

    # 3. New Enhancing Lesion (Previous ET = 0, current ET = 1.2 mL)
    prev_vols_zero_et = {
        "WT": {"voxels": 5000, "voxelVolumeMm3": 1.0, "volumeMl": 5.0},
        "TC": {"voxels": 2000, "voxelVolumeMm3": 1.0, "volumeMl": 2.0},
        "ET": {"voxels": 0, "voxelVolumeMm3": 1.0, "volumeMl": 0.0},
    }
    cur_vols_new_lesion = {
        "WT": {"voxels": 6000, "voxelVolumeMm3": 1.0, "volumeMl": 6.0},
        "TC": {"voxels": 3000, "voxelVolumeMm3": 1.0, "volumeMl": 3.0},
        "ET": {"voxels": 1200, "voxelVolumeMm3": 1.0, "volumeMl": 1.2},
    }
    res_new = evaluate_longitudinal_assessment(prev_vols_zero_et, cur_vols_new_lesion)
    assert res_new["isImprovement"] is False
    assert res_new["category"] == "new_lesion"
    assert res_new["riskLevel"] == "high"

    # 4. Stable Disease (Minor variation < 25%)
    cur_vols_stable = {
        "WT": {"voxels": 10200, "voxelVolumeMm3": 1.0, "volumeMl": 10.2},
        "TC": {"voxels": 5900, "voxelVolumeMm3": 1.0, "volumeMl": 5.9},
        "ET": {"voxels": 4900, "voxelVolumeMm3": 1.0, "volumeMl": 4.9},  # -2%
    }
    res_stable = evaluate_longitudinal_assessment(prev_vols, cur_vols_stable)
    assert res_stable["isImprovement"] is False
    assert res_stable["bettermentStatus"] == "stable"
    assert res_stable["riskLevel"] == "moderate"
    assert "Stable" in res_stable["bettermentHeadline"]

