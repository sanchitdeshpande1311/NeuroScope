"""
Create a timestamped, hash-verified backup of the NeuroScope 3D project.

Usage:
    python execution/backup_project.py [--dest C:/Users/hp/NeuroScope3D_backups]

Copies every project file except regenerable / very large directories
(virtual env, node_modules, Next.js build cache, raw dataset), then re-reads
every copied file and compares SHA-256 against the original. Writes
BACKUP_MANIFEST.json inside the backup and a copy at the project root.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent

# Excluded paths (relative, forward slashes). Recorded in the manifest.
EXCLUDE_DIRS = {
    "venv": "Regenerable Python virtual environment (requirements.txt).",
    "frontend/node_modules": "Regenerable npm dependencies (package-lock.json).",
    "frontend/.next": "Regenerable Next.js build cache.",
    "backend/runs": "Transient user runs (auto-deleted within 24 h; never backed up).",
    "data/raw": "Original BraTS 2023 GLI dataset (~13 GB) - read-only source data, never modified by this work; re-downloadable from Synapse/TCIA.",
    ".git/objects": "Git object store (no commits on master at backup time); index + refs are copied.",
}
EXCLUDE_NAMES = {"__pycache__"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_excluded(rel: str) -> bool:
    return any(rel == d or rel.startswith(d + "/") for d in EXCLUDE_DIRS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", default=str(Path.home() / "NeuroScope3D_backups"))
    args = ap.parse_args()

    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = Path(args.dest) / f"backup_{ts}"
    dest.mkdir(parents=True, exist_ok=False)

    files = []
    for root, dirs, fnames in os.walk(PROJECT):
        rel_root = Path(root).relative_to(PROJECT).as_posix()
        rel_root = "" if rel_root == "." else rel_root
        dirs[:] = [d for d in dirs if d not in EXCLUDE_NAMES
                   and not is_excluded(f"{rel_root}/{d}".lstrip("/"))]
        for fn in fnames:
            rel = f"{rel_root}/{fn}".lstrip("/")
            files.append(rel)

    records, failures = [], []
    for rel in files:
        src = PROJECT / rel
        dst = dest / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(src, dst)
            h_src, h_dst = sha256(src), sha256(dst)
            ok = h_src == h_dst
            records.append({"path": rel, "bytes": src.stat().st_size, "sha256": h_src, "verified": ok})
            if not ok:
                failures.append(rel)
        except Exception as e:  # noqa: BLE001
            failures.append(rel)
            records.append({"path": rel, "error": repr(e), "verified": False})

    manifest = {
        "project_root": str(PROJECT),
        "backup_path": str(dest),
        "timestamp": ts,
        "file_count": len(records),
        "total_bytes": sum(r.get("bytes", 0) for r in records),
        "verified_ok": len(records) - len(failures),
        "verification_failures": failures,
        "excluded": EXCLUDE_DIRS,
        "excluded_names": sorted(EXCLUDE_NAMES),
        "files": records,
    }
    (dest / "BACKUP_MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    summary = {k: v for k, v in manifest.items() if k != "files"}
    (PROJECT / "BACKUP_MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(summary, indent=2))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
