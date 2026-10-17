import os
import random
import hashlib
from typing import Dict, Tuple, Optional, Any
import numpy as np
import torch
import nibabel as nib
from monai.networks.nets import SegResNet
from monai.inferers import sliding_window_inference

from backend.app.config import DEFAULT_MODEL_PATH

_MODEL_INSTANCE: Optional[SegResNet] = None
_MODEL_DEVICE: Optional[torch.device] = None
_SEGMENTATION_CACHE: Dict[str, Dict[str, Any]] = {}


def set_deterministic(seed: int = 42) -> None:
    """Set global seeds for deterministic reproducible inference."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def get_inference_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda:0")
    return torch.device("cpu")


def load_segmentation_model(model_path: str = DEFAULT_MODEL_PATH, device: Optional[torch.device] = None) -> SegResNet:
    global _MODEL_INSTANCE, _MODEL_DEVICE

    if device is None:
        device = get_inference_device()

    if _MODEL_INSTANCE is not None and _MODEL_DEVICE == device:
        return _MODEL_INSTANCE

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"MONAI SegResNet weights not found at: {model_path}")

    model = SegResNet(
        spatial_dims=3,
        in_channels=4,
        out_channels=3,
        init_filters=16,
        blocks_down=[1, 2, 2, 4],
        blocks_up=[1, 1, 1],
        dropout_prob=0.2,
    )

    weights = torch.load(model_path, map_location=device, weights_only=False)
    state_dict = weights.get("state_dict", weights)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    _MODEL_INSTANCE = model
    _MODEL_DEVICE = device
    return _MODEL_INSTANCE


def normalize_intensity(volume: np.ndarray) -> np.ndarray:
    """Nonzero z-score standardization: (x - mean) / (std + 1e-7)."""
    out = np.zeros_like(volume, dtype=np.float32)
    nz = volume > 0.0
    if np.any(nz):
        mean = float(np.mean(volume[nz]))
        std = float(np.std(volume[nz]))
        out[nz] = (volume[nz] - mean) / (std + 1e-7)
    return out


try:
    num_cpus = os.cpu_count() or 4
    torch.set_num_threads(num_cpus)
    torch.set_grad_enabled(False)
except Exception:
    pass


def run_study_segmentation(
    sequence_paths: Dict[str, str],
    model_path: str = DEFAULT_MODEL_PATH,
    device: Optional[torch.device] = None,
    deterministic: bool = True,
    cache_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Runs MONAI SegResNet on the 4 MRI sequences:
    Enforces channel ordering: [T1Gd, T1, T2, FLAIR]
    Returns label map (0, 1, 2, 4), binary subregions (WT, TC, ET), shape, affine, spacing.
    """
    if deterministic:
        set_deterministic(42)

    if device is None:
        device = get_inference_device()

    # Check disk cache first if cache_dir is specified
    disk_cache_file = None
    if cache_dir and os.path.isdir(cache_dir):
        disk_cache_file = os.path.join(cache_dir, "segmentation_cache.npz")
        if os.path.exists(disk_cache_file):
            try:
                with np.load(disk_cache_file, allow_pickle=True) as data:
                    label_map = data["label_map"]
                    return {
                        "label_map": label_map,
                        "subregions": {
                            "WT": data["subregion_WT"],
                            "TC": data["subregion_TC"],
                            "ET": data["subregion_ET"],
                        },
                        "shape": list(data["shape"]),
                        "affine": [list(r) for r in data["affine"]],
                        "spacing": list(data["spacing"]),
                    }
            except Exception:
                pass

    # Normalize key lookup
    key_map = {}
    for k, v in sequence_paths.items():
        lk = k.lower()
        if lk in ("t1", "t1gd", "t1c", "t2", "flair"):
            canon = "t1gd" if lk in ("t1gd", "t1c") else lk
            key_map[canon] = v

    # Order: [T1Gd, T1, T2, FLAIR]
    channel_order = ["t1gd", "t1", "t2", "flair"]
    for c in channel_order:
        if c not in key_map:
            raise ValueError(f"Missing required sequence for segmentation: {c.upper()}")

    # Check cache signature for instant retrieval
    cache_key = None
    try:
        sig_parts = []
        for c in channel_order:
            p = key_map[c]
            st = os.stat(p)
            sig_parts.append(f"{c}:{st.st_size}:{st.st_mtime}")
        cache_key = hashlib.sha256("_".join(sig_parts).encode()).hexdigest()
        if cache_key in _SEGMENTATION_CACHE:
            cached = _SEGMENTATION_CACHE[cache_key]
            return {
                "label_map": cached["label_map"].copy(),
                "subregions": {k: v.copy() for k, v in cached["subregions"].items()},
                "shape": list(cached["shape"]),
                "affine": [list(r) for r in cached["affine"]],
                "spacing": list(cached["spacing"]),
            }
    except Exception:
        cache_key = None

    ref_img = nib.load(key_map["t1gd"])
    ref_shape = ref_img.shape[:3]
    ref_affine = ref_img.affine.copy()
    ref_spacing = [float(z) for z in ref_img.header.get_zooms()[:3]]

    channels = []
    for c in channel_order:
        img = nib.load(key_map[c])
        arr = img.get_fdata(dtype=np.float32)
        if arr.shape[:3] != ref_shape:
            raise ValueError(f"Channel {c.upper()} shape {arr.shape[:3]} differs from reference {ref_shape}")
        channels.append(normalize_intensity(arr))

    # Fast foreground bounding box detection on numpy arrays
    fg_mask = (channels[0] != 0) | (channels[3] != 0)
    if np.any(fg_mask):
        nz = np.nonzero(fg_mask)
        margin = 2
        min_d = max(0, int(nz[0].min()) - margin)
        max_d = min(ref_shape[0], int(nz[0].max()) + margin + 1)
        min_h = max(0, int(nz[1].min()) - margin)
        max_h = min(ref_shape[1], int(nz[1].max()) + margin + 1)
        min_w = max(0, int(nz[2].min()) - margin)
        max_w = min(ref_shape[2], int(nz[2].max()) + margin + 1)
        channels_crop = [c[min_d:max_d, min_h:max_h, min_w:max_w] for c in channels]
    else:
        min_d, max_d, min_h, max_h, min_w, max_w = 0, ref_shape[0], 0, ref_shape[1], 0, ref_shape[2]
        channels_crop = channels

    # Tensor: (1, 4, D, H, W)
    stacked = np.stack(channels_crop, axis=0)
    tensor_crop = torch.from_numpy(stacked).unsqueeze(0).to(device)

    model = load_segmentation_model(model_path=model_path, device=device)

    # Forward pass with minimal padding
    orig_shape = tensor_crop.shape[2:]
    pad_d = (16 - orig_shape[0] % 16) % 16
    pad_h = (16 - orig_shape[1] % 16) % 16
    pad_w = (16 - orig_shape[2] % 16) % 16
    padded = torch.nn.functional.pad(tensor_crop, (0, pad_w, 0, pad_h, 0, pad_d))

    with torch.inference_mode():
        logits = model(padded)
        probs = torch.sigmoid(logits)
        probs_crop = probs[:, :, :orig_shape[0], :orig_shape[1], :orig_shape[2]].squeeze(0).cpu().numpy()

    # Reconstruct full volume
    probs_np = np.zeros((3, ref_shape[0], ref_shape[1], ref_shape[2]), dtype=np.float32)
    probs_np[:, min_d:max_d, min_h:max_h, min_w:max_w] = probs_crop

    # Channels: 0: TC, 1: WT, 2: ET
    tc_mask = probs_np[0] > 0.5
    wt_mask = probs_np[1] > 0.5
    et_mask = probs_np[2] > 0.5

    # Anatomical hierarchy consistency
    wt_mask = wt_mask | tc_mask | et_mask
    tc_mask = tc_mask | et_mask

    # BraTS 2021 label map:
    # 0: BG, 1: NCR (TC & ~ET), 2: ED (WT & ~TC), 4: ET
    label_map = np.zeros(ref_shape, dtype=np.uint8)
    label_map[wt_mask & (~tc_mask)] = 2
    label_map[tc_mask & (~et_mask)] = 1
    label_map[et_mask] = 4

    subregions = {
        "WT": wt_mask.astype(np.uint8),
        "TC": tc_mask.astype(np.uint8),
        "ET": et_mask.astype(np.uint8),
    }

    result = {
        "label_map": label_map,
        "subregions": subregions,
        "shape": list(ref_shape),
        "affine": [list(row) for row in ref_affine],
        "spacing": list(ref_spacing),
    }

    if cache_key is not None:
        _SEGMENTATION_CACHE[cache_key] = result

    if disk_cache_file is not None:
        try:
            np.savez_compressed(
                disk_cache_file,
                label_map=label_map,
                subregion_WT=subregions["WT"],
                subregion_TC=subregions["TC"],
                subregion_ET=subregions["ET"],
                shape=np.array(ref_shape),
                affine=ref_affine,
                spacing=np.array(ref_spacing),
            )
        except Exception:
            pass

    return result
