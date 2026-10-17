import os
import logging
import torch
from monai.networks.nets import UNet
from monai.losses import DiceLoss
from monai.metrics import DiceMetric
from torch.optim import Adam
from torch.optim.lr_scheduler import CosineAnnealingLR
from monai.transforms import AsDiscrete
from .dataset import get_dataloaders
from tqdm import tqdm

logger = logging.getLogger(__name__)

def train_model(config):
    """
    Main training loop for the segmentation model.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using device: {device}")
    
    train_loader, val_loader = get_dataloaders(
        splits_dir=config.get("splits_dir", "data/splits"),
        batch_size=config.get("batch_size", 2),
        num_workers=config.get("num_workers", 4)
    )
    
    if not train_loader or not val_loader:
        logger.error("Dataloaders could not be initialized.")
        return

    # Using a 3D U-Net
    model = UNet(
        spatial_dims=3,
        in_channels=4, # t1n, t1c, t2w, t2f (manifest order)
        out_channels=3, # TC, WT, ET
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
    ).to(device)
    
    loss_function = DiceLoss(sigmoid=True)
    optimizer = Adam(model.parameters(), lr=config.get("learning_rate", 1e-4))
    scheduler = CosineAnnealingLR(optimizer, T_max=config.get("epochs", 50))
    # reduction="mean_batch" computes the metric for each class/channel independently across the batch
    dice_metric = DiceMetric(include_background=True, reduction="mean_batch")
    
    epochs = config.get("epochs", 50)
    best_metric = -1
    best_metric_epoch = -1
    
    checkpoint_dir = config.get("checkpoint_dir", "models/checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    logger.info(f"Starting training for {epochs} epochs...")
    
    accumulation_steps = config.get("accumulation_steps", 4)
    scaler = torch.amp.GradScaler("cuda") if torch.cuda.is_available() else None
    
    for epoch in range(epochs):
        model.train()
        epoch_loss = 0
        step = 0
        optimizer.zero_grad()
        
        progress = tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}")
        for i, batch_data in enumerate(progress):
            step += 1
            inputs, labels = batch_data["image"].to(device), batch_data["label"].to(device)
            
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
            
            # Unscale loss for logging
            epoch_loss += loss.item() * accumulation_steps
            progress.set_postfix({"loss": loss.item() * accumulation_steps})
            
            if config.get("max_steps") and step >= config.get("max_steps"):
                break
            
        epoch_loss /= step
        logger.info(f"Epoch {epoch+1} average loss: {epoch_loss:.4f}")
        scheduler.step()
        
        # Validation
        model.eval()
        from monai.inferers import sliding_window_inference
        with torch.no_grad():
            for val_data in val_loader:
                val_inputs, val_labels = val_data["image"].to(device), val_data["label"].to(device)
                
                val_outputs = sliding_window_inference(
                    inputs=val_inputs, 
                    roi_size=(128, 128, 128), 
                    sw_batch_size=4, 
                    predictor=model,
                    overlap=0.25
                )
                
                # compute metric
                # Apply thresholding for multi-label sigmoid outputs before Dice computation
                val_outputs_discrete = [AsDiscrete(threshold=0.5)(i) for i in val_outputs]
                dice_metric(y_pred=val_outputs_discrete, y=val_labels)
                
                if config.get("max_steps"):
                    break # just one batch for validation smoke test
                
            metric_vals = dice_metric.aggregate()
            overall_metric = metric_vals.mean().item()
            tc_dice = metric_vals[0].item()
            wt_dice = metric_vals[1].item()
            et_dice = metric_vals[2].item()
            
            dice_metric.reset()
            
            logger.info(f"Validation Dice - Overall: {overall_metric:.4f} | TC: {tc_dice:.4f} | WT: {wt_dice:.4f} | ET: {et_dice:.4f}")
            
            if overall_metric > best_metric:
                best_metric = overall_metric
                best_metric_epoch = epoch + 1
                torch.save(model.state_dict(), os.path.join(checkpoint_dir, "best_metric_model.pth"))
                logger.info("Saved new best metric model")
                
    logger.info(f"Training completed, best_metric: {best_metric:.4f} at epoch: {best_metric_epoch}")
