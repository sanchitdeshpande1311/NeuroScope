import type { Region, RegionVolume, RegionVolumes, Vec3 } from "./types";
import { REGIONS } from "./types";

export function voxelVolumeMm3(spacing: Vec3): number {
  return Math.abs(spacing[0] * spacing[1] * spacing[2]);
}

/** Volume in mL = voxels × voxel volume (mm³) ÷ 1000 */
export function volumeMl(voxels: number, spacing: Vec3): RegionVolume {
  const v = voxelVolumeMm3(spacing);
  return { voxels, voxelVolumeMm3: v, volumeMl: (voxels * v) / 1000 };
}

export interface VolumeDifference {
  region: Region;
  previousMl: number;
  currentMl: number;
  absoluteMl: number;
  percent: number | null;
  status: "ok" | "undefined_zero_previous" | "unavailable";
  note?: string;
  direction: "increase" | "decrease" | "no change";
}

export function volumeDifference(region: Region, prev?: RegionVolume, cur?: RegionVolume): VolumeDifference {
  if (!prev || !cur) {
    return {
      region,
      previousMl: prev?.volumeMl ?? NaN,
      currentMl: cur?.volumeMl ?? NaN,
      absoluteMl: NaN,
      percent: null,
      status: "unavailable",
      note: "Volume not available for one or both studies.",
      direction: "no change",
    };
  }
  const absoluteMl = cur.volumeMl - prev.volumeMl;
  const direction = absoluteMl > 0 ? "increase" : absoluteMl < 0 ? "decrease" : "no change";
  if (prev.volumeMl === 0) {
    return {
      region,
      previousMl: 0,
      currentMl: cur.volumeMl,
      absoluteMl,
      percent: null,
      status: "undefined_zero_previous",
      note: "Not defined — previous volume is zero. A percentage change relative to zero would require division by zero.",
      direction,
    };
  }
  return {
    region,
    previousMl: prev.volumeMl,
    currentMl: cur.volumeMl,
    absoluteMl,
    percent: (absoluteMl / prev.volumeMl) * 100,
    status: "ok",
    direction,
  };
}

export function allDifferences(prev: RegionVolumes | null, cur: RegionVolumes | null): VolumeDifference[] {
  return REGIONS.map((r) => volumeDifference(r, prev?.[r], cur?.[r]));
}

export function describeDifference(d: VolumeDifference): string {
  if (d.status === "unavailable") return "Unavailable";
  if (d.direction === "no change") return "No difference in estimated volume";
  return d.direction === "increase" ? "Increase in estimated volume" : "Decrease in estimated volume";
}

import type { LongitudinalAssessment, SubregionAssessment, RiskFactor } from "./types";
import { REGION_NAMES } from "./types";

