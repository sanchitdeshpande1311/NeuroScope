import type { Affine, Region, Vec3 } from "@/lib/neuro/types";
import { categoryOf } from "@/lib/neuro/changemap";

export type Plane = "axial" | "coronal" | "sagittal";
export type RGB = [number, number, number];

const _rgbCache: Record<string, RGB> = {};

/** Resolve a CSS custom property to RGB with in-memory caching. */
export function cssVarRgb(name: string): RGB {
  if (_rgbCache[name]) return _rgbCache[name];
  let rgb: RGB = [255, 255, 255];
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff";
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      rgb = [d[0], d[1], d[2]];
    }
  } catch {
    rgb = [255, 255, 255];
  }
  _rgbCache[name] = rgb;
  return rgb;
}

export function planeDims(shape: Vec3, plane: Plane): [number, number] {
  if (plane === "axial") return [shape[0], shape[1]];
  if (plane === "coronal") return [shape[0], shape[2]];
  return [shape[1], shape[2]];
}

export function voxelIndex(shape: Vec3, x: number, y: number, z: number) {
  return x + y * shape[0] + z * shape[0] * shape[1];
}

/** Map plane pixel (u, v) at crosshair to voxel coords. */
export function planeToVoxel(plane: Plane, u: number, v: number, cross: Vec3): Vec3 {
  if (plane === "axial") return [u, v, cross[2]];
  if (plane === "coronal") return [u, cross[1], v];
  return [cross[0], u, v];
}

export function voxelToWorld(a: Affine, p: Vec3): Vec3 {
  return [0, 1, 2].map((r) => a[r][0] * p[0] + a[r][1] * p[1] + a[r][2] * p[2] + a[r][3]) as Vec3;
}

export type Layer = "previous" | "current" | "change";

export function displayCategoryFast(packed: number, layer: Layer, hasET: boolean, hasTC: boolean, hasWT: boolean): number {
  if (packed === 0) return 0;

  if (hasET) {
    const p = (packed & 4) !== 0, c = (packed & 32) !== 0;
    if (layer === "change") {
      if (p && c) return 2;
      if (c) return 1;
      if (p) return 3;
    } else if (layer === "previous") {
      if (p) return 2;
    } else if (layer === "current") {
      if (c) return 2;
    }
  }

  if (hasTC) {
    const p = (packed & 2) !== 0, c = (packed & 16) !== 0;
    if (layer === "change") {
      if (p && c) return 2;
      if (c) return 1;
      if (p) return 3;
    } else if (layer === "previous") {
      if (p) return 2;
    } else if (layer === "current") {
      if (c) return 2;
    }
  }

  if (hasWT) {
    const p = (packed & 1) !== 0, c = (packed & 8) !== 0;
    if (layer === "change") {
      if (p && c) return 2;
      if (c) return 1;
      if (p) return 3;
    } else if (layer === "previous") {
      if (p) return 2;
    } else if (layer === "current") {
      if (c) return 2;
    }
  }

  return 0;
}

/**
 * Fast zero-allocation category for display at one voxel given visible regions.
 * Priority: ET > TC > WT.
 * Bit mapping:
 *   WT: prev=1, cur=8
 *   TC: prev=2, cur=16
 *   ET: prev=4, cur=32
 */
export function displayCategory(packed: number, layer: Layer, regions: Region[]): number {
  if (packed === 0) return 0;
  return displayCategoryFast(packed, layer, regions.includes("ET"), regions.includes("TC"), regions.includes("WT"));
}

