// Show Definitions: identify the visible element under the pointer in a NiiVue viewer.
//
// 2D slice tiles: the renderer's own canvas -> volume mapping (canvasPos2frac / frac2mm / mm2vox) gives the
//   voxel under the pointer; its value is read from the label volumes that are currently drawn (expert reference
//   is drawn on top of the prediction, so it wins). MRI intensity alone is never named.
// 3D render tile: a ray is unprojected with the renderer's own MVP matrix for that tile
//   (calculateMvpMatrix with the current azimuth/elevation) and intersected with what NiiVue draws:
//   - surface meshes (tumour, brain): their triangles;
//   - connectome layers (vertices, path): the spheres and cylinders NiiVue builds from the layer JSON
//     (radius = sizeValue x nodeScale, edge radius = colorValue x edgeScale; NiiVue keeps no CPU triangles for them);
//   - thin line layers (.tck edges): their segments in screen space with a small pixel tolerance.
// Priority when several objects are hit: solid graph objects (path, vertices) > thin graph lines (their hover
//   tolerance is wider than their drawn 0.3 mm width, so they must not steal hits from the path drawn over them)
//   > tumour surfaces > brain (the surfaces are translucent and enclose the graph). Within a class, the object
//   nearest to the camera wins. Hidden or 0-opacity layers are ignored.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type PickClass = 'graph' | 'line' | 'tumour' | 'brain';
export interface MeshPickable { kind: 'mesh'; cls: PickClass; label: string; color: string; pts: ArrayLike<number>; tris: ArrayLike<number>; bbox: Float64Array }
export interface LinePickable { kind: 'lines'; cls: PickClass; label: string; color: string; segments: Float32Array }
/** spheres: x,y,z,r per node; tubes: x0,y0,z0,x1,y1,z1,r per edge (world mm) */
export interface ShapePickable { kind: 'shapes'; cls: PickClass; label: string; color: string; spheres: Float64Array; tubes: Float64Array; bbox: Float64Array }
export type Pickable = MeshPickable | LinePickable | ShapePickable;
export interface VolumePickState {
  expert: { vol: any; visible: boolean } | null;
  prediction: { vol: any; visible: boolean; showLabels: Record<number, boolean> } | null;
}
export interface PickResult { label: string; color: string }

const LABEL_NAMES: Record<number, [string, string]> = { 1: ['NCR/NET', '#dc3232'], 2: ['Edema', '#3cc85a'], 4: ['Enhancing Tumor', '#fad228'] };
const RANK: Record<PickClass, number> = { graph: 0, line: 1, tumour: 2, brain: 3 };

export function bboxOf(pts: ArrayLike<number>): Float64Array {
  const b = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < pts.length; i += 3) {
    for (let a = 0; a < 3; a++) { const v = pts[i + a]; if (v < b[a]) b[a] = v; if (v > b[a + 3]) b[a + 3] = v; }
  }
  return b;
}

/** The sphere/cylinder geometry NiiVue's connectome mesher builds from a layer's JSON (same radius rules). */
export function connectomeShapes(j: any): { spheres: Float64Array; tubes: Float64Array; bbox: Float64Array } {
  const nodes: any[] = j.nodes ?? [], edges: any[] = j.edges ?? [];
  const sph: number[] = [], tub: number[] = [];
  const nMin = j.nodeMinColor, nMax = j.nodeMaxColor, eMin = j.edgeMin, eMax = j.edgeMax;
  for (const n of nodes) {
    const r = n.sizeValue * (j.nodeScale ?? 3);
    if (r <= 0 || (nMin < nMax && n.colorValue < nMin)) continue;
    sph.push(n.x, n.y, n.z, r);
  }
  for (const e of edges) {
    const c = Math.abs(e.colorValue), r = c * (j.edgeScale ?? 1);
    if (r <= 0 || (eMin < eMax && c < eMin)) continue;
    const a = nodes[e.first], b = nodes[e.second];
    if (!a || !b) continue;
    tub.push(a.x, a.y, a.z, b.x, b.y, b.z, r);
  }
  const bbox = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  const grow = (x: number, y: number, z: number, r: number) => {
    bbox[0] = Math.min(bbox[0], x - r); bbox[1] = Math.min(bbox[1], y - r); bbox[2] = Math.min(bbox[2], z - r);
    bbox[3] = Math.max(bbox[3], x + r); bbox[4] = Math.max(bbox[4], y + r); bbox[5] = Math.max(bbox[5], z + r);
  };
  for (let i = 0; i < sph.length; i += 4) grow(sph[i], sph[i + 1], sph[i + 2], sph[i + 3]);
  for (let i = 0; i < tub.length; i += 7) { grow(tub[i], tub[i + 1], tub[i + 2], tub[i + 6]); grow(tub[i + 3], tub[i + 4], tub[i + 5], tub[i + 6]); }
  return { spheres: new Float64Array(sph), tubes: new Float64Array(tub), bbox };
}

