import { AlertTriangle, CheckCircle2, Server } from "lucide-react";
import { apiBase } from "@/lib/neuro/api";
import { useBackendHealth } from "@/hooks/use-backend-health";

export function BackendStatus() {
  const configured = !!apiBase();
  const q = useBackendHealth();
  if (!configured)
    return (
      <Box tone="warn" title="Setup required — no processing backend connected">
        The analysis pipeline (validation, MONAI segmentation, SimpleITK registration) runs in a separate Python service. Start it and set
        <code className="mx-1 rounded bg-muted px-1 font-mono text-xs">VITE_NEUROSCOPE_API_URL</code>. Until then no results can be produced.
      </Box>
    );
  if (q.isLoading) return <Box tone="idle" title="Checking processing backend…" />;
  if (q.isError) return <Box tone="error" title="Processing backend unreachable">{(q.error as Error).message}</Box>;
  const h = q.data!;
  if (h.status !== "ok" || !h.model?.weights_loaded)
    return (
      <Box tone="warn" title="Backend reachable — setup required">
        {h.model ? `${h.model.name}: weights not loaded.` : "No segmentation model configured."} {h.messages?.join(" ") ?? ""}
      </Box>
    );
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-4.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)] backdrop-blur-md">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
      <span>AI Pipeline & SimpleITK Connected</span>
    </div>
  );
}

function Box({ tone, title, children }: { tone: "ok" | "warn" | "error" | "idle"; title: string; children?: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "idle" ? Server : AlertTriangle;
  const styles = {
    ok: "border-emerald-500/40 bg-emerald-950/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.12)]",
    warn: "border-amber-500/40 bg-amber-950/20 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.12)]",
    error: "border-rose-500/50 bg-rose-950/25 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)]",
    idle: "border-border/80 bg-black/30 text-muted-foreground",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4.5 backdrop-blur-md transition-all ${styles}`}>
      <div className="flex items-start gap-3.5">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-current" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold leading-snug tracking-tight text-white">{title}</div>
          {children && <div className="mt-1 text-sm leading-relaxed text-muted-foreground/90">{children}</div>}
        </div>
      </div>
    </div>
  );
}
