import json
import random
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def make_subject_split(train_ratio=0.7, val_ratio=0.15, test_ratio=0.15, seed=42):
    """
    Creates reproducible subject-level train/validation/test splits.
    """
    random.seed(seed)
    
    metadata_dir = Path("metadata")
    manifest_path = metadata_dir / "validated_manifest.json"
    
    if not manifest_path.exists():
        logger.error(f"Validated manifest {manifest_path} not found.")
        return
        
    with open(manifest_path, "r") as f:
        subjects = json.load(f)
        
    if not subjects:
        logger.warning("No subjects available for splitting.")
        return
        
    # Shuffle for randomness
    random.shuffle(subjects)
    
    n_total = len(subjects)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)
    
    train_split = subjects[:n_train]
    val_split = subjects[n_train:n_train + n_val]
    test_split = subjects[n_train + n_val:]
    
    logger.info(f"Split created: Train={len(train_split)}, Val={len(val_split)}, Test={len(test_split)}")
    
    splits_dir = Path("data/splits")
    splits_dir.mkdir(exist_ok=True)
    
    with open(splits_dir / "train.json", "w") as f:
        json.dump(train_split, f, indent=4)
        
    with open(splits_dir / "val.json", "w") as f:
        json.dump(val_split, f, indent=4)
        
    with open(splits_dir / "test.json", "w") as f:
        json.dump(test_split, f, indent=4)
        
    logger.info("Splits saved to data/splits/")

if __name__ == "__main__":
    make_subject_split()
