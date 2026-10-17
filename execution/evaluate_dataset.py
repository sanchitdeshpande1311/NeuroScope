"""
Evaluate the production pipeline on any labelled BraTS-style folder (e.g. the organiser's 40-case
BraTS 2021 development subset) and optionally compare with the organiser baseline.

Usage:
    python execution/evaluate_dataset.py --data-dir PATH [--baseline-json organiser_baseline.json]
                                         [--out results/organiser_dev_eval.json] [--limit N]

Folder layout: one sub-folder per case containing four sequences + a label file. Sequences are
identified by file name (BraTS 2021: _t1, _t1ce, _t2, _flair, _seg; BraTS 2023: -t1n, -t1c, -t2w, -t2f, -seg).
The label convention is detected per case: ET = 4 (BraTS 2021) or ET = 3 (BraTS 2023).

--baseline-json format (values supplied by the organiser, never invented):
    {"WT": {"dice": 0.xx, "sensitivity": 0.xx}, "TC": {...}, "ET": {...}}
The script reports our mean minus baseline and whether each is within 0.05 (the stated target).
No parameters are tuned here. Cases are only read; nothing is written next to them.
"""
import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

import nibabel as nib
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ml.inference import Segmenter, compare_to_reference, validate_case  # noqa: E402

PATTERNS = {
    "seg": r"(seg|label|mask)",
    "t2f": r"(flair|t2f)",
    "t1c": r"(t1ce|t1c|t1gd)",
    "t2w": r"(t2w|t2)",
    "t1n": r"(t1n|t1)",
}


def identify(case_dir: Path) -> dict:
    out = {}
    for f in sorted(case_dir.glob("*.nii*")):
        stem = re.sub(r"\.nii(\.gz)?$", "", f.name.lower())
        tokens = re.split(r"[^a-z0-9]+", stem)
        for key, pat in PATTERNS.items():  # order matters: seg, flair, t1ce before t2/t1
            if any(re.fullmatch(pat, t) for t in tokens) and key not in out:
                out[key] = f
                break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--baseline-json")
    ap.add_argument("--out", default=str(ROOT / "results" / "organiser_dev_eval.json"))
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    cases = sorted(d for d in Path(a.data_dir).iterdir() if d.is_dir())[: a.limit]
    seg_model = Segmenter()
    rows, skipped = [], []
    for d in cases:
        files = identify(d)
        missing = [k for k in ("t1n", "t1c", "t2w", "t2f", "seg") if k not in files]
        if missing:
            skipped.append({"case": d.name, "missing": missing})
            continue
        t0 = time.perf_counter()
        case = validate_case({k: files[k] for k in ("t1n", "t1c", "t2w", "t2f")})
        pred = seg_model.predict(case)["seg"]
        ref = np.round(np.asarray(nib.load(str(files["seg"])).dataobj)).astype(int)
        et_label = 4 if (ref == 4).any() or not (ref == 3).any() else 3
        cmp = compare_to_reference(pred, ref, case.zooms, ref_et_label=et_label)
        rows.append({"case": d.name, "et_label_in_reference": et_label, "seconds": time.perf_counter() - t0, **{
            f"{r}_{m}": cmp[r][m] for r in ("WT", "TC", "ET") for m in ("dice", "sensitivity", "pred_ml", "ref_ml")}})
        print(f"{d.name}: WT {cmp['WT']['dice']:.3f} TC {cmp['TC']['dice']:.3f} ET {cmp['ET']['dice']:.3f}", flush=True)
    summary = {}
    for r in ("WT", "TC", "ET"):
        dice = [x[f"{r}_dice"] for x in rows]
        sens = [x[f"{r}_sensitivity"] for x in rows if not np.isnan(x[f"{r}_sensitivity"])]
        summary[r] = {"dice_mean": float(np.mean(dice)) if dice else None,
                      "sensitivity_mean": float(np.mean(sens)) if sens else None, "n_sens": len(sens)}
    comparison = None
    if a.baseline_json:
        base = json.loads(Path(a.baseline_json).read_text())
        comparison = {r: {m: {"ours": summary[r][f"{m}_mean"], "baseline": base[r][m],
                              "difference": summary[r][f"{m}_mean"] - base[r][m],
                              "within_0.05": summary[r][f"{m}_mean"] >= base[r][m] - 0.05}
                          for m in ("dice", "sensitivity")} for r in ("WT", "TC", "ET")}
    res = {"data_dir": str(Path(a.data_dir).resolve()), "n_cases": len(rows), "skipped": skipped,
           "checkpoint_sha256": seg_model.checkpoint_sha256, "summary": summary,
           "baseline_comparison": comparison or "not run (no --baseline-json supplied)", "cases": rows}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(res, indent=2, default=float))
    if rows:
        with open(Path(a.out).with_suffix(".csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
    print(json.dumps({"n_cases": len(rows), "skipped": skipped, "summary": summary, "baseline_comparison": comparison}, indent=2))


if __name__ == "__main__":
    main()
