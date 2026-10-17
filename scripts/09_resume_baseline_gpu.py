import os
import sys
import logging
from pathlib import Path
import torch
from torch.optim import Adam
from torch.optim.lr_scheduler import CosineAnnealingLR
from tqdm import tqdm

import monai
from monai.networks.nets import UNet
from monai.losses import DiceLoss
from monai.metrics import DiceMetric
from monai.transforms import AsDiscrete
from monai.inferers import sliding_window_inference

sys.path.append(str(Path(__file__).resolve().parent.parent))
from ml.dataset import get_dataloaders

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def resume_baseline_training():
    """
    Safely resumes the 50-epoch GPU baseline segmentation training
    from verified Epoch-13 checkpoint through Epoch 50.
    """
    logger.info("=" * 70)
    logger.info("Initializing Phase 5 GPU Baseline Training Resumption")
    logger.info("=" * 70)
    
    # 1. Determinism
    torch.manual_seed(42)
    monai.utils.set_determinism(seed=42)
    
    # 2. Device check
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using compute device: {device}")
    if torch.cuda.is_available():
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"Available VRAM: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB")
    
    # 3. Dataloaders
    train_loader, val_loader = get_dataloaders(
        splits_dir="data/splits",
        batch_size=1,
        num_workers=2
    )
    if not train_loader or not val_loader:
        logger.error("Failed to initialize dataloaders from data/splits.")
        return
    logger.info(f"Dataloaders initialized: {len(train_loader)} train batches, {len(val_loader)} validation batches.")
    
    # 4. Model Architecture (Identical to frozen setup)
    model = UNet(
        spatial_dims=3,
        in_channels=4,  # t1n, t1c, t2w, t2f (manifest order)
        out_channels=3, # TC, WT, ET
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
    ).to(device)
    
    # 5. Load Verified Epoch-13 Checkpoint
    checkpoint_dir = Path("models/baseline_checkpoints")
    checkpoint_path = checkpoint_dir / "best_metric_model.pth"
    backup_path = checkpoint_dir / "best_metric_model_epoch13_backup.pth"
    
    if not checkpoint_path.exists():
        logger.error(f"Checkpoint not found at {checkpoint_path}!")
        return
    
    # Ensure backup exists
    if not backup_path.exists():
        import shutil
        shutil.copy2(checkpoint_path, backup_path)
        logger.info(f"Created pre-run safety backup: {backup_path}")
    else:
        logger.info(f"Safety backup already verified at: {backup_path}")
        
    weights = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(weights)
    logger.info(f"Successfully loaded model weights from: {checkpoint_path}")
    
    # 6. Loss, Optimizer, and LR Scheduler Synchronization
    loss_function = DiceLoss(sigmoid=True)
    learning_rate = 1e-4
    optimizer = Adam(model.parameters(), lr=learning_rate)
    
    # Synchronize scheduler: last_epoch=12 ensures Epoch 14 begins at exactly lr = 8.4227e-05
    for param_group in optimizer.param_groups:
        param_group['initial_lr'] = learning_rate
    scheduler = CosineAnnealingLR(optimizer, T_max=50, last_epoch=12)
    initial_lr = scheduler.get_last_lr()[0]
    logger.info(f"Synchronized CosineAnnealingLR (T_max=50). Starting LR for Epoch 14: {initial_lr:.6e}")
    
    # 7. Metric & Checkpoint Baseline Setup
    dice_metric = DiceMetric(include_background=True, reduction="mean_batch")
    
    # Baseline verified at Epoch 13
    best_metric = 0.5748
    best_metric_epoch = 13
    start_epoch = 14  # 1-indexed
    total_epochs = 50
    accumulation_steps = 4
    scaler = torch.amp.GradScaler("cuda") if torch.cuda.is_available() else None
    
    logger.info(f"Resuming training: Epochs {start_epoch} to {total_epochs} ({total_epochs - start_epoch + 1} remaining).")
    logger.info(f"Benchmark threshold to beat: Overall Dice = {best_metric:.4f} (set by Epoch {best_metric_epoch})")
    
    # 8. Main Resumed Training Loop
    for epoch in range(start_epoch - 1, total_epochs):
        model.train()
        epoch_loss = 0.0
        step = 0
        optimizer.zero_grad()
        
        progress = tqdm(train_loader, desc=f"Epoch {epoch+1}/{total_epochs}")
        for i, batch_data in enumerate(progress):
            step += 1
            inputs = batch_data["image"].to(device)
            labels = batch_data["label"].to(device)
            
            if scaler:
                with torch.amp.autocast("cuda"):
                    outputs = model(inputs)
                    loss = loss_function(outputs, labels)
                    loss = loss / accumulation_steps
                scaler.scale(loss).backward()
                
                if (i + 1) % accumulation_steps == 0 or (i + 1) == len(train_loader):
                    scaler.step(optimizer)
                    scaler.update()
                    optimizer.zero_grad()
            else:
                outputs = model(inputs)
                loss = loss_function(outputs, labels)
                loss = loss / accumulation_steps
                loss.backward()
                
                if (i + 1) % accumulation_steps == 0 or (i + 1) == len(train_loader):
                    optimizer.step()
                    optimizer.zero_grad()
                    
            unscaled_loss = loss.item() * accumulation_steps
            epoch_loss += unscaled_loss
            progress.set_postfix({"loss": f"{unscaled_loss:.4f}"})
            
        epoch_loss /= step
        current_lr = scheduler.get_last_lr()[0]
        logger.info(f"Epoch {epoch+1}/{total_epochs} Average Loss: {epoch_loss:.4f} | LR: {current_lr:.6e}")
        scheduler.step()
        
        # 9. Validation Pass with Sliding Window Inference
        model.eval()
        with torch.no_grad():
            for val_data in val_loader:
                val_inputs = val_data["image"].to(device)
                val_labels = val_data["label"].to(device)
                
                val_outputs = sliding_window_inference(
                    inputs=val_inputs,
                    roi_size=(128, 128, 128),
                    sw_batch_size=4,
                    predictor=model,
                    overlap=0.25
                )
                
                # Multi-label discrete thresholding (> 0.5)
                val_outputs_discrete = [AsDiscrete(threshold=0.5)(o) for o in val_outputs]
                dice_metric(y_pred=val_outputs_discrete, y=val_labels)
                
            metric_vals = dice_metric.aggregate()
            overall_metric = metric_vals.mean().item()
            tc_dice = metric_vals[0].item()
            wt_dice = metric_vals[1].item()
            et_dice = metric_vals[2].item()
            dice_metric.reset()
            
            gpu_mem = ""
            if torch.cuda.is_available():
                alloc_mb = torch.cuda.memory_allocated() / (1024 ** 2)
                res_mb = torch.cuda.memory_reserved() / (1024 ** 2)
                gpu_mem = f" | VRAM: {alloc_mb:.1f}MB/{res_mb:.1f}MB"
                
            logger.info(
                f"Validation Dice - Epoch {epoch+1}/{total_epochs} -> "
                f"Overall: {overall_metric:.4f} | TC: {tc_dice:.4f} | WT: {wt_dice:.4f} | ET: {et_dice:.4f}{gpu_mem}"
            )
            
            # Safe Checkpoint Save: Only if strictly exceeding previous best
            if overall_metric > best_metric:
                prev_best = best_metric
                best_metric = overall_metric
                best_metric_epoch = epoch + 1
                torch.save(model.state_dict(), checkpoint_path)
                logger.info(
                    f"*** NEW BEST CHECKPOINT SAVED: Overall Dice {best_metric:.4f} > {prev_best:.4f} "
                    f"at Epoch {best_metric_epoch} ***"
                )
            else:
                logger.info(f"Checkpoint maintained from Epoch {best_metric_epoch} (Best: {best_metric:.4f})")
                
    # 10. Training Complete
    final_path = checkpoint_dir / "final_epoch_model.pth"
    torch.save(model.state_dict(), final_path)
    logger.info("=" * 70)
    logger.info(f"50-Epoch Baseline GPU Training Complete!")
    logger.info(f"Best Validation Metric: Overall Dice = {best_metric:.4f} achieved at Epoch {best_metric_epoch}")
    logger.info(f"Best Model Checkpoint: {checkpoint_path}")
    logger.info(f"Final Epoch Checkpoint: {final_path}")
    logger.info("=" * 70)

if __name__ == "__main__":
    resume_baseline_training()
