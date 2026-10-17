"""
Surface meshes for the 3D viewer, in world (scanner) millimetres.

Marching cubes runs in voxel space; vertices are then mapped through the NIfTI
affine, so meshes overlay the volumes exactly in any viewer that uses world
coordinates (NiiVue does). Written as GIfTI (.gii).
"""
from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np
from nibabel.gifti import GiftiDataArray, GiftiImage
from scipy import ndimage
from skimage.measure import marching_cubes


def mask_to_gifti(mask: np.ndarray, affine: np.ndarray, path: Path, step: int = 1, smooth_sigma: float = 0.0) -> dict:
    if not mask.any():
        return {"written": False, "reason": "empty"}
    vol = np.pad(mask.astype(np.float32), 1)
    if smooth_sigma > 0:
        vol = ndimage.gaussian_filter(vol, smooth_sigma)
    verts, faces, _, _ = marching_cubes(vol, level=0.5, step_size=step)
    verts -= 1.0  # undo padding
    world = (affine[:3, :3] @ verts.T).T + affine[:3, 3]
    if np.linalg.det(affine[:3, :3]) < 0:  # keep outward-facing winding after a reflection
        faces = faces[:, ::-1]
    g = GiftiImage(darrays=[
        GiftiDataArray(world.astype(np.float32), intent="NIFTI_INTENT_POINTSET", datatype="NIFTI_TYPE_FLOAT32"),
        GiftiDataArray(faces.astype(np.int32), intent="NIFTI_INTENT_TRIANGLE", datatype="NIFTI_TYPE_INT32"),
    ])
    nib.save(g, str(path))
    return {"written": True, "vertices": int(len(world)), "faces": int(len(faces))}
