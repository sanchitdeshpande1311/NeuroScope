"""
Create a portable, verified ZIP of the NeuroScope 3D project (main application + the four integrated modules).

Usage:
    venv\\Scripts\\python execution\\package_project.py [--out-dir DIR] [--modules-dir DIR]

Read-only with respect to the project and the modules: files are only read and written into a new archive.
The archive name is NeuroScope3D_Complete_Project_<date>.zip; an existing file is never overwritten
(a numeric suffix is added instead).

Excluded (documented in PACKAGE_README.md inside the archive):
  * regenerable: venv, node_modules, .next, build outputs (.output, dist, .tanstack, .wrangler), caches
  * private / derived medical data: data/raw (BraTS dataset), backend/runs, backend/temp, backend/results,
    .tmp (intermediates), the Tracker module's backend/storage (uploaded studies), log files
  * secrets: every real .env file (the .env.example templates are kept)
  * unrelated or local tooling: .git, .claude, skill-creator, BACKUP_MANIFEST.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
import re
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
MODULE_NAMES = ["NeuroBrain Landing page", "location", "screenshot-perfect-project-39", "tumor-tracker-nifti", "_integration_patches"]

# directory names skipped anywhere in the tree
SKIP_DIR_NAMES = {"node_modules", "__pycache__", ".pytest_cache", ".git", ".next", ".output", ".tanstack", ".wrangler",
                  ".venv", "venv"}
# project-relative paths skipped (main project)
SKIP_MAIN = ["venv", "data/raw", "backend/runs", "backend/temp", "backend/results", ".tmp", ".claude", "skill-creator",
             "frontend/.next", "frontend/node_modules"]
SKIP_MAIN_FILES = {"BACKUP_MANIFEST.json", "frontend/tsconfig.tsbuildinfo"}
# module-relative paths skipped
SKIP_MODULE = ["dist", "backend/storage", "node_modules"]
SKIP_FILE_PATTERNS = ["*.pyc", "*.log", "*.tsbuildinfo", ".DS_Store", "Thumbs.db"]
ENV_RE = re.compile(r"^\.env($|\.(?!example$).+)")   # .env, .env.local, ... but not .env.example

SECRET_PATTERNS = {
    "google_api_key": re.compile(rb"AIza[0-9A-Za-z_\-]{30,}"),
    "openai_style_key": re.compile(rb"\bsk-[A-Za-z0-9]{20,}"),
    "private_key": re.compile(rb"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "filled_api_key_assignment": re.compile(rb"(?im)^\s*[A-Z0-9_]*(API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*[^\s#<]{8,}"),
}

ENV_TEMPLATE_MAIN = """# NeuroScope 3D - environment template (no secrets are required by the main application)
# Backend
# NEUROSCOPE_RETENTION_HOURS=23
# Workspace (frontend/next.config.ts) - set these for any production build; `next dev` has local defaults
# NEUROSCOPE_LANDING_ORIGIN=https://landing.example.org     (or "off")
# NEXT_PUBLIC_LOCATE_URL=https://locate.example.org
# NEXT_PUBLIC_CHATBOT_URL=https://assistant.example.org
# NEXT_PUBLIC_TRACKER_URL=https://tracker.example.org
# Modules folder used by scripts/start_integrations.ps1 (default: <home>\\NeuroScope3D_modules)
# NEUROSCOPE_MODULES_DIR=
"""
ENV_TEMPLATE_TRACKER = "# Tracker web (build time): address of the Tracker API (backend/run_backend.py listens on 8008)\nVITE_NEUROSCOPE_API_URL=http://localhost:8008\n"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def skipped(rel: str, is_dir: bool, prefixes: list[str], files: set[str] = frozenset()) -> str | None:
    name = rel.rsplit("/", 1)[-1]
    if is_dir and name in SKIP_DIR_NAMES:
        return "dependency/build/cache folder"
    if any(rel == p or rel.startswith(p + "/") for p in prefixes):
        return "excluded path"
    if not is_dir:
        if rel in files:
            return "excluded file"
        if ENV_RE.match(name):
            return "real .env file (may contain secrets)"
        if any(fnmatch.fnmatch(name, pat) for pat in SKIP_FILE_PATTERNS):
            return "cache/log file"
    return None


def walk(root: Path, prefixes: list[str], files: set[str] = frozenset()):
    """Yield (relative posix path, absolute path) for included files; collect exclusions."""
    excluded: dict[str, str] = {}
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        rel_dir = "" if rel_dir == "." else rel_dir
        keep = []
        for d in dirnames:
            rel = f"{rel_dir}/{d}" if rel_dir else d
            why = skipped(rel, True, prefixes)
            if why:
                excluded[rel + "/"] = why
            else:
                keep.append(d)
        dirnames[:] = sorted(keep)
        for fn in sorted(filenames):
            rel = f"{rel_dir}/{fn}" if rel_dir else fn
            why = skipped(rel, False, prefixes, files)
            if why:
                excluded[rel] = why
            else:
                out.append((rel, Path(dirpath) / fn))
    return out, excluded


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=str(Path.home() / "OneDrive" / "Desktop"))
    ap.add_argument("--modules-dir", default=os.environ.get("NEUROSCOPE_MODULES_DIR", str(Path.home() / "NeuroScope3D_modules")))
    args = ap.parse_args()
    out_dir, modules_dir = Path(args.out_dir), Path(args.modules_dir)
    date = dt.date.today().isoformat()
    base = f"NeuroScope3D_Complete_Project_{date}"
    zpath = out_dir / f"{base}.zip"
    n = 2
    while zpath.exists():
        zpath = out_dir / f"{base}_{n}.zip"
        n += 1
    top = zpath.stem

    entries, excluded = [], {}
    main_files, main_ex = walk(PROJECT, SKIP_MAIN, SKIP_MAIN_FILES)
    entries += [(rel, p) for rel, p in main_files]
    excluded.update({f"(project)/{k}": v for k, v in main_ex.items()})
    module_counts = {}
    for name in MODULE_NAMES:
        src = modules_dir / name
        if not src.exists():
            excluded[f"modules/{name}/"] = "module folder not found"
            continue
        files, ex = walk(src, SKIP_MODULE)
        entries += [(f"modules/{name}/{rel}", p) for rel, p in files]
        excluded.update({f"modules/{name}/{k}": v for k, v in ex.items()})
        module_counts[name] = len(files)

    secret_hits = []
    manifest = []
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for rel, p in entries:
            data = p.read_bytes()
            if p.suffix.lower() in {".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".txt", ".env", ".example", ".toml",
                                    ".yml", ".yaml", ".ps1", ".css", ".html", ""} and len(data) < 5_000_000:
                for kind, rx in SECRET_PATTERNS.items():
                    if rx.search(data):
                        secret_hits.append({"file": rel, "pattern": kind})
            z.writestr(f"{top}/{rel}", data)
            manifest.append({"path": rel, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        z.writestr(f"{top}/.env.example", ENV_TEMPLATE_MAIN)
        z.writestr(f"{top}/modules/tumor-tracker-nifti/.env.example", ENV_TEMPLATE_TRACKER)
        z.writestr(f"{top}/PACKAGE_MANIFEST.json", json.dumps({
            "created": dt.datetime.now().isoformat(timespec="seconds"),
            "project_root": str(PROJECT), "modules_dir": str(modules_dir),
            "file_count": len(manifest), "module_file_counts": module_counts,
            "excluded": excluded, "secret_scan_hits": secret_hits, "files": manifest,
        }, indent=1))
    # re-open and verify every member
    with zipfile.ZipFile(zpath) as z:
        bad = z.testzip()
        names = set(z.namelist())
    print(json.dumps({"zip": str(zpath), "bytes": zpath.stat().st_size, "sha256": sha256(zpath), "files": len(manifest),
                      "module_file_counts": module_counts, "testzip": bad or "OK",
                      "members": len(names), "secret_scan_hits": secret_hits,
                      "excluded_top": sorted({k.split("/")[0] + "/" + k.split("/")[1] if k.startswith("modules/") else k.split("/")[0] + "/" + (k.split("/")[1] if "/" in k else "") for k in excluded})[:80]}, indent=1))


if __name__ == "__main__":
    main()
