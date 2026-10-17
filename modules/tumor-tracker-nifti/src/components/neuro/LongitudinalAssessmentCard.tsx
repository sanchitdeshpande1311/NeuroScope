import { memo } from "react";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { LongitudinalAssessment } from "@/lib/neuro/types";

interface Props {
  assessment: LongitudinalAssessment;
}

export const LongitudinalAssessmentCard = memo(function LongitudinalAssessmentCard({ assessment }: Props) {
  const {
    isImprovement,
    riskLevel,
    riskLabel,
    bettermentHeadline,
    summary,
    subregions,
    riskFactors,
  } = assessment;

  const isHighRisk = riskLevel === "high";
  const isLowRisk = riskLevel === "low";

  return (
    <div
      id="longitudinal-assessment-panel"
      className="panel mt-6 overflow-hidden rounded-2xl border border-primary/30 bg-card/95 p-6 shadow-2xl backdrop-blur-md transition-all"
    >
      {/* Top Tag & Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-primary">
              01 —— Longitudinal Evaluation
            </span>
          </div>
          <h2 className="mt-1.5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl font-heading">
            {bettermentHeadline.split(" - ")[0]}
            <span className="ml-2.5 font-extrabold text-primary drop-shadow-[0_0_12px_rgba(255,51,102,0.4)]">
              {bettermentHeadline.includes(" - ") ? bettermentHeadline.split(" - ")[1] : ""}
            </span>
          </h2>
        </div>

        {/* Status & Risk Badges */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Betterment Pill */}
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm font-bold uppercase tracking-wider ${
              isImprovement
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                : isHighRisk
                ? "border-rose-500/50 bg-rose-950/30 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                : "border-sky-500/50 bg-sky-950/30 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.2)]"
            }`}
          >
            {isImprovement ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Betterment: Yes</span>
              </>
            ) : isHighRisk ? (
              <>
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                <span>Progression: High</span>
              </>
            ) : (
              <>
                <Minus className="h-4 w-4 text-sky-400" />
                <span>Status: Stable</span>
              </>
            )}
          </div>

          {/* Risk Level Badge */}
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm font-bold tracking-wide ${
              isHighRisk
                ? "border-rose-500/50 bg-rose-950/30 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                : isLowRisk
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                : "border-sky-500/50 bg-sky-950/30 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.2)]"
            }`}
          >
            {isHighRisk ? (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            ) : isLowRisk ? (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            ) : (
              <Info className="h-4 w-4 text-sky-400" />
            )}
            <span>{riskLabel.replace(" - ", " · ")}</span>
          </div>
        </div>
      </div>

      {/* Concise Clinical Takeaway */}
      <div className="mt-4 rounded-2xl border border-border/50 bg-black/40 px-5 py-3.5 text-base sm:text-lg leading-relaxed text-foreground/95">
        <span className="font-bold text-primary font-heading">Summary: </span>
        {summary}
      </div>

      {/* 3 Subregion Metric Cards (WT, TC, ET) */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {subregions.map((sub) => {
          const isReduction = sub.trend === "decreasing";
          const isExpansion = sub.trend === "increasing" || sub.trend === "new";
          const deltaSign = sub.deltaMl > 0 ? "+" : "";

          return (
            <div
              key={sub.region}
              className="flex flex-col justify-between rounded-2xl border border-border/80 bg-black/40 p-4.5 shadow-md transition-all hover:border-primary/50 hover:bg-black/60"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-base font-bold text-primary">{sub.region}</span>
                  <div className="text-sm font-medium text-muted-foreground">{sub.name.split(" (")[0]}</div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-bold ${
                    isReduction
                      ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                      : isExpansion
                      ? "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                      : "bg-muted border border-border text-muted-foreground"
                  }`}
                >
                  {isReduction ? (
                    <TrendingDown className="h-4 w-4 text-emerald-400" />
                  ) : isExpansion ? (
                    <TrendingUp className="h-4 w-4 text-rose-400" />
                  ) : (
                    <Minus className="h-4 w-4 text-sky-400" />
                  )}
                  {sub.deltaPercent !== null
                    ? `${sub.deltaPercent > 0 ? "+" : ""}${sub.deltaPercent}%`
                    : sub.trend === "new"
                    ? "+ New"
                    : "0%"}
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between border-t border-border/40 pt-3 font-mono text-sm sm:text-base">
                <span className="text-muted-foreground">
                  {sub.previousMl.toFixed(2)} → <strong className="text-white font-bold">{sub.currentMl.toFixed(2)} mL</strong>
                </span>
                <span
                  className={`font-bold ${
                    isReduction
                      ? "text-emerald-400"
                      : isExpansion
                      ? "text-rose-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {deltaSign}{sub.deltaMl.toFixed(2)} mL
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact Risk Factor Indicators */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-black/30 px-4 py-2.5 text-sm">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Risk Signals:
        </span>
        <div className="flex flex-wrap items-center gap-5">
          {riskFactors.slice(0, 3).map((rf) => (
            <div key={rf.title} className="flex items-center gap-2 font-mono text-xs font-semibold">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  rf.level === "high"
                    ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                    : rf.level === "low"
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                    : "bg-sky-400"
                }`}
              />
              <span className="text-muted-foreground">{rf.title.split(" ")[0]}:</span>
              <span className="font-semibold text-white uppercase">{rf.level}</span>
            </div>
          ))}
        </div>
        <span className="font-mono text-xs text-muted-foreground/80">
          RANO 2.0 3D Volumetric
        </span>
      </div>
    </div>
  );
});
