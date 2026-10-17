"""
Summarise baseline vs refined metrics from results/heldout_eval.json (written by evaluate_heldout.py).

Usage:
    python execution/summarize_refinement_eval.py

Writes results/refinement_eval_summary.json: per-case Dice/sensitivity/TP/FP/FN for both masks, counts of
cases improved / worse / unchanged per region (|dDice| <= 0.001 = unchanged, same rule as the UI), mean deltas
(unweighted mean over cases), volume changes and runtime overhead. Nothing is tuned.
"""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
EPS = 0.001


def main():
    ev = json.loads((ROOT / "results" / "heldout_eval.json").read_text())
    rows, counts, deltas = [], {}, {}
    for r in ("WT", "TC", "ET"):
        counts[r] = {"improved": 0, "worse": 0, "unchanged": 0}
        deltas[r] = []
    for c in ev["cases"]:
        row = {"subject_id": c["subject_id"], "refine_s": c["timings_s"]["refine_s"]}
        for r in ("WT", "TC", "ET"):
            b, f = c["baseline"][r], c["refined"][r]
            d = f["dice"] - b["dice"]
            deltas[r].append(d)
            counts[r]["improved" if d > EPS else "worse" if d < -EPS else "unchanged"] += 1
            row[r] = {"dice": [b["dice"], f["dice"]], "sensitivity": [b["sensitivity"], f["sensitivity"]],
                      "fp": [b["fp_voxels"], f["fp_voxels"]], "fn": [b["fn_voxels"], f["fn_voxels"]],
                      "tp": [b["tp_voxels"], f["tp_voxels"]], "pred_ml": [b["pred_ml"], f["pred_ml"]]}
        rows.append(row)
    fp_b = sum(x["WT"]["fp"][0] for x in rows); fp_r = sum(x["WT"]["fp"][1] for x in rows)
    fn_b = sum(x["WT"]["fn"][0] for x in rows); fn_r = sum(x["WT"]["fn"][1] for x in rows)
    md = {r: float(np.mean(deltas[r])) for r in deltas}
    meaningful = any(abs(v) > EPS for v in md.values())
    out = {
        "source": "results/heldout_eval.json", "n_cases": len(rows), "case_ids": [x["subject_id"] for x in rows],
        "rule": "remove WT connected components (26-conn) < 10 mm^3 (not tuned)",
        "averaging": "unweighted mean over cases of (refined - baseline) per-case Dice",
        "mean_delta_dice": md,
        "counts": counts,
        "wt_total_fp_voxels": [fp_b, fp_r], "wt_total_fn_voxels": [fn_b, fn_r],
        "wt_fp_pct_change": None if fp_b == 0 else 100.0 * (fp_r - fp_b) / fp_b,
        "wt_fn_pct_change": None if fn_b == 0 else 100.0 * (fn_r - fn_b) / fn_b,
        "mean_refine_s": float(np.mean([x["refine_s"] for x in rows])),
        "conclusion": ("Refinement produced a meaningful mean Dice change." if meaningful else
                       "No meaningful change: mean Dice differences are within +/-0.001 for WT, TC and ET. "
                       "The unrefined model prediction remains the primary output; refinement is a research comparison only."),
        "cases": rows,
    }
    (ROOT / "results" / "refinement_eval_summary.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({k: v for k, v in out.items() if k != "cases"}, indent=2))


if __name__ == "__main__":
    main()
