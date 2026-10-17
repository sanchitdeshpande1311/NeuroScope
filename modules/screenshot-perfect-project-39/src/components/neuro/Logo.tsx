import { Brain } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-primary/40 bg-primary/20 shadow-mauve">
        <Brain className="h-5 w-5 text-primary" strokeWidth={1.6} />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--mauve)]" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-sm font-bold text-white tracking-tight">
            NeuroScope <span className="text-mauve-glow font-semibold">AI</span>
          </div>
        </div>
      )}
    </Link>
  );
}
