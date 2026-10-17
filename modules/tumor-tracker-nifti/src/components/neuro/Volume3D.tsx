import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { Region } from "@/lib/neuro/types";
import type { SliceData } from "./SlicePane";
import { cssVarRgb, displayCategoryFast, type Layer } from "./viewer-utils";

const MAX_POINTS = 120000;

/** Renders the actual predicted voxels as a point cloud in physical (mm) space. */
export const Volume3D = memo(function Volume3D({ data, layer, regions, title }: { data: SliceData; layer: Layer; regions: Region[]; title: string }) {
  const controls = useRef<OrbitImpl | null>(null);
  const { geometry, count, radius } = useMemo(() => {
    const cols = {
      1: cssVarRgb("--change-current"),
      2: cssVarRgb("--change-shared"),
      3: cssVarRgb("--change-previous")
    } as Record<number, number[]>;

    const [X, Y, Z] = data.shape;
    const [sx, sy, sz] = data.spacing;
    const masks = data.masks;
    const nonZero = data.nonZeroIndices;

    const hasET = regions.includes("ET");
    const hasTC = regions.includes("TC");
    const hasWT = regions.includes("WT");

    const idx: number[] = [];
    const cats: number[] = [];

    // Instant loop: uses precomputed non-zero voxel indices (<1ms) if available
    if (nonZero) {
      const len = nonZero.length;
      for (let j = 0; j < len; j++) {
        const i = nonZero[j];
        const val = masks[i];
        const c = displayCategoryFast(val, layer, hasET, hasTC, hasWT);
        if (c !== 0) {
          idx.push(i);
          cats.push(c);
        }
      }
    } else {
      const len = masks.length;
      for (let i = 0; i < len; i++) {
        const val = masks[i];
        if (val === 0) continue;
        const c = displayCategoryFast(val, layer, hasET, hasTC, hasWT);
        if (c !== 0) {
          idx.push(i);
          cats.push(c);
        }
      }
    }

    const step = Math.max(1, Math.ceil(idx.length / MAX_POINTS));
    const n = Math.ceil(idx.length / step);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let k = 0;
    for (let j = 0; j < idx.length; j += step, k++) {
      const i = idx[j];
      const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / (X * Y));
      pos[k * 3] = (x - X / 2) * sx;
      pos[k * 3 + 1] = (z - Z / 2) * sz;
      pos[k * 3 + 2] = -(y - Y / 2) * sy;
      const c = layer === "change" ? cols[cats[j]] : cols[2];
      col[k * 3] = c[0] / 255; col[k * 3 + 1] = c[1] / 255; col[k * 3 + 2] = c[2] / 255;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return { geometry: g, count: idx.length, radius: Math.max(X * sx, Y * sy, Z * sz) / 2 };
  }, [data, layer, regions]);

  const edge = useMemo(() => new THREE.Color(...cssVarRgb("--border").map((v) => v / 255)), []);
  const box = useMemo(() => new THREE.BoxGeometry(data.shape[0] * data.spacing[0], data.shape[2] * data.spacing[2], data.shape[1] * data.spacing[1]), [data]);
  const dolly = (f: number) => {
    const c = controls.current;
    if (!c) return;
    c.object.position.sub(c.target).multiplyScalar(f).add(c.target);
    c.update();
  };

  return (
    <div className="relative h-full min-h-[260px] overflow-hidden rounded-md border border-border bg-background">
      <span className="absolute left-2 top-1.5 z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title} · {count.toLocaleString()} vox</span>
      <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
        {[{ i: ZoomIn, f: () => dolly(0.8), l: "Zoom in" }, { i: ZoomOut, f: () => dolly(1.25), l: "Zoom out" }, { i: RotateCcw, f: () => controls.current?.reset(), l: "Reset camera" }].map(({ i: I, f, l }) => (
          <button key={l} aria-label={l} onClick={f} className="rounded border border-border bg-card/80 p-1 text-muted-foreground hover:text-foreground"><I className="h-3.5 w-3.5" /></button>
        ))}
      </div>
      {count === 0 && (
        <div className="absolute inset-0 z-10 grid place-items-center text-xs text-muted-foreground">No predicted voxels for the selected regions</div>
      )}
      <Canvas dpr={[1, 2]} camera={{ position: [radius * 1.6, radius * 0.9, radius * 1.6], fov: 40, near: 1, far: radius * 20 }}>
        <points geometry={geometry}>
          <pointsMaterial size={Math.max(...data.spacing) * 1.1} vertexColors sizeAttenuation transparent opacity={0.85} />
        </points>
        <lineSegments>
          <edgesGeometry args={[box]} />
          <lineBasicMaterial color={edge} />
        </lineSegments>
        <OrbitControls ref={controls as never} makeDefault enableDamping />
      </Canvas>
    </div>
  );
});
