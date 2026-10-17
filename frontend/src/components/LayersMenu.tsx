"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useCursor } from '@/lib/cursor';
import { Segmented, Slider, Switch } from './ui';

/** Floating popover anchored top-left of the stage. Closes on outside click and Escape. */
export function LayersPopover({ children, testId = 'layers' }: { children: React.ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="layers-wrap" ref={ref}>
      <button type="button" className="layers-btn glass" aria-expanded={open} aria-haspopup="dialog" data-testid={`${testId}-btn`}
        onClick={() => setOpen((o) => !o)}><Layers size={17} strokeWidth={1.8} /> Layers</button>
      {open && <div className="popover glass" role="dialog" aria-label="Layers" data-testid={`${testId}-menu`}>{children}</div>}
    </div>
  );
}

/** Shared case layers (Results, Full-screen viewer, Expert comparison): one state for all of them. */
export function CaseLayers({ hasRefined, hasExpert }: { hasRefined: boolean; hasExpert: boolean }) {
  const { viewer: v, setViewer } = useStore();
  return (
    <LayersPopover>
      <section className="pop-card">
        <h3>2D labels</h3>
        <Switch label="NCR/NET" swatch="var(--l1)" checked={v.showLabels[1]} testId="label-1" onChange={(c) => setViewer({ showLabels: { ...v.showLabels, 1: c } })} />
        <Switch label="Edema" swatch="var(--l2)" checked={v.showLabels[2]} testId="label-2" onChange={(c) => setViewer({ showLabels: { ...v.showLabels, 2: c } })} />
        <Switch label="Enhancing Tumor" swatch="var(--l4)" checked={v.showLabels[4]} testId="label-4" onChange={(c) => setViewer({ showLabels: { ...v.showLabels, 4: c } })} />
        <Slider label="Label opacity" value={v.segOpacity} testId="seg-opacity" onChange={(x) => setViewer({ segOpacity: x })} />
      </section>
      <section className="pop-card">
        <h3>3D surface</h3>
        <Switch label="WT" swatch="var(--l2)" checked={v.showMeshes.WT} testId="mesh-WT" onChange={(c) => setViewer({ showMeshes: { ...v.showMeshes, WT: c } })} />
        <Switch label="TC" swatch="var(--l1)" checked={v.showMeshes.TC} testId="mesh-TC" onChange={(c) => setViewer({ showMeshes: { ...v.showMeshes, TC: c } })} />
        <Switch label="ET" swatch="var(--l4)" checked={v.showMeshes.ET} testId="mesh-ET" onChange={(c) => setViewer({ showMeshes: { ...v.showMeshes, ET: c } })} />
        <Switch label="Brain" swatch="#c8c8d2" checked={v.showBrain} testId="mesh-brain" onChange={(c) => setViewer({ showBrain: c })} />
        <Slider label="Surface opacity" value={v.meshOpacity} min={0.1} testId="mesh-opacity" onChange={(x) => setViewer({ meshOpacity: x })} />
      </section>
      <section className="pop-card">
        <h3>Masks</h3>
        <Switch label="Model prediction" checked={v.showPrediction !== false} testId="show-prediction" onChange={(c) => setViewer({ showPrediction: c })} />
        <div style={{ margin: '2px 0 6px' }}>
          <Segmented dark testId="pred-version" value={v.showRefined && hasRefined ? 'refined' : 'original'}
            options={[{ value: 'original', label: 'Original' }, { value: 'refined', label: 'Refined', disabled: !hasRefined }]}
            onChange={(x) => setViewer({ showRefined: x === 'refined' })} />
        </div>
        {hasExpert
          ? <Switch label="Expert reference" swatch="var(--expert)" checked={v.showExpert} testId="show-expert" onChange={(c) => setViewer({ showExpert: c })} />
          : <p className="pop-note">Expert reference: not provided for this case.</p>}
      </section>
      <DefinitionsToggle />
    </LayersPopover>
  );
}

/** Last control of every Layers menu: one shared, session-only setting (off by default). */
export function DefinitionsToggle() {
  const { definitions, setDefinitions } = useStore();
  return (
    <div className="pop-foot">
      <Switch label="Show Definitions" checked={definitions} testId="show-definitions" onChange={setDefinitions}
        hint="Hover a visible region, surface or graph element to see its name" />
    </div>
  );
}

export function Readout() {
  const c = useCursor();
  return (
    <div className="readout" data-testid="readout">
      {c ? <>RAS {c.mm.map((x) => x.toFixed(1)).join(', ')} mm · voxel {c.vox.join(', ')}</> : 'Click a view to set the crosshair'}
    </div>
  );
}
