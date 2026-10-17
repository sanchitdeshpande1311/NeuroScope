"use client";

// Secondary route (not in the feature navigation): the PDF saved when the case was processed, with
// provenance. The header's "Generate Report" builds the full, current report on demand.
import { createPortal } from 'react-dom';
import React from 'react';
import { Download } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { useRun, useViewerConfig, useWorkspace, type ViewerConfig } from '@/components/RunContext';
import { fmt } from '@/components/ui';

const HIDDEN: ViewerConfig = { hidden: true, mode: 'grid', hide3DVolume: false, connectomes: [], settings: null, layersMenu: 'none' };

export default function ReportPage() {
  const { run } = useRun();
  const { stageSlot } = useWorkspace();
  useViewerConfig(HIDDEN);
  const v = run.volumes_ml.baseline;
  const m = run.model;
  return (
    <>
      <div className="panel-title"><h1>Processing report</h1></div>
      <div className="card">
        <div className="card-head"><span className="card-title">Estimated volumes</span></div>
        <table className="table"><tbody>
          {(['WT', 'TC', 'ET'] as const).map((k) => <tr key={k}><td>{k}</td><td>{fmt(v[k])} mL</td></tr>)}
        </tbody></table>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <a className="btn btn-primary btn-sm" href={fileUrl(run, 'report.pdf')} target="_blank" rel="noreferrer"><Download size={14} /> PDF</a>
          <a className="btn btn-secondary btn-sm" href={fileUrl(run, 'seg.nii.gz')}><Download size={14} /> SEG.nii.gz</a>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">Provenance</span></div>
        <table className="table"><tbody>
          <tr><td>Model</td><td>{m.name}</td></tr>
          <tr><td>Weights</td><td>sha256 {run.checkpoint_sha256.slice(0, 12)}…</td></tr>
          <tr><td>Device</td><td>{run.device}</td></tr>
          <tr><td>Created (UTC)</td><td>{run.timestamp_utc}</td></tr>
        </tbody></table>
      </div>
      {stageSlot && createPortal(<iframe className="report-frame" src={fileUrl(run, 'report.pdf')} title="Processing report" data-testid="report-iframe" />, stageSlot)}
    </>
  );
}
