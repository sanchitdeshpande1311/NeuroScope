"""
Calibrate reference ranges for ml.inference.input_sanity from TRAINING cases only.

Usage:
    python execution/calibrate_input_sanity.py --n 40

Computes ml.inference.sanity_features on the first N train.json cases (sorted)
and stores [min - 25% range, max + 25% range] per feature in
configs/input_sanity_reference.json. Held-out and hidden cases are never used.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ml.inference import MODALITIES, sanity_features, validate_case  # noqa: E402

FEATURES = ["foreground_volume_ml", "extent_mm_min", "extent_mm_mid", "extent_mm_max",
            "ellipsoid_fill", "corr_t1_t2", "corr_t2_flair", "corr_t1_t1gd"]
# Shape/size features: a brain cannot fall outside these by much.
HARD = ["foreground_volume_ml", "extent_mm_max", "extent_mm_min", "ellipsoid_fill"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40)
    a = ap.parse_args()
    train = sorted(json.loads((ROOT / "data/splits/train.json").read_text()), key=lambda e: e["subject_id"])[: a.n]
    vals = {k: [] for k in FEATURES}
    for e in train:
        f = sanity_features(validate_case(dict(zip(MODALITIES, [ROOT / Path(p) for p in e["image"]]))))
        for k in FEATURES:
            vals[k].append(f[k])
        print(e["subject_id"], {k: round(f[k], 3) for k in FEATURES}, flush=True)
    ranges = {}
    for k, v in vals.items():
        lo, hi = float(np.min(v)), float(np.max(v))
        pad = 0.25 * (hi - lo)
        ranges[k] = [lo - pad, hi + pad]
    out = {"description": "Reference ranges from training cases (min/max +/- 25% of range). Heuristic, not a validated brain detector.",
           "n_cases": len(train), "case_ids": [e["subject_id"] for e in train],
           "ranges": ranges, "hard_features": HARD,
           "observed": {k: {"min": float(np.min(v)), "max": float(np.max(v)), "mean": float(np.mean(v))} for k, v in vals.items()}}
    (ROOT / "configs" / "input_sanity_reference.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(ranges, indent=1))


if __name__ == "__main__":
    main()
