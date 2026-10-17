import os
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
import nibabel as nib


class NiftiValidationError(Exception):
    def __init__(self, message: str, code: str = "validation_error"):
        super().__init__(message)
        self.message = message
        self.code = code


def validate_single_nifti(file_path: str, sequence_name: str) -> Dict[str, Any]:
    """
    Validates a single NIfTI file: format, header, dimensions, finite intensity numbers.
    """
    issues: List[Dict[str, str]] = []
    
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "missing_or_empty", "message": f"{sequence_name}: File is missing or 0 bytes."}],
            "shape": None,
            "affine": None,
            "spacing": None,
        }

    try:
        img = nib.load(file_path)
    except Exception as e:
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "corrupted_nifti", "message": f"{sequence_name}: Corrupted or invalid NIfTI header: {str(e)}"}],
            "shape": None,
            "affine": None,
            "spacing": None,
        }

    shape = list(img.shape)
    if len(shape) == 4 and shape[3] == 1:
        shape = shape[:3]
        issues.append({"level": "warning", "code": "squeezed_4d", "message": f"{sequence_name}: 4D volume with single time-frame squeezed to 3D."})
    elif len(shape) != 3:
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "non_3d_spatial", "message": f"{sequence_name}: Expected 3D spatial volume, got shape {tuple(img.shape)}."}],
            "shape": shape,
            "affine": None,
            "spacing": None,
        }

    if any(s < 8 for s in shape):
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "dimension_too_small", "message": f"{sequence_name}: Dimensions {shape} are unrealistically small."}],
            "shape": shape,
            "affine": None,
            "spacing": None,
        }

    # Spacing from header zoome
    zooms = img.header.get_zooms()[:3]
    spacing = [float(z) for z in zooms]
    if any(s <= 0 or not np.isfinite(s) for s in spacing):
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "invalid_spacing", "message": f"{sequence_name}: Non-positive or non-finite voxel spacing: {spacing}."}],
            "shape": shape,
            "affine": None,
            "spacing": spacing,
        }

    # Anisotropic spacing check
    s_min, s_max = min(spacing), max(spacing)
    if s_max / max(s_min, 1e-5) > 1.25:
        issues.append({
            "level": "warning",
            "code": "anisotropic_spacing",
            "message": f"{sequence_name}: Anisotropic voxel spacing {spacing} mm. Slice thickness differs from in-plane resolution."
        })

    # Affine check
    affine = img.affine
    if not np.all(np.isfinite(affine)):
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "invalid_affine", "message": f"{sequence_name}: Affine matrix contains NaN or Inf."}],
            "shape": shape,
            "affine": None,
            "spacing": spacing,
        }

    # Sample finite values
    try:
        data = img.get_fdata(dtype=np.float32)
        if not np.all(np.isfinite(data)):
            return {
                "sequence": sequence_name,
                "valid": False,
                "issues": [{"level": "error", "code": "nan_inf_voxels", "message": f"{sequence_name}: Volume contains non-finite voxels (NaN or Inf)."}],
                "shape": shape,
                "affine": [list(row) for row in affine],
                "spacing": spacing,
            }
        v_min, v_max = float(np.min(data)), float(np.max(data))
        if v_max <= v_min:
            issues.append({"level": "warning", "code": "constant_intensity", "message": f"{sequence_name}: Constant intensity range [{v_min}, {v_max}]."})
    except Exception as e:
        return {
            "sequence": sequence_name,
            "valid": False,
            "issues": [{"level": "error", "code": "read_error", "message": f"{sequence_name}: Could not read voxel data: {str(e)}"}],
            "shape": shape,
            "affine": [list(row) for row in affine],
            "spacing": spacing,
        }

    valid = not any(i["level"] == "error" for i in issues)
    return {
        "sequence": sequence_name,
        "valid": valid,
        "issues": issues,
        "shape": shape,
        "affine": [list(row) for row in affine],
        "spacing": spacing,
    }


def validate_study_collection(
    file_paths: Dict[str, str],
    expert_mask_path: Optional[str] = None
) -> Tuple[bool, List[Dict[str, str]], Dict[str, Any]]:
    """
    Validates the complete 4-sequence study:
    T1, T1Gd, T2, FLAIR, plus optional expert mask.
    Enforces shared spatial grid across all sequences within the study.
    """
    normalized_keys = {}
    for k, v in file_paths.items():
        lk = k.lower()
        if lk in ("t1", "t1gd", "t1c", "t2", "flair"):
            canon = "T1Gd" if lk in ("t1gd", "t1c") else lk.upper()
            if lk == "flair":
                canon = "FLAIR"
            normalized_keys[canon] = v

    required = ["T1", "T1Gd", "T2", "FLAIR"]
    missing = [r for r in required if r not in normalized_keys]
    issues: List[Dict[str, str]] = []

    if missing:
        issues.append({
            "level": "error",
            "code": "missing_sequences",
            "message": f"Study is missing required sequences: {', '.join(missing)}. All 4 modalities (T1, T1Gd, T2, FLAIR) are required."
        })
        return False, issues, {}

    # Validate each sequence
    seq_reports = {}
    reference_shape = None
    reference_affine = None
    reference_spacing = None
    all_valid = True

    for seq in required:
        rep = validate_single_nifti(normalized_keys[seq], seq)
        seq_reports[seq] = rep
        issues.extend(rep["issues"])
        if not rep["valid"]:
            all_valid = False
        else:
            if reference_shape is None:
                reference_shape = rep["shape"]
                reference_affine = np.array(rep["affine"])
                reference_spacing = rep["spacing"]
            else:
                # Compare geometry to reference
                if rep["shape"] != reference_shape:
                    all_valid = False
                    issues.append({
                        "level": "error",
                        "code": "shape_mismatch",
                        "message": f"Geometry mismatch: {seq} shape {rep['shape']} does not match reference shape {reference_shape}."
                    })
                
                aff_diff = np.max(np.abs(np.array(rep["affine"]) - reference_affine))
                if aff_diff > 0.05:
                    all_valid = False
                    issues.append({
                        "level": "error",
                        "code": "affine_mismatch",
                        "message": f"Geometry mismatch: {seq} coordinate affine deviates from reference by max {aff_diff:.3f} mm."
                    })

    # Validate expert mask if present
    expert_valid = True
    if expert_mask_path and os.path.exists(expert_mask_path):
        m_rep = validate_single_nifti(expert_mask_path, "ExpertMask")
        if not m_rep["valid"]:
            all_valid = False
            expert_valid = False
            issues.extend(m_rep["issues"])
        elif reference_shape is not None:
            if m_rep["shape"] != reference_shape:
                all_valid = False
                expert_valid = False
                issues.append({
                    "level": "error",
                    "code": "expert_shape_mismatch",
                    "message": f"Expert mask shape {m_rep['shape']} does not match MRI study shape {reference_shape}."
                })

    info = {
        "shape": reference_shape,
        "affine": [list(row) for row in reference_affine] if reference_affine is not None else None,
        "spacing": reference_spacing,
        "has_expert_mask": bool(expert_mask_path and expert_valid),
        "sequence_reports": seq_reports,
    }

    return all_valid, issues, info
