import logging
import sys
import torch
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from ml.dataset import get_dataloaders
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def validate_topology():
    logger.info("Running Topology Validation: ET ⊆ TC ⊆ WT")
    
    # Use a small batch size, just test the validation loader which is deterministic
    _, val_loader = get_dataloaders(splits_dir="data/splits", batch_size=1, num_workers=0)
    
    if not val_loader:
        logger.error("Dataloader could not be initialized.")
        return
        
    valid_count = 0
    total_count = 0
    
    logger.info("Scanning transformed segmentation masks...")
    
    for batch in tqdm(val_loader, desc="Validating Topology"):
        labels = batch["label"] # Shape: [B, 3, H, W, D]
        # Channels: 0 = TC, 1 = WT, 2 = ET
        
        tc = labels[:, 0, ...]
        wt = labels[:, 1, ...]
        et = labels[:, 2, ...]
        
        # Check ET ⊆ TC : Everywhere ET is 1, TC must be 1.
        # This means ET & ~TC should be empty
        et_not_tc = torch.logical_and(et == 1, tc == 0).sum().item()
        
        # Check TC ⊆ WT : Everywhere TC is 1, WT must be 1.
        tc_not_wt = torch.logical_and(tc == 1, wt == 0).sum().item()
        
        total_count += 1
        if et_not_tc == 0 and tc_not_wt == 0:
            valid_count += 1
        else:
            logger.error(f"Topology violation found! ET-not-TC voxels: {et_not_tc}, TC-not-WT voxels: {tc_not_wt}")
            
    logger.info(f"Topology Validation Complete. Valid: {valid_count}/{total_count}")
    
    if valid_count == total_count:
        logger.info("SUCCESS: All transformed targets strictly adhere to ET ⊆ TC ⊆ WT.")
    else:
        logger.error("FAILURE: Topological relationships are broken in the preprocessing pipeline.")

if __name__ == "__main__":
    validate_topology()
