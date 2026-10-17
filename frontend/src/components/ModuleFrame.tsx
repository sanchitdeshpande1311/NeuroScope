"use client";

// Shows an integrated module (the supplied project, running as its own service) in the workspace stage.
// The module is loaded unchanged in an iframe; nothing from the current case is sent to it.
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { MODULES, moduleUrl, probe, type ModuleKey } from '@/lib/integrations';
import { useStore } from '@/lib/store';
import { PanelDock } from '@/components/AppShell';

export default function ModuleFrame({ k, title, children, allow }: {
  k: ModuleKey; title: string; children: React.ReactNode; allow?: string;
}) {
  const { currentRun } = useStore();
  const m = MODULES[k];
  const src = moduleUrl(k);
  const [state, setState] = useState<'checking' | 'ok' | 'down' | 'unconfigured'>(src ? 'checking' : 'unconfigured');
  const check = useCallback(() => {
    if (!src) return;
    setState('checking');
    probe(k).then((ok) => setState(ok ? 'ok' : 'down'));
  }, [k, src]);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    probe(k).then((ok) => { if (alive) setState(ok ? 'ok' : 'down'); });   // initial state is already 'checking'
    return () => { alive = false; };
  }, [k, src]);
  const back = currentRun ? `/runs/${currentRun}` : '/upload';

  return (
    <div className="workspace">
      <aside className="panel-left" aria-label={`${title} panel`}>
        <div className="panel-title"><h1>{title}</h1></div>
        <Link className="btn btn-secondary btn-block" href={back} data-testid="module-back"><ArrowLeft size={16} /> Back to workspace</Link>
        <div className="card flat module-info">{children}</div>
        <div className="card flat">
          <div className="card-head" style={{ marginBottom: 6 }}><span className="card-title">Service</span>
            <span className={`pill ${state === 'ok' ? 'pill-ok' : state === 'checking' ? 'pill-busy' : 'pill-err'}`} data-testid="module-status">
              {state === 'ok' ? 'Online' : state === 'checking' ? 'Checking' : state === 'down' ? 'Offline' : 'Not configured'}</span></div>
          {src && <a className="module-link" href={src} target="_blank" rel="noreferrer">Open in a new tab <ExternalLink size={14} /></a>}
        </div>
        <PanelDock />
      </aside>
      <section className="stage module-stage" aria-label={title}>
        {state === 'ok' && <iframe className="module-frame" src={src} title={m.name} allow={allow} data-testid={`${k}-frame`} />}
        {state === 'checking' && <div className="stage-empty"><div><Loader2 size={28} className="spin" />Connecting to {m.name}…</div></div>}
        {(state === 'down' || state === 'unconfigured') && (
          <div className="stage-empty"><div className="module-error" data-testid="module-error">
            <AlertCircle size={30} />
            <h2>{m.name} is not available</h2>
            <p>{state === 'unconfigured'
              ? <>No service address is configured. Set <code>{m.env}</code> for this deployment.</>
              : <>The service at <code>{m.url}</code> did not respond. Start {m.start} — for example with <code>start.ps1</code>.</>}</p>
            {state === 'down' && <button type="button" className="btn btn-dark" onClick={check}><RefreshCw size={15} /> Try again</button>}
          </div></div>
        )}
      </section>
    </div>
  );
}