export function evaluateLongitudinalAssessment(
  prev: RegionVolumes | null,
  cur: RegionVolumes | null,
  existingDiffs?: VolumeDifference[]
): LongitudinalAssessment {
  if (!prev || !cur) {
    return {
      category: "indeterminate",
      bettermentStatus: "indeterminate",
      bettermentHeadline: "Longitudinal Assessment Unavailable",
      isImprovement: false,
      riskLevel: "indeterminate",
      riskLabel: "Undetermined",
      summary: "Volumetric segmentation missing for one or both time points. Cannot evaluate longitudinal changes.",
      clinicalInterpretation: "Assessment requires complete volumetric segmentation across both time points.",
      subregions: [],
      riskFactors: [],
      keyFindings: ["Incomplete longitudinal volumetric data."],
      criteriaReference: "RANO 2.0 volumetric criteria adapted for 3D MRI segmentation",
    };
  }

  const diffs = existingDiffs || allDifferences(prev, cur);
  const diffMap = new Map<Region, VolumeDifference>();
  diffs.forEach((d) => diffMap.set(d.region, d));

  const pEt = prev.ET?.volumeMl ?? 0;
  const cEt = cur.ET?.volumeMl ?? 0;
  const dEt = diffMap.get("ET");
  const dEtMl = dEt ? (Number.isFinite(dEt.absoluteMl) ? dEt.absoluteMl : cEt - pEt) : cEt - pEt;
  const dEtPct = dEt?.percent ?? null;

  const pTc = prev.TC?.volumeMl ?? 0;
  const cTc = cur.TC?.volumeMl ?? 0;
  const dTc = diffMap.get("TC");
  const dTcMl = dTc ? (Number.isFinite(dTc.absoluteMl) ? dTc.absoluteMl : cTc - pTc) : cTc - pTc;
  const dTcPct = dTc?.percent ?? null;

  const pWt = prev.WT?.volumeMl ?? 0;
  const cWt = cur.WT?.volumeMl ?? 0;
  const dWt = diffMap.get("WT");
  const dWtMl = dWt ? (Number.isFinite(dWt.absoluteMl) ? dWt.absoluteMl : cWt - pWt) : cWt - pWt;
  const dWtPct = dWt?.percent ?? null;

  const classifyTrend = (p: number, c: number, dMl: number, dPct: number | null) => {
    if (p === 0 && c > 0.05) return "new" as const;
    if (p === 0 && c === 0) return "absent" as const;
    if (dPct !== null) {
      if (dPct <= -25 && dMl <= -0.1) return "decreasing" as const;
      if (dPct >= 25 && dMl >= 0.1) return "increasing" as const;
    } else if (dMl > 0.1) return "increasing" as const;
    else if (dMl < -0.1) return "decreasing" as const;
    return "stable" as const;
  };

  const etTrend = classifyTrend(pEt, cEt, dEtMl, dEtPct);
  const tcTrend = classifyTrend(pTc, cTc, dTcMl, dTcPct);
  const wtTrend = classifyTrend(pWt, cWt, dWtMl, dWtPct);

  const subregions: SubregionAssessment[] = [
    {
      region: "ET",
      name: "Enhancing Tumour (Active Neovascular Burden)",
      previousMl: Number(pEt.toFixed(3)),
      currentMl: Number(cEt.toFixed(3)),
      deltaMl: Number(dEtMl.toFixed(3)),
      deltaPercent: dEtPct !== null ? Number(dEtPct.toFixed(1)) : null,
      trend: etTrend,
      summary:
        etTrend === "new"
          ? `New enhancing focus observed (+${cEt.toFixed(2)} mL)`
          : etTrend === "decreasing"
          ? `Contracted by ${Math.abs(dEtMl).toFixed(2)} mL (${dEtPct?.toFixed(1)}%)`
          : etTrend === "increasing"
          ? `Expanded by +${dEtMl.toFixed(2)} mL (+${dEtPct?.toFixed(1)}%)`
          : etTrend === "absent"
          ? "Negligible/No enhancing volume detected"
          : `Stable within ±25% margin (${dEtMl >= 0 ? "+" : ""}${dEtMl.toFixed(2)} mL)`,
    },
    {
      region: "TC",
      name: "Tumour Core (Solid Tumour & Necrotic Cavity)",
      previousMl: Number(pTc.toFixed(3)),
      currentMl: Number(cTc.toFixed(3)),
      deltaMl: Number(dTcMl.toFixed(3)),
      deltaPercent: dTcPct !== null ? Number(dTcPct.toFixed(1)) : null,
      trend: tcTrend,
      summary:
        tcTrend === "new"
          ? `New solid core observed (+${cTc.toFixed(2)} mL)`
          : tcTrend === "decreasing"
          ? `Contracted by ${Math.abs(dTcMl).toFixed(2)} mL (${dTcPct?.toFixed(1)}%)`
          : tcTrend === "increasing"
          ? `Expanded by +${dTcMl.toFixed(2)} mL (+${dTcPct?.toFixed(1)}%)`
          : tcTrend === "absent"
          ? "Negligible/No core volume detected"
          : `Stable within ±25% margin (${dTcMl >= 0 ? "+" : ""}${dTcMl.toFixed(2)} mL)`,
    },
    {
      region: "WT",
      name: "Whole Tumour (Core + Peritumoral Vasogenic Edema)",
      previousMl: Number(pWt.toFixed(3)),
      currentMl: Number(cWt.toFixed(3)),
      deltaMl: Number(dWtMl.toFixed(3)),
      deltaPercent: dWtPct !== null ? Number(dWtPct.toFixed(1)) : null,
      trend: wtTrend,
      summary:
        wtTrend === "decreasing"
          ? `Contracted by ${Math.abs(dWtMl).toFixed(2)} mL (${dWtPct?.toFixed(1)}%)`
          : wtTrend === "increasing"
          ? `Increased hyperintensity by +${dWtMl.toFixed(2)} mL (+${dWtPct?.toFixed(1)}%)`
          : `Stable hyperintensity extent (${dWtMl >= 0 ? "+" : ""}${dWtMl.toFixed(2)} mL)`,
    },
  ];

  let category: LongitudinalAssessment["category"];
  let bettermentStatus: LongitudinalAssessment["bettermentStatus"];
  let isImprovement: boolean;
  let riskLevel: LongitudinalAssessment["riskLevel"];
  let riskLabel: string;
  let bettermentHeadline: string;
  let summary: string;
  let clinInterp: string;

  if (etTrend === "new" && cEt >= 0.2) {
    category = "new_lesion";
    bettermentStatus = "progression";
    isImprovement = false;
    riskLevel = "high";
    riskLabel = "High Risk - Progressive Lesion";
    bettermentHeadline = "No Improvement - New Enhancing Lesion Emerged";
    summary = `A new contrast-enhancing lesion of ${cEt.toFixed(2)} mL has emerged where no enhancing tumor was measurable at baseline. In accordance with RANO guidelines, emergence of a new enhancing focus represents disease progression and elevated clinical risk.`;
    clinInterp =
      "Suggests recurrent or newly vascularized active neoplastic activity. Urgent clinical correlation with patient neurological status and radiation oncology history is advised.";
  } else if (
    (dEtPct !== null && dEtPct > 25 && dEtMl >= 0.25) ||
    (dTcPct !== null && dTcPct > 25 && dTcMl >= 0.35) ||
    (tcTrend === "new" && cTc >= 0.4)
  ) {
    category = "progression";
    bettermentStatus = "progression";
    isImprovement = false;
    riskLevel = "high";
    riskLabel = "High Risk - Volumetric Progression";
    const maxGrowthPct = dEtPct && dEtPct > 25 ? dEtPct : (dTcPct ?? 0);
    bettermentHeadline = `No Improvement - Disease Progression Observed (+${maxGrowthPct.toFixed(1)}%)`;
    summary = `Tumour volume increased significantly (+${Math.max(dEtMl, dTcMl).toFixed(2)} mL, exceeding the +25% progression threshold). The expansion of enhancing and core tissue indicates active disease progression rather than stability.`;
    clinInterp =
      "Volumetric growth exceeds the standard threshold for treatment failure or progression. Differentiate from pseudoprogression if patient underwent recent radiotherapy or immunotherapy.";
  } else if (
    ((dEtPct !== null && dEtPct <= -50 && dEtMl <= -0.2) ||
      (pEt < 0.2 && dTcPct !== null && dTcPct <= -50 && dTcMl <= -0.3)) &&
    (dWtPct === null || dWtPct <= 25)
  ) {
    category = "marked_improvement";
    bettermentStatus = "significant_improvement";
    isImprovement = true;
    riskLevel = "low";
    riskLabel = "Low Risk - Favorable Treatment Response";
    const dropPct = Math.abs(dEtPct !== null ? dEtPct : (dTcPct ?? 0));
    bettermentHeadline = `Significant Betterment - Marked Volumetric Regression (-${dropPct.toFixed(1)}%)`;
    summary = `Substantial reduction in active tumor burden: enhancing tumour decreased by ${Math.abs(dEtMl).toFixed(2)} mL (${dEtPct?.toFixed(1)}% reduction). This fulfills criteria for marked partial/complete therapeutic response.`;
    clinInterp =
      "Reflects favorable response to current therapy with contraction of active neoplastic tissue. Correlate with reduced steroid requirement and clinical symptom stability.";
  } else if (
    ((dEtPct !== null && dEtPct <= -25 && dEtMl <= -0.15) ||
      (pEt < 0.2 && dTcPct !== null && dTcPct <= -25 && dTcMl <= -0.25)) &&
    (dWtPct === null || dWtPct <= 25)
  ) {
    category = "partial_improvement";
    bettermentStatus = "partial_improvement";
    isImprovement = true;
    riskLevel = "low";
    riskLabel = "Low-to-Moderate Risk - Favorable Trend";
    const dropPct = Math.abs(dEtPct !== null ? dEtPct : (dTcPct ?? 0));
    bettermentHeadline = `Definite Betterment - Partial Volumetric Regression (-${dropPct.toFixed(1)}%)`;
    summary = `Measurable contraction of active tumor components (${(dEtPct ?? dTcPct ?? 0).toFixed(1)}% decrease, ${Math.abs(dEtMl).toFixed(2)} mL reduction). Consistent with favorable therapeutic regression.`;
    clinInterp =
      "Indicates positive therapeutic response. Continued longitudinal surveillance recommended to confirm sustained benefit.";
  } else if (dWtPct !== null && dWtPct > 30 && dWtMl >= 1.5 && (dEtPct === null || dEtPct <= 25)) {
    category = "edema_expansion";
    bettermentStatus = "stable";
    isImprovement = false;
    riskLevel = "moderate";
    riskLabel = "Moderate Risk - Edema/Infiltration Expansion";
    bettermentHeadline = `Guarded Status - Non-Enhancing / Edema Expansion (+${dWtPct.toFixed(1)}%)`;
    summary = `T2/FLAIR whole tumour hyperintensity increased by +${dWtMl.toFixed(2)} mL (+${dWtPct.toFixed(1)}%), while enhancing and core volumes remained stable. May reflect increased vasogenic edema, treatment changes, or infiltrative spread.`;
    clinInterp =
      "Assess for symptoms of elevated intracranial pressure. Clinical differentiation between infiltrative tumor recurrence and therapy-induced inflammation/edema is necessary.";
  } else {
    category = "stable_disease";
    bettermentStatus = "stable";
    isImprovement = false;
    riskLevel = "moderate";
    riskLabel = "Moderate Risk - Stable Volumetric Status";
    bettermentHeadline = "Stable Disease - No Significant Progression or Betterment";
    summary = `Estimated tumor volumes remain within the ±25% longitudinal stability threshold. Enhancing change: ${dEtMl >= 0 ? "+" : ""}${dEtMl.toFixed(2)} mL (${dEtPct !== null ? `${dEtPct >= 0 ? "+" : ""}${dEtPct.toFixed(1)}%` : "0.0%"}), Core change: ${dTcMl >= 0 ? "+" : ""}${dTcMl.toFixed(2)} mL (${dTcPct !== null ? `${dTcPct >= 0 ? "+" : ""}${dTcPct.toFixed(1)}%` : "0.0%"}). No definitive signs of tumor progression or marked regression.`;
    clinInterp = "Consistent with disease stabilization under current management. Routine interval surveillance is appropriate.";
  }

  const riskFactors: RiskFactor[] = [
    {
      title: "Enhancing Vascularized Burden",
      level: etTrend === "new" || etTrend === "increasing" ? "high" : etTrend === "decreasing" ? "low" : "moderate",
      details:
        etTrend === "new" || etTrend === "increasing"
          ? "Expanding or newly emergent contrast-enhancing lesion indicating high metabolic/angiogenic activity."
          : etTrend === "decreasing"
          ? "Substantial regression in contrast-enhancing tissue, indicating low active angiogenic risk."
          : "Stable enhancing volume without evidence of rapid neo-vascular expansion.",
    },
    {
      title: "Tumour Core & Necrotic Burden",
      level: tcTrend === "new" || tcTrend === "increasing" ? "high" : tcTrend === "decreasing" ? "low" : "moderate",
      details:
        tcTrend === "new" || tcTrend === "increasing"
          ? "Solid core expansion observed."
          : tcTrend === "decreasing"
          ? "Core tissue regression noted."
          : "Core volume remains stable.",
    },
    {
      title: "Peritumoural Edema & Mass Effect",
      level: dWtMl > 5 || (dWtPct !== null && dWtPct > 40) ? "high" : wtTrend === "increasing" ? "moderate" : "low",
      details:
        wtTrend === "increasing"
          ? `Elevated risk of mass effect: whole tumour edema/infiltration change is ${dWtMl >= 0 ? "+" : ""}${dWtMl.toFixed(2)} mL.`
          : "Peritumoural edema is stable or resolving favorably.",
    },
    {
      title: "Longitudinal Trajectory",
      level: riskLevel,
      details: `Overall status classified as ${bettermentHeadline} (${riskLabel}).`,
    },
  ];

  const keyFindings: string[] = [
    `Longitudinal Trajectory: ${bettermentHeadline}`,
    `Betterment / Improvement: ${isImprovement ? "Yes — Measurable volumetric improvement (betterment) observed" : "No — Stable disease or progressive tumor burden"}`,
    `Risk Category: ${riskLabel}`,
    dEtPct !== null
      ? `Enhancing Tumour Delta: ${dEtMl >= 0 ? "+" : ""}${dEtMl.toFixed(2)} mL (${dEtPct >= 0 ? "+" : ""}${dEtPct.toFixed(1)}%)`
      : `Enhancing Tumour Delta: ${dEtMl >= 0 ? "+" : ""}${dEtMl.toFixed(2)} mL (new focus)`,
    dWtPct !== null
      ? `Whole Tumour Delta: ${dWtMl >= 0 ? "+" : ""}${dWtMl.toFixed(2)} mL (${dWtPct >= 0 ? "+" : ""}${dWtPct.toFixed(1)}%)`
      : `Whole Tumour Delta: ${dWtMl >= 0 ? "+" : ""}${dWtMl.toFixed(2)} mL`,
  ];

  return {
    category,
    bettermentStatus,
    bettermentHeadline,
    isImprovement,
    riskLevel,
    riskLabel,
    summary,
    clinicalInterpretation: clinInterp,
    subregions,
    riskFactors,
    keyFindings,
    criteriaReference: "RANO 2.0 volumetric criteria adapted for 3D MRI segmentation",
  };
}
