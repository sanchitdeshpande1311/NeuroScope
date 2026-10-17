"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Box, ExternalLink, FileText, GitBranch, LayoutDashboard, Loader2, MapPin, Plus, Upload, Users } from 'lucide-react';
import { API } from '@/lib/api';
import { useStore } from '@/lib/store';
import ChatAssistant from './ChatAssistant';
import { BrandMark } from './BrandMark';

type Item = { key: string; label: string; short: string; icon: React.ElementType; href: (run: string | null) => string | null };
// Fixed order: Upload first, the four case features, then Tracker (the integrated longitudinal comparison tool).
// Refinement Before & After is hidden from the primary navigation; its route, API and data are unchanged.
export const FEATURES: Item[] = [
  { key: 'upload', label: 'Upload', short: 'Upload', icon: Upload, href: () => '/upload' },
  { key: 'results', label: 'Results', short: 'Results', icon: LayoutDashboard, href: (r) => (r ? `/runs/${r}` : null) },
  { key: 'viewer', label: 'Full-screen 3D Viewer', short: '3D Viewer', icon: Box, href: (r) => (r ? `/runs/${r}/viewer` : null) },
  { key: 'graph', label: 'Graph Analysis', short: 'Graph', icon: GitBranch, href: (r) => (r ? `/runs/${r}/graph` : null) },
  { key: 'expert', label: 'Expert Comparison', short: 'Expert', icon: Users, href: (r) => (r ? `/runs/${r}/expert` : null) },
  { key: 'tracker', label: 'Tracker', short: 'Tracker', icon: Activity, href: () => '/tracker' },
];


/** Opaque strip at the bottom of the left panel: the circular navigation sits on it, so it never covers content. */
export function PanelDock() {
  return <div className="panel-dock"><p>Research and education prototype · not for diagnosis</p></div>;
}

export function activeFeature(path: string | null): string {
  if (!path || path === '/' || path === '/upload') return 'upload';
  if (path.startsWith('/tracker')) return 'tracker';
  const m = path.match(/^\/runs\/[0-9a-f]{32}(?:\/([a-z]+))?/);
  if (!m) return '';
  return m[1] ?? 'results';
}

const RADIUS = 176;   // six items: about 55 px between neighbouring 46 px buttons
const STEP = 90 / (FEATURES.length - 1);   // balanced quarter circle: straight up -> straight right

function FeatureNav({ run }: { run: string | null }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const active = activeFeature(path);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {open && <div className="fnav-backdrop" onClick={() => setOpen(false)} aria-hidden />}
      <div className={`fnav ${open ? 'open' : ''}`} ref={wrap} data-testid="feature-nav">
        {FEATURES.map((f, i) => {
          const theta = ((90 - i * STEP) * Math.PI) / 180;          // quarter-circle fan: up -> right
          const x = Math.cos(theta) * RADIUS, y = -Math.sin(theta) * RADIUS;
          const href = f.href(run);
          const Icon = f.icon;
          // label sits radially outward from the fan centre, so it never covers a neighbouring icon
          const lx = Math.cos(theta), ly = Math.sin(theta);
          const labelStyle: React.CSSProperties = {
            left: 23 + lx * 31, top: 23 - ly * 31,
            transform: `translate(${-50 + 50 * lx}%, ${-50 - 50 * ly}%)`,
          };
          return (
            <div key={f.key} className="fnav-item" style={{ ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px`, transitionDelay: open ? `${i * 18}ms` : '0ms' }}>
              <button type="button" className={`fnav-btn ${active === f.key ? 'active' : ''}`} disabled={!href} tabIndex={open ? 0 : -1}
                aria-label={href ? f.label : `${f.label} (available after a segmentation)`} aria-current={active === f.key ? 'page' : undefined}
                data-testid={`nav-${f.key}`} onClick={() => { if (href) { setOpen(false); router.push(href); } }}>
                <Icon size={20} strokeWidth={1.8} />
              </button>
              <span className="fnav-label" style={labelStyle}>{href ? f.label : `${f.label} — run a segmentation first`}</span>
            </div>
          );
        })}
        <button type="button" className="fnav-plus" aria-expanded={open} aria-label={open ? 'Close feature menu' : 'Open feature menu'}
          data-testid="nav-plus" onClick={() => setOpen((o) => !o)}>
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>
      <nav className="dock" aria-label="Features">
        {FEATURES.map((f) => {
          const href = f.href(run);
          const Icon = f.icon;
          return (
            <Link key={f.key} href={href ?? '#'} className={active === f.key ? 'active' : ''} aria-disabled={!href}>
              <Icon size={19} strokeWidth={1.8} />{f.short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { currentRun, graphSel } = useStore();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string; href?: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  const generateReport = useCallback(async () => {
    if (!currentRun || busy) return;
    setBusy(true);
    // open the tab synchronously (inside the click) so pop-up blockers allow it; filled when the PDF is ready
    const win = window.open('', '_blank');
    try {
      const g = graphSel[currentRun];
      const q = new URLSearchParams(g ? { src: g.src, dst: g.dst, mode: g.mode, alpha: String(g.alpha), target_mm: String(g.targetMm) } : {});
      const r = await fetch(`${API}/api/runs/${currentRun}/report?${q}`, { method: 'POST' });
      const body = await r.json().catch(() => null);
      if (!r.ok || body?.status !== 'ok') throw new Error(body?.message ?? `Report failed (HTTP ${r.status})`);
      const href = `${API}${body.file}?t=${Date.now()}`;
      if (win) win.location.href = href;
      setToast({ ok: true, text: `Report ready — ${body.sections.length} sections.`, href });
    } catch (e) {
      win?.close();
      setToast({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  }, [currentRun, busy, graphSel]);

  return (
    <div className="app">
      <header className="app-header">
        {/* a plain link: "/" is the landing page, served by another service through a rewrite */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- "/" is not a page of this app */}
        <a href="/" className="brand" aria-label="NeuroScope 3D — home page">
          <BrandMark />NeuroScope 3D
        </a>
        <span className="header-spacer" />
        <Link href="/locate" className="btn btn-header btn-header-ghost" data-testid="header-locate" title="Find neurologists near you" aria-label="Locate">
          <MapPin size={17} /><span className="hide-sm">Locate</span>
        </Link>
        <button type="button" className="btn btn-header" disabled={!currentRun || busy} onClick={generateReport} data-testid="header-report"
          title={currentRun ? 'Generate the PDF report for the current case' : 'Run a segmentation first'}>
          {busy ? <Loader2 size={17} className="spin" /> : <FileText size={17} />} {busy ? 'Generating…' : <><span className="hide-sm">Generate </span>Report</>}
        </button>
      </header>
      {children}
      <FeatureNav run={currentRun} />
      <ChatAssistant />
      {toast && (
        <div className={`toast ${toast.ok ? '' : 'err'}`} role="status" data-testid="toast">
          {toast.text}{toast.href && <a href={toast.href} target="_blank" rel="noreferrer">Open <ExternalLink size={12} /></a>}
        </div>
      )}
    </div>
  );
}
