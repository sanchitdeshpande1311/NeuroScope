import { memo } from "react";
import { allDifferences, describeDifference } from "@/lib/neuro/volumes";
import { REGION_NAMES, REGIONS, type StudySummary } from "@/lib/neuro/types";

const f = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");

export const VolumeTable = memo(function VolumeTable({ prev, cur }: { prev: StudySummary; cur: StudySummary }) {
  const diffs = allDifferences(prev.volumes, cur.volumes);
  return (
    <div className="panel mt-6 overflow-x-auto rounded-2xl border border-primary/30 bg-card/95 p-6 shadow-2xl backdrop-blur-md">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-primary">
            03 —— Quantitative Data
          </span>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-white font-heading">
            Estimated Volume Measurements
          </h3>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          mL = voxels × voxel volume (mm³) ÷ 1000 · original geometry
        </span>
      </div>
      <table className="mt-4 w-full text-base">
        <thead className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="py-3 text-left">Region</th>
            <th className="text-right">Previous (mL)</th>
            <th className="text-right">Current (mL)</th>
            <th className="text-right">Absolute Δ (mL)</th>
            <th className="text-right">Percentage Δ</th>
            <th className="pl-6 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {diffs.map((d) => {
            const pv = prev.volumes?.[d.region],
              cv = cur.volumes?.[d.region];
            const isReduction = d.percent !== null && d.percent <= -25;
            const isExpansion = (d.percent !== null && d.percent >= 25) || d.status === "undefined_zero_previous";
            return (
              <tr key={d.region} className="border-b border-border/40 align-top transition-colors hover:bg-white/[0.02]">
                <td className="py-3.5 font-sans">
                  <span className="font-mono text-base font-bold text-primary">{d.region}</span>{" "}
                  <span className="text-sm font-medium text-muted-foreground">{REGION_NAMES[d.region]}</span>
                </td>
                <td className="py-3.5 text-right font-semibold text-white">
                  {f(d.previousMl)}
                  <div className="text-xs text-muted-foreground font-normal">
                    {pv ? `${pv.voxels.toLocaleString()} voxels` : ""}
                  </div>
                </td>
                <td className="py-3.5 text-right font-semibold text-white">
                  {f(d.currentMl)}
                  <div className="text-xs text-muted-foreground font-normal">
                    {cv ? `${cv.voxels.toLocaleString()} voxels` : ""}
                  </div>
                </td>
                <td className="py-3.5 text-right font-bold">
                  <span
                    className={
                      isReduction
                        ? "text-emerald-400"
                        : isExpansion
                        ? "text-rose-400"
                        : "text-white"
                    }
                  >
                    {Number.isFinite(d.absoluteMl) ? (d.absoluteMl > 0 ? "+" : "") + f(d.absoluteMl) : "—"}
                  </span>
                </td>
                <td className="py-3.5 text-right font-bold">
                  {d.percent === null ? (
                    <span className="font-sans text-sm text-amber-300">
                      {d.status === "undefined_zero_previous" ? "+ New Focus" : "—"}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold ${
                        isReduction
                          ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                          : isExpansion
                          ? "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                          : "text-white bg-black/40"
                      }`}
                    >
                      {d.percent > 0 ? "+" : ""}
                      {f(d.percent, 1)}%
                    </span>
                  )}
                </td>
                <td className="py-3.5 pl-6 font-sans text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isReduction
                          ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                          : isExpansion
                          ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                          : "bg-sky-400"
                      }`}
                    />
                    <span className="text-muted-foreground font-medium">
                      {isReduction
                        ? "Volumetric regression (Betterment)"
                        : isExpansion
                        ? "Volumetric progression (Elevated risk)"
                        : describeDifference(d)}
                      {d.note && d.status !== "undefined_zero_previous" ? ` · ${d.note}` : ""}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {diffs.some((d) => d.status === "undefined_zero_previous") && (
        <p className="mt-2 text-xs text-muted-foreground">A percentage is undefined when the previous estimated volume is zero, because the formula divides by the previous volume.</p>
      )}
      {(prev.expert_volumes || cur.expert_volumes) && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Expert-mask measurements — {[prev, cur].filter((s) => s.expert_volumes).map((s) => `${s.role}: ${REGIONS.map((r) => `${r} ${f(s.expert_volumes![r].volumeMl)} mL`).join(", ")}`).join(" · ")}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Volume differences between model predictions do not establish growth, treatment response or progression.</p>
    </div>
  );
});
