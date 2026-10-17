"use client";

// Upload: the first feature of the NeuroScope 3D workspace (/upload). The public root "/" is the landing page,
// served through the rewrite in next.config.ts; its "Start Segmentation" button opens this page.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Brain, ChevronRight, FileCheck2, FilePlus2, History, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { API, MAX_BYTES, RUN_ID_RE, SLOTS, addRecent, getRecent, guessSlot, validateFile, validateSet, type RecentRun, type SlotKey } from '@/lib/api';
import { useStore } from '@/lib/store';
import { InfoTip, StatusPill, fmt } from '@/components/ui';
import { PanelDock } from '@/components/AppShell';

const size = (b: number) => (b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const REQUIRED: SlotKey[] = ['t1n', 't1c', 't2w', 't2f'];
const LABEL: Record<SlotKey, string> = Object.fromEntries(SLOTS.map((s) => [s.key, s.label])) as Record<SlotKey, string>;
const HINT: Record<SlotKey, string> = { t1n: 'native', t1c: 'contrast-enhanced', t2w: 'T2-weighted', t2f: 'fluid-attenuated', expert: '' };

function SequenceCard({ k, onChoose, onClear, inputRef }: {
  k: SlotKey; onChoose: (k: SlotKey, f?: File) => void; onClear: (k: SlotKey) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const { slots } = useStore();
  const st = slots[k];
  const [drag, setDrag] = useState(false);
  const local = useRef<HTMLInputElement | null>(null);
  const pick = () => local.current?.click();
  return (
    <div className={`seq-card is-${st.status} ${drag ? "drag" : ""}`} data-testid={`slot-${k}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onChoose(k, e.dataTransfer.files[0]); }}>
      <div className="seq-head">
        <span className="seq-name">{k === 'expert' ? 'Expert reference mask' : LABEL[k]}{k !== 'expert' && <small>{HINT[k]}</small>}</span>
        <StatusPill status={st.status} />
      </div>
      <input type="file" accept=".nii,.gz" hidden ref={(el) => { local.current = el; inputRef(el); }} data-testid={`input-${k}`}
        onChange={(e) => { onChoose(k, e.target.files?.[0]); e.target.value = ''; }} />
      {st.file ? (
        <div className="seq-file">
          <FileCheck2 size={18} strokeWidth={1.8} />
          <span className="fmeta"><span className="fname" title={st.file.name}>{st.file.name}</span><span className="fsize">{size(st.file.size)}</span></span>
          <span className="seq-actions">
            <button type="button" className="btn btn-quiet btn-sm btn-icon" onClick={pick} aria-label={`Replace ${LABEL[k] ?? 'expert'} file`} title="Replace"><RefreshCw size={16} /></button>
            <button type="button" className="btn btn-quiet btn-sm btn-icon" onClick={() => onClear(k)} aria-label={`Remove ${LABEL[k] ?? 'expert'} file`} title="Remove"><Trash2 size={16} /></button>
          </span>
        </div>
      ) : (
        <button type="button" className="seq-drop" onClick={pick}><FilePlus2 size={19} strokeWidth={1.8} /> Choose or drop a .nii / .nii.gz file</button>
      )}
      {st.error && <div className="msg msg-err" data-testid={`error-${k}`}><AlertCircle size={16} />{st.error}</div>}
      {!st.error && st.warning && <div className="msg msg-warn"><AlertTriangle size={16} />{st.warning}</div>}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const { slots, setSlot, setCurrentRun } = useStore();
  const [setCheck, setSetCheck] = useState<{ compatible: boolean; issues: { code: string; message: string }[] } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'error'>('idle');
  const [pct, setPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const inputs = useRef<Partial<Record<SlotKey, HTMLInputElement | null>>>({});
  const seq = useRef<Record<string, number>>({});

  useEffect(() => {
    const legacy = new URLSearchParams(window.location.search).get('run'); // old /?run=<id> links
    if (legacy && RUN_ID_RE.test(legacy)) { router.replace(`/runs/${legacy}`); return; }
    setRecent(getRecent()); // eslint-disable-line react-hooks/set-state-in-effect
  }, [router]);

  const choose = useCallback(async (key: SlotKey, file: File | undefined) => {
    if (!file) return;
    const token = (seq.current[key] = (seq.current[key] ?? 0) + 1);
    const g = guessSlot(file.name);
    // file-name hint only: shown as a warning, never used to reassign or to claim the image content
    const warning = g && g !== key ? (key === 'expert' || g === 'expert'
      ? `The file name suggests ${g === 'expert' ? 'a segmentation mask' : `a ${LABEL[g]} image`}. Check that it belongs in this slot.`
      : `The file name suggests ${LABEL[g]}, but this slot needs ${LABEL[key]}.`) : null;
    if (!/\.nii(\.gz)?$/i.test(file.name)) { setSlot(key, { file, status: 'error', summary: null, error: 'Only .nii or .nii.gz files are accepted.', warning: null }); return; }
    if (file.size > MAX_BYTES) { setSlot(key, { file, status: 'error', summary: null, error: 'This file is larger than the 1 GB limit.', warning: null }); return; }
    setSlot(key, { file, status: 'validating', summary: null, error: null, warning });
    setRunError(null);
    try {
      const summary = await validateFile(file, key);
      if (seq.current[key] === token) setSlot(key, { status: 'valid', summary, error: null });
    } catch (e) {
      const msg = (e as Error).message || 'Validation failed.';
      if (seq.current[key] === token) setSlot(key, { status: 'error', summary: null, error: key === 'expert' ? msg : `This file is not a valid ${LABEL[key]} image: ${msg.replace(/^[A-Za-z0-9 ]+: /, '')}` });
    }
  }, [setSlot]);

  const clear = (key: SlotKey) => {
    seq.current[key] = (seq.current[key] ?? 0) + 1;
    setSlot(key, { file: null, status: 'empty', summary: null, error: null, warning: null });
  };

  const validKey = SLOTS.map((s) => `${s.key}:${slots[s.key].status}:${slots[s.key].file?.name ?? ''}`).join('|');
  useEffect(() => {
    const summaries: Record<string, unknown> = {};
    SLOTS.forEach((s) => { if (slots[s.key].status === 'valid') summaries[s.key] = slots[s.key].summary; });
    if (Object.keys(summaries).length < 2) { setSetCheck(null); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let alive = true;
    validateSet(summaries).then((r) => { if (alive) setSetCheck(r); }).catch(() => { if (alive) setSetCheck(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validKey]);

  const missing = REQUIRED.filter((k) => slots[k].status !== 'valid');
  const pending = SLOTS.some((s) => slots[s.key].status === 'validating');
  const expertBad = slots.expert.status === 'error';
  const issues = (setCheck?.issues ?? []).filter((i) => i.code !== 'missing_modality');
  const busy = phase === 'uploading' || phase === 'processing';
  const canRun = missing.length === 0 && !pending && !expertBad && setCheck?.compatible === true && !busy;

  const run = () => {
    if (!canRun) return;
    const fd = new FormData();
    REQUIRED.forEach((k) => fd.append(k, slots[k].file!));
    if (slots.expert.status === 'valid' && slots.expert.file) fd.append('expert_mask', slots.expert.file);
    setPhase('uploading'); setPct(0); setRunError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/predict`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((100 * e.loaded) / e.total)); };
    xhr.upload.onload = () => setPhase('processing');
    xhr.onload = () => {
      clearInterval(timer);
      let body: { status?: string; run_id?: string; message?: string; files?: Record<string, string>; timestamp_utc?: string; volumes_ml?: { baseline: { WT: number } } } | null = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 200 && body?.status === 'complete' && body.run_id && body.files?.['seg.nii.gz']) {
        addRecent({ id: body.run_id, when: body.timestamp_utc ?? '', wt: body.volumes_ml?.baseline.WT });
        setCurrentRun(body.run_id);
        setPhase('idle');
        router.push(`/runs/${body.run_id}`);
      } else {
        setRunError(body?.message ?? `The server returned an error (HTTP ${xhr.status}).`);
        setPhase('error');
      }
    };
    xhr.onerror = () => { clearInterval(timer); setRunError('Cannot reach the analysis server. Check that the backend is running.'); setPhase('error'); };
    xhr.send(fd);
  };

  return (
    <div className="workspace">
      <aside className="panel-left" aria-label="Upload">
        <div className="panel-title"><h1>Upload</h1><span className="sub">4 sequences · NIfTI</span></div>
        <div className="seq-grid">
          {REQUIRED.map((k) => <SequenceCard key={k} k={k} onChoose={choose} onClear={clear} inputRef={(el) => { inputs.current[k] = el; }} />)}
        </div>

        <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Optional expert reference
          <InfoTip text="Used only to compare the model with an expert segmentation of the same case (BraTS labels 0/1/2/4). It is never an input to the model and is not required." side="top" /></div>
        <SequenceCard k="expert" onChoose={choose} onClear={clear} inputRef={(el) => { inputs.current.expert = el; }} />

        {issues.map((i, n) => <div key={n} className="msg msg-err" data-testid="set-issue"><AlertCircle size={16} />{i.message}</div>)}

        <div className="card feature run-card" data-testid="set-check">
          {busy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-md)', fontWeight: 650 }}>
                <span>{phase === 'uploading' ? 'Uploading sequences' : 'Running segmentation'}</span>
                <span className="muted">{phase === 'uploading' ? `${pct}%` : `${elapsed.toFixed(0)} s`}</span>
              </div>
              <div className={`progress ${phase === 'processing' ? 'indeterminate' : ''}`}><span style={phase === 'uploading' ? { width: `${pct}%` } : undefined} /></div>
              <span className="card-hint">{phase === 'processing' ? 'Validation, model inference, refinement, surfaces and report are computed on the server.' : 'Sending the four files to the analysis server.'}</span>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!canRun} onClick={run} data-testid="run-button">
                {pending ? <Loader2 size={19} className="spin" /> : <Play size={18} />} Start Segmentation
              </button>
              <p className="card-hint" style={{ marginTop: 10, textAlign: 'center' }} data-testid="run-hint">
                {pending ? 'Checking files…' : missing.length ? `Add a valid ${missing.map((k) => LABEL[k]).join(', ')} file to continue.`
                  : issues.length ? 'Resolve the compatibility issue above.' : expertBad ? 'Remove or replace the invalid expert mask.'
                  : setCheck?.compatible ? 'All four sequences are valid and on one voxel grid.' : 'Checking compatibility…'}
              </p>
            </>
          )}
          {runError && <div className="msg msg-err" style={{ marginTop: 10 }} data-testid="run-error"><AlertCircle size={16} />{runError} No segmentation was produced.</div>}
        </div>

        {recent.length > 0 && (
          <details className="recent">
            <summary><History size={16} /> Recent cases in this browser</summary>
            <ul>{recent.map((r) => <li key={r.id}><Link href={`/runs/${r.id}`}><span>Case {r.id.slice(0, 8)}</span><span className="muted">{r.wt !== undefined ? `WT ${fmt(r.wt)} mL` : ''} <ChevronRight size={14} /></span></Link></li>)}</ul>
          </details>
        )}
        <p className="panel-foot">Upload only de-identified, skull-stripped research MRI. Files are processed on this server only and deleted within 24 hours.</p>
        <PanelDock />
      </aside>
      <section className="stage" aria-label="Visualisation">
        <div className="stage-empty"><div><Brain size={48} strokeWidth={1.1} />The 3D brain and MRI views appear here after segmentation.</div></div>
      </section>
    </div>
  );
}