/** nearest entry of the ray into spheres / tubes, as t in [0,1]; Infinity when none */
function rayShapes(o: number[], d: number[], sph: Float64Array, tub: Float64Array): number {
  let best = Infinity;
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  for (let i = 0; i < sph.length; i += 4) {
    const ox = o[0] - sph[i], oy = o[1] - sph[i + 1], oz = o[2] - sph[i + 2], r = sph[i + 3];
    const b = ox * d[0] + oy * d[1] + oz * d[2], c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - dd * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / dd;
    if (t >= 0 && t <= 1 && t < best) best = t;
  }
  const dl = Math.sqrt(dd);
  for (let i = 0; i < tub.length; i += 7) {
    // closest points between the ray (t) and the segment (s), then step back to the tube surface
    const ux = tub[i + 3] - tub[i], uy = tub[i + 4] - tub[i + 1], uz = tub[i + 5] - tub[i + 2], r = tub[i + 6];
    const wx = o[0] - tub[i], wy = o[1] - tub[i + 1], wz = o[2] - tub[i + 2];
    const a = dd, b = d[0] * ux + d[1] * uy + d[2] * uz, c = ux * ux + uy * uy + uz * uz;
    const dw = d[0] * wx + d[1] * wy + d[2] * wz, uw = ux * wx + uy * wy + uz * wz;
    const den = a * c - b * b;
    let t: number, s: number;
    if (den < 1e-12) { t = 0; s = c > 0 ? uw / c : 0; } else { t = (b * uw - c * dw) / den; s = (a * uw - b * dw) / den; }
    s = Math.max(0, Math.min(1, s));
    t = (b * s - dw) / a;
    const px = o[0] + t * d[0] - (tub[i] + s * ux), py = o[1] + t * d[1] - (tub[i + 1] + s * uy), pz = o[2] + t * d[2] - (tub[i + 2] + s * uz);
    const dist2 = px * px + py * py + pz * pz;
    if (dist2 > r * r) continue;
    const te = t - Math.sqrt(r * r - dist2) / dl;
    if (te >= 0 && te <= 1 && te < best) best = te;
  }
  return best;
}

/** gl-matrix compatible column-major 4x4 inverse */
function invert(m: ArrayLike<number>): Float64Array | null {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = Array.from(m);
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  return new Float64Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ]);
}

function xform(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number] {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
}

/** slab test: does the ray o + t d (t in [0,1]) meet the box? */
function hitsBox(o: number[], d: number[], b: Float64Array): boolean {
  let t0 = 0, t1 = 1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b[a] || o[a] > b[a + 3]) return false; continue; }
    let ta = (b[a] - o[a]) / d[a], tb = (b[a + 3] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** nearest Möller–Trumbore hit (two-sided) along the ray, as t in [0,1]; Infinity when none */
function rayMesh(o: number[], d: number[], pts: ArrayLike<number>, tris: ArrayLike<number>): number {
  let best = Infinity;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const ia = tris[i] * 3, ib = tris[i + 1] * 3, ic = tris[i + 2] * 3;
    const ax = pts[ia], ay = pts[ia + 1], az = pts[ia + 2];
    const e1x = pts[ib] - ax, e1y = pts[ib + 1] - ay, e1z = pts[ib + 2] - az;
    const e2x = pts[ic] - ax, e2y = pts[ic + 1] - ay, e2z = pts[ic + 2] - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-7 || u > 1 + 1e-7) continue;   // tiny tolerance: rays through a shared edge or vertex still hit
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < -1e-7 || u + v > 1 + 1e-7) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t >= 0 && t <= 1 && t < best) best = t;
  }
  return best;
}

