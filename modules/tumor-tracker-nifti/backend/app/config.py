import os
import time
import shutil
from typing import Dict, Any

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
UPLOAD_DIR = os.path.join(STORAGE_DIR, "uploads")
OUTPUT_DIR = os.path.join(STORAGE_DIR, "outputs")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_DIR = os.path.join(BASE_DIR, "models", "brats_mri_segmentation")
DEFAULT_MODEL_PATH = os.path.join(MODEL_DIR, "models", "model.pt")
METADATA_PATH = os.path.join(MODEL_DIR, "configs", "metadata.json")
LICENSE_PATH = os.path.join(MODEL_DIR, "LICENSE")

MAX_AGE_SECONDS = 86400  # 24 hours strict retention policy

# Global stores
STUDY_STORE: Dict[str, Dict[str, Any]] = {}
COMPARISON_STORE: Dict[str, Dict[str, Any]] = {}
STORE_INDEX_PATH = os.path.join(STORAGE_DIR, "store_index.json")


def persist_store():
    """Persist study and comparison metadata to disk for seamless reload."""
    try:
        import json
        payload = {
            "studies": {},
            "comparisons": {}
        }
        for sid, s in STUDY_STORE.items():
            payload["studies"][sid] = {
                "study_id": s.get("study_id"),
                "study_dir": s.get("study_dir"),
                "created_at": s.get("created_at"),
                "role": s.get("role"),
                "label": s.get("label"),
                "date": s.get("date"),
                "saved_paths": s.get("saved_paths"),
                "expert_mask_path": s.get("expert_mask_path"),
                "input_hashes": s.get("input_hashes"),
                "shape": s.get("shape"),
                "spacing": s.get("spacing"),
                "sequence_reports": s.get("sequence_reports"),
                "issues": s.get("issues"),
                "segmentation": s.get("segmentation"),
            }
        for cid, c in COMPARISON_STORE.items():
            payload["comparisons"][cid] = {
                "comparison_id": c.get("comparison_id"),
                "comp_dir": c.get("comp_dir"),
                "study_ids": c.get("study_ids"),
                "created_at": c.get("created_at"),
                "stage": c.get("stage"),
                "progress": c.get("progress"),
                "warnings": c.get("warnings"),
                "error": c.get("error"),
                "updated_at": c.get("updated_at"),
                "results": c.get("results"),
            }
        with open(STORE_INDEX_PATH, "w") as f:
            json.dump(payload, f)
    except Exception:
        pass


def restore_store():
    """Restore studies and comparisons from disk if available."""
    if os.path.exists(STORE_INDEX_PATH):
        try:
            import json
            with open(STORE_INDEX_PATH, "r") as f:
                data = json.load(f)
            for sid, s in data.get("studies", {}).items():
                if sid not in STUDY_STORE:
                    STUDY_STORE[sid] = s
            for cid, c in data.get("comparisons", {}).items():
                if cid not in COMPARISON_STORE:
                    COMPARISON_STORE[cid] = c
        except Exception:
            pass


# Restore previously indexed data immediately on startup
restore_store()


def cleanup_expired_data(max_age_seconds: int = MAX_AGE_SECONDS) -> int:
    """
    Automatically clean up temporary uploads and analysis jobs older than 24 hours.
    Ensures research privacy and disk space sanitation.
    """
    now = time.time()
    deleted_count = 0

    # Clean studies
    for study_id, info in list(STUDY_STORE.items()):
        created = info.get("created_at", now)
        if now - created > max_age_seconds:
            study_dir = info.get("study_dir")
            if study_dir and os.path.exists(study_dir):
                shutil.rmtree(study_dir, ignore_errors=True)
            STUDY_STORE.pop(study_id, None)
            deleted_count += 1

    # Clean comparisons
    for comp_id, info in list(COMPARISON_STORE.items()):
        created = info.get("created_at", now)
        if now - created > max_age_seconds:
            comp_dir = info.get("comp_dir")
            if comp_dir and os.path.exists(comp_dir):
                shutil.rmtree(comp_dir, ignore_errors=True)
            COMPARISON_STORE.pop(comp_id, None)
            deleted_count += 1

    # Also clean orphaned directories in UPLOAD_DIR older than 24h
    for entry in os.scandir(UPLOAD_DIR):
        if entry.is_dir():
            try:
                mtime = entry.stat().st_mtime
                if now - mtime > max_age_seconds:
                    shutil.rmtree(entry.path, ignore_errors=True)
                    deleted_count += 1
            except Exception:
                pass

    return deleted_count
