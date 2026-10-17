"""
NeuroScope 3D - validated, geometry-correct inference pipeline.

Flow (every step runs on the current uploaded case; nothing is looked up):
    validate_case()      -> per-file + cross-file checks (format, 3D, finite, non-constant,
                            shapes, affines, size); raises InputValidationError on failure
    input_sanity()       -> reference-range checks for skull-stripping / brain-like input
    Segmenter.predict()  -> training-parity preprocessing (RAS, 1 mm, nonzero z-score),
                            sliding-window UNet inference, sigmoid probabilities,
                            trilinear resampling of probabilities back onto the ORIGINAL
                            voxel grid via the two affines, threshold 0.5,
                            hierarchical TC/WT/ET -> BraTS labels {0,1,2,4}
    save_segmentation()  -> uint8 NIfTI on the reference grid with the reference affine

Model input order (as used in training, ml/preprocessing.py + metadata manifest):
    channel 0 = t1n (T1), 1 = t1c (T1Gd), 2 = t2w (T2), 3 = t2f (FLAIR)
Model output channels (sigmoid, multi-label): 0 = TC, 1 = WT, 2 = ET
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import time
from dataclasses import dataclass, field
from pathlib import Path

import nibabel as nib
import numpy as np
import torch
from scipy import ndimage

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Order matters: it is the model's input channel order.
MODALITIES = ("t1n", "t1c", "t2w", "t2f")
MODALITY_NAMES = {"t1n": "T1", "t1c": "T1Gd", "t2w": "T2", "t2f": "FLAIR"}
MAX_FILE_BYTES = 1024 ** 3  # 1 GiB upload limit per file
MIN_DIM = 8  # smaller than this along any axis is treated as 2D / unsupported
AFFINE_ATOL_MM = 1e-2  # cross-sequence affine agreement tolerance (mm / direction cosine)

DEFAULT_CHECKPOINT = PROJECT_ROOT / "models" / "baseline_checkpoints" / "best_metric_model.pth"
SANITY_REFERENCE = PROJECT_ROOT / "configs" / "input_sanity_reference.json"

LABEL_NCR, LABEL_ED, LABEL_ET = 1, 2, 4


class InputValidationError(Exception):
    """Raised when an input must be refused. `code` is stable for tests/UI."""

    def __init__(self, code: str, message: str, modality: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.modality = modality

    def to_dict(self):
        return {"code": self.code, "message": self.message, "modality": self.modality}


# --------------------------------------------------------------------------- validation
@dataclass
class ValidatedCase:
    data: dict            # modality -> float32 array (original grid)
    affine: np.ndarray    # reference affine (t1c)
    header: nib.Nifti1Header
    shape: tuple
    zooms: tuple          # voxel spacing in mm from the reference header
    sha256: dict
    warnings: list = field(default_factory=list)


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check_file_bytes(path: Path, modality: str):
    """Cheap checks before parsing: size, gzip magic, NIfTI header magic."""
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise InputValidationError("file_too_large",
                                   f"{MODALITY_NAMES.get(modality, modality)} file is {size / 1024**3:.2f} GB; the limit is 1 GB.",
                                   modality)
    if size == 0:
        raise InputValidationError("empty_file", "File is empty.", modality)
    with open(path, "rb") as f:
        head = f.read(4)
    name = path.name.lower()
    if name.endswith(".gz") or head[:2] == b"\x1f\x8b":
        if head[:2] != b"\x1f\x8b":
            raise InputValidationError("not_gzip", "File is named .nii.gz but is not gzip-compressed NIfTI data.", modality)
        try:  # decompress the whole stream so truncation / CRC errors are caught here
            with gzip.open(path, "rb") as g:
                hdr = g.read(348)
                while g.read(1 << 24):
                    pass
        except (OSError, EOFError) as e:
            raise InputValidationError("corrupt_gzip", f"Corrupt or truncated gzip stream ({type(e).__name__}).", modality)
    else:
        with open(path, "rb") as f:
            hdr = f.read(348)
    if len(hdr) < 348:
        raise InputValidationError("not_nifti", "File is too short to be a NIfTI image.", modality)
    sizeof_hdr_le = int.from_bytes(hdr[:4], "little")
    sizeof_hdr_be = int.from_bytes(hdr[:4], "big")
    if 348 not in (sizeof_hdr_le, sizeof_hdr_be) and 540 not in (sizeof_hdr_le, sizeof_hdr_be):
        raise InputValidationError("not_nifti", "File does not contain a valid NIfTI header.", modality)


def load_volume(path: Path, modality: str):
    check_file_bytes(path, modality)
    try:
        img = nib.load(str(path))
        if not isinstance(img, (nib.Nifti1Image, nib.Nifti2Image)):
            raise InputValidationError("not_nifti", "File is not a NIfTI-1/NIfTI-2 image.", modality)
        shape = img.shape
        if len(shape) == 4 and shape[3] == 1:
            data = np.asarray(img.dataobj, dtype=np.float32)[..., 0]
        elif len(shape) == 3:
            data = np.asarray(img.dataobj, dtype=np.float32)
        else:
            raise InputValidationError("not_3d", f"Expected a 3D volume, got shape {tuple(shape)}.", modality)
    except InputValidationError:
        raise
    except (EOFError, OSError, ValueError, gzip.BadGzipFile, nib.filebasedimages.ImageFileError) as e:
        raise InputValidationError("unreadable", f"Could not read NIfTI data ({type(e).__name__}).", modality)
    if min(data.shape) < MIN_DIM:
        raise InputValidationError("not_3d", f"Volume shape {data.shape} is effectively 2D (an axis has < {MIN_DIM} voxels).", modality)
    if not np.all(np.isfinite(data)):
        raise InputValidationError("non_finite", "Volume contains NaN or infinite values.", modality)
    if not np.any(data):
        raise InputValidationError("all_zero", "Volume is entirely zero.", modality)
    if float(data.max()) == float(data.min()):
        raise InputValidationError("constant", "Volume has a single constant intensity.", modality)
    aff = img.affine
    if not np.all(np.isfinite(aff)) or abs(np.linalg.det(aff[:3, :3])) < 1e-6:
        raise InputValidationError("bad_affine", "Image affine is singular or non-finite.", modality)
    zooms = tuple(float(z) for z in img.header.get_zooms()[:3])
    if min(zooms) <= 0:
        raise InputValidationError("bad_spacing", f"Invalid voxel spacing {zooms}.", modality)
    return img, data


def validate_case(paths: dict) -> ValidatedCase:
    missing = [m for m in MODALITIES if m not in paths or paths[m] is None]
    if missing:
        names = ", ".join(MODALITY_NAMES[m] for m in missing)
        raise InputValidationError("missing_modality", f"Missing required sequence(s): {names}. All four (T1, T1Gd, T2, FLAIR) are required.")
    imgs, data = {}, {}
    for m in MODALITIES:
        imgs[m], data[m] = load_volume(Path(paths[m]), m)
    ref = imgs["t1c"]
    for m in MODALITIES:
        if data[m].shape != data["t1c"].shape:
            raise InputValidationError("shape_mismatch",
                                       f"Shape mismatch: {MODALITY_NAMES[m]} is {data[m].shape} but T1Gd is {data['t1c'].shape}. Sequences must be co-registered on one voxel grid.", m)
        if not np.allclose(imgs[m].affine, ref.affine, atol=AFFINE_ATOL_MM):
            raise InputValidationError("affine_mismatch",
                                       f"{MODALITY_NAMES[m]} has a different affine (voxel-to-world mapping) from T1Gd. Sequences must be co-registered on one voxel grid.", m)
    zooms = tuple(float(z) for z in ref.header.get_zooms()[:3])
    return ValidatedCase(
        data=data, affine=ref.affine.copy(), header=ref.header.copy(), shape=data["t1c"].shape,
        zooms=zooms, sha256={m: sha256_file(paths[m]) for m in MODALITIES},
    )


# --------------------------------------------------------------------------- input sanity
def sanity_features(case: ValidatedCase) -> dict:
    """Simple descriptors of the four volumes, compared with ranges measured on training cases."""
    stack = np.stack([case.data[m] for m in MODALITIES])
    fg = np.any(stack != 0, axis=0)
    vox_ml = float(np.prod(case.zooms)) / 1000.0
    feats = {
        "foreground_fraction": float(fg.mean()),
        "foreground_volume_ml": float(fg.sum() * vox_ml),
    }
    if fg.sum() < 1000:
        return feats
    idx = np.argwhere(fg)
    ext_vox = idx.max(0) - idx.min(0) + 1
    ext_mm = sorted(float(e * z) for e, z in zip(ext_vox, case.zooms))
    feats["extent_mm_min"], feats["extent_mm_mid"], feats["extent_mm_max"] = ext_mm
    # Fraction of exact zeros on the six faces of the field of view: ~1 for skull-stripped data
    faces = [stack[:, 0], stack[:, -1], stack[:, :, 0], stack[:, :, -1], stack[:, :, :, 0], stack[:, :, :, -1]]
    feats["outer_zero_fraction"] = float(np.mean([np.mean(f == 0) for f in faces]))
    # Fill ratio of the foreground inside its bounding ellipsoid (brain ~ ellipsoid)
    feats["ellipsoid_fill"] = float(fg.sum() / (math.pi / 6 * np.prod(ext_vox)))
    # Inter-sequence correlation inside foreground (tissue contrast relationships)
    rng = np.random.default_rng(0)
    sel = idx[rng.choice(len(idx), size=min(len(idx), 200000), replace=False)]
    v = stack[:, sel[:, 0], sel[:, 1], sel[:, 2]]
    v = (v - v.mean(1, keepdims=True)) / (v.std(1, keepdims=True) + 1e-6)
    c = (v @ v.T) / v.shape[1]
    feats["corr_t1_t2"] = float(c[0, 2])
    feats["corr_t2_flair"] = float(c[2, 3])
    feats["corr_t1_t1gd"] = float(c[0, 1])
    return feats


def input_sanity(case: ValidatedCase, reference_path: Path = SANITY_REFERENCE) -> dict:
    """
    Returns {"status": "ok"|"warn"|"refuse", "issues": [...], "features": {...}}.
    "refuse" only for inputs that are clearly outside what the model was trained on
    (no zero background => not skull-stripped; foreground volume/extent far outside
    the brain range). This is a heuristic reference-range check, NOT a validated
    brain detector; it is reported as such.
    """
    feats = sanity_features(case)
    issues, status = [], "ok"
    ref = json.loads(Path(reference_path).read_text()) if Path(reference_path).exists() else None

    def flag(level, code, msg):
        nonlocal status
        issues.append({"level": level, "code": code, "message": msg})
        if level == "refuse" or (level == "warn" and status == "ok"):
            status = "refuse" if level == "refuse" else status if status == "refuse" else "warn"

    if feats["foreground_fraction"] > 0.6 or feats.get("outer_zero_fraction", 1.0) < 0.5:
        flag("refuse", "not_skull_stripped",
             "The volumes have no zero-valued background around the head. The model was trained only on "
             "skull-stripped, co-registered BraTS-style data; this input appears not skull-stripped.")
    if "extent_mm_max" not in feats:
        flag("refuse", "no_foreground", "Too few non-zero voxels to be a brain volume.")
        return {"status": status, "issues": issues, "features": feats}
    if ref:
        out = []
        for k, (lo, hi) in ref["ranges"].items():
            if k in feats and not (lo <= feats[k] <= hi):
                out.append(f"{k}={feats[k]:.3g} (reference {lo:.3g}..{hi:.3g})")
        hard = [k for k in ref.get("hard_features", []) if k in feats and not (ref["ranges"][k][0] <= feats[k] <= ref["ranges"][k][1])]
        if len(hard) >= 1 and len(out) >= 2:
            flag("refuse", "not_brain_like",
                 "Input does not resemble the skull-stripped brain MRI the model was trained on: " + "; ".join(out))
        elif out:
            flag("warn", "atypical_input", "Input is atypical compared with training data: " + "; ".join(out) +
                 ". Treat the prediction with extra caution.")
    else:
        flag("warn", "no_reference", "Sanity reference ranges not available; only basic checks applied.")
    return {"status": status, "issues": issues, "features": feats}


# --------------------------------------------------------------------------- model
@dataclass
class ModelInfo:
    name: str = "NeuroScope3D-UNet (MONAI UNet, 4->3, sigmoid TC/WT/ET)"
    architecture: str = "monai.networks.nets.UNet(spatial_dims=3, in_channels=4, out_channels=3, channels=(16,32,64,128,256), strides=(2,2,2,2), num_res_units=2)"
    version: str = "baseline_checkpoints/best_metric_model.pth"
    training_data: str = "BraTS 2023 GLI training data (subset listed in data/splits/train.json), trained by the project team"
    weights_licence: str = "Project-trained weights; no separate licence issued (see docs/MODEL_CARD.md). Training data under BraTS/Synapse data use terms."
    code_licence: str = "MONAI: Apache-2.0"
    preprocessing: str = "Orientation RAS; resample 1.0 mm isotropic (bilinear); per-channel z-score on non-zero voxels"
    inference: str = "sliding window ROI 128^3, overlap 0.25, gaussian=constant, sw_batch_size 2, fp32, sigmoid, threshold 0.5 on original grid"


def volumes_ml(seg: np.ndarray, zooms) -> dict:
    """Physical volumes from voxel counts: count * sx * sy * sz / 1000 (mm^3 -> mL)."""
    vox_ml = float(np.prod([float(z) for z in zooms[:3]])) / 1000.0
    et = int(np.count_nonzero(seg == LABEL_ET))
    tc = et + int(np.count_nonzero(seg == LABEL_NCR))
    wt = tc + int(np.count_nonzero(seg == LABEL_ED))
    return {"WT": wt * vox_ml, "TC": tc * vox_ml, "ET": et * vox_ml,
            "voxels": {"WT": wt, "TC": tc, "ET": et}, "voxel_volume_ml": vox_ml}


def regions_to_labels(tc: np.ndarray, wt: np.ndarray, et: np.ndarray) -> np.ndarray:
    """
    Nested region masks -> BraTS semantic labels. Hierarchy is enforced upward
    (ET implies TC implies WT), the standard BraTS region-to-label conversion:
        4 = ET, 1 = TC \\ ET (NCR/NET), 2 = WT \\ TC (edema), 0 = background.
    """
    et = et.astype(bool)
    tc = tc.astype(bool) | et
    wt = wt.astype(bool) | tc
    seg = np.zeros(wt.shape, dtype=np.uint8)
    seg[wt] = LABEL_ED
    seg[tc] = LABEL_NCR
    seg[et] = LABEL_ET
    return seg


def labels_to_regions(seg: np.ndarray, et_label: int = LABEL_ET):
    """BraTS labels -> (WT, TC, ET). et_label=3 for BraTS 2023 GLI ground truth."""
    seg = np.asarray(seg)
    et = seg == et_label
    tc = et | (seg == LABEL_NCR)
    wt = tc | (seg == LABEL_ED)
    return wt, tc, et


def remove_small_components(seg: np.ndarray, zooms, min_volume_mm3: float = 10.0) -> np.ndarray:
    """Optional refinement: drop WT connected components (26-conn) smaller than min_volume_mm3.
    Labels inside removed components are set to 0; hierarchy is preserved."""
    vox_mm3 = float(np.prod(zooms))
    min_vox = max(1, int(math.ceil(min_volume_mm3 / vox_mm3)))
    lab, n = ndimage.label(seg > 0, structure=np.ones((3, 3, 3)))
    if n == 0:
        return seg.copy()
    sizes = np.bincount(lab.ravel())
    keep = sizes >= min_vox
    keep[0] = False
    out = seg.copy()
    out[~keep[lab]] = 0
    return out


class Segmenter:
    def __init__(self, checkpoint: Path = DEFAULT_CHECKPOINT, device: str | None = None,
                 sw_batch_size: int = 2, overlap: float = 0.25):
        from monai.networks.nets import UNet
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True
        self.checkpoint = Path(checkpoint)
        if not self.checkpoint.exists():
            raise FileNotFoundError(f"Checkpoint not found: {self.checkpoint}")
        self.model = UNet(spatial_dims=3, in_channels=4, out_channels=3,
                          channels=(16, 32, 64, 128, 256), strides=(2, 2, 2, 2), num_res_units=2)
        self.model.load_state_dict(torch.load(self.checkpoint, map_location="cpu", weights_only=True))
        self.model.to(self.device).eval()
        self.checkpoint_sha256 = sha256_file(self.checkpoint)
        self.sw_batch_size, self.overlap = sw_batch_size, overlap
        self.info = ModelInfo()

    def preprocess(self, case: ValidatedCase):
        """Same transforms as ml/preprocessing.get_val_transforms (minus label handling)."""
        from monai.data import MetaTensor
        from monai.transforms import Compose, NormalizeIntensity, Orientation, Spacing
        img = MetaTensor(torch.from_numpy(np.stack([case.data[m] for m in MODALITIES]).astype(np.float32)),
                         affine=torch.as_tensor(case.affine, dtype=torch.float64))
        tf = Compose([
            Orientation(axcodes="RAS"),
            Spacing(pixdim=(1.0, 1.0, 1.0), mode="bilinear"),
            NormalizeIntensity(nonzero=True, channel_wise=True),
        ])
        out = tf(img)
        return out.as_tensor().float(), np.asarray(out.affine, dtype=np.float64)

    @torch.no_grad()
    def predict_probs(self, x: torch.Tensor) -> np.ndarray:
        from monai.inferers import sliding_window_inference
        logits = sliding_window_inference(x.unsqueeze(0).to(self.device), roi_size=(128, 128, 128),
                                          sw_batch_size=self.sw_batch_size, predictor=self.model,
                                          overlap=self.overlap, mode="constant")
        return torch.sigmoid(logits)[0].float().cpu().numpy()

    @staticmethod
    def resample_to_reference(arr: np.ndarray, src_affine: np.ndarray, ref_affine: np.ndarray,
                              ref_shape: tuple, order: int = 1) -> np.ndarray:
        """Resample a [C, ...] array from the processed grid onto the original grid using world coordinates."""
        m = np.linalg.inv(src_affine) @ ref_affine  # original voxel -> processed voxel
        out = np.empty((arr.shape[0],) + tuple(ref_shape), dtype=np.float32)
        for c in range(arr.shape[0]):
            out[c] = ndimage.affine_transform(arr[c], m[:3, :3], offset=m[:3, 3], output_shape=ref_shape,
                                              order=order, mode="constant", cval=0.0)
        return out

    def predict(self, case: ValidatedCase) -> dict:
        t = {}
        t0 = time.perf_counter()
        x, proc_affine = self.preprocess(case)
        t["preprocess_s"] = time.perf_counter() - t0
        t0 = time.perf_counter()
        probs = self.predict_probs(x)
        if self.device.type == "cuda":
            torch.cuda.synchronize()
        t["inference_s"] = time.perf_counter() - t0
        t0 = time.perf_counter()
        probs_orig = self.resample_to_reference(probs, proc_affine, case.affine, case.shape)
        tc, wt, et = probs_orig[0] > 0.5, probs_orig[1] > 0.5, probs_orig[2] > 0.5
        seg = regions_to_labels(tc, wt, et)
        t["postprocess_s"] = time.perf_counter() - t0
        return {"seg": seg, "timings": t, "processed_shape": tuple(x.shape[1:])}


def save_segmentation(seg: np.ndarray, case: ValidatedCase, path: Path) -> Path:
    """Write uint8 labels on the reference grid with the reference affine; verify by reloading."""
    hdr = case.header.copy()
    hdr.set_data_dtype(np.uint8)
    img = nib.Nifti1Image(seg.astype(np.uint8), case.affine, header=hdr)
    img.header.set_slope_inter(1, 0)
    qcode = int(case.header["qform_code"]) or 1
    scode = int(case.header["sform_code"]) or 1
    img.set_qform(case.affine, code=qcode)
    img.set_sform(case.affine, code=scode)
    nib.save(img, str(path))
    chk = nib.load(str(path))
    d = np.asarray(chk.dataobj)
    if chk.shape != tuple(case.shape) or not np.allclose(chk.affine, case.affine, atol=1e-4):
        raise RuntimeError("Output NIfTI geometry verification failed.")
    if not set(np.unique(d).tolist()) <= {0, 1, 2, 4}:
        raise RuntimeError("Output NIfTI contains unexpected labels.")
    return path


def dice(a, b) -> float:
    a, b = a.astype(bool), b.astype(bool)
    s = a.sum() + b.sum()
    return 1.0 if s == 0 else float(2 * np.logical_and(a, b).sum() / s)


def sensitivity(pred, ref) -> float:
    pred, ref = pred.astype(bool), ref.astype(bool)
    return float("nan") if ref.sum() == 0 else float(np.logical_and(pred, ref).sum() / ref.sum())


def compare_to_reference(seg: np.ndarray, ref_seg: np.ndarray, zooms, ref_et_label: int = LABEL_ET) -> dict:
    p = dict(zip(("WT", "TC", "ET"), labels_to_regions(seg)))
    r = dict(zip(("WT", "TC", "ET"), labels_to_regions(ref_seg, ref_et_label)))
    vox_ml = float(np.prod(zooms)) / 1000.0
    out = {}
    for k in ("WT", "TC", "ET"):
        tp = int(np.logical_and(p[k], r[k]).sum())
        fp = int(np.logical_and(p[k], ~r[k]).sum())
        fn = int(np.logical_and(~p[k], r[k]).sum())
        out[k] = {"dice": dice(p[k], r[k]), "sensitivity": sensitivity(p[k], r[k]),
                  "tp_voxels": tp, "fp_voxels": fp, "fn_voxels": fn,
                  "pred_ml": float(p[k].sum() * vox_ml), "ref_ml": float(r[k].sum() * vox_ml)}
    return out


# --------------------------------------------------------------------------- per-file / set checks (upload UI)
def describe_volume(path: Path, modality: str) -> dict:
    """Validate ONE file (same checks as validate_case) and return its geometry for the set check."""
    img, data = load_volume(Path(path), modality)
    return {"modality": modality, "shape": list(data.shape), "zooms": [float(z) for z in img.header.get_zooms()[:3]],
            "affine": np.round(img.affine, 6).tolist(), "axcodes": "".join(nib.aff2axcodes(img.affine)),
            "dtype": str(img.get_data_dtype()), "min": float(data.min()), "max": float(data.max()),
            "nonzero_fraction": float(np.count_nonzero(data) / data.size)}


def check_set(summaries: dict) -> list:
    """Cross-sequence compatibility from describe_volume() summaries. Same rules as validate_case.
    Returns a list of {code, message, modalities} issues (empty list = compatible)."""
    issues = []
    missing = [m for m in MODALITIES if m not in summaries]
    if missing:
        issues.append({"code": "missing_modality", "modalities": missing,
                       "message": "Missing: " + ", ".join(MODALITY_NAMES[m] for m in missing) + "."})
    present = [m for m in MODALITIES if m in summaries]
    if not present:
        return issues
    ref = "t1c" if "t1c" in summaries else present[0]
    for m in present:
        if m == ref:
            continue
        a, b = summaries[m], summaries[ref]
        if list(a["shape"]) != list(b["shape"]):
            issues.append({"code": "shape_mismatch", "modalities": [m, ref],
                           "message": f"{MODALITY_NAMES[m]} shape {tuple(a['shape'])} differs from {MODALITY_NAMES[ref]} {tuple(b['shape'])}."})
        elif not np.allclose(np.array(a["affine"]), np.array(b["affine"]), atol=AFFINE_ATOL_MM):
            issues.append({"code": "affine_mismatch", "modalities": [m, ref],
                           "message": f"{MODALITY_NAMES[m]} ({a['axcodes']}) and {MODALITY_NAMES[ref]} ({b['axcodes']}) have different voxel-to-world affines; they are not on the same grid."})
    return issues
