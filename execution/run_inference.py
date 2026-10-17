"""
CLI: run the full NeuroScope 3D pipeline on one four-sequence case.

Usage:
    python execution/run_inference.py --t1 T1.nii.gz --t1gd T1Gd.nii.gz --t2 T2.nii.gz --flair FLAIR.nii.gz \
        --out OUT_DIR [--expert seg.nii.gz] [--allow-atypical]

Writes OUT_DIR/seg.nii.gz (labels 0/1/2/4 on the T1Gd grid and affine), seg_refined.nii.gz,
meshes, report.pdf and result.json. Exit code 2 when the input is refused.
"""
import argparse
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ml.inference import InputValidationError, Segmenter  # noqa: E402
from ml.pipeline import run_case  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    for a in ("t1", "t1gd", "t2", "flair"):
        ap.add_argument(f"--{a}", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--expert")
    ap.add_argument("--allow-atypical", action="store_true", help="do not refuse inputs failing the sanity check")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    paths = {"t1n": Path(a.t1), "t1c": Path(a.t1gd), "t2w": Path(a.t2), "t2f": Path(a.flair)}
    try:
        meta = run_case(paths, out, Segmenter(), uuid.uuid4().hex, expert_path=a.expert,
                        enforce_sanity=not a.allow_atypical)
    except InputValidationError as e:
        print(json.dumps({"status": "refused", **e.to_dict()}, indent=2))
        sys.exit(2)
    v = meta["volumes_ml"]["baseline"]
    print(json.dumps({"status": "complete", "output": str(out / "seg.nii.gz"),
                      "estimated_volumes_ml": {k: round(v[k], 2) for k in ("WT", "TC", "ET")},
                      "timings_s": {k: round(x, 2) for k, x in meta["timings_s"].items()}}, indent=2))


if __name__ == "__main__":
    main()
