import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

EXPECTED_MODALITIES = ["t1n", "t1c", "t2w", "t2f"]
LABEL_MODALITY = "seg"

def build_manifest():
    """
    Reads the scan report and builds a dataset manifest.
    Filters out subjects that do not have all required modalities and the label mask.
    """
    metadata_dir = Path("metadata")
    report_path = metadata_dir / "scan_report.json"
    
    if not report_path.exists():
        logger.error(f"Scan report {report_path} not found. Run 01_scan_raw.py first.")
        return
        
    with open(report_path, "r") as f:
        subjects = json.load(f)
        
    valid_subjects = []
    invalid_subjects = []
    
    for subject_id, files in subjects.items():
        missing_mods = [mod for mod in EXPECTED_MODALITIES if mod not in files]
        if LABEL_MODALITY not in files:
            missing_mods.append(LABEL_MODALITY)
            
        if missing_mods:
            logger.warning(f"Subject {subject_id} is missing modalities: {missing_mods}")
            invalid_subjects.append(subject_id)
        else:
            # Create a dictionary for MONAI Dataset
            entry = {
                "subject_id": subject_id,
                "image": [files[mod] for mod in EXPECTED_MODALITIES],
                "label": files[LABEL_MODALITY]
            }
            valid_subjects.append(entry)
            
    logger.info(f"Total valid subjects: {len(valid_subjects)}")
    logger.info(f"Total invalid subjects: {len(invalid_subjects)}")
    
    manifest_path = metadata_dir / "dataset_manifest.json"
    with open(manifest_path, "w") as out:
        json.dump(valid_subjects, out, indent=4)
        
    logger.info(f"Manifest saved to {manifest_path}")

if __name__ == "__main__":
    build_manifest()
