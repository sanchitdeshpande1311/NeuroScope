import logging
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from ml.train import train_model

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_smoke_test():
    """
    Runs a fast smoke test to verify the forward/backward passes, loss, metrics, and checkpointing.
    """
    logger.info("Initializing Phase 5 Smoke Test...")
    
    # We set seeds inside monai/torch for reproducibility
    import torch
    torch.manual_seed(42)
    import monai
    monai.utils.set_determinism(seed=42)
    
    config = {
        "splits_dir": "data/splits",
        "batch_size": 2, 
        "num_workers": 0, # zero workers for faster setup in Windows/testing
        "learning_rate": 1e-4,
        "epochs": 1,
        "max_steps": 2, # Only run 2 batches for training
        "checkpoint_dir": "models/smoke_test_checkpoints"
    }
    
    train_model(config)
    
    logger.info("Smoke test execution finished.")
    
if __name__ == "__main__":
    run_smoke_test()