/** Name of the topmost visible element at canvas pixel (px, py) (device pixels), or null. */
export function pickAt(nv: any, px: number, py: number, pickables: Pickable[], vols: VolumePickState): PickResult | null {
  const tiles: any[] = nv.screenSlices ?? [];
  const tile = tiles.find((s) => {
    const [l, t, w, h] = s.leftTopWidthHeight;
    return px >= l && px <= l + w && py >= t && py <= t + h;
  });
  if (!tile) return null;
  if (tile.axCorSag !== 4) return pick2D(nv, px, py, vols);
  return pick3D(nv, px, py, tile.leftTopWidthHeight, pickables);
}

function pick2D(nv: any, px: number, py: number, vols: VolumePickState): PickResult | null {
  const frac = nv.canvasPos2frac([px, py]);
  if (!frac || frac[0] < 0) return null;
  const mm = nv.frac2mm(frac, 0, true);
  const value = (vol: any) => {
    const v = vol.mm2vox(mm);
    const d = vol.dims;
    if (d && (v[0] < 0 || v[1] < 0 || v[2] < 0 || v[0] >= d[1] || v[1] >= d[2] || v[2] >= d[3])) return 0;
    return Math.round(vol.getValue(v[0], v[1], v[2]));
  };
  if (vols.expert?.visible && value(vols.expert.vol) > 0) return { label: 'Expert Reference', color: '#4f9bff' };
  const p = vols.prediction;
  if (p?.visible) {
    const l = value(p.vol);
    if (LABEL_NAMES[l] && p.showLabels[l]) return { label: LABEL_NAMES[l][0], color: LABEL_NAMES[l][1] };
  }
  return null;
}

function pick3D(nv: any, px: number, py: number, ltwh: number[], pickables: Pickable[]): PickResult | null {
  const [mvp] = nv.calculateMvpMatrix(null, ltwh, nv.scene.renderAzimuth, nv.scene.renderElevation);
  const inv = invert(mvp);
  if (!inv) return null;
  const nx = ((px - ltwh[0]) / ltwh[2]) * 2 - 1;
  const ny = 1 - ((py - ltwh[1]) / ltwh[3]) * 2;
  // NiiVue's orthographic projection is built with near = 8s and far = 0.01s, i.e. a reversed depth range:
  // ndc z = +1 is the camera side. The ray therefore runs from z = +1 (t = 0, nearest) to z = -1 (t = 1).
  const near = xform(inv, nx, ny, 1), far = xform(inv, nx, ny, -1);
  const dir = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
  const toPx = (x: number, y: number, z: number) => {
    const c = xform(mvp, x, y, z);
    return [ltwh[0] + ((c[0] + 1) / 2) * ltwh[2], ltwh[1] + ((1 - c[1]) / 2) * ltwh[3], c[2]];
  };
  let best: { rank: number; t: number; p: Pickable } | null = null;
  const consider = (p: Pickable, t: number) => {
    const rank = RANK[p.cls];
    if (!best || rank < best.rank || (rank === best.rank && t < best.t)) best = { rank, t, p };
  };
  for (const p of pickables) {
    if (best && RANK[p.cls] > (best as { rank: number }).rank) continue;
    if (p.kind === 'mesh') {
      if (!hitsBox(near, dir, p.bbox)) continue;
      const t = rayMesh(near, dir, p.pts, p.tris);
      if (t !== Infinity) consider(p, t);
    } else if (p.kind === 'shapes') {
      if (!hitsBox(near, dir, p.bbox)) continue;
      const t = rayShapes(near, dir, p.spheres, p.tubes);
      if (t !== Infinity) consider(p, t);
    } else {
      const s = p.segments;
      const tol = 4 * (window.devicePixelRatio || 1);
      for (let i = 0; i + 5 < s.length; i += 6) {
        const a = toPx(s[i], s[i + 1], s[i + 2]), b = toPx(s[i + 3], s[i + 4], s[i + 5]);
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const len2 = ex * ex + ey * ey;
        const u = len2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / len2)) : 0;
        const dx = a[0] + u * ex - px, dy = a[1] + u * ey - py;
        if (dx * dx + dy * dy <= tol * tol) {
          const z = a[2] + u * (b[2] - a[2]);
          if (z >= -1 && z <= 1) consider(p, (1 - z) / 2);
        }
      }
    }
  }
  const b = best as { p: Pickable } | null;
  return b ? { label: b.p.label, color: b.p.color } : null;
}
