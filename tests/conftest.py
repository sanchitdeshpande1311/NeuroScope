import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ml.inference import MODALITIES  # noqa: E402

HELDOUT = ROOT / "configs" / "heldout_cases.json"


def heldout_cases():
    return json.loads(HELDOUT.read_text())["cases"] if HELDOUT.exists() else []


# Case used for geometry tests (3, 4, 5, 8). Taken from the held-out list *after* the
# 30 evaluation cases so it is distinct from both the evaluation set and the blind case.
GEOMETRY_CASE_INDEX = 40
# Blind case (Test 9): the last held-out patient; never used in development, tuning or other tests.
BLIND_CASE_INDEX = -1


def case_paths(index):
    cases = heldout_cases()
    if not cases:
        pytest.skip("held-out case list not available")
    c = cases[index]
    paths = {m: ROOT / Path(p) for m, p in zip(MODALITIES, c["image"])}
    if not all(p.exists() for p in paths.values()):
        pytest.skip("BraTS data not available locally")
    return c["subject_id"], paths, ROOT / Path(c["label"])


@pytest.fixture(scope="session")
def segmenter():
    from ml.inference import Segmenter
    return Segmenter()


@pytest.fixture(scope="session")
def geometry_case():
    return case_paths(GEOMETRY_CASE_INDEX)


def write_case(dirpath: Path, arrays: dict, affine, prefix="case"):
    """Write {modality: array} as NIfTI files and return {modality: path}."""
    dirpath.mkdir(parents=True, exist_ok=True)
    out = {}
    for m, a in arrays.items():
        p = dirpath / f"{prefix}_{m}.nii.gz"
        nib.save(nib.Nifti1Image(np.asarray(a, dtype=np.float32), affine), str(p))
        out[m] = p
    return out


def load_case_arrays(paths):
    imgs = {m: nib.load(str(p)) for m, p in paths.items()}
    return {m: np.asarray(i.dataobj, dtype=np.float32) for m, i in imgs.items()}, imgs["t1c"].affine


def synthetic_case(shape=(64, 64, 48), spacing=(1.0, 1.0, 1.0), seed=0):
    rng = np.random.default_rng(seed)
    aff = np.diag(list(spacing) + [1.0])
    zz = np.indices(shape).astype(np.float32)
    c = np.array(shape)[:, None, None, None] / 2
    r = np.sqrt((((zz - c) / (np.array(shape)[:, None, None, None] / 2.5)) ** 2).sum(0))
    base = np.where(r < 1, 100 + 10 * rng.standard_normal(shape), 0).astype(np.float32)
    return {m: base * (1 + 0.1 * i) for i, m in enumerate(MODALITIES)}, aff
