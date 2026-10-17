// Thin client for the NeuroScope 3D FastAPI backend.
export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
export const MAX_BYTES = 1024 ** 3;
export const RUN_ID_RE = /^[0-9a-f]{32}$/;

export type Region = 'WT' | 'TC' | 'ET';
export type SlotKey = 't1n' | 't1c' | 't2w' | 't2f' | 'expert';
export const SLOTS: { key: SlotKey; label: string; hint: string; required: boolean }[] = [
  { key: 't1n', label: 'T1', hint: 'Native T1-weighted', required: true },
  { key: 't1c', label: 'T1Gd', hint: 'Contrast-enhanced T1 (gadolinium)', required: true },
  { key: 't2w', label: 'T2', hint: 'T2-weighted', required: true },
  { key: 't2f', label: 'FLAIR', hint: 'T2-FLAIR', required: true },
  { key: 'expert', label: 'Expert mask', hint: 'Optional reference segmentation (BraTS labels 0/1/2/4)', required: false },
];

export interface ApiError { code?: string; message: string; modality?: string | null }

/** Filename hint only (BraTS 2021: _t1/_t1ce/_t2/_flair/_seg, BraTS 2023: -t1n/-t1c/-t2w/-t2f/-seg). Never used to reorder silently. */
export function guessSlot(name: string): SlotKey | null {
  const n = name.toLowerCase().replace(/\.nii(\.gz)?$/, '');
  const tok = n.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (...t: string[]) => t.some((x) => tok.includes(x));
  if (has('seg', 'mask', 'label', 'labels', 'gt', 'expert')) return 'expert';
  if (has('flair', 't2f') || /t2[-_]?flair/.test(n)) return 't2f';
  if (has('t1ce', 't1c', 't1gd', 'gd') || /t1[-_]?(ce|gd|post)/.test(n)) return 't1c';
  if (has('t2', 't2w')) return 't2w';
  if (has('t1', 't1n', 't1w')) return 't1n';
  return null;
}

async function parse(r: Response) {
  let body: unknown = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) {
    const b = body as { message?: string; detail?: string; code?: string } | null;
    throw Object.assign(new Error(b?.message ?? b?.detail ?? `HTTP ${r.status}`), { code: b?.code, status: r.status });
  }
  return body;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RunMeta = any;
const runCache = new Map<string, Promise<RunMeta>>();
const sideCache = new Map<string, Promise<unknown>>();

/** Cached per run: navigating between run pages never refetches or re-runs inference. */
export function fetchRun(id: string): Promise<RunMeta> {
  if (!runCache.has(id)) {
    const p = fetch(`${API}/api/runs/${id}`).then(parse);
    p.catch(() => runCache.delete(id));
    runCache.set(id, p);
  }
  return runCache.get(id)!;
}

export function fetchCached<T>(key: string, url: string): Promise<T> {
  if (!sideCache.has(key)) {
    const p = fetch(url).then(parse);
    p.catch(() => sideCache.delete(key));
    sideCache.set(key, p);
  }
  return sideCache.get(key) as Promise<T>;
}

export function forgetRun(id: string) {
  runCache.delete(id);
  [...sideCache.keys()].filter((k) => k.startsWith(id)).forEach((k) => sideCache.delete(k));
}

export async function validateFile(file: File, slot: SlotKey) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('modality', slot);
  return parse(await fetch(`${API}/api/validate-file`, { method: 'POST', body: fd }));
}

export async function validateSet(summaries: Record<string, unknown>) {
  return parse(await fetch(`${API}/api/validate-set`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summaries }),
  })) as Promise<{ compatible: boolean; issues: { code: string; message: string; modalities: string[] }[] }>;
}

export const fileUrl = (run: RunMeta, name: string): string | undefined =>
  run?.files?.[name] ? `${API}${run.files[name]}` : undefined;

// ---- recent runs (this browser only; the server has no listing endpoint, so other users' runs are never exposed)
const RECENT_KEY = 'ns3d_recent_runs';
export interface RecentRun { id: string; when: string; wt?: number }
export function getRecent(): RecentRun[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
export function addRecent(r: RecentRun) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...getRecent().filter((x) => x.id !== r.id)].slice(0, 10))); } catch { /* ignore */ }
}
export function removeRecent(id: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(getRecent().filter((x) => x.id !== id))); } catch { /* ignore */ }
}

export const fmt = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? 'n/a' : v.toFixed(d);
