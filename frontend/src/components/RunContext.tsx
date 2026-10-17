"use client";

import { createContext, useContext, useEffect } from 'react';
import type { Niivue } from '@niivue/niivue';
import type { RunMeta } from '@/lib/api';
import type { ViewerSettings } from '@/lib/store';
import type { ConnectomeLayer } from './NiiVueViewer';

export const RunCtx = createContext<{ id: string; run: RunMeta } | null>(null);

export function useRun() {
  const r = useContext(RunCtx);
  if (!r) throw new Error('useRun outside run layout');
  return r;
}

/** How a feature page configures the single, persistent case viewer in the stage. */
export interface ViewerConfig {
  hidden: boolean;                       // the page draws its own stage content (Refinement)
  mode: 'grid' | 'render';
  hide3DVolume: boolean;
  connectomes: ConnectomeLayer[];
  settings: Partial<ViewerSettings> | null; // page-specific overrides of the shared display settings
  layersMenu: 'case' | 'none';           // 'case' = shared Layers menu (2D labels / 3D surface / masks)
}
export const DEFAULT_VIEWER: ViewerConfig = { hidden: false, mode: 'grid', hide3DVolume: false, connectomes: [], settings: null, layersMenu: 'case' };

export const WorkspaceCtx = createContext<{
  setConfig: (c: ViewerConfig) => void;
  nv: () => Niivue | null;
  stageSlot: HTMLElement | null;       // portal target for page-specific stage overlays
} | null>(null);

export function useWorkspace() {
  const w = useContext(WorkspaceCtx);
  if (!w) throw new Error('useWorkspace outside run layout');
  return w;
}

/** Declare this page's viewer configuration; restored to the default when the page unmounts. */
export function useViewerConfig(cfg: ViewerConfig) {
  const { setConfig } = useWorkspace();
  useEffect(() => { setConfig(cfg); }, [cfg, setConfig]);
  useEffect(() => () => setConfig(DEFAULT_VIEWER), [setConfig]);
}
