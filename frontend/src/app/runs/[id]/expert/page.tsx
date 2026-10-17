"use client";

import Link from 'next/link';
import React, { useEffect } from 'react';
import { Upload } from 'lucide-react';
import { useStore } from '@/lib/store';
import { DEFAULT_VIEWER, useRun, useViewerConfig } from '@/components/RunContext';
import { InfoTip, Switch, fmt } from '@/components/ui';

const R = ['WT', 'TC', 'ET'] as const;
const MODEL_SWATCH = 'linear-gradient(90deg, var(--l1), var(--l2), var(--l4))';
const Sw = ({ c }: { c: string }) => <span className="swatch" style={{ background: c }} />;

export default function ExpertPage() {
  const { run } = useRun();
  const { viewer, setViewer } = useStore();
  useViewerConfig(DEFAULT_VIEWER);
  const ec = run.expert_comparison;
  // show the reference when arriving on this feature (the user can switch it off)
  useEffect(() => { if (ec) setViewer({ showExpert: true }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!ec]);

  if (!ec) {
    return (
      <>
        <div className="panel-title"><h1>Expert Comparison</h1></div>
        <div className="empty" data-testid="no-expert">
          <h3>No expert reference for this case</h3>
          <p>Upload an expert segmentation of the same case (BraTS labels 0/1/2/4, same voxel grid) together with the four sequences to compare it with the model. No agreement metrics are estimated without it.</p>
          <Link className="btn btn-primary" href="/upload"><Upload size={16} /> Go to Upload</Link>
        </div>
      </>
    );
  }
  const prec = (k: typeof R[number]) => { const e = ec[k]; return e.tp_voxels + e.fp_voxels ? e.tp_voxels / (e.tp_voxels + e.fp_voxels) : null; };
  return (
    <>
      <div className="panel-title"><h1>Expert Comparison</h1></div>
      <div className="card feature" data-testid="expert-table">
        <div className="card-head"><span className="card-title">Model vs expert</span>
          <InfoTip text="Overlap metrics describe agreement with this reference mask only. Dice = 2TP/(2TP+FP+FN); sensitivity = TP/(TP+FN); precision = TP/(TP+FP). Not a measure of clinical diagnostic accuracy." /></div>
        <table className="table">
          <thead><tr><th>Metric</th>{R.map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>
            <tr className="group"><td colSpan={4}>Volume (mL)</td></tr>
            <tr><td><span className="row-label"><Sw c={MODEL_SWATCH} />Model</span></td>{R.map((k) => <td key={k}>{fmt(ec[k].pred_ml)}</td>)}</tr>
            <tr><td><span className="row-label"><Sw c="var(--expert)" />Expert</span></td>{R.map((k) => <td key={k}>{fmt(ec[k].ref_ml)}</td>)}</tr>
            <tr><td className="muted">Difference</td>{R.map((k) => <td key={k} className="muted">{(ec[k].pred_ml - ec[k].ref_ml >= 0 ? '+' : '−') + fmt(Math.abs(ec[k].pred_ml - ec[k].ref_ml))}</td>)}</tr>
            <tr className="group"><td colSpan={4}>Overlap</td></tr>
            <tr className="strong"><td>Dice</td>{R.map((k) => <td key={k}>{fmt(ec[k].dice, 3)}</td>)}</tr>
            <tr><td>Sensitivity</td>{R.map((k) => <td key={k}>{fmt(ec[k].sensitivity, 3)}</td>)}</tr>
            <tr><td>Precision</td>{R.map((k) => <td key={k}>{fmt(prec(k), 3)}</td>)}</tr>
            <tr className="group"><td colSpan={4}>Voxel counts</td></tr>
            <tr><td>False positive</td>{R.map((k) => <td key={k}>{ec[k].fp_voxels.toLocaleString()}</td>)}</tr>
            <tr><td>False negative</td>{R.map((k) => <td key={k}>{ec[k].fn_voxels.toLocaleString()}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="card flat">
        <div className="card-head" style={{ marginBottom: 4 }}><span className="card-title">Layers</span></div>
        <Switch label="Model prediction" swatch={MODEL_SWATCH} checked={viewer.showPrediction !== false}
          testId="expert-pred" onChange={(c) => setViewer({ showPrediction: c })} />
        <Switch label="Expert reference" swatch="var(--expert)" checked={viewer.showExpert} testId="expert-ref" onChange={(c) => setViewer({ showExpert: c })} />
      </div>
    </>
  );
}
