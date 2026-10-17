import os
import tempfile
import pytest
import numpy as np
import nibabel as nib

from backend.app.validation import (
    validate_single_nifti,
    validate_study_collection,
)


@pytest.fixture
def temp_nifti_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


def make_nifti(path: str, shape=(32, 32, 32), affine=None, spacing=(1.0, 1.0, 1.0), fill=50.0):
    if affine is None:
        affine = np.diag([spacing[0], spacing[1], spacing[2], 1.0])
    data = np.full(shape, fill, dtype=np.float32)
    img = nib.Nifti1Image(data, affine)
    img.header.set_zooms(spacing)
    nib.save(img, path)
    return path


def test_invalid_files(temp_nifti_dir):
    # 1. Non-existent file
    rep = validate_single_nifti(os.path.join(temp_nifti_dir, "missing.nii.gz"), "T1")
    assert not rep["valid"]
    assert any(i["code"] == "missing_or_empty" for i in rep["issues"])

    # 2. Corrupted file
    corrupt_p = os.path.join(temp_nifti_dir, "corrupt.nii.gz")
    with open(corrupt_p, "wb") as f:
        f.write(b"NOT_A_NIFTI_HEADER_DATA")
    rep = validate_single_nifti(corrupt_p, "T1")
    assert not rep["valid"]
    assert any(i["code"] == "corrupted_nifti" for i in rep["issues"])

    # 3. 2D image (non-3D)
    img_2d_p = os.path.join(temp_nifti_dir, "flat_2d.nii.gz")
    img_2d = nib.Nifti1Image(np.zeros((32, 32), dtype=np.float32), np.eye(4))
    nib.save(img_2d, img_2d_p)
    rep = validate_single_nifti(img_2d_p, "T1")
    assert not rep["valid"]
    assert any(i["code"] == "non_3d_spatial" for i in rep["issues"])

    # 4. NaN / Inf voxels
    nan_p = os.path.join(temp_nifti_dir, "nan.nii.gz")
    nan_data = np.zeros((16, 16, 16), dtype=np.float32)
    nan_data[4, 4, 4] = np.nan
    nib.save(nib.Nifti1Image(nan_data, np.eye(4)), nan_p)
    rep = validate_single_nifti(nan_p, "T1")
    assert not rep["valid"]
    assert any(i["code"] == "nan_inf_voxels" for i in rep["issues"])


def test_missing_sequences(temp_nifti_dir):
    # Provide only 3 sequences: missing FLAIR
    files = {
        "T1": make_nifti(os.path.join(temp_nifti_dir, "t1.nii.gz")),
        "T1Gd": make_nifti(os.path.join(temp_nifti_dir, "t1gd.nii.gz")),
        "T2": make_nifti(os.path.join(temp_nifti_dir, "t2.nii.gz")),
    }
    valid, issues, info = validate_study_collection(files)
    assert not valid
    assert any(i["code"] == "missing_sequences" for i in issues)
    assert "FLAIR" in issues[0]["message"]


def test_mismatched_geometry(temp_nifti_dir):
    # Sequences with different shapes
    files = {
        "T1": make_nifti(os.path.join(temp_nifti_dir, "t1.nii.gz"), shape=(32, 32, 32)),
        "T1Gd": make_nifti(os.path.join(temp_nifti_dir, "t1gd.nii.gz"), shape=(32, 32, 32)),
        "T2": make_nifti(os.path.join(temp_nifti_dir, "t2.nii.gz"), shape=(32, 32, 32)),
        "FLAIR": make_nifti(os.path.join(temp_nifti_dir, "flair.nii.gz"), shape=(32, 32, 48)),  # Mismatch!
    }
    valid, issues, info = validate_study_collection(files)
    assert not valid
    assert any(i["code"] == "shape_mismatch" for i in issues)

    # Affine mismatch
    aff_a = np.diag([1.0, 1.0, 1.0, 1.0])
    aff_b = np.diag([1.5, 1.0, 1.0, 1.0])
    files_aff = {
        "T1": make_nifti(os.path.join(temp_nifti_dir, "t1_b.nii.gz"), affine=aff_a),
        "T1Gd": make_nifti(os.path.join(temp_nifti_dir, "t1gd_b.nii.gz"), affine=aff_a),
        "T2": make_nifti(os.path.join(temp_nifti_dir, "t2_b.nii.gz"), affine=aff_a),
        "FLAIR": make_nifti(os.path.join(temp_nifti_dir, "flair_b.nii.gz"), affine=aff_b),  # Mismatch!
    }
    valid, issues, info = validate_study_collection(files_aff)
    assert not valid
    assert any(i["code"] == "affine_mismatch" for i in issues)


def test_anisotropic_voxel_spacing(temp_nifti_dir):
    # Slice thickness 2.5mm vs in-plane 1.0mm
    aniso_p = os.path.join(temp_nifti_dir, "aniso.nii.gz")
    make_nifti(aniso_p, spacing=(1.0, 1.0, 2.5))
    rep = validate_single_nifti(aniso_p, "T1")
    assert rep["valid"]  # Anisotropic is a warning, not a hard error
    assert any(i["code"] == "anisotropic_spacing" for i in rep["issues"])
