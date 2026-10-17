"use client";

import React, { useEffect, useRef } from 'react';
import { Niivue, NVMesh, SLICE_TYPE, SHOW_RENDER, MULTIPLANAR_TYPE } from '@niivue/niivue';
import type { Region } from '@/lib/api';
import type { ViewerSettings } from '@/lib/store';
import { bboxOf, connectomeShapes, pickAt, type Pickable, type VolumePickState } from '@/lib/picking';

export interface CursorInfo {
  mm: [number, number, number];        // world (scanner RAS+) millimetres
  vox: [number, number, number];       // voxel index on the ORIGINAL input grid (from the input affine)
  values: { name: string; value: number }[];
}

export interface ConnectomeLayer {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;             // NiiVue Connectome (nodes/edges in world mm)
  /** straight 2-point segments in world mm, flat [x0,y0,z0,x1,y1,z1, ...]; drawn as a tract mesh.
   *  radius > 0 -> thin cylinders (per-layer opacity works); radius 0 -> 1-px lines (fast, fixed opacity) */
  lines?: { segments: Float32Array; rgba255: [number, number, number, number]; radius: number };
  visible: boolean;
  opacity?: number;
  /** Show Definitions: the name shown when the pointer is over this layer, and its swatch colour */
  definition?: string;
  definitionColor?: string;
}

/** MRtrix .tck buffer with one streamline per segment, in the layout NiiVue's reader expects:
 *  a leading NaN triplet (so the first streamline starts at offset 0), NaN separators, an Inf terminator
 *  and 12 padding bytes (the reader stops when fewer than 12 bytes remain). */
export function segmentsToTck(seg: Float32Array): ArrayBuffer {
  const n = seg.length / 6;
  const headerLen = 256;
  const head = `mrtrix tracks\ncount: ${n}\ndatatype: Float32LE\nfile: . ${headerLen}\nEND\n`;
  const nTriplets = 1 + n * 3 + 1 + 1;
  const buf = new ArrayBuffer(headerLen + nTriplets * 12);
  const bytes = new Uint8Array(buf);
  bytes.fill(32, 0, headerLen);
  bytes.set(new TextEncoder().encode(head), 0);
  const f = new Float32Array(buf, headerLen);
  let k = 0;
  f[k++] = NaN; f[k++] = NaN; f[k++] = NaN;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 6; j++) f[k++] = seg[i * 6 + j];
    f[k++] = NaN; f[k++] = NaN; f[k++] = NaN;
  }
  k -= 3; // the last separator becomes the terminator
  f[k++] = Infinity; f[k++] = Infinity; f[k++] = Infinity;
  return buf;
}

interface Props {
  backgroundUrl: string;
  segUrl: string;
  refinedUrl?: string | null;
  expertUrl?: string | null;
  meshUrls?: Partial<Record<Region | 'brain', string | undefined>>;
  affine: number[][];
  settings: ViewerSettings;
  mode?: 'grid' | 'render';
  /** graph page: in 3D-only mode hide the volume rendering (it is opaque and hides meshes inside the brain);
   *  in the 4-panel mode keep the slices and draw occluded meshes with an X-ray pass instead */
  hide3DVolume?: boolean;
  connectomes?: ConnectomeLayer[];
  initialCrosshairMm?: [number, number, number] | null;
  /** Show Definitions: name the visible element under the pointer (off by default) */
  definitions?: boolean;
  /** draw a faint frame and name for each linked view (from the renderer's own tile geometry) */
  frames?: boolean;
  onCursor?: (c: CursorInfo) => void;
  onReady?: (nv: Niivue) => void;
  testId?: string;
}

// One colour scheme everywhere (slices, meshes, report): label 1 NCR/NET red, 2 edema green, 4 ET yellow.
export const LABEL_RGB: Record<number, [number, number, number]> = { 1: [220, 50, 50], 2: [60, 200, 90], 4: [250, 210, 40] };
export const MESH_RGBA: Record<Region, [number, number, number, number]> = {
  WT: [60, 200, 90, 255], TC: [220, 50, 50, 255], ET: [250, 210, 40, 255],
};

