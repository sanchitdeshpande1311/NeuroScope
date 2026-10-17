import os
import json
import logging
import sys
from pathlib import Path
import torch

sys.path.append(str(Path(__file__).resolve().parent.parent))

from ml.dataset import get_dataloaders
from ml.train import UNet
from ml.refinement import TopologicalRefiner
from monai.inferers import sliding_window_inference
from monai.transforms import AsDiscrete
from monai.metrics import DiceMetric, HausdorffDistanceMetric
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_evaluation_experiment():
    logger.info("Initializing Phase 8: Baseline vs Refined Experiment on Test Set")
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # We load only the test split, but get_dataloaders doesn't natively expose the test_loader
    # Wait, the dataset structure in get_dataloaders might only return train/val.
    # Let's import the raw dataset parsing to build a test dataloader explicitly.
    # For now, let's just use the validation loader if test isn't explicitly split, 
    # but the instructions said "189 test subjects".
    # I'll modify ml/dataset.py if necessary, but assuming it uses "test.json" inside splits directory.
    # Let's write the evaluation logic cleanly.
    
    # Check if checkpoint exists
    ckpt_path = Path("models/baseline_checkpoints/best_metric_model.pth")
    if not ckpt_path.exists():
        logger.error(f"Checkpoint not found at {ckpt_path}. Run training first.")
        return
        
    model = UNet(
        spatial_dims=3,
        in_channels=4,
        out_channels=3,
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
    ).to(device)
    
    model.load_state_dict(torch.load(ckpt_path, map_location=device))
    model.eval()
    
    # Metrics
    dice_metric_base = DiceMetric(include_background=True, reduction="mean_batch")
    dice_metric_ref = DiceMetric(include_background=True, reduction="mean_batch")
    
    # Initialize refiner - using conservative volume thresholds for testing
    refiner = TopologicalRefiner(enforce_containment=True, min_volume_dict={"TC": 10, "WT": 10, "ET": 10})
    
    # Load independent test split (189 subjects)
    from monai.data import Dataset, DataLoader
    from ml.preprocessing import get_val_transforms
    test_path = Path("data/splits/test.json")
    if not test_path.exists():
        logger.error(f"Test split not found at {test_path}")
        return
    with open(test_path, "r") as f:
        test_data = json.load(f)
    test_ds = Dataset(data=test_data, transform=get_val_transforms())
    test_loader = DataLoader(test_ds, batch_size=1, shuffle=False, num_workers=2)
    
    logger.info(f"Starting inference on {len(test_loader)} unseen test subjects...")
    
    with torch.no_grad():
        for batch in tqdm(test_loader, desc="Running Experiment"):
            inputs, labels = batch["image"].to(device), batch["label"].to(device)
            
            # 1. Baseline Prediction
            baseline_outputs = sliding_window_inference(
                inputs=inputs, roi_size=(128, 128, 128), sw_batch_size=4, predictor=model, overlap=0.25
            )
            
            # Sigmoid activation and thresholding
            # [B, C, H, W, D] -> B is 1
            baseline_discrete = (torch.sigmoid(baseline_outputs) > 0.5).float()
            
            # 2. Compute Baseline Dice
            dice_metric_base(y_pred=baseline_discrete, y=labels)
            
            # 3. Refinement Prediction
            # refine operates on shape [3, H, W, D], we need to squeeze the batch dimension
            refined_tensor = refiner.refine(baseline_discrete.squeeze(0))
            refined_discrete = refined_tensor.unsqueeze(0).float().to(device)
            
            # 4. Compute Refined Dice
            dice_metric_ref(y_pred=refined_discrete, y=labels)
            
    # Aggregate results
    base_vals = dice_metric_base.aggregate()
    ref_vals = dice_metric_ref.aggregate()
    
    results = {
        "test_subjects": len(test_loader),
        "baseline": {
            "overall_dice": base_vals.mean().item(),
            "tc_dice": base_vals[0].item(),
            "wt_dice": base_vals[1].item(),
            "et_dice": base_vals[2].item()
        },
        "graph_refined": {
            "overall_dice": ref_vals.mean().item(),
            "tc_dice": ref_vals[0].item(),
            "wt_dice": ref_vals[1].item(),
            "et_dice": ref_vals[2].item()
        },
        "absolute_improvement": {
            "overall_dice": ref_vals.mean().item() - base_vals.mean().item(),
            "tc_dice": ref_vals[0].item() - base_vals[0].item(),
            "wt_dice": ref_vals[1].item() - base_vals[1].item(),
            "et_dice": ref_vals[2].item() - base_vals[2].item()
        }
    }
    
    os.makedirs("results", exist_ok=True)
    with open("results/baseline_metrics.json", "w") as f:
        json.dump(results, f, indent=4)
        
    logger.info(f"Experiment completed. Results saved to results/baseline_metrics.json")
    logger.info(json.dumps(results, indent=2))

if __name__ == "__main__":
    run_evaluation_experiment()
