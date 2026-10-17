import type { ComparisonResults, ComparisonStatus, HealthResponse, Sequence, StudyDraft } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryable: boolean, public code = "api_error") {
    super(message);
  }
}

export function apiBase(): string {
  const v = (import.meta.env.VITE_NEUROSCOPE_API_URL as string | undefined)?.trim();
  if (v && !v.includes(":8000")) return v.replace(/\/$/, "");
  return "http://localhost:8005";
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const base = apiBase();
  if (!base) throw new ApiError("Processing backend is not configured (VITE_NEUROSCOPE_API_URL).", 0, false, "setup_required");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(base + path, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const j = await res.json();
        msg = j.detail?.message ?? j.detail ?? j.message ?? msg;
      } catch { /* ignore */ }
      throw new ApiError(String(msg), res.status, res.status >= 500 || res.status === 429);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("Request timed out.", 0, true, "timeout");
    throw new ApiError("Backend unreachable.", 0, true, "network");
  } finally {
    clearTimeout(t);
  }
}

/** Retry only idempotent reads. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof ApiError) || !e.retryable) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw last;
}

export const api = {
  health: () => withRetry(() => request<HealthResponse>("/api/health", { timeoutMs: 8000 })),

  /** Upload + server-side validation of one study. Uses XHR for real upload progress. */
  validateStudy(study: StudyDraft, onProgress?: (fraction: number) => void): Promise<{ study_id: string; valid: boolean; issues: { level: string; message: string }[] }> {
    const base = apiBase();
    if (!base) return Promise.reject(new ApiError("Processing backend is not configured.", 0, false, "setup_required"));
    const fd = new FormData();
    fd.append("role", study.role);
    fd.append("label", study.label);
    fd.append("date", study.date);
    (Object.entries(study.files) as [Sequence, File][]).forEach(([seq, f]) => fd.append(seq, f, f.name));
    if (study.expertMask) fd.append("expert_mask", study.expertMask, study.expertMask.name);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/api/studies/validate`);
      xhr.timeout = 30 * 60 * 1000;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(body);
          else reject(new ApiError(body.detail?.message ?? body.detail ?? `Validation failed (${xhr.status})`, xhr.status, xhr.status >= 500));
        } catch {
          reject(new ApiError(`Invalid response (${xhr.status})`, xhr.status, false));
        }
      };
      xhr.onerror = () => reject(new ApiError("Upload failed — backend unreachable.", 0, true, "network"));
      xhr.ontimeout = () => reject(new ApiError("Upload timed out.", 0, true, "timeout"));
      xhr.send(fd);
    });
  },

  segment: (studyId: string) => request<{ study_id: string; status: string }>(`/api/studies/${studyId}/segment`, { method: "POST" }),

  createComparison: (previousStudyId: string, currentStudyId: string) =>
    request<{ comparison_id: string }>("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study_ids: [previousStudyId, currentStudyId] }),
    }),

  status: (id: string) => withRetry(() => request<ComparisonStatus>(`/api/comparisons/${id}/status`)),
  results: (id: string) => withRetry(() => request<ComparisonResults>(`/api/comparisons/${id}/results`, { timeoutMs: 120000 })),
  deleteComparison: (id: string) => request<{ deleted: boolean }>(`/api/comparisons/${id}`, { method: "DELETE" }),
};
