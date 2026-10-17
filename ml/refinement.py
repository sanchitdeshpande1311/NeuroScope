import torch
import numpy as np
from typing import Dict, Any

class TopologicalRefiner:
    """
    Applies discrete-mathematical and topological refinement rules 
    to 3D segmentation outputs to enforce anatomical consistency.
    """
    
    def __init__(self, 
                 enforce_containment: bool = True,
                 min_volume_dict: Dict[str, int] = None):
        """
        Args:
            enforce_containment: If True, enforces ET ⊆ TC ⊆ WT pixelwise constraints.
            min_volume_dict: Dictionary mapping region names ('TC', 'WT', 'ET') to minimum voxel volumes. 
                             Components smaller than this are pruned.
        """
        self.enforce_containment = enforce_containment
        self.min_volume_dict = min_volume_dict or {"TC": 0, "WT": 0, "ET": 0}
        
    def refine(self, masks: torch.Tensor) -> torch.Tensor:
        """
        Refines a predicted mask tensor.
        Args:
            masks: Boolean tensor of shape [3, H, W, D] corresponding to [TC, WT, ET].
        Returns:
            Refined boolean tensor of shape [3, H, W, D].
        """
        # Ensure we are working with boolean CPU tensors for logic operations
        masks = masks.bool().cpu()
        
        tc = masks[0].clone()
        wt = masks[1].clone()
        et = masks[2].clone()
        
        # 1. Pixel-level Containment Constraint
        if self.enforce_containment:
            # TC must be a subset of WT
            tc = tc & wt
            # ET must be a subset of TC
            et = et & tc
            
        # 2. Graph/Component-level Volume Pruning
        # We use scipy.ndimage for fast 3D component extraction
        import scipy.ndimage as ndimage
        
        refined_masks = torch.stack([tc, wt, et], dim=0)
        region_names = ["TC", "WT", "ET"]
        
        for i, region in enumerate(region_names):
            min_vol = self.min_volume_dict.get(region, 0)
            if min_vol > 0:
                channel_np = refined_masks[i].numpy()
                labeled_array, num_features = ndimage.label(channel_np, structure=np.ones((3,3,3)))
                
                if num_features > 0:
                    # Calculate volumes using bincount (much faster than looping)
                    volumes = np.bincount(labeled_array.ravel())
                    
                    # Create a mask of components to keep
                    # volumes > min_vol. Note: volumes[0] is the background, we don't prune background.
                    keep_labels = np.where(volumes >= min_vol)[0]
                    
                    # Remove background (label 0) from keep_labels
                    keep_labels = keep_labels[keep_labels != 0]
                        
                    # Vectorized prune: np.isin is fast
                    pruned_np = np.isin(labeled_array, keep_labels)
                    refined_masks[i] = torch.from_numpy(pruned_np)
                    
        return refined_masks