function labelColormap(show: Record<1 | 2 | 4, boolean>, expert = false) {
  const R = [0, 0, 0, 0, 0], G = [0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0], A = [0, 0, 0, 0, 0];
  ([1, 2, 4] as const).forEach((l) => {
    const c = expert ? [80, 160, 255] : LABEL_RGB[l];
    R[l] = c[0]; G[l] = c[1]; B[l] = c[2]; A[l] = show[l] ? 255 : 0;
  });
  return { R, G, B, A, I: [0, 1, 2, 3, 4], labels: ['background', 'NCR/NET', 'edema', '', 'enhancing'] };
}

export function invert4(m: number[][]): number[][] {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
  const t = [m[0][3], m[1][3], m[2][3]];
  return r.map((row) => [...row, -(row[0] * t[0] + row[1] * t[1] + row[2] * t[2])]).concat([[0, 0, 0, 1]]);
}

type Perf = { loadMs?: number; applyMs?: number[]; pickMs?: number[] };
const VIEW_NAME: Record<number, string> = { 0: 'Axial', 1: 'Coronal', 2: 'Sagittal', 4: '3D' };
const SURFACE: Record<Region | 'brain', [string, string]> = { WT: ['WT', '#3cc85a'], TC: ['TC', '#dc3232'], ET: ['ET', '#fad228'], brain: ['Brain', '#c8c8d2'] };
const bboxCache = new WeakMap<object, Float64Array>();
const shapeCache = new WeakMap<object, ReturnType<typeof connectomeShapes>>();

const perf = (): Perf => {
  const w = window as unknown as { __ns3dPerf?: Perf };
  return (w.__ns3dPerf ??= { applyMs: [] });
};

