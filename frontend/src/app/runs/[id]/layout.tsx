"use client";

// Case workspace: left feature panel (page content) + one persistent viewer in the stage.
// Results, Full-screen viewer, Graph analysis and Expert comparison reuse the SAME viewer instance, so
// switching between them never reloads the MRI or re-runs anything; pages configure it via useViewerConfig.
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, usePathname } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Niivue } from '@niivue/niivue';
import { AlertCircle, Loader2, Upload } from 'lucide-react';
import { RUN_ID_RE, addRecent, fetchRun, fileUrl, removeRecent, type RunMeta } from '@/lib/api';
import { useStore } from '@/lib/store';
import { setCursor } from '@/lib/cursor';
import { DEFAULT_VIEWER, RunCtx, WorkspaceCtx, type ViewerConfig } from '@/components/RunContext';
import { CaseLayers, Readout } from '@/components/LayersMenu';
import { PanelDock } from '@/components/AppShell';

const NiiVueViewer = dynamic(() => import('@/components/NiiVueViewer'), { ssr: false });

/** Start the linked views at the largest predicted tumour component (world mm), so the slices show the result. */
function tumourCentre(run: RunMeta): [number, number, number] | null {
  const nodes = (run.graph?.nodes ?? []).filter((n: { region: string }) => n.region === 'WT');
  if (!nodes.length) return null;
  const big = nodes.reduce((a: { volume_ml: number }, b: { volume_ml: number }) => (b.volume_ml > a.volume_ml ? b : a));
  return big.centroid_mm as [number, number, number];
}

export default function RunLayout({ children }: LayoutProps<'/runs/[id]'>) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const { viewer, setCurrentRun, currentRun, getCrosshair, setCrosshair, definitions } = useStore();
  const valid = RUN_ID_RE.test(id ?? '');
  const [run, setRun] = useState<RunMeta | null>(null);
  const [error, setError] = useState<string | null>(valid ? null : 'This is not a valid case link.');
  const [config, setConfigState] = useState<ViewerConfig>(DEFAULT_VIEWER);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const nvRef = useRef<Niivue | null>(null);
  const full = /\/viewer$/.test(path ?? '');

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    setCursor(null);
    fetchRun(id).then((r) => {
      if (!alive) return;
      setRun(r);
      setCurrentRun(id);
      addRecent({ id, when: r.timestamp_utc, wt: r.volumes_ml?.baseline?.WT });
    }).catch((e) => {
      if (!alive) return;
      if (e.status === 404) { removeRecent(id); if (currentRun === id) setCurrentRun(null); }
      setError(e.status === 404 ? 'This case is no longer available. Cases are deleted automatically within 24 hours, or on request.' : `The case could not be loaded: ${e.message}`);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, valid]);

  const setConfig = useCallback((c: ViewerConfig) => setConfigState(c), []);
  const ws = useMemo(() => ({ setConfig, nv: () => nvRef.current, stageSlot: slot }), [setConfig, slot]);
  const settings = useMemo(() => (config.settings ? { ...viewer, ...config.settings } : viewer), [viewer, config.settings]);

  if (error) {
    return (
      <div className="workspace">
        <aside className="panel-left">
          <div className="empty" data-testid="run-error"><h3>Case unavailable</h3><p>{error}</p>
            <Link className="btn btn-primary" href="/upload"><Upload size={16} /> Go to Upload</Link></div>
          <PanelDock />
        </aside>
        <section className="stage" />
      </div>
    );
  }
  if (!run) {
    return (
      <div className="workspace">
        <aside className="panel-left"><div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Loader2 size={18} className="spin" /> Loading case…</div><PanelDock /></aside>
        <section className="stage" />
      </div>
    );
  }
  const hasExpert = !!run.expert_comparison && !!fileUrl(run, 'expert.nii.gz');
  return (
    <RunCtx.Provider value={{ id, run }}>
      <WorkspaceCtx.Provider value={ws}>
        <div className={`workspace ${full ? 'full' : ''}`}>
          <aside className="panel-left" aria-label="Feature panel">{children}<PanelDock /></aside>
          <section className="stage" aria-label="Visualisation" data-testid="stage">
            {!config.hidden && (
              <>
                <div className="stage-bar" />
                <div className="stage-view">
                <NiiVueViewer
                  backgroundUrl={fileUrl(run, 't1c.nii.gz')!}
                  segUrl={fileUrl(run, 'seg.nii.gz')!}
                  refinedUrl={fileUrl(run, 'seg_refined.nii.gz') ?? null}
                  expertUrl={fileUrl(run, 'expert.nii.gz') ?? null}
                  meshUrls={{ brain: fileUrl(run, 'mesh_brain.gii'), WT: fileUrl(run, 'mesh_WT.gii'), TC: fileUrl(run, 'mesh_TC.gii'), ET: fileUrl(run, 'mesh_ET.gii') }}
                  affine={run.affine}
                  settings={settings}
                  mode={config.mode}
                  hide3DVolume={config.hide3DVolume}
                  connectomes={config.connectomes}
                  initialCrosshairMm={getCrosshair(id) ?? tumourCentre(run)}
                  onReady={(nv) => { nvRef.current = nv; }}
                  onCursor={(c) => { setCrosshair(id, c.mm); setCursor(c); }}
                  definitions={definitions}
                />
                </div>
                {config.layersMenu === 'case' && <div className="stage-tl"><CaseLayers hasRefined={!!fileUrl(run, 'seg_refined.nii.gz')} hasExpert={hasExpert} /></div>}
                <div className="stage-tc"><Readout /></div>
              </>
            )}
            <div ref={setSlot} />
            {run.input_sanity?.status === 'warn' && !config.hidden && (
              <div className="stage-tr" style={{ top: 'calc(var(--bar-h) + 10px)' }}><span className="pill pill-warn" title={run.input_sanity.issues.map((i: { message: string }) => i.message).join(' ')}><AlertCircle size={12} /> Atypical input</span></div>
            )}
          </section>
        </div>
      </WorkspaceCtx.Provider>
    </RunCtx.Provider>
  );
}
