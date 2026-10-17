"""
DRY-RUN audit of legacy upload folders written by the OLD API (before 2026-10-16 rewrite):
    backend/temp/<unix_ts>/{t1n,t1c,t2w,t2f}.nii.gz   - uploaded MRI copies
    backend/results/<unix_ts>_t1c.nii.gz             - copy of the uploaded T1Gd for the viewer
    backend/results/<unix_ts>_{baseline,refined}.nii.gz - generated masks (old labels 1/2/3)

Usage:
    python execution/audit_old_uploads.py            # dry run: writes results/old_uploads_dry_run.json, deletes nothing
    python execution/audit_old_uploads.py --delete   # deletes ONLY entries with action == "delete" in a fresh audit

For every file: size, mtime, SHA-256, NIfTI shape/labels, category, and whether a byte-identical
copy exists in data/raw (size pre-filter, then SHA-256) and in the verified backup.
Only uploaded-MRI copies that have a byte-identical original in data/raw AND a verified backup copy are
proposed for deletion. Everything else is retained and listed for the owner to decide.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
from collections import defaultdict
from pathlib import Path

import nibabel as nib
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BACKUP = Path.home() / "NeuroScope3D_backups" / "backup_20261016_204349"


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def classify(rel):
    m = re.match(r"backend/temp/(\d+)/(t1n|t1c|t2w|t2f)\.nii\.gz$", rel)
    if m:
        return m.group(1), "uploaded_mri_copy", f"uploaded {m.group(2)} saved by old /api/predict"
    m = re.match(r"backend/results/(\d+)_t1c\.nii\.gz$", rel)
    if m:
        return m.group(1), "uploaded_mri_copy", "copy of uploaded T1Gd served to the old viewer"
    m = re.match(r"backend/results/(\d+)_(baseline|refined)\.nii\.gz$", rel)
    if m:
        return m.group(1), "generated_mask", f"old-pipeline {m.group(2)} mask (labels 1/2/3, min-max preprocessing)"
    return None, "unknown", "purpose not identified"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true")
    a = ap.parse_args()
    files = [p for d in ("backend/temp", "backend/results") for p in (ROOT / d).rglob("*") if p.is_file()]
    raw_by_size = defaultdict(list)
    for p in (ROOT / "data" / "raw").rglob("*.nii.gz"):
        raw_by_size[p.stat().st_size].append(p)
    backup_manifest = {r["path"]: r for r in json.loads((BACKUP / "BACKUP_MANIFEST.json").read_text())["files"]}
    rows = []
    for p in sorted(files):
        rel = p.relative_to(ROOT).as_posix()
        run_id, cat, purpose = classify(rel)
        st = p.stat()
        h = sha256(p)
        info = {"path": rel, "run_id": run_id, "run_time_utc": dt.datetime.fromtimestamp(int(run_id), dt.timezone.utc).isoformat() if run_id else None,
                "bytes": st.st_size, "mtime": dt.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                "sha256": h, "category": cat, "purpose": purpose}
        try:
            img = nib.load(str(p))
            info["shape"] = list(img.shape)
            if cat == "generated_mask":
                info["labels"] = sorted(np.unique(np.asarray(img.dataobj)).astype(int).tolist())
        except Exception as e:  # noqa: BLE001
            info["nifti_error"] = type(e).__name__
        matches = [q for q in raw_by_size.get(st.st_size, []) if sha256(q) == h]
        info["identical_in_data_raw"] = [q.relative_to(ROOT).as_posix() for q in matches]
        b = backup_manifest.get(rel)
        info["in_verified_backup"] = bool(b and b.get("verified") and b.get("sha256") == h and (BACKUP / rel).exists())
        expired = run_id is not None and (dt.datetime.now().timestamp() - int(run_id)) > 24 * 3600
        info["older_than_24h"] = expired
        if cat == "uploaded_mri_copy" and not expired:
            info["action"], info["reason"] = "retain_not_expired", "upload copy younger than 24 h; retention does not yet require removal"
        elif cat == "uploaded_mri_copy" and info["identical_in_data_raw"] and info["in_verified_backup"]:
            info["action"], info["reason"] = "delete", "obsolete upload copy; byte-identical original in data/raw; verified copy in backup; violates 24 h retention"
        elif cat == "uploaded_mri_copy":
            info["action"], info["reason"] = "retain_ask_owner", "uploaded MRI with no byte-identical original in data/raw (or not in backup) - owner decision"
        elif cat == "generated_mask":
            info["action"], info["reason"] = "retain_ask_owner", "generated output, not uploaded MRI; derived from the upload - owner decision"
        else:
            info["action"], info["reason"] = "retain", "purpose not identified"
        rows.append(info)
    summary = defaultdict(lambda: {"files": 0, "bytes": 0})
    for r in rows:
        summary[r["action"]]["files"] += 1
        summary[r["action"]]["bytes"] += r["bytes"]
    out = {"generated": dt.datetime.now().isoformat(timespec="seconds"), "mode": "delete" if a.delete else "dry_run",
           "run_ids": sorted({r["run_id"] for r in rows if r["run_id"]}), "summary": summary, "files": rows}
    if a.delete:
        deleted = []
        for r in rows:
            if r["action"] == "delete":
                (ROOT / r["path"]).unlink()
                deleted.append(r["path"])
        out["deleted"] = deleted
        out["verified_gone"] = all(not (ROOT / d).exists() for d in deleted)
        out["retained_still_present"] = all((ROOT / r["path"]).exists() and sha256(ROOT / r["path"]) == r["sha256"]
                                            for r in rows if r["action"] != "delete")
    md = ["# Legacy upload audit (" + out["mode"] + ")", "", "| action | run | path | bytes | identical original in data/raw |", "|---|---|---|---|---|"]
    md += [f"| {r['action']} | {r['run_id']} | {r['path']} | {r['bytes']} | {(r['identical_in_data_raw'] or ['-'])[0]} |" for r in rows]
    (ROOT / "results" / ("old_uploads_deletion_log.md" if a.delete else "old_uploads_dry_run.md")).write_text("\n".join(md) + "\n")
    name = "old_uploads_deletion_log.json" if a.delete else "old_uploads_dry_run.json"
    (ROOT / "results" / name).write_text(json.dumps(out, indent=2))
    print(json.dumps({k: v for k, v in out.items() if k != "files"}, indent=2))


if __name__ == "__main__":
    main()
