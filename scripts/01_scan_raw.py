import os
import glob
import json
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

RAW_DATA_DIR = Path("data/raw")
EXPECTED_MODALITIES = ["t1n", "t1c", "t2w", "t2f", "seg"]

def scan_raw_data(data_dir: Path):
    """
    Scans the raw data directory for BraTS formatted data.
    Assumes standard BraTS layout where each subject has their own folder
    or files are named with subject IDs and modalities.
    """
    if not data_dir.exists():
        logger.error(f"Raw data directory {data_dir} does not exist.")
        return

    logger.info(f"Scanning {data_dir} for BraTS data...")
    
    # We look for .nii.gz files.
    # Typical BraTS structure: data/raw/BraTS20_Training_001/BraTS20_Training_001_t1.nii.gz
    # OR all files in a single flat directory
    
    nii_files = list(data_dir.rglob("*.nii.gz"))
    if not nii_files:
        logger.warning(f"No .nii.gz files found in {data_dir}. Please ensure dataset is correctly placed.")
        return

    subjects = {}
    
    for f in nii_files:
        filename = f.name
        # BraTS naming is typically: <SubjectID>_<Modality>.nii.gz
        # E.g., BraTS-GLI-00000-000-t1c.nii.gz
        
        parts = filename.replace('.nii.gz', '').split('-')
        
        if len(parts) >= 2:
            modality = parts[-1].lower()
            subject_id = "-".join(parts[:-1])
            
            if subject_id not in subjects:
                subjects[subject_id] = {}
            subjects[subject_id][modality] = str(f)
            
    logger.info(f"Found {len(subjects)} subjects.")
    
    # Save the scanned result to metadata/scan_report.json
    metadata_dir = Path("metadata")
    metadata_dir.mkdir(exist_ok=True)
    report_path = metadata_dir / "scan_report.json"
    
    with open(report_path, "w") as out:
        json.dump(subjects, out, indent=4)
        
    logger.info(f"Scan report saved to {report_path}")
    
    return subjects

if __name__ == "__main__":
    scan_raw_data(RAW_DATA_DIR)
