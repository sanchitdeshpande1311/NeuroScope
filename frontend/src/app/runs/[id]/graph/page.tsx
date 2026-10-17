"use client";

// Graph Analysis: left panel = exactly three cards (Path settings, Graph overview, Tumour components);
// stage = the persistent case viewer with graph overlays + a three-card Layers popover.
// All values come from /api/runs/{id}/spatial-graph (lattice graph + scipy Dijkstra on this case's prediction).
import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Loader2, RotateCcw } from 'lucide-react';
import { API, fetchCached } from '@/lib/api';
import { useStore, type ViewerSettings } from '@/lib/store';
import { getCursor } from '@/lib/cursor';
import { useRun, useViewerConfig, useWorkspace, type ViewerConfig } from '@/components/RunContext';
import { DefinitionsToggle, LayersPopover } from '@/components/LayersMenu';
import { InfoTip, Segmented, Select, Slider, Switch, Tip, fmt } from '@/components/ui';
import type { ConnectomeLayer } from '@/components/NiiVueViewer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const CLASS_LABEL: Record<string, string> = { non_tumour_brain: 'Non-tumour', ncr_net: 'NCR/NET', edema: 'Edema', enhancing: 'Enhancing' };
const CLASS_CSS: Record<string, string> = { non_tumour_brain: '#9aa3b2', ncr_net: '#dc3232', edema: '#3cc85a', enhancing: '#fad228' };
// colormap stops checked in node_modules/@niivue/niivue/src/cmaps: gray .75 grey, red 1 red, green 1 green, gold .67 gold
const NODE_CMAP: Record<number, [string, number]> = { 0: ['gray', 0.75], 1: ['red', 1], 2: ['green', 1], 4: ['gold', 0.67] };
const BASE = { nodeColormapNegative: 'winter', nodeMinColor: 0, nodeMaxColor: 1, edgeColormapNegative: 'winter', edgeMin: 0, edgeMax: 1, showLegend: false };
type Node = { name: string; x: number; y: number; z: number; colorValue: number; sizeValue: number };

function connectome(name: string, nodes: Node[], edges: [number, number][], cmap: string, nodeScale: number, edgeScale: number, edgeValue = 1) {
  return { ...BASE, name, nodeColormap: cmap, edgeColormap: cmap, nodeScale, edgeScale, nodes, edges: edges.map(([a, b]) => ({ first: a, second: b, colorValue: edgeValue })) };
}

/** Path layers built ONLY from the returned Dijkstra vertex sequence (points_mm, vertex_class). */
function pathLayers(p: Any) {
  const pts: number[][] = p.points_mm, cls: string[] = p.vertex_class;
  const tumourEdges: [number, number][] = [], otherEdges: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) (cls[i] !== 'non_tumour_brain' && cls[i + 1] !== 'non_tumour_brain' ? tumourEdges : otherEdges).push([i, i + 1]);
  const usedT = new Set(tumourEdges.flat()), usedO = new Set(otherEdges.flat());
  const nodes = (val: number, used: Set<number>) => pts.map((q, i) => ({ name: `p${i}`, x: q[0], y: q[1], z: q[2], colorValue: val, sizeValue: used.has(i) ? 0.9 : 0.01 }));
  const end = (q: number[], name: string) => ({ name, x: q[0], y: q[1], z: q[2], colorValue: 1, sizeValue: 2.8 });
  return {
    tumour: connectome('path_tumour', nodes(0.6, usedT), tumourEdges, 'electric_blue', 1, 1.6, 0.6),
    other: connectome('path_non_tumour', nodes(0.5, usedO), otherEdges, 'hot', 1, 1.6, 0.5),
    source: connectome('path_source', [end(pts[0], 'source')], [], 'cool', 1, 1),
    dest: connectome('path_destination', [end(pts.at(-1)!, 'destination')], [], 'violet', 1, 1),
  };
}

