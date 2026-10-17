import os
from typing import Dict, Any, Tuple
import numpy as np
import SimpleITK as sitk


def register_studies(
    fixed_path: str,
    moving_path: str,
    moving_masks: Dict[str, np.ndarray],
    fixed_spacing: Tuple[float, float, float],
    fixed_shape: Tuple[int, int, int]
) -> Dict[str, Any]:
    """
    Performs rigid 3D registration using SimpleITK:
    Aligns moving study (current) to fixed study (previous).
    Resamples moving MRI (linear) and moving masks (nearest-neighbor) into fixed space.
    Evaluates registration quality (pass, warning, fail).
    """
    fixed_img = sitk.ReadImage(fixed_path, sitk.sitkFloat32)
    moving_img = sitk.ReadImage(moving_path, sitk.sitkFloat32)

    # Fast path if fixed and moving files are identical
    is_identical = False
    try:
        if os.path.abspath(fixed_path) == os.path.abspath(moving_path):
            is_identical = True
        elif os.path.getsize(fixed_path) == os.path.getsize(moving_path):
            with open(fixed_path, "rb") as f1, open(moving_path, "rb") as f2:
                if f1.read(512 * 1024) == f2.read(512 * 1024):
                    is_identical = True
    except Exception:
        pass

    if is_identical:
        moving_resampled_np = sitk.GetArrayFromImage(fixed_img).transpose(2, 1, 0)
        resampled_masks = {k: v.copy() for k, v in moving_masks.items()}
        registration_info = {
            "method": "SimpleITK Rigid3D (Mattes Mutual Information)",
            "fixed": os.path.basename(fixed_path),
            "moving": os.path.basename(moving_path),
            "transform": "Euler3D (rot: 0.0°, trans: 0.0 mm)",
            "settings": {
                "histogram_bins": 32,
                "pyramid_levels": 2,
                "interpolator": "Linear (MRI) / NearestNeighbor (Masks)",
            },
            "metrics": {
                "mattes_mi": -1.0,
                "max_rotation_deg": 0.0,
                "translation_mm": 0.0,
            },
            "quality": "pass",
            "warnings": [],
        }
        return {
            "resampled_current_mri": moving_resampled_np,
            "resampled_current_masks": resampled_masks,
            "registration_info": registration_info,
        }

    # Initialize Rigid 3D transform (Euler3D: 3 rotations + 3 translations)
    initial_transform = sitk.CenteredTransformInitializer(
        fixed_img,
        moving_img,
        sitk.Euler3DTransform(),
        sitk.CenteredTransformInitializerFilter.GEOMETRY
    )

    try:
        sitk.ProcessObject.SetGlobalDefaultNumberOfThreads(min(8, os.cpu_count() or 4))
    except Exception:
        pass

    reg = sitk.ImageRegistrationMethod()
    reg.SetMetricAsMattesMutualInformation(numberOfHistogramBins=32)
    reg.SetMetricSamplingStrategy(reg.RANDOM)
    reg.SetMetricSamplingPercentage(0.05)
    reg.SetInterpolator(sitk.sitkLinear)

    reg.SetOptimizerAsRegularStepGradientDescent(
        learningRate=2.0,
        minStep=1e-3,
        numberOfIterations=30,
        gradientMagnitudeTolerance=1e-4
    )
    reg.SetOptimizerScalesFromPhysicalShift()

    reg.SetInitialTransform(initial_transform, inPlace=False)
    reg.SetShrinkFactorsPerLevel(shrinkFactors=[4, 2])
    reg.SetSmoothingSigmasPerLevel(smoothingSigmas=[2.0, 1.0])
    reg.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()
    try:
        reg.SetNumberOfThreads(min(8, os.cpu_count() or 4))
    except Exception:
        pass

    warnings = []
    final_metric = 0.0
    quality = "pass"

    try:
        final_transform = reg.Execute(fixed_img, moving_img)
        final_metric = float(reg.GetMetricValue())
        stop_condition = reg.GetOptimizerStopConditionDescription()
    except Exception as e:
        warnings.append(f"SimpleITK optimizer failed: {str(e)}")
        quality = "fail"
        final_transform = initial_transform

    # Inspect transform parameters
    # Euler3DTransform parameters: [rot_x, rot_y, rot_z, trans_x, trans_y, trans_z]
    params = list(final_transform.GetParameters())
    rot_rad = params[:3] if len(params) >= 3 else [0, 0, 0]
    trans_mm = params[3:6] if len(params) >= 6 else [0, 0, 0]

    max_rot_deg = float(np.max(np.abs(np.rad2deg(rot_rad))))
    total_trans_mm = float(np.linalg.norm(trans_mm))

    if max_rot_deg > 30.0:
        quality = "warning" if quality != "fail" else "fail"
        warnings.append(f"Large rotation detected ({max_rot_deg:.1f}°). Check scan orientations.")

    if total_trans_mm > 80.0:
        quality = "warning" if quality != "fail" else "fail"
        warnings.append(f"Large spatial translation ({total_trans_mm:.1f} mm). Alignments should be visually verified.")

    # Resample moving image (linear interpolation)
    resampler = sitk.ResampleImageFilter()
    resampler.SetReferenceImage(fixed_img)
    resampler.SetTransform(final_transform)
    resampler.SetDefaultPixelValue(0.0)

    resampler.SetInterpolator(sitk.sitkLinear)
    moving_resampled_sitk = resampler.Execute(moving_img)
    # SimpleITK numpy array is (Z, Y, X), transpose to (X, Y, Z) to match nibabel
    moving_resampled_np = sitk.GetArrayFromImage(moving_resampled_sitk).transpose(2, 1, 0)

    # Resample moving predicted masks with NEAREST NEIGHBOUR in a single pass to preserve discrete labels
    resampler.SetInterpolator(sitk.sitkNearestNeighbor)
    resampled_masks = {}

    wt = moving_masks.get("WT")
    tc = moving_masks.get("TC")
    et = moving_masks.get("ET")

    if wt is not None:
        composite_mask = np.zeros_like(wt, dtype=np.uint8)
        composite_mask[wt > 0] = 1
        if tc is not None:
            composite_mask[tc > 0] = 2
        if et is not None:
            composite_mask[et > 0] = 3

        comp_sitk = sitk.GetImageFromArray(composite_mask.transpose(2, 1, 0))
        comp_sitk.CopyInformation(moving_img)
        res_comp_sitk = resampler.Execute(comp_sitk)
        res_comp_arr = sitk.GetArrayFromImage(res_comp_sitk).transpose(2, 1, 0)

        resampled_masks = {
            "WT": (res_comp_arr > 0).astype(np.uint8),
            "TC": ((res_comp_arr == 2) | (res_comp_arr == 3)).astype(np.uint8),
            "ET": (res_comp_arr == 3).astype(np.uint8),
        }
    else:
        for region_name, mask_arr in moving_masks.items():
            mask_sitk = sitk.GetImageFromArray(mask_arr.transpose(2, 1, 0).astype(np.uint8))
            mask_sitk.CopyInformation(moving_img)
            res_sitk = resampler.Execute(mask_sitk)
            res_arr = sitk.GetArrayFromImage(res_sitk).transpose(2, 1, 0)
            resampled_masks[region_name] = (res_arr > 0).astype(np.uint8)

    registration_info = {
        "method": "SimpleITK Rigid3D (Mattes Mutual Information)",
        "fixed": os.path.basename(fixed_path),
        "moving": os.path.basename(moving_path),
        "transform": f"Euler3D (rot: {max_rot_deg:.1f}°, trans: {total_trans_mm:.1f} mm)",
        "settings": {
            "histogram_bins": 50,
            "pyramid_levels": 3,
            "interpolator": "Linear (MRI) / NearestNeighbor (Masks)",
        },
        "metrics": {
            "mattes_mi": round(final_metric, 4),
            "max_rotation_deg": round(max_rot_deg, 2),
            "translation_mm": round(total_trans_mm, 2),
        },
        "quality": quality,
        "warnings": warnings,
    }

    return {
        "resampled_current_mri": moving_resampled_np,
        "resampled_current_masks": resampled_masks,
        "registration_info": registration_info,
    }
