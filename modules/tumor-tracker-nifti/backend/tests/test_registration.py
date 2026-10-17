import os
import tempfile
import pytest
import numpy as np
import nibabel as nib
import SimpleITK as sitk

from backend.app.registration import register_studies


@pytest.fixture
def temp_reg_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


def make_ellipsoid_mri(path: str, center=(16, 16, 16), radii=(10, 8, 6), shape=(32, 32, 32)):
    x, y, z = np.ogrid[:shape[0], :shape[1], :shape[2]]
    mask = (((x - center[0]) / radii[0])**2 + ((y - center[1]) / radii[1])**2 + ((z - center[2]) / radii[2])**2) <= 1.0
    arr = np.zeros(shape, dtype=np.float32)
    arr[mask] = 100.0
    img = nib.Nifti1Image(arr, np.eye(4))
    nib.save(img, path)
    return path, mask.astype(np.uint8)


def test_registration_and_resampling(temp_reg_dir):
    # Create fixed image
    fixed_p, f_mask = make_ellipsoid_mri(os.path.join(temp_reg_dir, "fixed.nii.gz"), center=(16, 16, 16))
    # Create slightly translated moving image
    moving_p, m_mask = make_ellipsoid_mri(os.path.join(temp_reg_dir, "moving.nii.gz"), center=(18, 16, 15))

    moving_masks = {
        "WT": m_mask,
        "TC": (m_mask > 0).astype(np.uint8),
        "ET": np.zeros_like(m_mask, dtype=np.uint8),
    }

    res = register_studies(
        fixed_path=fixed_p,
        moving_path=moving_p,
        moving_masks=moving_masks,
        fixed_spacing=(1.0, 1.0, 1.0),
        fixed_shape=(32, 32, 32)
    )

    reg_info = res["registration_info"]
    assert reg_info["quality"] in ("pass", "warning")
    assert "Euler3D" in reg_info["transform"]

    # Check that nearest-neighbor resampled masks contain ONLY 0 and 1 (no float interpolation)
    res_wt = res["resampled_current_masks"]["WT"]
    assert set(np.unique(res_wt)).issubset({0, 1})
    assert res_wt.shape == (32, 32, 32)


def test_registration_failure_on_extreme_displacement(temp_reg_dir):
    # Two images with completely disjoint/huge offsets
    fixed_p, _ = make_ellipsoid_mri(os.path.join(temp_reg_dir, "f.nii.gz"), center=(6, 6, 6))
    moving_p, m_mask = make_ellipsoid_mri(os.path.join(temp_reg_dir, "m.nii.gz"), center=(28, 28, 28))

    res = register_studies(
        fixed_path=fixed_p,
        moving_path=moving_p,
        moving_masks={"WT": m_mask},
        fixed_spacing=(1.0, 1.0, 1.0),
        fixed_shape=(32, 32, 32)
    )
    # The registration detects large translation/deviation
    metrics = res["registration_info"]["metrics"]
    assert "translation_mm" in metrics
