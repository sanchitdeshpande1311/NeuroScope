import json
import logging
from pathlib import Path
from monai.data import Dataset, DataLoader
from .preprocessing import get_train_transforms, get_val_transforms

logger = logging.getLogger(__name__)

def get_dataloaders(splits_dir="data/splits", batch_size=2, num_workers=4):
    splits_dir = Path(splits_dir)
    train_path = splits_dir / "train.json"
    val_path = splits_dir / "val.json"
    
    if not train_path.exists() or not val_path.exists():
        logger.error("Split files not found. Run make_subject_split.py first.")
        return None, None

    with open(train_path, "r") as f:
        train_data = json.load(f)
    with open(val_path, "r") as f:
        val_data = json.load(f)
        
    logger.info(f"Loaded {len(train_data)} train and {len(val_data)} validation cases.")
    
    train_ds = Dataset(data=train_data, transform=get_train_transforms())
    val_ds = Dataset(data=val_data, transform=get_val_transforms())
    
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)
    
    return train_loader, val_loader
