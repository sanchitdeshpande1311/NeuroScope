"use client";

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { ChevronRight, Download, FileText, GitBranch, Loader2, Maximize2, Trash2, Users } from 'lucide-react';
import { API, fileUrl, forgetRun, removeRecent } from '@/lib/api';
import { useStore } from '@/lib/store';
import { DEFAULT_VIEWER, useRun, useViewerConfig } from '@/components/RunContext';
import { InfoTip, fmt } from '@/components/ui';

function Action({ icon: Icon, label, meta, onClick, testId, disabled, busy, hint }: {
  icon: React.ElementType; label: string; meta?: string; onClick: () => void; testId: string; disabled?: boolean; busy?: boolean; hint?: string;
}) {
  return (
    <button type="button" className="action-row" onClick={onClick} disabled={disabled || busy} data-testid={testId} title={hint}>
      <span className="ic">{busy ? <Loader2 size={17} className="spin" /> : <Icon size={17} strokeWidth={1.8} />}</span>{label}
      {meta && <span className="meta">{meta}</span>}<ChevronRight size={17} className="chev" />
    </button>
  );
}

export default function ResultsPage() {
  const { id, run } = useRun();
  const router = useRouter();
  const { graphSel, setCurrentRun } = useStore();
  const [reportBusy, setReportBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useViewerConfig(DEFAULT_VIEWER);
  const v = run.volumes_ml.baseline;
  const hasExpert = !!run.expert_comparison;
  // label composition of the whole tumour, derived from the reported nested volumes: ET = label 4,
  // TC - ET = label 1 (NCR/NET), WT - TC = label 2 (edema)
  const parts = [
    { k: 'NCR/NET', ml: Math.max(v.TC - v.ET, 0), c: 'var(--l1)' },
    { k: 'Edema', ml: Math.max(v.WT - v.TC, 0), c: 'var(--l2)' },
    { k: 'Enhancing', ml: Math.max(v.ET, 0), c: 'var(--l4)' },
  ];

  const report = async () => {
    setReportBusy(true); setMsg(null);
    const win = window.open('', '_blank');
    try {
      const g = graphSel[id];
      const q = new URLSearchParams(g ? { src: g.src, dst: g.dst, mode: g.mode, alpha: String(g.alpha), target_mm: String(g.targetMm) } : {});
      const r = await fetch(`${API}/api/runs/${id}/report?${q}`, { method: 'POST' });
      const body = await r.json().catch(() => null);
      if (!r.ok || body?.status !== 'ok') throw new Error(body?.message ?? 'Report generation failed.');
      if (win) win.location.href = `${API}${body.file}?t=${Date.now()}`;
      setMsg({ ok: true, text: 'Report generated and opened in a new tab.' });
    } catch (e) { win?.close(); setMsg({ ok: false, text: (e as Error).message }); } finally { setReportBusy(false); }
  };

  const del = async () => {
    if (!confirm('Delete this case (uploaded scans and all results) from the server now?')) return;
    await fetch(`${API}/api/runs/${id}`, { method: 'DELETE' });
    forgetRun(id); removeRecent(id); setCurrentRun(null);
    router.push('/upload');
  };

  return (
    <>
      <div className="panel-title"><h1>Results</h1></div>
      <div className="hero-metric" data-testid="vol-total">
        <div className="k">Estimated tumour volume <InfoTip side="bottom" text="Whole tumour (WT): all voxels the model labelled NCR/NET, edema or enhancing, × voxel volume from the image header." /></div>
        <div className="v">{fmt(v.WT)}<small>mL</small></div>
        {v.WT > 0 && (
          <>
            <div className="comp" aria-hidden>{parts.filter((p) => p.ml > 0).map((p) => <span key={p.k} style={{ width: `${(100 * p.ml) / v.WT}%`, background: p.c }} />)}</div>
            <div className="comp-legend">{parts.map((p) => <span key={p.k}><i style={{ background: p.c }} />{p.k} {fmt(p.ml, 1)}</span>)}</div>
          </>
        )}
      </div>
      <div className="metric-row">
        {([['WT', 'Whole tumour', 'var(--l2)'], ['TC', 'Tumour core', 'var(--l1)'], ['ET', 'Enhancing', 'var(--l4)']] as const).map(([k, n, c]) => (
          <div key={k} className="metric" style={{ ['--c' as string]: c }} data-testid={`vol-${k}`} title={n}>
            <div className="k"><i />{k}</div><div className="v">{fmt(v[k])}<small>mL</small></div><div className="u">{n}</div>
          </div>
        ))}
      </div>
      <button type="button" className="action-cta" onClick={() => router.push(`/runs/${id}/viewer`)} data-testid="open-viewer">
        <Maximize2 size={19} strokeWidth={1.8} /> Full-screen 3D Viewer<ChevronRight size={19} className="chev" />
      </button>
      <div className="action-list">
        <Action icon={GitBranch} label="Graph Analysis" testId="open-graph" onClick={() => router.push(`/runs/${id}/graph`)} />
        <Action icon={Users} label="Expert Comparison" meta={hasExpert ? undefined : 'No reference'} testId="open-expert" onClick={() => router.push(`/runs/${id}/expert`)} />
        <Action icon={FileText} label="Generate Report" meta="PDF" testId="gen-report" busy={reportBusy} onClick={report} />
        <a className="action-row" href={fileUrl(run, 'seg.nii.gz')} download={`seg_${id.slice(0, 8)}.nii.gz`} data-testid="dl-nifti">
          <span className="ic"><Download size={17} strokeWidth={1.8} /></span>Download SEG.nii.gz<span className="meta">NIfTI</span><ChevronRight size={17} className="chev" />
        </a>
      </div>
      {msg && <div className={`msg ${msg.ok ? 'msg-ok' : 'msg-err'}`}>{msg.text}</div>}
      {run.input_sanity?.issues?.length > 0 && <div className="msg msg-warn">{run.input_sanity.issues[0].message}</div>}
      <div className="panel-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span>Predicted by the model; specialist interpretation required.</span>
        <button type="button" className="btn btn-danger btn-sm" onClick={del} title="Delete this case from the server now"><Trash2 size={15} /> Delete</button>
      </div>
    </>
  );
}
