"use client";

// NeuroScope 3D UI primitives. Styling lives in globals.css (design tokens); these components only add
// structure, accessibility and state wiring. Every control is a real form element (keyboard + screen reader).
import React, { useId } from 'react';
import { CheckCircle2, ChevronDown, CircleDashed, Info, Loader2, XCircle } from 'lucide-react';

export function Switch({ label, checked, onChange, disabled, swatch, testId, hint }: {
  label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; swatch?: string; testId?: string; hint?: string;
}) {
  return (
    <label className={`switch-row ${disabled ? 'disabled' : ''}`} title={hint}>
      <span className="sw-label">{swatch && <span className="swatch" style={{ background: swatch }} />}{label}</span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} data-testid={testId}
          onChange={(e) => onChange(e.target.checked)} />
        <span className="track" /><span className="thumb" />
      </span>
    </label>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, format, testId, disabled }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
  format?: (v: number) => string; testId?: string; disabled?: boolean;
}) {
  const id = useId();
  const pct = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="slider">
      <label className="slider-label" htmlFor={id}><span>{label}</span><output>{format ? format(value) : `${Math.round(value * 100)}%`}</output></label>
      <input id={id} className="range" type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        style={{ ['--pct' as string]: pct }} data-testid={testId} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

export function Select({ value, onChange, children, testId, disabled, ariaLabel }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; testId?: string; disabled?: boolean; ariaLabel?: string;
}) {
  return (
    <div className="select-wrap">
      <select className="select" value={value} disabled={disabled} aria-label={ariaLabel} data-testid={testId}
        onChange={(e) => onChange(e.target.value)}>{children}</select>
      <ChevronDown size={17} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, dark, testId }: {
  options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; dark?: boolean; testId?: string;
}) {
  return (
    <div className={`segmented ${dark ? 'dark' : ''}`} role="group" data-testid={testId}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={o.disabled}
          data-testid={testId ? `${testId}-${o.value}` : undefined} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export type Status = 'empty' | 'validating' | 'valid' | 'error';
export function StatusPill({ status }: { status: Status }) {
  if (status === 'valid') return <span className="pill pill-ok"><CheckCircle2 size={15} /> Valid</span>;
  if (status === 'error') return <span className="pill pill-err"><XCircle size={15} /> Invalid</span>;
  if (status === 'validating') return <span className="pill pill-busy"><Loader2 size={15} className="spin" /> Checking</span>;
  return <span className="pill pill-empty"><CircleDashed size={15} /> Empty</span>;
}

export function Tip({ text, side = 'bottom', children }: { text: string; side?: 'top' | 'bottom' | 'right' | 'left'; children: React.ReactNode }) {
  return <span className="tip">{children}<span className={`tip-bubble ${side}`} role="tooltip">{text}</span></span>;
}

export function InfoTip({ text, side = 'bottom' }: { text: string; side?: 'top' | 'bottom' | 'right' | 'left' }) {
  return (
    <span className="tip info-dot" tabIndex={0} aria-label={text}>
      <Info size={15} /><span className={`tip-bubble ${side}`} role="tooltip">{text}</span>
    </span>
  );
}

export const fmt = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
