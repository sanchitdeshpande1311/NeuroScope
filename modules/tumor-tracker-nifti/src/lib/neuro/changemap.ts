import type { Region } from "./types";

export const REGION_BIT: Record<Region, { prev: number; cur: number }> = {
  WT: { prev: 1, cur: 8 },
  TC: { prev: 2, cur: 16 },
  ET: { prev: 4, cur: 32 },
};

export type ChangeCategory = 0 | 1 | 2 | 3; // 0 none, 1 current-only, 2 shared, 3 previous-only
export const CHANGE_LABELS = {
  1: "Current-only prediction",
  2: "Shared predicted region",
  3: "Previous-only prediction",
} as const;

export function categoryOf(packed: number, region: Region): ChangeCategory {
  const b = REGION_BIT[region];
  const p = (packed & b.prev) !== 0;
  const c = (packed & b.cur) !== 0;
  if (p && c) return 2;
  if (c) return 1;
  if (p) return 3;
  return 0;
}

export interface ChangeCounts {
  currentOnly: number;
  shared: number;
  previousOnly: number;
  dice: number | null;
}

/** Compare two aligned binary masks (same grid). */
export function compareMasks(prev: ArrayLike<number>, cur: ArrayLike<number>): ChangeCounts {
  if (prev.length !== cur.length) throw new Error("Masks must share the same reference grid");
  let currentOnly = 0,
    shared = 0,
    previousOnly = 0;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i] !== 0,
      c = cur[i] !== 0;
    if (p && c) shared++;
    else if (c) currentOnly++;
    else if (p) previousOnly++;
  }
  const denom = 2 * shared + currentOnly + previousOnly;
  return { currentOnly, shared, previousOnly, dice: denom === 0 ? null : (2 * shared) / denom };
}

export function countsFromPacked(packed: Uint8Array, region: Region): ChangeCounts {
  const b = REGION_BIT[region];
  let currentOnly = 0,
    shared = 0,
    previousOnly = 0;
  for (let i = 0; i < packed.length; i++) {
    const v = packed[i];
    const p = (v & b.prev) !== 0,
      c = (v & b.cur) !== 0;
    if (p && c) shared++;
    else if (c) currentOnly++;
    else if (p) previousOnly++;
  }
  const denom = 2 * shared + currentOnly + previousOnly;
  return { currentOnly, shared, previousOnly, dice: denom === 0 ? null : (2 * shared) / denom };
}

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
