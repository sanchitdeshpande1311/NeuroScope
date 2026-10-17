import base64
from typing import Dict, Any, Tuple
import numpy as np


def pack_visualization_grid(
    shape: Tuple[int, int, int],
    spacing: Tuple[float, float, float],
    affine: np.ndarray,
    prev_masks: Dict[str, np.ndarray],
    cur_resampled_masks: Dict[str, np.ndarray],
    prev_mri: np.ndarray,
    cur_resampled_mri: np.ndarray
) -> Dict[str, Any]:
    """
    Constructs the compact visualization payload in previous reference space.
    Voxel order: Fortran order (x fastest: x + y*nx + z*nx*ny).
    Mask byte encoding:
      bit 0: prev WT (1)
      bit 1: prev TC (2)
      bit 2: prev ET (4)
      bit 3: cur WT  (8)
      bit 4: cur TC  (16)
      bit 5: cur ET  (32)
    Background images: 8-bit uint8 intensity images (0-255).
    """
    nx, ny, nz = shape
    packed = np.zeros((nx, ny, nz), dtype=np.uint8)

    # Previous masks (in native previous space)
    p_wt = prev_masks.get("WT")
    p_tc = prev_masks.get("TC")
    p_et = prev_masks.get("ET")

    if p_wt is not None:
        packed |= ((p_wt > 0).astype(np.uint8) * 1)
    if p_tc is not None:
        packed |= ((p_tc > 0).astype(np.uint8) * 2)
    if p_et is not None:
        packed |= ((p_et > 0).astype(np.uint8) * 4)

    # Current masks (resampled into previous reference space)
    c_wt = cur_resampled_masks.get("WT")
    c_tc = cur_resampled_masks.get("TC")
    c_et = cur_resampled_masks.get("ET")

    if c_wt is not None:
        packed |= ((c_wt > 0).astype(np.uint8) * 8)
    if c_tc is not None:
        packed |= ((c_tc > 0).astype(np.uint8) * 16)
    if c_et is not None:
        packed |= ((c_et > 0).astype(np.uint8) * 32)

    # Base64 encode masks in Fortran order
    masks_b64 = base64.b64encode(packed.tobytes(order="F")).decode("ascii")

    # Normalize backgrounds to uint8 0-255 using fast sampled percentiles
    def norm_u8(arr: np.ndarray) -> str:
        # Sample every 2nd voxel across all dimensions for fast percentile computation
        sample = arr[::2, ::2, ::2]
        nz = sample[sample > 0]
        if len(nz) > 200:
            p1, p99 = float(np.percentile(nz, 1)), float(np.percentile(nz, 99))
        else:
            p1, p99 = float(np.min(arr)), float(np.max(arr))
        if p99 > p1:
            clipped = np.clip(arr, p1, p99)
            u8 = ((clipped - p1) / (p99 - p1) * 255.0).astype(np.uint8)
        else:
            u8 = np.zeros_like(arr, dtype=np.uint8)
        return base64.b64encode(u8.tobytes(order="F")).decode("ascii")

    bg_prev_b64 = norm_u8(prev_mri)
    bg_cur_b64 = norm_u8(cur_resampled_mri)

    return {
        "shape": list(shape),
        "spacing": list(spacing),
        "affine": [list(row) for row in affine],
        "masks": masks_b64,
        "background_previous": bg_prev_b64,
        "background_current": bg_cur_b64,
    }


def compute_spatial_change_counts(
    prev_mask: np.ndarray,
    cur_resampled_mask: np.ndarray
) -> Dict[str, Any]:
    """
    Computes voxel overlap statistics between aligned binary masks:
    Shared, Previous-only, Current-only, and Dice coefficient.
    """
    p = prev_mask > 0
    c = cur_resampled_mask > 0

    shared = int(np.count_nonzero(p & c))
    current_only = int(np.count_nonzero((~p) & c))
    previous_only = int(np.count_nonzero(p & (~c)))

    denom = 2 * shared + current_only + previous_only
    dice = float((2.0 * shared) / denom) if denom > 0 else None

    return {
        "shared": shared,
        "currentOnly": current_only,
        "previousOnly": previous_only,
        "dice": round(dice, 4) if dice is not None else None,
    }
