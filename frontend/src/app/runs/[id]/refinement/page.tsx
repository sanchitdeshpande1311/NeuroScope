"use client";

// Refinement Before & After: two linked viewers (original prediction vs refined mask of THIS case) and the
// numerical comparison computed by /api/runs/{id}/refinement from the two saved masks. No accuracy claims here;
// agreement with an expert reference belongs to Expert Comparison.
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Niivue } from '@niivue/niivue';
import { CheckCircle2, Loader2, MinusCircle } from 'lucide-react';
import { API, fetchCached, fileUrl } from '@/lib/api';
import { useStore } from '@/lib/store';
import { setCursor } from '@/lib/cursor';
import { useRun, useViewerConfig, useWorkspace, type ViewerConfig } from '@/components/RunContext';
import { Readout } from '@/components/LayersMenu';
import { InfoTip, fmt } from '@/components/ui';
import type { CursorInfo } from '@/components/NiiVueViewer';

const NiiVueViewer = dynamic(() => import('@/components/NiiVueViewer'), { ssr: false });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R = ['WT', 'TC', 'ET'] as const;
const HIDDEN: ViewerConfig = { hidden: true, mode: 'grid', hide3DVolume: false, connectomes: [], settings: null, layersMenu: 'none' };

const signed = (v: number, d: number) => (v === 0 ? (0).toFixed(d) : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`);
const rel = (before: number, after: number) => (after === before ? '0.00 %' : before === 0 ? '—' : `${signed((100 * (after - before)) / before, 2)} %`);

export default function RefinementPage() {
  const { id, run } = useRun();
  const { viewer, getCrosshair, setCrosshair } = useStore();
  const { stageSlot } = useWorkspace();
  const [data, setData] = useState<Any>(null);
  const [err, setErr] = useState<string | null>(null);
  const nvs = useRef<Record<string, Niivue>>({});
  useViewerConfig(HIDDEN);

  useEffect(() => {
    fetchCached<Any>(`${id}:refinement`, `${API}/api/runs/${id}/refinement`).then(setData).catch((e) => setErr(e.message));
  }, [id]);

  // same label colours/opacity as the rest of the app; no surfaces (they exist only for the original mask)
  const settings = useMemo(() => ({ ...viewer, showRefined: false, showExpert: false, showPrediction: true }), [viewer]);
  const onCursor = (key: string) => (c: CursorInfo) => {
    setCrosshair(id, c.mm); setCursor(c);
    const other = nvs.current[key === 'b' ? 'r' : 'b'];
    if (other) { other.scene.crosshairPos = other.mm2frac(c.mm); other.drawScene(); }   // linked crosshair
  };
  const refinedUrl = fileUrl(run, 'seg_refined.nii.gz');
  const pc = data?.prediction_change?.regions;
  const removed = pc ? R.reduce((a, k) => a + pc[k].removed_voxels, 0) : 0;
  const added = pc ? R.reduce((a, k) => a + pc[k].added_voxels, 0) : 0;
  const wtRemoved = pc ? pc.WT.removed_voxels : 0;
  const changed = removed + added > 0;
  const nComp = data?.prediction_change?.removed_components?.length ?? 0;

  const stage = stageSlot && refinedUrl && createPortal(
    <div className="compare">
      <div className="compare-views">
        {[{ key: 'b', title: 'Before', url: fileUrl(run, 'seg.nii.gz')! }, { key: 'r', title: 'After', url: refinedUrl }].map((s) => (
          <div className="compare-pane" key={s.key}>
            <span className="compare-tag glass">{s.title}</span>
            <NiiVueViewer backgroundUrl={fileUrl(run, 't1c.nii.gz')!} segUrl={s.url} affine={run.affine} settings={settings}
              initialCrosshairMm={getCrosshair(id)} onCursor={onCursor(s.key)} onReady={(nv) => { nvs.current[s.key] = nv; }} testId={`niivue-${s.key}`} />
          </div>
        ))}
      </div>
      {pc && (
        <div className="compare-table glass" data-testid="change-table">
          <table className="table table-dark">
            <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Difference</th><th>Relative change</th></tr></thead>
            <tbody>
              {R.map((k) => <tr key={k}><td>{k} volume (mL)</td><td>{fmt(pc[k].baseline_ml, 3)}</td><td>{fmt(pc[k].refined_ml, 3)}</td><td>{signed(pc[k].refined_ml - pc[k].baseline_ml, 3)}</td><td>{rel(pc[k].baseline_ml, pc[k].refined_ml)}</td></tr>)}
              {R.map((k) => <tr key={`c${k}`}><td>{k} connected components</td><td>{pc[k].components_baseline}</td><td>{pc[k].components_refined}</td><td>{signed(pc[k].components_refined - pc[k].components_baseline, 0)}</td><td>{rel(pc[k].components_baseline, pc[k].components_refined)}</td></tr>)}
              <tr><td>Voxels changed</td><td>—</td><td>—</td><td>{(removed + added).toLocaleString()}</td><td>{pc.WT.baseline_voxels ? `${((100 * wtRemoved) / pc.WT.baseline_voxels).toFixed(3)} % of WT` : '—'}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="stage-tr"><Readout /></div>
    </div>, stageSlot);

  return (
    <>
      <div className="panel-title"><h1>Refinement</h1><span className="sub">Before &amp; After</span></div>
      {!refinedUrl ? (
        <div className="empty"><h3>No refined mask</h3><p>This case has no refined segmentation to compare.</p></div>
      ) : err ? (
        <div className="msg msg-err">The comparison could not be loaded: {err}</div>
      ) : !data ? (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} className="spin" /> Comparing the two masks…</div>
      ) : (
        <>
          <div className="card" data-testid="refine-status">
            <div className="card-head"><span className="card-title">{changed ? <MinusCircle size={16} /> : <CheckCircle2 size={16} />}{changed ? 'Segmentation changed' : 'No change'}</span>
              <span className={`pill ${changed ? 'pill-warn' : 'pill-ok'}`}>{changed ? `${(removed + added).toLocaleString()} voxels` : 'Identical masks'}</span></div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {changed
                ? `${nComp} isolated fragment${nComp === 1 ? '' : 's'} removed (${wtRemoved.toLocaleString()} voxels, ${fmt(pc.WT.baseline_ml - pc.WT.refined_ml, 3)} mL). TC and ET ${pc.TC.removed_voxels + pc.ET.removed_voxels ? 'changed' : 'unchanged'}.`
                : 'The refinement did not change any voxel for this case; Before and After show the same mask.'}
            </p>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Operation</span><InfoTip text={`${data.method}. The unrefined prediction remains the primary result. Removed voxels are not confirmed errors, and a smaller volume is not by itself more accurate.`} /></div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.5 }}>Removes tumour fragments smaller than 10 mm³ that are not connected to any other predicted tumour.</p>
          </div>
          <p className="panel-foot">Agreement with an expert reference, when available, is shown in Expert Comparison.</p>
        </>
      )}
      {stage}
    </>
  );
}
