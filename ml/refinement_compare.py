"""
Numerical before/after comparison of the baseline model prediction and the refined prediction.

Without an expert mask only quantities computable from the two predictions are produced
(voxels removed/added, volumes, connected components). Removed voxels are NOT called false positives.

With a validated expert mask, per region (WT, TC, ET) and per mask (baseline, refined):
    TP = pred AND ref, FP = pred AND NOT ref, FN = NOT pred AND ref
    Dice = 2TP / (2TP + FP + FN); both empty -> 1.0 (documented convention)
    Sensitivity = TP / (TP + FN); no expert-positive voxels -> None (undefined)
    FN rate (miss rate) = FN / (TP + FN) = 1 - sensitivity; None when no expert positives
    FP fraction of prediction (false discovery rate) = FP / (TP + FP); None when prediction empty
      (a background-denominator FP rate would be dominated by millions of background voxels)
    % change of an error count uses the BASELINE count as denominator; None when baseline count is 0.
Outcome per region from the Dice change: > +0.001 improved, < -0.001 worse, otherwise no meaningful
change (fixed rule, not tuned). Overall: all no-change -> "No meaningful change"; some improved and
none worse -> "Improved agreement"; some worse and none improved -> "Worse agreement"; both -> "Mixed result".
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .inference import labels_to_regions

REGIONS = ("WT", "TC", "ET")
DICE_EPS = 0.001
_S26 = np.ones((3, 3, 3))


def _ncomp(mask):
    return int(ndimage.label(mask, structure=_S26)[1])


def _pct(new, old):
    return None if old == 0 else 100.0 * (new - old) / old


def prediction_change(base: np.ndarray, refined: np.ndarray, affine: np.ndarray, zooms) -> dict:
    vox_ml = float(np.prod(zooms)) / 1000.0
    b = dict(zip(REGIONS, labels_to_regions(base)))
    r = dict(zip(REGIONS, labels_to_regions(refined)))
    out = {}
    for k in REGIONS:
        nb, nr = int(b[k].sum()), int(r[k].sum())
        removed = int(np.logical_and(b[k], ~r[k]).sum())
        added = int(np.logical_and(~b[k], r[k]).sum())
        out[k] = {"baseline_voxels": nb, "refined_voxels": nr, "baseline_ml": nb * vox_ml, "refined_ml": nr * vox_ml,
                  "abs_change_ml": (nr - nb) * vox_ml, "pct_change": _pct(nr, nb),
                  "removed_voxels": removed, "added_voxels": added,
                  "removed_pct_of_baseline": 100.0 * removed / nb if nb else None,
                  "components_baseline": _ncomp(b[k]), "components_refined": _ncomp(r[k])}
    # removed WT components (what the rule actually deleted)
    lab, n = ndimage.label(b["WT"], structure=_S26)
    removed_comps = []
    if n:
        idx = np.arange(1, n + 1)
        sizes = ndimage.sum_labels(b["WT"], lab, idx)
        kept = ndimage.sum_labels(r["WT"], lab, idx)
        cents = ndimage.center_of_mass(b["WT"], lab, idx)
        for i, s, kp, c in zip(idx, sizes, kept, cents):
            if s > 0 and kp == 0:
                removed_comps.append({"component": int(i), "voxels": int(s), "volume_mm3": float(s * vox_ml * 1000),
                                      "centroid_mm": [round(float(v), 2) for v in (affine @ np.array([*c, 1.0]))[:3]]})
    return {"regions": out, "removed_components": removed_comps}


def _metrics(pred, ref):
    tp = int(np.logical_and(pred, ref).sum())
    fp = int(np.logical_and(pred, ~ref).sum())
    fn = int(np.logical_and(~pred, ref).sum())
    denom = 2 * tp + fp + fn
    return {"tp": tp, "fp": fp, "fn": fn,
            "dice": 1.0 if denom == 0 else 2 * tp / denom,
            "sensitivity": None if tp + fn == 0 else tp / (tp + fn),
            "fn_rate": None if tp + fn == 0 else fn / (tp + fn),
            "fp_fraction_of_prediction": None if tp + fp == 0 else fp / (tp + fp)}


def expert_change(base, refined, expert, expert_et_label, zooms) -> dict:
    vox_ml = float(np.prod(zooms)) / 1000.0
    b = dict(zip(REGIONS, labels_to_regions(base)))
    r = dict(zip(REGIONS, labels_to_regions(refined)))
    e = dict(zip(REGIONS, labels_to_regions(expert, expert_et_label)))
    regions, verdicts = {}, {}
    for k in REGIONS:
        mb, mr = _metrics(b[k], e[k]), _metrics(r[k], e[k])
        d_dice = mr["dice"] - mb["dice"]
        verdicts[k] = "improved" if d_dice > DICE_EPS else "worse" if d_dice < -DICE_EPS else "no_meaningful_change"
        ref_ml = float(e[k].sum() * vox_ml)
        regions[k] = {
            "baseline": mb, "refined": mr,
            "delta": {"dice": d_dice,
                      "sensitivity": None if mb["sensitivity"] is None else mr["sensitivity"] - mb["sensitivity"],
                      "fp": mr["fp"] - mb["fp"], "fn": mr["fn"] - mb["fn"],
                      "fp_pct_change": _pct(mr["fp"], mb["fp"]), "fn_pct_change": _pct(mr["fn"], mb["fn"])},
            "expert_ml": ref_ml,
            "volume_error_ml": {"baseline": float(b[k].sum() * vox_ml) - ref_ml, "refined": float(r[k].sum() * vox_ml) - ref_ml},
            "verdict": verdicts[k],
        }
    v = set(verdicts.values())
    if v == {"no_meaningful_change"}:
        overall = "No meaningful change"
    elif "improved" in v and "worse" not in v:
        overall = "Improved agreement"
    elif "worse" in v and "improved" not in v:
        overall = "Worse agreement"
    else:
        overall = "Mixed result"
    return {"regions": regions, "overall": overall,
            "rule": f"per-region Dice change > +{DICE_EPS} improved, < -{DICE_EPS} worse, else no meaningful change"}
