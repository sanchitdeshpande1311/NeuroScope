"""
Build a patient-disjoint held-out evaluation list from the historical split.

The historical split (scripts/04_make_subject_split.py) shuffled per *scan*
(BraTS-GLI-PPPPP-TTT, TTT = timepoint), so some patients occur in both train and
test. This keeps only test scans whose patient id (BraTS-GLI-PPPPP) never occurs
in train.json or val.json (the checkpoint was trained on train and selected on val).

Output: configs/heldout_cases.json  (sorted, deterministic)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPLITS = ROOT / "data" / "splits"


def pid(entry):
    return entry["subject_id"].rsplit("-", 1)[0]


def main():
    s = {k: json.loads((SPLITS / f"{k}.json").read_text()) for k in ("train", "val", "test")}
    seen = {pid(e) for e in s["train"]} | {pid(e) for e in s["val"]}
    clean = sorted([e for e in s["test"] if pid(e) not in seen], key=lambda e: e["subject_id"])
    # one scan per patient (first timepoint) so patients are not double-counted
    out, used = [], set()
    for e in clean:
        if pid(e) not in used:
            used.add(pid(e))
            out.append(e)
    dropped = sorted(e["subject_id"] for e in s["test"] if pid(e) in seen)
    res = {
        "description": "Test-split scans whose patient is absent from train.json and val.json; one scan per patient.",
        "n_test_scans": len(s["test"]),
        "n_dropped_patient_overlap": len(dropped),
        "dropped_subject_ids": dropped,
        "n_heldout": len(out),
        "cases": out,
    }
    (ROOT / "configs").mkdir(exist_ok=True)
    (ROOT / "configs" / "heldout_cases.json").write_text(json.dumps(res, indent=2))
    print(f"test scans={len(s['test'])} dropped(overlap)={len(dropped)} heldout patients={len(out)}")


if __name__ == "__main__":
    main()
