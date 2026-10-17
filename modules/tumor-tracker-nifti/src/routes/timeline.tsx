import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shell, StatusPill } from "@/components/neuro/Shell";
import { api, apiBase } from "@/lib/neuro/api";
import { listComparisons, type ComparisonRecord } from "@/lib/neuro/history";
import { REGIONS, type ComparisonResults } from "@/lib/neuro/types";

export const Route = createFileRoute("/timeline")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Study timeline — NeuroScope Change Tracker" },
      { name: "description", content: "Timeline of submitted MRI studies with processing status and estimated WT, TC and ET volumes." },
      { property: "og:title", content: "Study timeline — NeuroScope Change Tracker" },
      { property: "og:description", content: "Every submitted study date, its processing status and estimated volumes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Timeline,
});

interface Point { date: string; label: string; comparisonId: string; role: string; status: string; volumes?: ComparisonResults["studies"][number]["volumes"] }

function Timeline() {
  const [records, setRecords] = useState<ComparisonRecord[]>([]);
  useEffect(() => setRecords(listComparisons()), []);
  const qs = useQueries({
    queries: records.map((r) => ({
      queryKey: ["timeline", r.id],
      enabled: !!apiBase(),
      retry: false,
      queryFn: async () => {
        const s = await api.status(r.id);
        return { status: s.stage, results: s.stage === "complete" ? await api.results(r.id) : null };
      },
    })),
  });
  const points: Point[] = records.flatMap((r, i) => {
    const q = qs[i];
    const st = !apiBase() ? "backend not configured" : q?.isError ? "unavailable" : q?.data?.status ?? "loading";
    return (["previous", "current"] as const).map((role) => ({
      date: r[role].date, label: r[role].label, comparisonId: r.id, role, status: st,
      volumes: q?.data?.results?.studies.find((s) => s.role === role)?.volumes,
    }));
  }).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Shell>
      <div className="mx-auto max-w-4xl px-5 py-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Timeline</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Study timeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only studies you have submitted appear here. Volumes are shown only when processing has completed.</p>
        {points.length === 0 ? (
          <div className="panel mt-6 p-6 text-sm text-muted-foreground">No studies yet.</div>
        ) : (
          <ol className="relative mt-8 border-l border-border pl-6">
            {points.map((p) => (
              <li key={p.comparisonId + p.role} className="mb-6">
                <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${p.role === "previous" ? "bg-change-previous" : "bg-change-current"}`} />
                <div className="panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-mono text-sm">{p.date}</span> <span className="ml-2 text-sm">{p.label}</span></div>
                    <StatusPill tone={p.status === "complete" ? "ok" : p.status === "failed" || p.status === "unavailable" ? "error" : "idle"}>{p.status}</StatusPill>
                  </div>
                  <div className="mt-2 font-mono text-xs text-muted-foreground">
                    {p.volumes ? REGIONS.map((r) => `${r} ${p.volumes![r].volumeMl.toFixed(2)} mL`).join(" · ") : "Volumes not available"}
                  </div>
                  <Link to="/comparisons/$id" params={{ id: p.comparisonId }} className="mt-2 inline-block text-xs text-primary hover:underline">Open comparison →</Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Shell>
  );
}
