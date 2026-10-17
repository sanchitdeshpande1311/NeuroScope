import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { Shell } from "@/components/neuro/Shell";
import { BackendStatus } from "@/components/neuro/BackendStatus";
import { StudyPanel, studyReady } from "@/components/neuro/StudyPanel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api, apiBase, ApiError } from "@/lib/neuro/api";
import { saveComparison } from "@/lib/neuro/history";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { validateNiftiFile } from "@/lib/neuro/nifti-validate";
import type { StudyDraft } from "@/lib/neuro/types";

export const Route = createFileRoute("/new")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "New comparison — NeuroScope Change Tracker" },
      { name: "description", content: "Upload and validate previous and current multi-sequence NIfTI MRI studies for longitudinal comparison." },
      { property: "og:title", content: "New comparison — NeuroScope Change Tracker" },
      { property: "og:description", content: "Set up a two-time-point brain MRI comparison with T1, T1Gd, T2 and FLAIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewComparison,
});

const empty = (role: "previous" | "current"): StudyDraft => ({ role, label: "", date: "", files: {}, validation: {} });

function NewComparison() {
  const [prev, setPrev] = useState(empty("previous"));
  const [cur, setCur] = useState(empty("current"));
  const [running, setRunning] = useState<string | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const navigate = useNavigate();
  const health = useBackendHealth();

  const problems = [
    ...studyReady(prev).map((p) => `Previous: ${p}`),
    ...studyReady(cur).map((p) => `Current: ${p}`),
  ];
  if (prev.date && cur.date && prev.date >= cur.date) problems.push("Current study date must be after previous study date");
  const backendReady = !!apiBase() && health.data?.status === "ok" && health.data.model?.weights_loaded;

  async function loadDemoStudies() {
    setLoadingDemo(true);
    setError(null);
    try {
      const fetchFile = async (url: string, filename: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${filename}`);
        const blob = await res.blob();
        return new File([blob], filename, { type: "application/gzip" });
      };

      const [t1, t1gd, t2, flair] = await Promise.all([
        fetchFile("/sample_scans/t1.nii.gz", "t1.nii.gz"),
        fetchFile("/sample_scans/t1gd.nii.gz", "t1gd.nii.gz"),
        fetchFile("/sample_scans/t2.nii.gz", "t2.nii.gz"),
        fetchFile("/sample_scans/flair.nii.gz", "flair.nii.gz"),
      ]);

      const [vT1, vT1gd, vT2, vFlair] = await Promise.all([
        validateNiftiFile(t1),
        validateNiftiFile(t1gd),
        validateNiftiFile(t2),
        validateNiftiFile(flair),
      ]);

      const files = { T1: t1, T1Gd: t1gd, T2: t2, FLAIR: flair };
      const validation = { T1: vT1, T1Gd: vT1gd, T2: vT2, FLAIR: vFlair };

      setPrev({
        role: "previous",
        label: "Baseline (Pre-op)",
        date: "2024-01-15",
        files,
        validation,
      });

      setCur({
        role: "current",
        label: "Follow-up (Post-op 6m)",
        date: "2024-07-20",
        files: { ...files },
        validation: { ...validation },
      });
    } catch (err) {
      setError(new ApiError(String(err instanceof Error ? err.message : err), 0, false));
    } finally {
      setLoadingDemo(false);
    }
  }

  async function run() {
    setError(null);
    try {
      setRunning("Uploading studies (Baseline & Follow-up)…"); setUpload(0);
      let pLoaded = 0;
      let cLoaded = 0;
      const [p, c] = await Promise.all([
        api.validateStudy(prev, (f) => {
          pLoaded = f;
          setUpload((pLoaded + cLoaded) / 2);
        }),
        api.validateStudy(cur, (f) => {
          cLoaded = f;
          setUpload((pLoaded + cLoaded) / 2);
        }),
      ]);
      if (!p.valid) throw new ApiError(`Previous study failed server validation: ${p.issues.map((i) => i.message).join("; ")}`, 422, false);
      if (!c.valid) throw new ApiError(`Current study failed server validation: ${c.issues.map((i) => i.message).join("; ")}`, 422, false);
      setUpload(null);
      setRunning("Initializing comparison pipeline…");
      const { comparison_id } = await api.createComparison(p.study_id, c.study_id);
      saveComparison({ id: comparison_id, previous: { label: prev.label, date: prev.date }, current: { label: cur.label, date: cur.date }, createdAt: new Date().toISOString() });
      navigate({ to: "/comparisons/$id", params: { id: comparison_id } });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e), 0, false));
      setRunning(null); setUpload(null);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1500px] px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border/40 pb-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-primary">
                01 —— Longitudinal Setup
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-primary/50 bg-primary/15 px-3.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(255,51,102,0.25)] hover:bg-primary/25"
                onClick={loadDemoStudies}
                disabled={loadingDemo || !!running}
              >
                {loadingDemo ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                )}
                Load Sample Studies (BraTS Demo)
              </Button>
            </div>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl font-heading">
              New comparison
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Upload previous and current multi-sequence MRI studies (T1, T1Gd, T2, FLAIR). Sequences are verified in
              browser before deep AI segmentation and SimpleITK rigid registration.
            </p>
          </div>
          <div className="flex items-center">
            <BackendStatus />
          </div>
        </div>

        <div className="mt-8 grid gap-7 lg:grid-cols-2">
          <StudyPanel title="Previous Study (Baseline)" study={prev} onChange={setPrev} />
          <StudyPanel title="Current Study (Follow-up)" study={cur} onChange={setCur} />
        </div>

        <div className="panel mt-8 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-primary/30 bg-card/95 p-6 shadow-2xl backdrop-blur-md">
          <div className="min-w-0 flex-1">
            {running ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 text-base font-semibold text-white">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  {running}
                </div>
                {upload !== null && <Progress value={upload * 100} className="h-2 rounded-full" />}
              </div>
            ) : error ? (
              <div className="flex items-center gap-2.5 text-base font-medium text-rose-400">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
                <span>
                  {error.message}
                  {error.retryable && " — you can retry."}
                </span>
              </div>
            ) : problems.length ? (
              <div className="space-y-1">
                <div className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Required before processing:
                </div>
                <ul className="space-y-1 text-sm font-medium text-muted-foreground">
                  {problems.map((p) => (
                    <li key={p} className="flex items-center gap-1.5">
                      <span className="text-primary">•</span> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ) : !backendReady ? (
              <span className="text-base font-medium text-amber-300">
                Inputs pass local checks. Processing is waiting for backend model initialization.
              </span>
            ) : (
              <span className="flex items-center gap-2 text-base font-semibold text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                All 8 MRI sequence channels verified. Ready to initiate 3D segmentation pipeline.
              </span>
            )}
          </div>
          <Button
            size="lg"
            className="h-13 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-rose-600 px-8 text-base font-bold text-white shadow-[0_0_25px_rgba(255,51,102,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(255,51,102,0.6)] disabled:opacity-50"
            disabled={!!running || problems.length > 0 || !backendReady}
            onClick={run}
          >
            <Play className="mr-2 h-5 w-5 fill-current" /> {error?.retryable ? "Retry" : "Run comparison"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}
