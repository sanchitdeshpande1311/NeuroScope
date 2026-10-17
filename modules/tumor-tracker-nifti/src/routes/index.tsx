import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, ChevronDown, Layers, Activity, Eye, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Shell } from "@/components/neuro/Shell";
import { BackendStatus } from "@/components/neuro/BackendStatus";
import { listComparisons, type ComparisonRecord } from "@/lib/neuro/history";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuroScope 3D — Longitudinal Tumour Change Tracker" },
      { name: "description", content: "AI-powered 3D brain tumour segmentation and longitudinal change tracker." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const [history, setHistory] = useState<ComparisonRecord[]>([]);
  useEffect(() => setHistory(listComparisons()), []);

  return (
    <Shell>
      {/* 1. Hero Section (Deep Cherry-Cola Background matching screenshots) */}
      <section className="relative overflow-hidden bg-background px-6 pt-24 pb-20 text-center">
        {/* Subtle background glow & star dust */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(232,93,117,0.15),transparent_65%)]" />

        <div className="relative mx-auto max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary shadow-[0_0_15px_rgba(232,93,117,0.2)]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Powered Longitudinal MRI Analysis</span>
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-foreground sm:text-7xl font-sans">
            Neuro<span className="text-primary drop-shadow-[0_0_35px_rgba(232,93,117,0.6)]">scope 3D</span>
          </h1>

          <p className="font-sans text-xl text-muted-foreground tracking-wide sm:text-2xl">
            Unfolding the Unseen
          </p>

          {/* Glowing slider line from screenshot */}
          <div className="mx-auto flex w-48 items-center py-2">
            <div className="h-0.5 w-full bg-border/60 relative">
              <div className="absolute left-1/4 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="rounded-xl px-7 bg-primary text-primary-foreground font-semibold shadow-[0_0_20px_rgba(232,93,117,0.4)] hover:bg-primary/90">
              <Link to="/new">Launch Comparison <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl border-border/80 px-7 hover:bg-muted/40">
              <Link to="/timeline">View Timeline</Link>
            </Button>
          </div>

          {/* Scroll to explore indicator from screenshot */}
          <div className="pt-12 text-xs font-mono text-muted-foreground/70">
            <div className="mx-auto mb-1 flex h-6 w-3.5 justify-center rounded-full border border-muted-foreground/40 p-1">
              <div className="h-1.5 w-1 rounded-full bg-primary animate-bounce" />
            </div>
            <span>Scroll to explore</span>
            <ChevronDown className="mx-auto mt-0.5 h-3.5 w-3.5 animate-pulse text-primary/70" />
          </div>
        </div>
      </section>

      {/* 2. Organic Wave Divider into Vanilla-Cream Section */}
      <div className="relative -mb-1 w-full overflow-hidden leading-none">
        <svg
          viewBox="0 0 1440 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-14 sm:h-20 preserve-3d"
        >
          <path
            d="M0,40 C320,110 720,0 1120,60 C1280,85 1380,50 1440,40 L1440,120 L0,120 Z"
            fill="#fdf5ef"
          />
        </svg>
      </div>

      {/* 3. Vanilla-Cream Section (Matching Screenshot 1 & 4) */}
      <section className="bg-[#fdf5ef] px-6 py-16 text-[#250a0e]">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="space-y-1">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#e85d75]">
              02 —— THE PROCESS
            </p>
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl font-sans text-[#250a0e]">
              From Slices to <span className="text-[#e85d75]">Structure.</span>
            </h2>
            <p className="text-base text-[#7c565d] sm:text-lg">
              Four MRI sequences. AI-powered segmentation. An interactive 3D view.
            </p>
          </div>

          {/* 4 Process Cards with Cherry Badges 1, 2, 3, 4 */}
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                num: "1",
                title: "Input",
                desc: "T1, T1Gd, T2, FLAIR sequences validated on shared coordinate grids.",
                icon: Layers,
              },
              {
                num: "2",
                title: "Interpretation",
                desc: "Multi-sequence alignment capturing enhancing core, necrosis, and vasogenic edema.",
                icon: Eye,
              },
              {
                num: "3",
                title: "Segmentation",
                desc: "Genuine MONAI SegResNet segmenting WT, TC, and ET subregions.",
                icon: Brain,
              },
              {
                num: "4",
                title: "Visualization",
                desc: "Linked 3D views, before-after volumetric graphs, and clinical response metrics.",
                icon: Activity,
              },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.num}
                  className="relative rounded-2xl border border-[#ecdcd0] bg-white/90 p-5 shadow-sm transition-all hover:border-[#e85d75]/50 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e85d75] font-mono text-sm font-bold text-white shadow-[0_0_10px_rgba(232,93,117,0.35)]">
                      {step.num}
                    </span>
                    <Icon className="h-5 w-5 text-[#e85d75]" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[#250a0e]">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#7c565d]">{step.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Quick Launcher inside Cream section */}
          <div className="mt-12 rounded-2xl border border-[#ecdcd0] bg-white/80 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-[#250a0e]">Ready to compare MRI studies?</h4>
                <p className="text-xs text-[#7c565d]">Upload previous and follow-up scans or test with verified sample data.</p>
              </div>
              <Button asChild className="rounded-xl bg-[#e85d75] text-white hover:bg-[#d94665]">
                <Link to="/new">Start New Comparison <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Bottom Wave back to Cherry-Cola for History and Backend Health */}
      <div className="relative -mt-1 w-full overflow-hidden leading-none rotate-180">
        <svg
          viewBox="0 0 1440 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-10 sm:h-14 preserve-3d"
        >
          <path
            d="M0,30 C360,70 720,0 1100,45 C1250,60 1370,40 1440,30 L1440,80 L0,80 Z"
            fill="#fdf5ef"
          />
        </svg>
      </div>

      {/* 5. Previous Comparisons & System Health (Cherry Cola) */}
      <section className="mx-auto max-w-6xl px-6 py-12 space-y-8">
        <div>
          <BackendStatus />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Previous Comparisons
            </h2>
            <Link to="/new" className="text-xs text-primary underline">Create new</Link>
          </div>

          {history.length === 0 ? (
            <div className="panel mt-3 rounded-2xl p-6 text-sm text-muted-foreground">
              No comparisons yet. Click <strong>Launch Comparison</strong> above to analyze your first study pair.
            </div>
          ) : (
            <div className="panel mt-3 divide-y divide-border/50 rounded-2xl overflow-hidden">
              {history.map((c) => (
                <Link
                  key={c.id}
                  to="/comparisons/$id"
                  params={{ id: c.id }}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-muted/30"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {c.previous.label} <span className="text-primary">→</span> {c.current.label}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {c.previous.date} → {c.current.date} · {c.id}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}
