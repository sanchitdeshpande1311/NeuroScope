import { Link } from "@tanstack/react-router";
import { Brain, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { DISCLAIMER } from "@/lib/neuro/types";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 transition-transform hover:scale-[1.02]">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-primary/50 bg-primary/20 text-primary shadow-[0_0_16px_rgba(255,51,102,0.4)]">
        <Brain className="h-5 w-5" />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-white font-heading sm:text-2xl">
        NeuroScope <span className="font-extrabold text-primary drop-shadow-[0_0_12px_rgba(255,51,102,0.5)]">3D</span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const nav = "relative py-1.5 text-base font-semibold text-muted-foreground transition-colors hover:text-white";
  const activeClass =
    "text-white font-bold after:absolute after:-bottom-2 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-primary after:shadow-[0_0_8px_var(--color-primary)]";
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/25">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between px-8">
          <Logo />
          <nav className="flex items-center gap-10">
            <Link to="/" className={nav} activeProps={{ className: `${nav} ${activeClass}` }} activeOptions={{ exact: true }}>
              Home
            </Link>
            <Link to="/new" className={nav} activeProps={{ className: `${nav} ${activeClass}` }}>
              New Comparison
            </Link>
            <Link to="/timeline" className={nav} activeProps={{ className: `${nav} ${activeClass}` }}>
              Timeline
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/50 bg-background/95 py-5">
        <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2.5 px-6 text-sm font-medium text-muted-foreground/90">
          <ShieldAlert className="h-4 w-4 shrink-0 text-primary" />
          {DISCLAIMER}
        </div>
      </footer>
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "error" | "idle" | "info"; children: ReactNode }) {
  const cls = {
    ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
    warn: "border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
    error: "border-rose-500/40 bg-rose-500/15 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]",
    idle: "border-border/60 bg-muted/40 text-muted-foreground",
    info: "border-primary/40 bg-primary/15 text-primary shadow-[0_0_10px_rgba(255,51,102,0.25)]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}
