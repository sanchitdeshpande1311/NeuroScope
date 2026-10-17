import { memo, useEffect, useMemo, useRef } from "react";
import type { Region, Vec3 } from "@/lib/neuro/types";
import { cssVarRgb, displayCategory, displayCategoryFast, planeDims, planeToVoxel, voxelIndex, type Layer, type Plane, type RGB } from "./viewer-utils";

export interface SliceData {
  shape: Vec3;
  spacing: Vec3;
  masks: Uint8Array;
  nonZeroIndices?: Int32Array;
  bgPrev?: Uint8Array;
  bgCur?: Uint8Array;
}

interface Props {
  data: SliceData;
  plane: Plane;
  cross: Vec3;
  onCross: (p: Vec3) => void;
  /** left/right layer; for swipe, `swipe` in 0..1 picks split. */
  layer: Layer;
  rightLayer?: Layer;
  swipe?: number;
  regions: Region[];
  opacity: number;
  canvasRef?: (c: HTMLCanvasElement | null) => void;
}

export const SlicePane = memo(function SlicePane({ data, plane, cross, onCross, layer, rightLayer, swipe, regions, opacity, canvasRef }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useMemo<Record<number, RGB>>(() => ({
    1: cssVarRgb("--change-current"),
    2: cssVarRgb("--change-shared"),
    3: cssVarRgb("--change-previous"),
  }), []);
  const [W, H] = planeDims(data.shape, plane);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d", { willReadFrequently: false })!;
    const img = ctx.createImageData(W, H);
    const d32 = new Uint32Array(img.data.buffer);
    const split = swipe !== undefined ? Math.round(swipe * W) : W;

    const c1 = colors[1], c2 = colors[2], c3 = colors[3];
    const invAlpha = 1 - opacity;
    const alpha = opacity;
    const masks = data.masks;
    const bgPrev = data.bgPrev;
    const bgCur = data.bgCur;

    const [X, Y, Z] = data.shape;
    const isAxial = plane === "axial";
    const isCoronal = plane === "coronal";
    const isSagittal = plane === "sagittal";

    const zStep = X * Y;
    const yStep = X;
    const sliceBase = isAxial ? cross[2] * zStep : isCoronal ? cross[1] * yStep : cross[0];

    const hasET = regions.includes("ET");
    const hasTC = regions.includes("TC");
    const hasWT = regions.includes("WT");

    const isSwipe = swipe !== undefined;
    const defaultBg = layer === "previous" ? bgPrev : layer === "current" ? bgCur : (bgCur ?? bgPrev);
    const rightBg = rightLayer === "previous" ? bgPrev : rightLayer === "current" ? bgCur : (bgCur ?? bgPrev);

    // Fast packed 32-bit pixel builder with ZERO allocations in inner loops
    for (let v = 0; v < H; v++) {
      const rowOffset = (H - 1 - v) * W;
      const vOffset = sliceBase + (isAxial ? v * yStep : v * zStep);

      for (let u = 0; u < W; u++) {
        const i = isSagittal ? vOffset + u * yStep : vOffset + u;
        const L = isSwipe ? (u < split ? layer : rightLayer ?? layer) : layer;
        const bg = (isSwipe ? (u < split ? defaultBg : rightBg) : defaultBg)?.[i] ?? 0;
        const maskVal = masks[i];

        let r = bg, g = bg, b = bg;
        if (maskVal !== 0) {
          const cat = displayCategoryFast(maskVal, L, hasET, hasTC, hasWT);
          if (cat !== 0) {
            const col = L === "change" ? (cat === 1 ? c1 : cat === 2 ? c2 : c3) : c2;
            r = (bg * invAlpha + col[0] * alpha) | 0;
            g = (bg * invAlpha + col[1] * alpha) | 0;
            b = (bg * invAlpha + col[2] * alpha) | 0;
          }
        }

        // Little-endian RGBA packing (0xAABBGGRR)
        d32[rowOffset + u] = 0xFF000000 | (b << 16) | (g << 8) | r;
      }
    }
    ctx.putImageData(img, 0, 0);
    // crosshair
    const [cu, cv] = plane === "axial" ? [cross[0], cross[1]] : plane === "coronal" ? [cross[0], cross[2]] : [cross[1], cross[2]];
    ctx.strokeStyle = `rgba(${colors[2].join(",")},0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cu + 0.5, 0); ctx.lineTo(cu + 0.5, H);
    ctx.moveTo(0, H - 1 - cv + 0.5); ctx.lineTo(W, H - 1 - cv + 0.5);
    ctx.stroke();
    if (swipe !== undefined) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(split - 1, 0, 2, H);
    }
  }, [data, plane, cross, layer, rightLayer, swipe, regions, opacity, colors, W, H]);

  // aspect from physical spacing
  const sp = plane === "axial" ? [data.spacing[0], data.spacing[1]] : plane === "coronal" ? [data.spacing[0], data.spacing[2]] : [data.spacing[1], data.spacing[2]];
  const aspect = (W * sp[0]) / (H * sp[1]);

  function click(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = Math.floor(((e.clientX - rect.left) / rect.width) * W);
    const v = H - 1 - Math.floor(((e.clientY - rect.top) / rect.height) * H);
    onCross(planeToVoxel(plane, Math.max(0, Math.min(W - 1, u)), Math.max(0, Math.min(H - 1, v)), cross));
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-background">
      <span className="absolute left-2 top-1.5 z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{plane}</span>
      <canvas
        ref={(c) => { (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = c; canvasRef?.(c); }}
        width={W}
        height={H}
        onMouseDown={click}
        onMouseMove={(e) => e.buttons === 1 && click(e)}
        className="block w-full cursor-crosshair [image-rendering:pixelated]"
        style={{ aspectRatio: String(aspect) }}
      />
    </div>
  );
});
