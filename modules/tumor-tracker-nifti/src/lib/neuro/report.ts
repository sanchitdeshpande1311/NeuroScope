import { jsPDF } from "jspdf";
import type { ComparisonResults } from "./types";
import { DISCLAIMER, REGIONS } from "./types";
import { allDifferences, describeDifference, evaluateLongitudinalAssessment } from "./volumes";

/** Builds the research report. Refuses when results are not complete. */
export function buildReport(r: ComparisonResults, changeMapPng?: string): jsPDF {
  const prev = r.studies.find((s) => s.role === "previous");
  const cur = r.studies.find((s) => s.role === "current");
  if (!prev || !cur || !prev.volumes || !cur.volumes) throw new Error("Report unavailable: analysis did not produce volumes for both studies.");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;
  const line = (t: string, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const l of doc.splitTextToSize(t, W - 96)) {
      if (y > 790) { doc.addPage(); y = 48; }
      doc.text(l, 48, y);
      y += size * 1.4;
    }
  };
  const gap = (n = 8) => (y += n);

  line("NeuroScope Tumour Change Tracker — Research Report", 16, true);
  line(DISCLAIMER, 9);
  gap();
  line(`Comparison ID: ${r.comparison_id}`);
  line(`Processed at: ${r.processed_at}`);
  gap();

  // Longitudinal Assessment & Clinical Risk Stratification
  const assessment = r.assessment || evaluateLongitudinalAssessment(prev.volumes, cur.volumes);
  line("Longitudinal Clinical Assessment & Risk Stratification", 12, true);
  line(`Status: ${assessment.bettermentHeadline}`, 10, true);
  line(`Risk Stratification: ${assessment.riskLabel}`, 9, true);
  line(`Betterment Observed: ${assessment.isImprovement ? "Yes (Measurable Volumetric Regression)" : "No (Stable or Progressive Burden)"}`, 9);
  line(`Assessment Summary: ${assessment.summary}`, 9);
  line(`Clinical Interpretation Note: ${assessment.clinicalInterpretation}`, 9);
  gap();

  line("Studies", 12, true);
  for (const s of [prev, cur]) {
    line(`${s.role === "previous" ? "Previous" : "Current"}: ${s.label} (${s.date}) — study ID ${s.study_id}`);
    for (const v of s.validation) line(`  ${v.sequence}: ${v.file_name} — ${v.valid ? "valid" : "invalid"}${v.issues.length ? " (" + v.issues.map((i) => i.message).join("; ") + ")" : ""}`, 9);
    for (const [k, h] of Object.entries(s.input_hashes)) line(`  SHA-256 ${k}: ${h}`, 8);
  }
  gap();
  line("Model", 12, true);
  line(`${r.model.name} — version ${r.model.version} — licence ${r.model.licence}`);
  line(`Input order: ${r.model.input_order.join(", ")}; output channels: ${r.model.output_channels.join(", ")}`);
  line("Preprocessing", 12, true);
  r.preprocessing.forEach((p) => line(`• ${p}`, 9));
  gap();
  line("Registration", 12, true);
  line(`${r.registration.method}; fixed: ${r.registration.fixed}; moving: ${r.registration.moving}; transform: ${r.registration.transform}`);
  line(`Quality: ${r.registration.quality.toUpperCase()}`);
  line(`Settings: ${Object.entries(r.registration.settings).map(([k, v]) => `${k}=${v}`).join(", ")}`, 9);
  line(`Metrics: ${Object.entries(r.registration.metrics).map(([k, v]) => `${k}=${v.toFixed(4)}`).join(", ")}`, 9);
  r.registration.warnings.forEach((w) => line(`! ${w}`, 9));
  gap();
  line("Estimated volumes (model predictions, original geometry)", 12, true);
  line("Volume (mL) = voxels × voxel volume (mm³) ÷ 1000", 9);
  for (const d of allDifferences(prev.volumes, cur.volumes)) {
    const pv = prev.volumes[d.region], cv = cur.volumes[d.region];
    line(`${d.region}: previous ${pv.volumeMl.toFixed(2)} mL (${pv.voxels} vox × ${pv.voxelVolumeMm3.toFixed(3)} mm³) → current ${cv.volumeMl.toFixed(2)} mL (${cv.voxels} vox × ${cv.voxelVolumeMm3.toFixed(3)} mm³)`, 9);
    line(`   Absolute ${d.absoluteMl >= 0 ? "+" : ""}${d.absoluteMl.toFixed(2)} mL; percentage ${d.percent === null ? d.note : d.percent.toFixed(1) + "%"} — ${describeDifference(d)}`, 9);
  }
  for (const s of [prev, cur]) if (s.expert_volumes) line(`Expert-mask measurements (${s.role}): ${REGIONS.map((k) => `${k} ${s.expert_volumes![k].volumeMl.toFixed(2)} mL`).join(", ")}`, 9);
  if (changeMapPng) {
    gap();
    line("Change map (axial slice through crosshair)", 12, true);
    if (y > 560) { doc.addPage(); y = 48; }
    doc.addImage(changeMapPng, "PNG", 48, y, 240, 240);
    y += 250;
    line("Orange: current-only prediction · Cyan: shared predicted region · Violet: previous-only prediction", 9);
  }
  gap();
  line("Warnings", 12, true);
  [...r.warnings].forEach((w) => line(`• ${w}`, 9));
  line("Limitations", 12, true);
  r.limitations.forEach((w) => line(`• ${w}`, 9));
  line("Differences describe model predictions, not confirmed biological change. They do not establish progression, treatment response or prognosis.", 9);
  gap();
  line(DISCLAIMER, 9, true);
  return doc;
}