const DEFAULT_SHOW = { vertices: true, edges: true, boundaryEdges: false, surfaces: true, brain: true, path: true, nonTumourPath: true, lattice: false };
const DEFAULT_OP = { brain: 0.2, tumour: 0.25, edges: 0.5, path: 1 };

export default function GraphPage() {
  const { id } = useRun();
  const { graphSel, setGraphSel, setCrosshair } = useStore();
  const { stageSlot, nv } = useWorkspace();
  const saved = graphSel[id];
  const [targetMm, setTargetMm] = useState(saved?.targetMm ?? 4);
  const [g, setG] = useState<Any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [path, setPath] = useState<Any>(null);
  const [pathErr, setPathErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState(saved?.src ?? ''), [dst, setDst] = useState(saved?.dst ?? '');
  const [mode, setMode] = useState<'A' | 'B'>(saved?.mode ?? 'A');
  const [alpha, setAlpha] = useState(saved?.alpha ?? 5);
  const [view, setView] = useState<'render' | 'grid'>('render');
  const [show, setShow] = useState(DEFAULT_SHOW);
  const [op, setOp] = useState(DEFAULT_OP);
  const [selComp, setSelComp] = useState<number | null>(null);
  const [lattice, setLattice] = useState<Any>(null);
  const alphaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const compute = useCallback(async (s: string, t: string, m: 'A' | 'B', a: number, spacing: number) => {
    if (!s || !t || s === t) return;
    setBusy(true); setPathErr(null);
    try {
      const q = new URLSearchParams({ src: s, dst: t, mode: m, alpha: String(a), target_mm: String(spacing) });
      const r = await fetch(`${API}/api/runs/${id}/spatial-graph/path?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? d.detail ?? `HTTP ${r.status}`);
      setPath(d);
      setGraphSel(id, { src: s, dst: t, mode: m, alpha: a, targetMm: spacing });
    } catch (e) { setPathErr((e as Error).message); } finally { setBusy(false); }
  }, [id, setGraphSel]);

  useEffect(() => {
    let alive = true;
    setG(null); setErr(null); setPath(null); setLattice(null); // eslint-disable-line react-hooks/set-state-in-effect
    fetchCached<Any>(`${id}:sgraph:${targetMm}`, `${API}/api/runs/${id}/spatial-graph?target_mm=${targetMm}`)
      .then((d) => {
        if (!alive) return;
        setG(d);
        const s0 = saved?.src, d0 = saved?.dst;
        if (s0 && d0 && s0 !== d0) { setSrc(s0); setDst(d0); compute(s0, d0, saved!.mode, saved!.alpha, targetMm); }
        else if (d.default_path) { setPath(d.default_path); setSrc(`c${d.components[0].id}`); setDst(`c${d.components[1].id}`); }
        else if (d.components.length) { setSrc(`c${d.components[0].id}`); setDst(''); }
      })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, targetMm]);

  useEffect(() => {
    if (!show.lattice || lattice) return;
    fetchCached<Any>(`${id}:lattice:${targetMm}`, `${API}/api/runs/${id}/spatial-graph/lattice?target_mm=${targetMm}`).then(setLattice).catch(() => {});
  }, [show.lattice, lattice, id, targetMm]);

  // ---------------- overlays: only real graph vertices/edges and the returned path
  const vertexJson = useMemo(() => {
    if (!g) return null;
    const out: Record<number, Any> = {};
    for (const c of [0, 1, 2, 4]) {
      const vs = g.render.vertices.filter((v: number[]) => v[4] === c);
      if (vs.length) out[c] = connectome(`vertices_${c}`, vs.map((v: number[]) => ({ name: `v${v[0]}`, x: v[1], y: v[2], z: v[3], colorValue: NODE_CMAP[c][1], sizeValue: 0.55 })), [], NODE_CMAP[c][0], 1, 1);
    }
    return out;
  }, [g]);
  const edgeLines = useMemo(() => {
    if (!g) return null;
    const pos = new Map<number, number[]>(g.render.vertices.map((v: number[]) => [v[0], v]));
    const tum: number[] = [], bnd: number[] = [];
    for (const [a, b] of g.render.edges as [number, number][]) {
      const A = pos.get(a)!, B = pos.get(b)!;
      (A[4] > 0 && B[4] > 0 ? tum : bnd).push(A[1], A[2], A[3], B[1], B[2], B[3]);
    }
    return {
      tumour: { segments: new Float32Array(tum), rgba255: [235, 235, 235, 255] as [number, number, number, number], radius: 0.15 },
      boundary: { segments: new Float32Array(bnd), rgba255: [110, 165, 255, 255] as [number, number, number, number], radius: 0.12 },
    };
  }, [g]);
  const latticeLines = useMemo(() => {
    if (!lattice) return null;
    const seg = new Float32Array(lattice.src.length * 6);
    for (let i = 0; i < lattice.src.length; i++) { const a = lattice.mm[lattice.src[i]], b = lattice.mm[lattice.dst[i]]; seg.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6); }
    return { segments: seg, rgba255: [150, 150, 165, 255] as [number, number, number, number], radius: 0 };
  }, [lattice]);
  const pl = useMemo(() => (path?.reachable && path.points_mm.length > 0 ? pathLayers(path) : null), [path]);
  const compJson = useMemo(() => {
    if (!g || selComp === null) return null;
    const vs = g.render.vertices.filter((v: number[]) => v[5] === selComp);
    return connectome(`component_${selComp}`, vs.map((v: number[]) => ({ name: `v${v[0]}`, x: v[1], y: v[2], z: v[3], colorValue: 0, sizeValue: 1.1 })), [], 'cool', 1, 1);
  }, [g, selComp]);

  const layers: ConnectomeLayer[] = useMemo(() => {
    const L: ConnectomeLayer[] = [];
    // `definition` = the name Show Definitions displays when the pointer is over that rendered layer
    if (vertexJson) for (const [c, j] of Object.entries(vertexJson)) L.push({ key: `vertices_${c}`, json: j, visible: show.vertices, definition: 'Vertex', definitionColor: '#c8c8d2' });
    if (edgeLines) {
      L.push({ key: 'edges_tumour', lines: edgeLines.tumour, visible: show.edges, opacity: op.edges, definition: 'Tumour Edge', definitionColor: '#ebebeb' });
      L.push({ key: 'edges_boundary', lines: edgeLines.boundary, visible: show.boundaryEdges, opacity: op.edges, definition: 'Boundary Edge', definitionColor: '#6ea5ff' });
    }
    if (latticeLines) L.push({ key: 'lattice', lines: latticeLines, visible: show.lattice, definition: 'Lattice Edge', definitionColor: '#9696a5' });
    if (compJson) L.push({ key: 'component_highlight', json: compJson, visible: true, definition: `Component ${selComp}`, definitionColor: '#4fd4ff' });
    if (pl) {
      L.push({ key: 'path_tumour', json: pl.tumour, visible: show.path, opacity: op.path, definition: 'Shortest Path', definitionColor: '#467dee' });
      L.push({ key: 'path_non_tumour', json: pl.other, visible: show.path && show.nonTumourPath, opacity: op.path, definition: 'Non-tumour Path Segment', definitionColor: '#ff7814' });
      L.push({ key: 'path_source', json: pl.source, visible: show.path, opacity: 1, definition: 'Path Source', definitionColor: '#00e6ff' });
      L.push({ key: 'path_destination', json: pl.dest, visible: show.path, opacity: 1, definition: 'Path Destination', definitionColor: '#ff00ff' });
    }
    return L;
  }, [vertexJson, edgeLines, latticeLines, compJson, selComp, pl, show, op]);

  const overrides: Partial<ViewerSettings> = useMemo(() => ({
    showRefined: false, showExpert: false, showBrain: show.brain, brainOpacity: op.brain,
    showMeshes: show.surfaces ? { WT: true, TC: true, ET: true } : { WT: false, TC: false, ET: false }, meshOpacity: op.tumour,
  }), [show.brain, show.surfaces, op.brain, op.tumour]);
  const cfg: ViewerConfig = useMemo(() => ({ hidden: false, mode: view, hide3DVolume: true, connectomes: layers, settings: overrides, layersMenu: 'none' }), [view, layers, overrides]);
  useViewerConfig(cfg);

  const reset = () => {
    const n = nv();
    if (n) { n.setRenderAzimuthElevation(110, 15); n.scene.volScaleMultiplier = 1; n.scene.pan2Dxyzmm = [0, 0, 0, 1]; n.drawScene(); }
    setShow(DEFAULT_SHOW); setOp(DEFAULT_OP); setView('render'); setSelComp(null);
  };
  const highlight = (cid: number | null) => {
    setSelComp(cid);
    const c = g?.components.find((x: Any) => x.id === cid);
    const n = nv();
    if (c && n) { n.scene.crosshairPos = n.mm2frac(c.centroid_mm); n.drawScene(); setCrosshair(id, c.centroid_mm); }
  };
  const fromCrosshair = () => { const c = getCursor(); return c ? `mm:${c.mm.map((v) => v.toFixed(2)).join(',')}` : null; };
  const pickSrc = (s: string | null) => { if (!s) return; setSrc(s); compute(s, dst, mode, alpha, targetMm); };
  const pickDst = (s: string | null) => { if (!s) return; setDst(s); compute(src, s, mode, alpha, targetMm); };
  const pickMode = (m: 'A' | 'B') => { setMode(m); compute(src, dst, m, alpha, targetMm); };
  const pickAlpha = (a: number) => {
    setAlpha(a);
    if (alphaTimer.current) clearTimeout(alphaTimer.current);
    alphaTimer.current = setTimeout(() => compute(src, dst, 'B', a, targetMm), 350);
  };
  const tog = (k: keyof typeof DEFAULT_SHOW) => (c: boolean) => setShow((s) => ({ ...s, [k]: c }));

  const stage = stageSlot && createPortal(
    <div className="stage-tl">
      <LayersPopover testId="glayers">
        <section className="pop-card">
          <h3>Visibility</h3>
          <Switch label="Vertices" testId="g-vertices" checked={show.vertices} onChange={tog('vertices')} />
          <Switch label="Tumour edges" swatch="#ebebeb" testId="g-edges" checked={show.edges} onChange={tog('edges')} />
          <Switch label="Boundary edges" swatch="#6ea5ff" testId="g-bedges" checked={show.boundaryEdges} onChange={tog('boundaryEdges')} />
          <Switch label="Tumour surfaces" swatch="var(--l2)" testId="g-surfaces" checked={show.surfaces} onChange={tog('surfaces')} />
          <Switch label="Brain" swatch="#c8c8d2" testId="g-brain" checked={show.brain} onChange={tog('brain')} />
          <Switch label="Shortest path" swatch="#467dee" testId="g-path" checked={show.path} onChange={tog('path')} disabled={!pl} />
          <Switch label="Non-tumour path segments" swatch="#ff7814" testId="g-nontumour" checked={show.nonTumourPath} onChange={tog('nonTumourPath')} disabled={!pl} />
          <Switch label="Whole-brain lattice" testId="g-lattice" checked={show.lattice} onChange={tog('lattice')} hint="All graph edges as thin lines (fixed opacity)" />
        </section>
        <section className="pop-card">
          <h3>Opacity</h3>
          <Slider label="Brain" value={op.brain} testId="op-brain" onChange={(x) => setOp((o) => ({ ...o, brain: x }))} />
          <Slider label="Tumour surfaces" value={op.tumour} testId="op-tumour" onChange={(x) => setOp((o) => ({ ...o, tumour: x }))} />
          <Slider label="Edges" value={op.edges} testId="op-edges" onChange={(x) => setOp((o) => ({ ...o, edges: x }))} />
          <Slider label="Path" value={op.path} min={0.1} testId="op-path" onChange={(x) => setOp((o) => ({ ...o, path: x }))} />
        </section>
        <section className="pop-card">
          <h3>View</h3>
          <Segmented dark testId="g-view" value={view} onChange={setView} options={[{ value: 'render', label: '3D only' }, { value: 'grid', label: '3D + slices' }]} />
          <button type="button" className="btn btn-dark btn-sm" style={{ marginTop: 8 }} onClick={reset} data-testid="g-reset"><RotateCcw size={15} /> Reset view</button>
        </section>
        <DefinitionsToggle />
      </LayersPopover>
    </div>, stageSlot);

  if (err && !g) return <><div className="panel-title"><h1>Graph Analysis</h1></div><div className="msg msg-err">Graph analysis is unavailable for this case: {err}</div></>;
  if (!g) return <><div className="panel-title"><h1>Graph Analysis</h1></div><div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Loader2 size={18} className="spin" /> Building the spatial graph…</div>{stage}</>;
  const st = g.stats;
  const comps: Any[] = g.components;
  const compOpt = (other: string) => comps.map((c) => <option key={c.id} value={`c${c.id}`} disabled={`c${c.id}` === other}>Component {c.id} · {fmt(c.volume_ml)} mL</option>);
  const srcMm: number[] | null = path?.source?.mm ?? null;

  return (
    <>
      <div className="panel-title"><h1>Graph Analysis</h1>
        <InfoTip side="bottom" text="Spatial connectivity analysis of this prediction: a lattice graph over the brain with edges between neighbouring points weighted by physical distance; Dijkstra finds the lowest-cost path. It does not predict tumour growth or spread." /></div>

      <div className="card feature" data-testid="path-select">
        <div className="card-head"><span className="card-title">Path settings</span>{busy && <Loader2 size={18} className="spin" />}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div className="field"><span className="field-label">Source</span>
            <div className="field-row">
              <Select value={src.startsWith('c') ? src : ''} onChange={(v) => pickSrc(v)} testId="g-src" ariaLabel="Source">
                <option value="" disabled>{src.startsWith('mm:') ? 'Crosshair point' : 'Choose…'}</option>{compOpt(dst)}</Select>
              <Tip text="Use crosshair as source" side="left"><button type="button" className="btn btn-secondary btn-icon" onClick={() => pickSrc(fromCrosshair())} data-testid="g-src-cross" aria-label="Use crosshair as source"><Crosshair size={17} /></button></Tip>
            </div></div>
          <div className="field"><span className="field-label">Destination</span>
            <div className="field-row">
              <Select value={dst.startsWith('c') ? dst : ''} onChange={(v) => pickDst(v)} testId="g-dst" ariaLabel="Destination">
                <option value="" disabled>{dst.startsWith('mm:') ? 'Crosshair point' : 'Choose…'}</option>{compOpt(src)}</Select>
              <Tip text="Use crosshair as destination" side="left"><button type="button" className="btn btn-secondary btn-icon" onClick={() => pickDst(fromCrosshair())} data-testid="g-dst-cross" aria-label="Use crosshair as destination"><Crosshair size={17} /></button></Tip>
            </div></div>
          <div className="field"><span className="field-label">Cost mode <InfoTip side="bottom" text={mode === "A" ? g.cost_modes.A : g.cost_modes.B} /></span>
            <Segmented testId="g-mode" value={mode} onChange={pickMode} options={[{ value: 'A', label: 'A · Distance' }, { value: 'B', label: 'B · Experimental' }]} /></div>
          {mode === 'B' && <Slider label="Non-tumour penalty α (experimental)" value={alpha} min={1} max={20} step={0.5} format={(x) => x.toFixed(1)} testId="g-alpha" onChange={pickAlpha} />}
          <div className="field"><span className="field-label">Lattice spacing</span>
            <Select value={String(targetMm)} onChange={(v) => setTargetMm(+v)} testId="g-spacing" ariaLabel="Lattice spacing">
              {[3, 4, 6].map((v) => <option key={v} value={v}>{v} mm</option>)}</Select></div>
          {pathErr && <div className="msg msg-err">{pathErr}</div>}
          {path && (path.reachable ? (
            <div className="path-status" data-testid="path-results">
              <div className="row"><span className="muted">Shortest path</span><span className="big" data-testid="path-length">{fmt(path.length_mm, 1)} mm</span></div>
              <div className="row"><span className="muted">Straight line · steps</span><span>{fmt(path.euclidean_mm, 1)} mm · {path.n_edges}</span></div>
              {path.mode === 'B' && <div className="row"><span className="muted">Weighted cost (α {path.alpha})</span><span>{fmt(path.total_cost, 1)}</span></div>}
              <div className="tissuebar" title="Path length by tissue">
                {Object.entries(path.length_by_class_mm as Record<string, number>).filter(([, x]) => x > 0).map(([k, x]) => <span key={k} style={{ width: `${(100 * x) / Math.max(path.length_mm, 1e-9)}%`, background: CLASS_CSS[k] }} />)}
              </div>
              <div className="legend" data-testid="path-tissue">
                {Object.entries(path.length_by_class_mm as Record<string, number>).filter(([, x]) => x > 0).map(([k, x]) => <span key={k}><span className="swatch" style={{ background: CLASS_CSS[k] }} />{CLASS_LABEL[k]} {fmt(x, 1)} mm</span>)}
              </div>
            </div>
          ) : <div className="msg msg-warn" data-testid="no-path">No path: the two points are not connected in the graph.</div>)}
        </div>
      </div>

      <div className="card flat" data-testid="graph-overview">
        <div className="card-head"><span className="card-title">Graph overview</span>
          <InfoTip text={`Lattice ${st.lattice_spacing_mm.map((x: number) => x.toFixed(1)).join(' × ')} mm · ${st.isolated_vertices} isolated vertices · integrity checks ${g.checks.all_passed ? 'passed' : 'FAILED'} · built in ${st.build_s.toFixed(1)} s`} /></div>
        <div className="stat-trio">
          <div><div className="k">Vertices</div><div className="v" data-testid="g-nv">{st.vertices.toLocaleString()}</div></div>
          <div><div className="k">Edges</div><div className="v">{st.edges.toLocaleString()}</div></div>
          <div><div className="k">Components</div><div className="v">{st.connected_components}</div></div>
        </div>
      </div>

      <div className="card" data-testid="component-table">
        <div className="card-head"><span className="card-title">Tumour components</span><span className="card-hint">{comps.length > 10 ? `largest 10 of ${comps.length}` : `${comps.length} total`}</span></div>
        <table className="table">
          <thead><tr><th>ID</th><th>mL</th><th title="Centroid (mm)">Centroid</th><th>From source</th><th>Path</th></tr></thead>
          <tbody>{comps.slice(0, 10).map((c) => {
            const role = `c${c.id}` === src ? 'Source' : `c${c.id}` === dst ? 'Destination' : null;
            const reach = path?.source ? (c.graph_component === path.source.graph_component ? 'Connected' : 'No path') : '—';
            return (
              <tr key={c.id} className={`clickable ${selComp === c.id ? 'sel' : ''}`} onClick={() => highlight(selComp === c.id ? null : c.id)} title="Highlight this component">
                <td>{c.id}</td><td>{fmt(c.volume_ml)}</td><td>{c.centroid_mm.map((x: number) => x.toFixed(0)).join(', ')}</td>
                <td>{srcMm ? `${fmt(Math.hypot(c.centroid_mm[0] - srcMm[0], c.centroid_mm[1] - srcMm[1], c.centroid_mm[2] - srcMm[2]), 1)} mm` : '—'}</td>
                <td>{role ?? reach}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      {stage}
    </>
  );
}
