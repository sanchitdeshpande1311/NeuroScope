"use client";

// App-wide client state that must survive navigation between features:
//  - the five upload slots (File objects stay in memory; never re-uploaded on navigation)
//  - viewer display preferences shared by Results / Full-screen viewer / Expert comparison
//  - the current case id (sessionStorage, so the feature navigation knows which case is open)
//  - the graph selection per case (the report uses the same source/destination/mode the user chose)
//  - the last crosshair per case (a ref: cursor moves never re-render the app)
//  - Show Definitions (hover names in the viewers): in memory only, so it is OFF in every fresh session
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Region, SlotKey } from './api';

export type SlotStatus = 'empty' | 'validating' | 'valid' | 'error';
export interface SlotState {
  file: File | null;
  status: SlotStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any | null;
  error: string | null;
  warning: string | null;
}
const emptySlot = (): SlotState => ({ file: null, status: 'empty', summary: null, error: null, warning: null });

export interface ViewerSettings {
  showLabels: Record<1 | 2 | 4, boolean>;
  showMeshes: Record<Region, boolean>;
  showBrain: boolean;
  segOpacity: number;
  meshOpacity: number;
  brainOpacity?: number;
  showPrediction?: boolean;
  showRefined: boolean;
  showExpert: boolean;
}
export const defaultViewer: ViewerSettings = {
  showLabels: { 1: true, 2: true, 4: true },
  showMeshes: { WT: true, TC: true, ET: true },
  showBrain: true,
  segOpacity: 0.5,
  meshOpacity: 0.6,
  brainOpacity: 0.15,
  showPrediction: true,
  showRefined: false,
  showExpert: false,
};

export interface GraphSelection { src: string; dst: string; mode: 'A' | 'B'; alpha: number; targetMm: number }

interface Store {
  slots: Record<SlotKey, SlotState>;
  setSlot: (k: SlotKey, s: Partial<SlotState>) => void;
  resetSlots: () => void;
  viewer: ViewerSettings;
  setViewer: (p: Partial<ViewerSettings>) => void;
  currentRun: string | null;
  setCurrentRun: (id: string | null) => void;
  graphSel: Record<string, GraphSelection>;
  setGraphSel: (run: string, g: GraphSelection) => void;
  getCrosshair: (run: string) => [number, number, number] | null;
  setCrosshair: (run: string, mm: [number, number, number]) => void;
  definitions: boolean;
  setDefinitions: (on: boolean) => void;
}

const Ctx = createContext<Store | null>(null);
const RUN_KEY = 'ns3d_current_run';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>({
    t1n: emptySlot(), t1c: emptySlot(), t2w: emptySlot(), t2f: emptySlot(), expert: emptySlot(),
  });
  const [viewer, setViewerState] = useState<ViewerSettings>(defaultViewer);
  const [currentRun, setRun] = useState<string | null>(null);
  const [graphSel, setGraphSelState] = useState<Record<string, GraphSelection>>({});
  const crosshair = useRef<Record<string, [number, number, number]>>({});
  const [definitions, setDefinitions] = useState(false);

  useEffect(() => {
    try { const r = sessionStorage.getItem(RUN_KEY); if (r) setRun(r); } catch { /* storage unavailable */ } // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const value = useMemo<Store>(() => ({
    slots,
    setSlot: (k, s) => setSlots((prev) => ({ ...prev, [k]: { ...prev[k], ...s } })),
    resetSlots: () => setSlots({ t1n: emptySlot(), t1c: emptySlot(), t2w: emptySlot(), t2f: emptySlot(), expert: emptySlot() }),
    viewer,
    setViewer: (p) => setViewerState((prev) => ({ ...prev, ...p })),
    currentRun,
    setCurrentRun: (id) => {
      setRun(id);
      try { if (id) sessionStorage.setItem(RUN_KEY, id); else sessionStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
    },
    graphSel,
    setGraphSel: (run, g) => setGraphSelState((prev) => ({ ...prev, [run]: g })),
    getCrosshair: (run) => crosshair.current[run] ?? null,
    setCrosshair: (run, mm) => { crosshair.current[run] = mm; },
    definitions,
    setDefinitions,
  }), [slots, viewer, currentRun, graphSel, definitions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
