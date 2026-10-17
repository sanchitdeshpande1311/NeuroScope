"use client";

// AI assistant: the supplied chatbot (screenshot-perfect-project-39.zip), running as its own service, opened in a
// floating drop-up panel from a launcher at the bottom-right. The panel floats above the workspace (it never resizes
// or replaces the page). The chat frame is created on first open and then kept, so closing and reopening keeps the
// conversation; the module also stores its threads in its own browser storage. No case data is sent to it.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { MODULES, moduleUrl, probe } from '@/lib/integrations';
import { BrandMark } from './BrandMark';

const THREAD_KEY = 'ns3d_assistant_thread';
// same id format as the module's own threads.newId()
const newThread = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function threadId(): string {
  try {
    const t = localStorage.getItem(THREAD_KEY);
    if (t && /^[a-z0-9]{6,32}$/.test(t)) return t;
    const n = newThread();
    localStorage.setItem(THREAD_KEY, n);
    return n;
  } catch {
    return newThread();
  }
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);          // set on first open; the frame then stays mounted
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'down' | 'unconfigured'>('idle');
  const launcher = useRef<HTMLButtonElement>(null);
  const m = MODULES.chatbot;

  const connect = useCallback(() => {
    const url = moduleUrl('chatbot', `${m.entry}${threadId()}`);
    if (!url) { setState('unconfigured'); return; }
    setState('checking');
    probe('chatbot').then((ok) => { setState(ok ? 'ok' : 'down'); if (ok) setSrc(url); });
  }, [m.entry]);

  const toggle = () => {
    setOpen((o) => !o);
    if (state === 'idle' || state === 'down') connect();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launcher.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div className={`assistant-panel ${open ? 'open' : ''}`} role="dialog" aria-label={m.name} inert={!open} data-testid="assistant-panel">
        <div className="assistant-head">
          <BrandMark size={16} />
          <span className="assistant-title">{m.name}</span>
          {src && <a className="assistant-icon" href={src} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open the assistant in a new tab" tabIndex={open ? 0 : -1}><ExternalLink size={16} /></a>}
          <button type="button" className="assistant-icon" onClick={() => setOpen(false)} aria-label="Close the assistant" data-testid="assistant-close" tabIndex={open ? 0 : -1}><X size={18} /></button>
        </div>
        <div className="assistant-body">
          {src && <iframe className="assistant-frame" src={src} title={m.name} allow="microphone; clipboard-write" data-testid="assistant-frame" />}
          {state === 'checking' && !src && <div className="assistant-msg"><Loader2 size={22} className="spin" />Connecting…</div>}
          {(state === 'down' || state === 'unconfigured') && (
            <div className="assistant-msg" data-testid="assistant-error">
              <AlertCircle size={24} />
              <strong>The assistant is not available.</strong>
              <span>{state === 'unconfigured' ? <>Set <code>{m.env}</code> for this deployment.</> : <>Start {m.start}, then try again.</>}</span>
              {state === 'down' && <button type="button" className="btn btn-secondary btn-sm" onClick={connect}><RefreshCw size={14} /> Try again</button>}
            </div>
          )}
        </div>
      </div>
      <button type="button" ref={launcher} className={`assistant-launcher ${open ? 'open' : ''}`} onClick={toggle}
        aria-expanded={open} aria-label={open ? 'Close the AI assistant' : 'Open the AI assistant'} title="NeuroScope AI Assistant" data-testid="assistant-launcher">
        <BrandMark size={22} />
      </button>
    </>
  );
}
