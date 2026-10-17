"""
Held-out evaluation: Dice and sensitivity for WT/TC/ET on patient-disjoint cases.

Usage:
    python execution/evaluate_heldout.py --n 30 [--out results/heldout_eval.json]

Cases: first N (sorted by subject id) of configs/heldout_cases.json (patients not in
train/val). Runs the exact production pipeline (ml.inference) and compares with the
expert mask (BraTS 2023 GLI labels: ET=3). Also evaluates the optional refinement
(small WT component removal, 10 mm^3) on the same cases. No thresholds are tuned here.
"""
import argparse
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np
import nibabel as nib
import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ml.inference import (MODALITIES, Segmenter, compare_to_reference, remove_small_components,  # noqa: E402
                          validate_case, volumes_ml)
from scipy import ndimage  # noqa: E402


def n_components(seg):
    return int(ndimage.label(seg > 0, structure=np.ones((3, 3, 3)))[1])


def summarize(rows, key):
    out = {}
    for r in ("WT", "TC", "ET"):
        d = [x[key][r]["dice"] for x in rows]
        s = [x[key][r]["sensitivity"] for x in rows if not np.isnan(x[key][r]["sensitivity"])]
        out[r] = {"dice_mean": float(np.mean(d)), "dice_median": float(np.median(d)), "dice_std": float(np.std(d)),
                  "sensitivity_mean": float(np.mean(s)) if s else None, "n_sens": len(s)}
    out["mean_dice"] = float(np.mean([out[r]["dice_mean"] for r in ("WT", "TC", "ET")]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--out", default=str(ROOT / "results" / "heldout_eval.json"))
    a = ap.parse_args()
    cases = json.loads((ROOT / "configs" / "heldout_cases.json").read_text())["cases"][: a.n]
    seg_model = Segmenter()
    rows = []
    for i, c in enumerate(cases):
        t0 = time.perf_counter()
        case = validate_case(dict(zip(MODALITIES, [ROOT / Path(p) for p in c["image"]])))
        r = seg_model.predict(case)
        total = time.perf_counter() - t0
        ref = np.asarray(nib.load(str(ROOT / Path(c["label"]))).dataobj)
        t1 = time.perf_counter()
        refined = remove_small_components(r["seg"], case.zooms, 10.0)
        t_ref = time.perf_counter() - t1
        row = {
            "subject_id": c["subject_id"],
            "baseline": compare_to_reference(r["seg"], ref, case.zooms, ref_et_label=3),
            "refined": compare_to_reference(refined, ref, case.zooms, ref_et_label=3),
            "components": {"baseline": n_components(r["seg"]), "refined": n_components(refined)},
            "volumes_ml": {"baseline": {k: v for k, v in volumes_ml(r["seg"], case.zooms).items() if k in ("WT", "TC", "ET")},
                           "refined": {k: v for k, v in volumes_ml(refined, case.zooms).items() if k in ("WT", "TC", "ET")}},
            "timings_s": {**r["timings"], "refine_s": t_ref, "validate_plus_predict_s": total},
        }
        rows.append(row)
        b = row["baseline"]
        print(f"[{i+1}/{len(cases)}] {c['subject_id']} WT {b['WT']['dice']:.3f} TC {b['TC']['dice']:.3f} ET {b['ET']['dice']:.3f} ({total:.1f}s)", flush=True)
    res = {
        "protocol": "Patient-disjoint held-out cases from data/splits/test.json (configs/heldout_cases.json), first N sorted by id. "
                    "Ground truth: BraTS 2023 GLI expert labels (ET=3). Same pipeline as the API. Threshold 0.5, not tuned.",
        "caveat": "Development-set results on BraTS 2023 GLI data. NOT hidden-case performance. The organiser baseline is not "
                  "available locally, so no baseline comparison is made.",
        "n_cases": len(rows), "case_ids": [r["subject_id"] for r in rows],
        "hardware": {"device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else platform.processor(),
                     "torch": torch.__version__},
        "checkpoint_sha256": seg_model.checkpoint_sha256,
        "summary": {"baseline": summarize(rows, "baseline"), "refined": summarize(rows, "refined")},
        "mean_runtime_s": float(np.mean([r["timings_s"]["validate_plus_predict_s"] for r in rows])),
        "cases": rows,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(res, indent=2))
    print(json.dumps(res["summary"], indent=2))


if __name__ == "__main__":
    main()
