import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, Download, Loader2, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Shell, StatusPill } from "@/components/neuro/Shell";
import { SlicePane, type SliceData } from "@/components/neuro/SlicePane";
import { Volume3D } from "@/components/neuro/Volume3D";
import { VolumeTable } from "@/components/neuro/VolumeTable";
import { LongitudinalAssessmentCard } from "@/components/neuro/LongitudinalAssessmentCard";
import { BeforeAfterGraph } from "@/components/neuro/BeforeAfterGraph";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { api, apiBase, ApiError } from "@/lib/neuro/api";
import { CHANGE_LABELS, countsFromPacked, decodeBase64 } from "@/lib/neuro/changemap";
import { buildReport } from "@/lib/neuro/report";
import { evaluateLongitudinalAssessment } from "@/lib/neuro/volumes";
import { PIPELINE_STAGES, REGIONS, type ComparisonResults, type ComparisonStatus, type Region, type Vec3 } from "@/lib/neuro/types";
import { voxelToWorld, type Plane } from "@/components/neuro/viewer-utils";

export const Route = createFileRoute("/comparisons/$id")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Comparison ${params.id} — NeuroScope Change Tracker` },
      { name: "description", content: "Linked 3D and slice comparison of model-predicted tumour regions between two MRI studies." },
      { property: "og:title", content: "Comparison workspace — NeuroScope Change Tracker" },
      { property: "og:description", content: "Side-by-side, overlay, swipe and change-map views with estimated volume differences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

type Mode = "side" | "overlay" | "swipe" | "change";

function Workspace() {
  const { id } = Route.useParams();
  const status = useQuery<ComparisonStatus, ApiError>({
    queryKey: ["status", id],
    queryFn: () => api.status(id),
    enabled: !!apiBase(),
    retry: false,
    refetchInterval: (q) => (q.state.data && ["complete", "failed"].includes(q.state.data.stage) ? false : 1000),
  });
  const done = status.data?.stage === "complete";
  const results = useQuery<ComparisonResults, ApiError>({ queryKey: ["results", id], queryFn: () => api.results(id), enabled: done, retry: false });

  if (!apiBase())
    return <Shell><Notice tone="warn" title="Setup required">No processing backend is configured, so this comparison cannot be loaded. No results are shown.</Notice></Shell>;
  if (status.isError)
    return <Shell><Notice tone="error" title="Comparison unavailable">{status.error.message} <Link to="/" className="text-primary underline">Back to overview</Link></Notice></Shell>;

  return (
    <Shell>
      {results.data ? (
        <Results r={results.data} status={status.data!} />
      ) : (
        <div className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="text-2xl font-semibold">Processing comparison</h1>
          <p className="font-mono text-xs text-muted-foreground">{id}</p>
          <Pipeline status={status.data} />
          {results.isError && <Notice tone="error" title="Results could not be loaded">{results.error.message}</Notice>}
        </div>
      )}
    </Shell>
  );
}

function Pipeline({ status }: { status?: ComparisonStatus }) {
  const failed = status?.stage === "failed";
  const curIdx = status ? PIPELINE_STAGES.findIndex((s) => s.id === status.stage) : -1;
  const doneAll = status?.stage === "complete";
  return (
    <div className="panel mt-6 p-5">
      <ol className="space-y-2.5">
        {PIPELINE_STAGES.map((s, i) => {
          const state = doneAll || i < curIdx ? "done" : i === curIdx && !failed ? "active" : "pending";
          return (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              {state === "done" ? <CheckCircle2 className="h-4 w-4 text-success" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground/50" />}
              <span className={state === "pending" ? "text-muted-foreground" : ""}>{s.label}</span>
              {state === "active" && status?.progress !== undefined && <span className="font-mono text-xs text-muted-foreground">{Math.round(status.progress * 100)}%</span>}
            </li>
          );
        })}
      </ol>
      {!status && <p className="mt-4 text-sm text-muted-foreground">Waiting for backend status…</p>}
      {failed && status?.error && (
        <div className="mt-4 flex gap-2 text-sm text-destructive"><XCircle className="h-4 w-4 shrink-0" />{status.error.message}{status.error.retryable && " (recoverable — resubmit the comparison)"}</div>
      )}
      {status?.warnings.map((w) => <p key={w} className="mt-2 text-xs text-warning">! {w}</p>)}
    </div>
  );
}

function Results({ r, status }: { r: ComparisonResults; status: ComparisonStatus }) {
  const prev = r.studies.find((s) => s.role === "previous")!;
  const cur = r.studies.find((s) => s.role === "current")!;
  const regFail = r.registration.quality === "fail";
  const data = useMemo<SliceData | null>(() => {
    if (!r.grid || regFail) return null;
    const masks = decodeBase64(r.grid.masks);
    const nonZeroList: number[] = [];
    for (let i = 0; i < masks.length; i++) {
      if (masks[i] !== 0) nonZeroList.push(i);
    }
    const nonZeroIndices = new Int32Array(nonZeroList);
    return {
      shape: r.grid.shape,
      spacing: r.grid.spacing,
      masks,
      nonZeroIndices,
      bgPrev: r.grid.background_previous ? decodeBase64(r.grid.background_previous) : undefined,
      bgCur: r.grid.background_current ? decodeBase64(r.grid.background_current) : undefined,
    };
  }, [r, regFail]);

  const [mode, setMode] = useState<Mode>("change");
  const [regions, setRegions] = useState<Region[]>(["WT", "TC", "ET"]);
  const [opacity, setOpacity] = useState(0.6);
  const [swipe, setSwipe] = useState(0.5);
  const [cross, setCross] = useState<Vec3>(() => (r.grid ? r.grid.shape.map((n) => Math.floor(n / 2)) as Vec3 : [0, 0, 0]));
  const axialCanvas = useRef<HTMLCanvasElement | null>(null);

  function exportPdf() {
    try {
      const png = axialCanvas.current?.toDataURL("image/png");
      buildReport(r, data ? png : undefined).save(`neuroscope-report-${r.comparison_id}.pdf`);
    } catch (e) { alert((e as Error).message); }
  }

  const leftLayer = mode === "change" ? "change" : mode === "overlay" ? "change" : "previous";
  const planes: Plane[] = ["axial", "coronal", "sagittal"];
  const world = r.grid ? voxelToWorld(r.grid.affine, cross) : null;

  const assessment = useMemo(
    () => r.assessment || evaluateLongitudinalAssessment(prev.volumes, cur.volumes),
    [r, prev, cur]
  );

  return (
    <div className="mx-auto max-w-[1650px] px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-5 border-b border-border/40 pb-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-rose-400">
              Previous Scan (Baseline)
            </div>
            <div className="text-base font-bold text-white">
              {prev.label} · {prev.date}
            </div>
          </div>
          <div className="text-xl font-black text-primary">→</div>
          <div>
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-400">
              Current Scan (Follow-up)
            </div>
            <div className="text-base font-bold text-white">
              {cur.label} · {cur.date}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusPill tone={status.stage === "complete" ? "ok" : "info"}>{status.stage}</StatusPill>
            <StatusPill
              tone={
                r.registration.quality === "pass"
                  ? "ok"
                  : r.registration.quality === "warning"
                  ? "warn"
                  : "error"
              }
            >
              registration {r.registration.quality}
            </StatusPill>
          </div>
        </div>
        <Button onClick={exportPdf} variant="outline" className="h-10 rounded-xl border-border/80 px-5 text-sm font-semibold text-white hover:border-primary">
          <Download className="mr-2 h-4 w-4 text-primary" /> Export Clinical PDF
        </Button>
      </div>

      {(regFail || r.registration.warnings.length > 0 || r.warnings.length > 0) && (
        <div className="panel mt-4 rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-200">
          {regFail && (
            <p className="flex gap-2 text-rose-400 font-semibold">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Registration failed quality checks. The spatial change map cannot be trusted and is not shown. Per-study volumes remain valid in their original geometry.
            </p>
          )}
          {[...r.registration.warnings, ...r.warnings].map((w) => (
            <p key={w} className="mt-1 text-amber-300">
              ! {w}
            </p>
          ))}
        </div>
      )}

      {/* Prominent Clinical Longitudinal Response & Risk Assessment Card */}
      <LongitudinalAssessmentCard assessment={assessment} />

      <div className="mt-6">
        <div className="panel rounded-2xl border border-primary/25 bg-card/95 p-5 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
            <div className="flex rounded-xl border border-border/70 bg-black/40 p-1">
              {([
                ["side", "Side-by-side"],
                ["overlay", "Overlay"],
                ["swipe", "Swipe"],
                ["change", "Change map"],
              ] as [Mode, string][]).map(([m, l]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                    mode === m
                      ? "bg-primary text-white shadow-[0_0_12px_rgba(255,51,102,0.4)]"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-5 text-sm font-medium">
              {REGIONS.map((reg) => (
                <label key={reg} className="flex items-center gap-2 cursor-pointer font-mono font-bold">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary rounded"
                    checked={regions.includes(reg)}
                    onChange={(e) =>
                      setRegions(e.target.checked ? [...regions, reg] : regions.filter((x) => x !== reg))
                    }
                  />
                  <span className={regions.includes(reg) ? "text-primary" : "text-muted-foreground"}>{reg}</span>
                </label>
              ))}
              <span className="flex w-32 items-center gap-2.5 text-xs font-mono text-muted-foreground">
                α
                <Slider value={[opacity]} min={0} max={1} step={0.05} onValueChange={([v]) => setOpacity(v)} />
              </span>
            </div>
          </div>

          {!data ? (
            <div className="mt-4 grid h-[480px] place-items-center rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
              <div><AlertTriangle className="mx-auto mb-2 h-5 w-5 text-warning" />Comparison visualization unavailable{regFail ? " — registration failed." : " — the backend did not return an aligned grid."}<br />No substitute anatomy is shown.</div>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-3" style={{ minHeight: 300 }}>
                {mode === "side" ? (
                  <>
                    <Volume3D data={data} layer="previous" regions={regions} title="Previous 3D" />
                    <Volume3D data={data} layer="current" regions={regions} title="Current 3D" />
                    <Volume3D data={data} layer="change" regions={regions} title="Change 3D" />
                  </>
                ) : (
                  <div className="md:col-span-3 h-[340px]"><Volume3D data={data} layer="change" regions={regions} title="Aligned change map 3D" /></div>
                )}
              </div>
              {mode === "side" ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["previous", "current"] as const).map((L) => (
                    <div key={L} className="grid grid-cols-3 gap-2">
                      {planes.map((p) => <SlicePane key={p} data={data} plane={p} cross={cross} onCross={setCross} layer={L} regions={regions} opacity={opacity} />)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {planes.map((p) => (
                    <SlicePane key={p} data={data} plane={p} cross={cross} onCross={setCross}
                      layer={mode === "swipe" ? "previous" : leftLayer} rightLayer={mode === "swipe" ? "current" : undefined}
                      swipe={mode === "swipe" ? swipe : undefined} regions={regions} opacity={opacity}
                      canvasRef={p === "axial" ? (c) => (axialCanvas.current = c) : undefined} />
                  ))}
                </div>
              )}
              {mode === "swipe" && <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">Previous<Slider value={[swipe]} min={0} max={1} step={0.01} onValueChange={([v]) => setSwipe(v)} />Current</div>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-muted-foreground">
                <span>voxel [{cross.join(", ")}] · world [{world?.map((v) => v.toFixed(1)).join(", ")}] mm</span>
                <span className="flex gap-4">
                  {([1, 2, 3] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${k === 1 ? "bg-change-current" : k === 2 ? "bg-change-shared" : "bg-change-previous"}`} />{CHANGE_LABELS[k]}</span>
                  ))}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <BeforeAfterGraph prev={prev} cur={cur} />

      <VolumeTable prev={prev} cur={cur} />

      <div className="panel mt-4 p-4 text-sm">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Limitations</h3>
        <ul className="mt-2 space-y-1 text-muted-foreground">{r.limitations.map((l) => <li key={l}>· {l}</li>)}</ul>
      </div>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "warn" | "error"; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <div className={`panel p-5 ${tone === "error" ? "border-destructive/40" : "border-warning/40"}`}>
        <div className={`flex items-center gap-2 font-medium ${tone === "error" ? "text-destructive" : "text-warning"}`}><AlertTriangle className="h-4 w-4" />{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
