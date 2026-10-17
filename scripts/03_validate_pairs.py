import json
import logging
from pathlib import Path
import nibabel as nib
import numpy as np
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_nifti_validity(filepath, is_label=False):
    try:
        img = nib.load(filepath)
        shape = img.shape
        affine = img.affine
        unique_labels = None
        if is_label:
            # We must convert to numpy to get unique values.
            # Using asarray to avoid loading whole image if possible, but actually we need the data
            data = img.get_fdata()
            unique_labels = np.unique(data).tolist()
        return shape, affine, unique_labels
    except Exception as e:
        logger.error(f"Failed to load {filepath}: {e}")
        return None, None, None

def validate_pairs():
    """
    Validates that the images and labels in the manifest have consistent dimensions and affines.
    Also collects all unique segmentation label values.
    """
    metadata_dir = Path("metadata")
    manifest_path = metadata_dir / "dataset_manifest.json"
    
    if not manifest_path.exists():
        logger.error(f"Manifest {manifest_path} not found.")
        return
        
    with open(manifest_path, "r") as f:
        valid_subjects = json.load(f)
        
    logger.info(f"Validating pairs for {len(valid_subjects)} subjects...")
    
    fully_valid_subjects = []
    
    global_unique_labels = set()
    
    stats = {
        "total_subjects": len(valid_subjects),
        "valid_subjects": 0,
        "invalid_subjects": 0,
        "missing_files": 0,
        "unreadable_files": 0,
        "shape_mismatches": 0,
        "affine_issues": 0
    }
    
    for entry in tqdm(valid_subjects, desc="Validating Subjects"):
        subject_id = entry["subject_id"]
        images = entry["image"]
        label = entry["label"]
        
        base_shape = None
        base_affine = None
        is_valid = True
        
        # Check images
        for filepath in images:
            if not Path(filepath).exists():
                logger.warning(f"Subject {subject_id} is missing file: {filepath}")
                stats["missing_files"] += 1
                is_valid = False
                break
                
            shape, affine, _ = check_nifti_validity(filepath, is_label=False)
            if shape is None:
                stats["unreadable_files"] += 1
                is_valid = False
                break
                
            if base_shape is None:
                base_shape = shape
                base_affine = affine
            else:
                if shape != base_shape:
                    logger.warning(f"Subject {subject_id} has shape mismatch: {shape} vs {base_shape} in {filepath}")
                    stats["shape_mismatches"] += 1
                    is_valid = False
                    break
                if not np.allclose(affine, base_affine, atol=1e-3):
                    logger.warning(f"Subject {subject_id} has affine mismatch in {filepath}")
                    stats["affine_issues"] += 1
                    is_valid = False
                    break
                    
        # Check label
        if is_valid:
            if not Path(label).exists():
                logger.warning(f"Subject {subject_id} is missing label file: {label}")
                stats["missing_files"] += 1
                is_valid = False
            else:
                shape, affine, unique_labels = check_nifti_validity(label, is_label=True)
                if shape is None:
                    stats["unreadable_files"] += 1
                    is_valid = False
                else:
                    if shape != base_shape:
                        logger.warning(f"Subject {subject_id} has shape mismatch in label: {shape} vs {base_shape}")
                        stats["shape_mismatches"] += 1
                        is_valid = False
                    elif not np.allclose(affine, base_affine, atol=1e-3):
                        logger.warning(f"Subject {subject_id} has affine mismatch in label")
                        stats["affine_issues"] += 1
                        is_valid = False
                    else:
                        global_unique_labels.update(unique_labels)
                        
        if is_valid:
            fully_valid_subjects.append(entry)
            stats["valid_subjects"] += 1
        else:
            stats["invalid_subjects"] += 1
            
    logger.info(f"Pairs validation complete. {len(fully_valid_subjects)} / {len(valid_subjects)} are fully valid structurally.")
    logger.info(f"Unique label values found across dataset: {sorted(list(global_unique_labels))}")
    logger.info(f"Validation Stats: {json.dumps(stats, indent=4)}")
    
    validated_manifest_path = metadata_dir / "validated_manifest.json"
    with open(validated_manifest_path, "w") as out:
        json.dump(fully_valid_subjects, out, indent=4)
        
    # Write stats to file for easy reading
    with open(metadata_dir / "validation_stats.json", "w") as out:
        stats["unique_labels"] = sorted(list(global_unique_labels))
        json.dump(stats, out, indent=4)
        
    logger.info(f"Validated manifest saved to {validated_manifest_path}")

if __name__ == "__main__":
    validate_pairs()
