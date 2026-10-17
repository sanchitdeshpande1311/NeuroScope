"""
Test 6 fixture: a real held-out case with a bright synthetic marker at a known voxel.

Usage:
    python execution/make_marker_case.py [--index 42] [--vox 170 150 100] [--out .tmp/marker_case]

Inserts, in all four sequences:
  - a bright rod (value = 3 x 99.9th percentile) along the voxel axis closest to world z
    through (i0, j0), visible as a dot in every axial slice
  - a brighter 3x3x3 cube (5 x p99.9) centred on (i0, j0, k0)
Prints the marker's voxel index, world mm (affine @ ijk) and anatomical side.
"""
import argparse
import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ml.inference import MODALITIES  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", type=int, default=42)
    ap.add_argument("--vox", type=int, nargs=3, default=[170, 150, 100])
    ap.add_argument("--out", default=str(ROOT / ".tmp" / "marker_case"))
    a = ap.parse_args()
    case = json.loads((ROOT / "configs" / "heldout_cases.json").read_text())["cases"][a.index]
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    i0, j0, k0 = a.vox
    for m, p in zip(MODALITIES, case["image"]):
        img = nib.load(str(ROOT / Path(p)))
        d = np.asarray(img.dataobj, dtype=np.float32)
        hi = float(np.percentile(d[d > 0], 99.9))
        zax = int(np.argmax(np.abs(img.affine[2, :3])))
        sl = [i0, j0, k0]; sl[zax] = slice(None)
        d[tuple(sl)] = 3 * hi
        d[i0 - 1:i0 + 2, j0 - 1:j0 + 2, k0 - 1:k0 + 2] = 5 * hi
        nib.save(nib.Nifti1Image(d, img.affine, img.header), str(out / f"marker_{m}.nii.gz"))
    aff = img.affine
    world = (aff @ np.array([i0, j0, k0, 1.0]))[:3]
    brain_c = (aff @ np.append(np.argwhere(d > 0).mean(0), 1.0))[:3]
    info = {"case": case["subject_id"], "marker_voxel": [i0, j0, k0], "marker_world_mm": world.round(2).tolist(),
            "axcodes": "".join(nib.aff2axcodes(aff)),
            "expected_side": {"LR": "R" if world[0] > brain_c[0] else "L", "AP": "A" if world[1] > brain_c[1] else "P",
                              "SI": "S" if world[2] > brain_c[2] else "I"}}
    (out / "marker_info.json").write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