export default function NiiVueViewer(p: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nvRef = useRef<Niivue | null>(null);
  const loaded = useRef(false);
  const volIdx = useRef<{ seg: number; refined: number; expert: number }>({ seg: 1, refined: -1, expert: -1 });
  const meshIds = useRef<Partial<Record<Region | 'brain', number>>>({});
  const conn = useRef<Map<string, { json: unknown; id: number }>>(new Map());
  const propsRef = useRef(p);
  propsRef.current = p;

  // ---- create the viewer and load data ONCE per case (URLs); display changes never reload
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    // a fresh canvas per viewer instance: its WebGL context can be released on unmount without
    // breaking a later instance (React may unmount/remount effects, e.g. in development StrictMode)
    const canvas = document.createElement('canvas');
    canvas.className = 'viewer-canvas';
    canvas.dataset.testid = p.testId ?? 'niivue-canvas';
    host.prepend(canvas);   // under the frame and tooltip layers
    canvasRef.current = canvas;
    loaded.current = false;
    const t0 = performance.now();
    const nv = new Niivue({
      show3Dcrosshair: true,
      backColor: [0, 0, 0, 1],
      // a restrained crosshair: 1 px in 2D, a 0.6 mm rod in 3D, softened cyan; it still marks the true linked point
      crosshairColor: [0.42, 0.84, 1, 0.62],
      crosshairWidth: 0.6,
      crosshairWidthUnit: 'mm',
      multiplanarPadPixels: 10,             // separate the four views
      fontMinPx: 15,                        // orientation letters readable at presentation distance
      fontColor: [0.93, 0.89, 0.83, 0.9],
      isOrientationTextVisible: true,
      showAllOrientationMarkers: true,
      isRadiologicalConvention: false,      // neurological: patient right on screen right
      multiplanarShowRender: SHOW_RENDER.ALWAYS,
      multiplanarLayout: MULTIPLANAR_TYPE.GRID,
      meshThicknessOn2D: 0,
      dragAndDropEnabled: false,
    });
    nvRef.current = nv;
    // development-only handle for browser tests (docs/TEST_RESULTS.md)
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __nv?: Niivue }).__nv = nv;
    nv.attachToCanvas(canvas);
    const inv = invert4(p.affine);
    nv.onLocationChange = (loc: unknown) => {
      const l = loc as { mm: number[]; values?: { name: string; value: number }[] };
      const mm = [l.mm[0], l.mm[1], l.mm[2]] as [number, number, number];
      const vox = [0, 1, 2].map((r) => Math.round(inv[r][0] * mm[0] + inv[r][1] * mm[1] + inv[r][2] * mm[2] + inv[r][3])) as [number, number, number];
      propsRef.current.onCursor?.({ mm, vox, values: (l.values ?? []).map((v) => ({ name: v.name, value: v.value })) });
    };
    const loading = (async () => {
      const vols: { url: string; colormap?: string; opacity: number; name: string }[] = [
        // names need a file extension: NiiVue infers the format from it
        { url: p.backgroundUrl, colormap: 'gray', opacity: 1, name: 'T1Gd.nii.gz' },
        { url: p.segUrl, opacity: 0, name: 'prediction.nii.gz' },
      ];
      volIdx.current = { seg: 1, refined: -1, expert: -1 };
      if (p.refinedUrl) { volIdx.current.refined = vols.length; vols.push({ url: p.refinedUrl, opacity: 0, name: 'refined.nii.gz' }); }
      if (p.expertUrl) { volIdx.current.expert = vols.length; vols.push({ url: p.expertUrl, opacity: 0, name: 'expert.nii.gz' }); }
      await nv.loadVolumes(vols);
      if (cancelled) return;
      const order: (Region | 'brain')[] = ['brain', 'WT', 'TC', 'ET'];
      const meshes = order.filter((k) => p.meshUrls?.[k]).map((k) => ({
        url: p.meshUrls![k] as string, name: `mesh_${k}.gii`,
        rgba255: k === 'brain' ? [200, 200, 210, 255] : MESH_RGBA[k as Region],
        opacity: k === 'brain' ? (propsRef.current.settings.brainOpacity ?? 0.15) : propsRef.current.settings.meshOpacity,
      }));
      if (meshes.length) await nv.loadMeshes(meshes);
      if (cancelled) return;
      meshIds.current = {};
      order.filter((k) => p.meshUrls?.[k]).forEach((k, i) => { meshIds.current[k] = nv.meshes[i].id as unknown as number; });
      conn.current = new Map();
      nv.setSliceType(propsRef.current.mode === 'render' ? SLICE_TYPE.RENDER : SLICE_TYPE.MULTIPLANAR);
      nv.setRenderAzimuthElevation(110, 15);
      const ch = propsRef.current.initialCrosshairMm;
      if (ch) { nv.scene.crosshairPos = nv.mm2frac(ch); }
      loaded.current = true;
      applied.current = null;
      applyDisplay();
      syncConnectomes();
      scheduleFrames();
      perf().loadMs = performance.now() - t0;
      propsRef.current.onReady?.(nv);
    })().catch((e) => console.error('Viewer load failed', e));
    const ro = new ResizeObserver(() => scheduleFrames());
    ro.observe(host);
    const frames = framesRef.current;
    return () => {
      cancelled = true;
      ro.disconnect();
      canvasRef.current = null;
      frames?.replaceChildren();
      nv.onLocationChange = () => {};
      nvRef.current = null;
      // remove NiiVue's resize observers / window listeners first: otherwise a disposed instance keeps
      // redrawing on window resize against a released context (seen as 'sobel shader' GL errors)
      try { nv.cleanup(); } catch { /* ignore */ }
      // release the WebGL context so repeated page visits do not leak GPU memory
      canvas.remove();
      // release the GPU context only after any in-flight load has settled; releasing it mid-load makes
      // NiiVue's texture/gradient passes fail repeatedly ('blur'/'sobel' shader errors)
      loading.finally(() => {
        try { (nv.gl as WebGL2RenderingContext | undefined)?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.backgroundUrl, p.segUrl, p.refinedUrl, p.expertUrl]);

  const applied = useRef<ViewerSettings | null>(null);
  const volHidden = useRef<boolean | null>(null);

  /**
   * Apply display settings with the minimum work (measured; see docs/TEST_RESULTS.md):
   *  - label toggles -> new label colour tables + ONE volume refresh
   *  - overlay opacity / refined / expert -> layer opacities + ONE volume refresh
   *  - surface visibility / opacity -> set on the mesh objects and redraw only. NiiVue's
   *    setMeshProperty() rebuilds the mesh and refreshes every volume per call, so it is avoided.
   * Masks, NIfTI files and volumes are never touched.
   */
  function applyDisplay() {
    const nv = nvRef.current;
    if (!nv || !loaded.current) return;
    const t0 = performance.now();
    const s = propsRef.current.settings;
    const prev = applied.current;
    const { seg, refined, expert } = volIdx.current;
    const vol3dHidden = !!propsRef.current.hide3DVolume && propsRef.current.mode === 'render';
    let volumesDirty = false;
    if (!prev || JSON.stringify(prev.showLabels) !== JSON.stringify(s.showLabels)) {
      nv.volumes[seg].setColormapLabel(labelColormap(s.showLabels));
      if (refined >= 0) nv.volumes[refined].setColormapLabel(labelColormap(s.showLabels));
      if (!prev && expert >= 0) nv.volumes[expert].setColormapLabel(labelColormap({ 1: true, 2: true, 4: true }, true));
      volumesDirty = true;
    }
    if (!prev || prev.segOpacity !== s.segOpacity || prev.showRefined !== s.showRefined || prev.showExpert !== s.showExpert
        || prev.showPrediction !== s.showPrediction || vol3dHidden !== volHidden.current) {
      const useRefined = s.showRefined && refined >= 0;
      const k = vol3dHidden ? 0 : 1;
      const pred = s.showPrediction === false ? 0 : 1; // 'Model prediction' layer toggle (Layers > Masks)
      nv.volumes[0].opacity = k;
      nv.volumes[seg].opacity = k * pred * (useRefined ? 0 : s.segOpacity);
      if (refined >= 0) nv.volumes[refined].opacity = k * pred * (useRefined ? s.segOpacity : 0);
      if (expert >= 0) nv.volumes[expert].opacity = k * (s.showExpert ? 0.6 : 0);
      // occluded surfaces (tumour inside the brain) are drawn through the opaque 3D volume rendering
      nv.opts.meshXRay = vol3dHidden ? 0 : 0.35;
      volHidden.current = vol3dHidden;
      volumesDirty = true;
    }
    for (const m of nv.meshes) {
      const k = (Object.keys(meshIds.current) as (Region | 'brain')[]).find((key) => (meshIds.current[key] as unknown) === m.id);
      if (!k) continue;
      m.visible = k === 'brain' ? s.showBrain : s.showMeshes[k as Region];
      m.opacity = k === 'brain' ? (s.brainOpacity ?? 0.15) : s.meshOpacity;
    }
    if (volumesDirty) nv.updateGLVolume(); else nv.drawScene();
    applied.current = s;
    perf().applyMs!.push(performance.now() - t0);
  }

  const syncChain = useRef<Promise<void>>(Promise.resolve());

  /** Add/remove/update overlay layers. Runs serially (a tract layer is built asynchronously), always from
   *  the latest props, so rapid toggling cannot add stale or duplicate layers. */
  function syncConnectomes() {
    syncChain.current = syncChain.current.then(doSync).catch((e) => console.error('overlay sync failed', e));
  }

  async function doSync() {
    const nv = nvRef.current;
    if (!nv || !loaded.current) return;
    const want = new Map((propsRef.current.connectomes ?? []).map((c) => [c.key, c]));
    for (const [key, cur] of conn.current) {
      const w = want.get(key);
      if (!w || (w.json ?? w.lines) !== cur.json) {
        const m = nv.meshes.find((x) => (x.id as unknown as number) === cur.id);
        if (m) nv.removeMesh(m);
        conn.current.delete(key);
      }
    }
    for (const [key, w] of want) {
      if (!conn.current.has(key) && (w.json || w.lines)) {
        let mesh: NVMesh;
        if (w.json) {
          mesh = nv.loadConnectomeAsMesh(w.json);
        } else {
          mesh = await NVMesh.loadFromUrl({ url: `${key}.tck`, name: `${key}.tck`, gl: nv.gl as WebGL2RenderingContext,
            buffer: segmentsToTck(w.lines!.segments), rgba255: w.lines!.rgba255, opacity: w.opacity ?? 1 });
          if (nvRef.current !== nv) return;
          mesh.fiberColor = 'Fixed';
          mesh.fiberDither = 0;
          mesh.fiberRadius = w.lines!.radius;
          mesh.updateMesh(nv.gl as WebGL2RenderingContext);
        }
        nv.addMesh(mesh);
        conn.current.set(key, { json: w.json ?? w.lines, id: mesh.id as unknown as number });
      }
      const id = conn.current.get(key)?.id;
      const mesh = nv.meshes.find((x) => (x.id as unknown as number) === id);
      if (mesh) {
        mesh.visible = w.visible; // direct: avoids NiiVue's per-call full refresh
        if (w.opacity !== undefined) mesh.opacity = w.opacity;
      }
    }
    nv.drawScene();
  }

  // ---- view frames: faint outline + name per tile, positioned from NiiVue's screenSlices (canvas pixels)
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleFrames() {
    if (frameTimer.current) clearTimeout(frameTimer.current);
    // after NiiVue has re-laid out its tiles on its own resize/draw
    frameTimer.current = setTimeout(layoutFrames, 80);
  }
  function layoutFrames() {
    const box = framesRef.current, nv = nvRef.current, canvas = canvasRef.current;
    if (!box) return;
    box.replaceChildren();
    if (!nv || !canvas || !loaded.current || propsRef.current.frames === false || !canvas.clientWidth) return;
    const k = canvas.width / canvas.clientWidth;
    const tiles = ((nv as unknown as { screenSlices?: { leftTopWidthHeight: number[]; axCorSag: number }[] }).screenSlices ?? []);
    if (tiles.length < 2) return;   // a single view needs no frame
    for (const t of tiles) {
      const [l, tp, w, h] = t.leftTopWidthHeight;
      if (w <= 0 || h <= 0) continue;
      const f = document.createElement('div');
      f.className = 'view-frame';
      Object.assign(f.style, { left: `${l / k}px`, top: `${tp / k}px`, width: `${w / k}px`, height: `${h / k}px` });
      const n = document.createElement('span');
      n.className = 'view-name';
      n.textContent = VIEW_NAME[t.axCorSag] ?? '';
      f.appendChild(n);
      box.appendChild(f);
    }
  }

  // ---- Show Definitions: what is visible right now, for the picker
  function pickables(): Pickable[] {
    const nv = nvRef.current;
    if (!nv) return [];
    const out: Pickable[] = [];
    const layers = new Map((propsRef.current.connectomes ?? []).map((c) => [c.key, c]));
    for (const m of nv.meshes) {
      const mesh = m as unknown as { id: number; visible?: boolean; opacity: number; pts?: Float32Array; tris?: Uint32Array };
      if (mesh.visible === false || !(mesh.opacity > 0)) continue;
      const surf = (Object.keys(meshIds.current) as (Region | 'brain')[]).find((key) => meshIds.current[key] === mesh.id);
      const bbox = () => { let b = bboxCache.get(m); if (!b) { b = bboxOf(mesh.pts!); bboxCache.set(m, b); } return b; };
      if (surf) {
        if (mesh.pts && mesh.tris) out.push({ kind: 'mesh', cls: surf === 'brain' ? 'brain' : 'tumour', label: SURFACE[surf][0], color: SURFACE[surf][1], pts: mesh.pts, tris: mesh.tris, bbox: bbox() });
        continue;
      }
      const key = [...conn.current.entries()].find(([, c]) => c.id === mesh.id)?.[0];
      const layer = key ? layers.get(key) : undefined;
      if (!layer?.definition || !layer.visible) continue;
      const color = layer.definitionColor ?? '#ffffff';
      if (layer.lines) out.push({ kind: 'lines', cls: 'line', label: layer.definition, color, segments: layer.lines.segments });
      else if (layer.json) {
        let g = shapeCache.get(layer.json);
        if (!g) { g = connectomeShapes(layer.json); shapeCache.set(layer.json, g); }
        out.push({ kind: 'shapes', cls: 'graph', label: layer.definition, color, ...g });
      }
    }
    return out;
  }
  function volumeState(): VolumePickState {
    const nv = nvRef.current!;
    const s = propsRef.current.settings;
    const { seg, refined, expert } = volIdx.current;
    const predVol = s.showRefined && refined >= 0 ? nv.volumes[refined] : nv.volumes[seg];
    return {
      expert: expert >= 0 ? { vol: nv.volumes[expert], visible: nv.volumes[expert].opacity > 0 } : null,
      prediction: predVol ? { vol: predVol, visible: predVol.opacity > 0, showLabels: s.showLabels } : null,
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current, tip = tipRef.current, host = hostRef.current;
    if (!p.definitions || !canvas || !tip || !host) { if (tip) tip.style.display = "none"; return; }
    // timer-based throttle (not requestAnimationFrame): picking is not tied to the render loop
    let timer: ReturnType<typeof setTimeout> | null = null, lastRun = 0, pending: { x: number; y: number } | null = null, shown = '';
    const hide = () => { tip.style.display = 'none'; shown = ''; };
    const run = () => {
      timer = null;
      const nv = nvRef.current, c = canvasRef.current;
      if (!pending || !nv || !c || !loaded.current) return;
      const now = performance.now();
      if (now - lastRun < 45) { timer = setTimeout(run, 45 - (now - lastRun)); return; }   // at most ~20 picks per second
      lastRun = now;
      const { x, y } = pending;
      const k = c.width / c.getBoundingClientRect().width;
      const t0 = performance.now();
      const hit = pickAt(nv, x * k, y * k, pickables(), volumeState());
      (perf().pickMs ??= []).push(performance.now() - t0);
      if (!hit) { hide(); return; }
      if (shown !== hit.label) {
        tip.replaceChildren();
        const sw = document.createElement('i');
        sw.style.background = hit.color;
        tip.append(sw, hit.label);
        shown = hit.label;
      }
      tip.style.display = 'flex';
      const W = host.clientWidth, H = host.clientHeight, w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.min(Math.max(x + 14, 4), W - w - 4), top = y + 18 + h > H - 4 ? y - h - 12 : y + 18;
      tip.style.transform = `translate(${left}px, ${Math.max(4, top)}px)`;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) { pending = null; hide(); return; }   // dragging: rotation / slicing / panning
      const r = canvas.getBoundingClientRect();   // (offsetX is unreliable under zoom/emulation)
      pending = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!timer) timer = setTimeout(run, 0);
    };
    const onLeave = () => { pending = null; hide(); };
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave, { passive: true });
    canvas.addEventListener('pointerdown', onLeave, { passive: true });
    canvas.addEventListener('wheel', onLeave, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onLeave);
      canvas.removeEventListener('wheel', onLeave);
      hide();
    };
  }, [p.definitions, p.backgroundUrl, p.segUrl]);

  useEffect(applyDisplay, [p.settings]);
  useEffect(syncConnectomes, [p.connectomes]);
  useEffect(() => {
    const nv = nvRef.current;
    if (nv && loaded.current) {
      nv.setSliceType(p.mode === 'render' ? SLICE_TYPE.RENDER : SLICE_TYPE.MULTIPLANAR);
      applyDisplay(); // volume visibility in 3D depends on the mode
      scheduleFrames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.mode]);
  useEffect(() => () => { if (frameTimer.current) clearTimeout(frameTimer.current); }, []);

  return (
    <div ref={hostRef} className="viewer-host">
      <div ref={framesRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }} />
      <div ref={tipRef} className="def-tip" data-testid={`${p.testId ?? 'niivue'}-definition`} role="status" aria-live="polite" />
    </div>
  );

}
