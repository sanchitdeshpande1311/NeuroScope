import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  BarChart3,
  LineChart as LineChartIcon,
  Activity,
} from "lucide-react";
import type { StudySummary } from "@/lib/neuro/types";

interface BeforeAfterGraphProps {
  prev: StudySummary;
  cur: StudySummary;
}

type GraphViewMode = "bars" | "trajectory" | "delta";

export const BeforeAfterGraph = React.memo(function BeforeAfterGraph({ prev, cur }: BeforeAfterGraphProps) {
  const [viewMode, setViewMode] = useState<GraphViewMode>("bars");

  const prevWT = prev.volumes?.WT?.volumeMl ?? 0;
  const curWT = cur.volumes?.WT?.volumeMl ?? 0;
  const prevTC = prev.volumes?.TC?.volumeMl ?? 0;
  const curTC = cur.volumes?.TC?.volumeMl ?? 0;
  const prevET = prev.volumes?.ET?.volumeMl ?? 0;
  const curET = cur.volumes?.ET?.volumeMl ?? 0;

  const prevDate = prev.date || "Baseline";
  const curDate = cur.date || "Follow-up";

  // Data for Grouped Bar Comparison
  const barData = [
    {
      region: "WT",
      name: "Whole Tumour (WT)",
      Before: Number(prevWT.toFixed(2)),
      After: Number(curWT.toFixed(2)),
      deltaMl: Number((curWT - prevWT).toFixed(2)),
      deltaPct: prevWT > 0 ? Number((((curWT - prevWT) / prevWT) * 100).toFixed(1)) : null,
      isReduction: curWT < prevWT,
    },
    {
      region: "TC",
      name: "Tumour Core (TC)",
      Before: Number(prevTC.toFixed(2)),
      After: Number(curTC.toFixed(2)),
      deltaMl: Number((curTC - prevTC).toFixed(2)),
      deltaPct: prevTC > 0 ? Number((((curTC - prevTC) / prevTC) * 100).toFixed(1)) : null,
      isReduction: curTC < prevTC,
    },
    {
      region: "ET",
      name: "Enhancing Tumour (ET)",
      Before: Number(prevET.toFixed(2)),
      After: Number(curET.toFixed(2)),
      deltaMl: Number((curET - prevET).toFixed(2)),
      deltaPct: prevET > 0 ? Number((((curET - prevET) / prevET) * 100).toFixed(1)) : null,
      isReduction: curET < prevET,
    },
  ];

  // Data for Trajectory Slope
  const trajectoryData = [
    {
      timepoint: `Before (${prevDate})`,
      WT: Number(prevWT.toFixed(2)),
      TC: Number(prevTC.toFixed(2)),
      ET: Number(prevET.toFixed(2)),
    },
    {
      timepoint: `After (${curDate})`,
      WT: Number(curWT.toFixed(2)),
      TC: Number(curTC.toFixed(2)),
      ET: Number(curET.toFixed(2)),
    },
  ];

  // Data for Net Delta
  const deltaData = barData.map((d) => ({
    region: d.region,
    name: d.name,
    deltaMl: d.deltaMl,
    deltaPct: d.deltaPct,
    isReduction: d.deltaMl <= 0,
  }));

  return (
    <div
      id="before-after-volumetric-graph"
      className="panel mt-6 overflow-hidden rounded-2xl border border-primary/30 bg-card/95 p-6 shadow-2xl backdrop-blur-md"
    >
      {/* Top Tag & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-primary">
            02 —— Volumetric Trajectory
          </span>
          <h3 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl font-heading">
            Before vs. After{" "}
            <span className="text-primary font-extrabold drop-shadow-[0_0_12px_rgba(255,51,102,0.4)]">
              Volume Shift.
            </span>
          </h3>
        </div>

        {/* Mode Buttons */}
        <div className="flex items-center rounded-xl border border-border/70 bg-black/50 p-1 font-mono text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setViewMode("bars")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
              viewMode === "bars"
                ? "bg-primary text-white shadow-[0_0_14px_rgba(255,51,102,0.5)]"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Paired Bars</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("trajectory")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
              viewMode === "trajectory"
                ? "bg-primary text-white shadow-[0_0_14px_rgba(255,51,102,0.5)]"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <LineChartIcon className="h-4 w-4" />
            <span>Trajectory Slope</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("delta")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
              viewMode === "delta"
                ? "bg-primary text-white shadow-[0_0_14px_rgba(255,51,102,0.5)]"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Net Δ (mL)</span>
          </button>
        </div>
      </div>

      {/* Main Chart Graphic */}
      <div className="mt-6 h-[330px] w-full">
        {viewMode === "bars" && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
              barGap={12}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 51, 102, 0.12)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#ffffff", fontSize: 13, fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255, 51, 102, 0.3)" }}
              />
              <YAxis
                tick={{ fill: "#ebd0d5", fontSize: 12, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                unit=" mL"
              />
              <Tooltip content={<CustomBarTooltip prevDate={prevDate} curDate={curDate} />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: "14px", fontSize: "12px", fontFamily: "monospace" }}
              />
              {/* Before Bar (Deep Plum Wine) */}
              <Bar
                name={`Before (${prevDate})`}
                dataKey="Before"
                fill="#7c283c"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              />
              {/* After Bar (Luminous Emerald or Electric Cherry Rose) */}
              <Bar
                name={`After (${curDate})`}
                dataKey="After"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {barData.map((entry) => (
                  <Cell
                    key={`after-cell-${entry.region}`}
                    fill={entry.isReduction ? "#10b981" : "#ff3366"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {viewMode === "trajectory" && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trajectoryData}
              margin={{ top: 20, right: 35, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 51, 102, 0.12)" vertical={false} />
              <XAxis
                dataKey="timepoint"
                tick={{ fill: "#ffffff", fontSize: 13, fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255, 51, 102, 0.3)" }}
              />
              <YAxis
                tick={{ fill: "#ebd0d5", fontSize: 12, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                unit=" mL"
              />
              <Tooltip content={<CustomTrajectoryTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: "14px", fontSize: "12px", fontFamily: "monospace" }}
              />
              <Line
                type="monotone"
                dataKey="WT"
                name="Whole Tumour (WT)"
                stroke="#ff3366"
                strokeWidth={3}
                dot={{ r: 6, fill: "#ff3366", stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 8 }}
              />
              <Line
                type="monotone"
                dataKey="TC"
                name="Tumour Core (TC)"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ r: 6, fill: "#38bdf8", stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 8 }}
              />
              <Line
                type="monotone"
                dataKey="ET"
                name="Enhancing Tumour (ET)"
                stroke="#fbbf24"
                strokeWidth={3}
                dot={{ r: 6, fill: "#fbbf24", stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {viewMode === "delta" && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={deltaData}
              margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 51, 102, 0.12)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#ffffff", fontSize: 13, fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255, 51, 102, 0.3)" }}
              />
              <YAxis
                tick={{ fill: "#ebd0d5", fontSize: 12, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                unit=" mL"
              />
              <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.35)" strokeWidth={1.5} />
              <Tooltip content={<CustomDeltaTooltip />} />
              <Bar dataKey="deltaMl" name="Volume Shift (mL)" radius={[6, 6, 0, 0]} maxBarSize={60}>
                {deltaData.map((entry) => (
                  <Cell
                    key={`delta-cell-${entry.region}`}
                    fill={entry.isReduction ? "#10b981" : "#ff3366"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Clear Bottom Legend / Notes */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border/40 pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-6 font-mono text-xs sm:text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <span className="h-3 w-3 rounded-sm bg-[#7c283c] shadow-sm" />
            <span>Before (Baseline Scan)</span>
          </span>
          <span className="flex items-center gap-2 text-foreground">
            <span className="h-3 w-3 rounded-sm bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span>After: Shrinkage (Betterment)</span>
          </span>
          <span className="flex items-center gap-2 text-foreground">
            <span className="h-3 w-3 rounded-sm bg-[#ff3366] shadow-[0_0_8px_rgba(255,51,102,0.5)]" />
            <span>After: Expansion (Progression)</span>
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          Calibrated in cm³ (mL) via rigid 3D co-registration
        </span>
      </div>
    </div>
  );
});

// Tooltip for Grouped Bar
function CustomBarTooltip({ active, payload, prevDate, curDate }: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-xl border border-primary/40 bg-[#1b060d] p-3.5 shadow-2xl font-mono text-xs sm:text-sm">
      <div className="font-bold text-white font-heading text-sm sm:text-base">{item.name}</div>
      <div className="mt-2.5 space-y-1.5">
        <div className="flex justify-between gap-5 text-muted-foreground">
          <span>Before ({prevDate}):</span>
          <strong className="text-white">{item.Before.toFixed(2)} mL</strong>
        </div>
        <div className="flex justify-between gap-5 text-muted-foreground">
          <span>After ({curDate}):</span>
          <strong className="text-white">{item.After.toFixed(2)} mL</strong>
        </div>
        <div className="mt-2 flex justify-between gap-5 border-t border-border/50 pt-1.5">
          <span className="text-muted-foreground">Shift:</span>
          <span className={item.isReduction ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
            {item.deltaMl > 0 ? "+" : ""}
            {item.deltaMl.toFixed(2)} mL{" "}
            {item.deltaPct !== null ? `(${item.deltaPct > 0 ? "+" : ""}${item.deltaPct}%)` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// Tooltip for Trajectory Line
function CustomTrajectoryTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;

  return (
    <div className="rounded-xl border border-primary/40 bg-[#1b060d] p-3.5 shadow-2xl font-mono text-xs sm:text-sm">
      <div className="font-bold text-white font-heading text-sm sm:text-base">{point?.timepoint}</div>
      <div className="mt-2.5 space-y-1.5">
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex justify-between gap-5">
            <span style={{ color: entry.color }} className="font-semibold">{entry.name.split(" ")[0]}:</span>
            <strong className="text-white">{Number(entry.value).toFixed(2)} mL</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tooltip for Net Delta
function CustomDeltaTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-xl border border-primary/40 bg-[#1b060d] p-3.5 shadow-2xl font-mono text-xs sm:text-sm">
      <div className="font-bold text-white font-heading text-sm sm:text-base">{item.name}</div>
      <div className="mt-2 flex justify-between gap-5">
        <span className="text-muted-foreground">Net Delta:</span>
        <span className={item.isReduction ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
          {item.deltaMl > 0 ? "+" : ""}
          {item.deltaMl.toFixed(2)} mL
        </span>
      </div>
    </div>
  );
}
