/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration interface for the NeuroScope 3D segmentation backend.
 * Only verified structured metadata — never MRI scans, NIfTI files or raw volumes.
 * Missing values must stay `null`/undefined; they are never treated as zero.
 *
 * Connect later by calling `window.NeuroScopeAssistant.setCase({...})`
 * or posting `{ type: "neuroscope:case", payload: {...} }` via postMessage.
 */
export type RegionValues = { WT?: number | null; TC?: number | null; ET?: number | null };

export interface CaseContext {
  caseId: string;
  validationStatus?: string | null;
  volumesMl?: RegionValues | null;
  expertMaskAvailable?: boolean | null;
  metrics?: { dice?: RegionValues | null; sensitivity?: RegionValues | null } | null;
  modelVersion?: string | null;
  inputWarnings?: string[] | null;
  coordinates?: { x: number; y: number; z: number } | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const region = (r: unknown): RegionValues | null => {
  if (!r || typeof r !== "object") return null;
  const o = r as any;
  return { WT: num(o.WT), TC: num(o.TC), ET: num(o.ET) };
};

/** Strict whitelist sanitiser — drops anything not in the schema. */
export function sanitizeCaseContext(input: unknown): CaseContext | null {
  if (!input || typeof input !== "object") return null;
  const o = input as any;
  if (typeof o.caseId !== "string" || !o.caseId.trim()) return null;
  const m = (o.metrics ?? null) as any | null;
  const c = o.coordinates as any | null | undefined;
  return {
    caseId: o.caseId.slice(0, 80),
    validationStatus: typeof o.validationStatus === "string" ? o.validationStatus.slice(0, 120) : null,
    volumesMl: region(o.volumesMl),
    expertMaskAvailable: typeof o.expertMaskAvailable === "boolean" ? o.expertMaskAvailable : null,
    metrics: m ? { dice: region(m.dice), sensitivity: region(m.sensitivity) } : null,
    modelVersion: typeof o.modelVersion === "string" ? o.modelVersion.slice(0, 120) : null,
    inputWarnings: Array.isArray(o.inputWarnings)
      ? o.inputWarnings.filter((w: unknown): w is string => typeof w === "string").slice(0, 20).map((w: string) => w.slice(0, 200))
      : null,
    coordinates:
      c && num(c.x) !== null && num(c.y) !== null && num(c.z) !== null
        ? { x: c.x as number, y: c.y as number, z: c.z as number }
        : null,
  };
}

/** Clearly labelled development fixture for UI testing only. */
export const DEV_FIXTURE_CASE: CaseContext = {
  caseId: "DEV-FIXTURE-001",
  validationStatus: "Development fixture — not a real study",
  volumesMl: { WT: 16.0, TC: 0, ET: 0 },
  expertMaskAvailable: false,
  metrics: null,
  modelVersion: "fixture",
  inputWarnings: ["This is synthetic test data (20×20×20 voxels, 1×1×2 mm, label 2 only)."],
  coordinates: null,
};
