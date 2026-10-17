import logging
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from ml.train import train_model

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_baseline_training():
    """
    Runs the full baseline training on 1251 subjects for 50 epochs.
    Configured for 6GB VRAM constraint with AMP and Gradient Accumulation.
    """
    logger.info("Initializing Phase 5 GPU Baseline Training...")
    
    import torch
    torch.manual_seed(42)
    import monai
    monai.utils.set_determinism(seed=42)
    
    config = {
        "splits_dir": "data/splits",
        "batch_size": 1, 
        "accumulation_steps": 4, # Effective batch size = 4
        "num_workers": 2, 
        "learning_rate": 1e-4,
        "epochs": 50,
        "checkpoint_dir": "models/baseline_checkpoints"
    }
    
    logger.info(f"Training Config: {config}")
    train_model(config)
    
    logger.info("Baseline GPU training execution finished.")
    
if __name__ == "__main__":
    run_baseline_training()
