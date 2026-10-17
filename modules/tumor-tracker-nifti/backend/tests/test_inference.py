import os
import tempfile
import pytest
import numpy as np
import nibabel as nib
import torch

from backend.app.models_info import get_verified_model_info
from backend.app.inference import (
    load_segmentation_model,
    run_study_segmentation,
    set_deterministic,
    DEFAULT_MODEL_PATH,
)


def test_model_metadata_verification():
    info = get_verified_model_info()
    assert info["weights_loaded"] is True
    assert "SegResNet" in info["name"]
    assert info["version"] == "0.5.4"
    assert info["licence"] == "Apache-2.0"
    assert info["input_order"] == ["T1Gd", "T1", "T2", "FLAIR"]
    assert info["output_channels"] == ["TC", "WT", "ET"]


def test_repeatability_and_determinism():
    with tempfile.TemporaryDirectory() as tmpdir:
        shape = (32, 32, 32)
        affine = np.eye(4)
        x, y, z = np.ogrid[:32, :32, :32]
        sphere = (((x - 16)**2 + (y - 16)**2 + (z - 16)**2) <= 10**2).astype(np.float32)

        seq_paths = {}
        for s in ["t1", "t1gd", "t2", "flair"]:
            p = os.path.join(tmpdir, f"{s}.nii.gz")
            nib.save(nib.Nifti1Image(sphere * 50.0, affine), p)
            seq_paths[s] = p

        # Run 1
        res1 = run_study_segmentation(seq_paths, deterministic=True)
        # Run 2
        res2 = run_study_segmentation(seq_paths, deterministic=True)

        # Exact bitwise equality of output segmentation label map
        np.testing.assert_array_equal(res1["label_map"], res2["label_map"])
        for reg in ["WT", "TC", "ET"]:
            np.testing.assert_array_equal(res1["subregions"][reg], res2["subregions"][reg])
