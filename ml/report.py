"""
PDF report with provenance and limitations (reportlab + Pillow snapshots).

Snapshots are drawn after reorienting to the closest canonical RAS frame, in
neurological convention (patient RIGHT on screen RIGHT), with L/R, A/P, S/I labels.
"""
from __future__ import annotations

import io
from pathlib import Path

import nibabel as nib
import numpy as np
from PIL import Image, ImageDraw
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

DISCLAIMER = ("RESEARCH AND TEACHING USE ONLY. Not a medical device. Not validated for clinical use. "
              "Must not be used for diagnosis, prognosis or treatment decisions, and does not replace a radiologist.")
COLORS = {1: (220, 50, 50), 2: (60, 200, 90), 4: (250, 210, 40)}  # NCR/NET red, edema green, ET yellow


def _canonical(arr, affine):
    img = nib.as_closest_canonical(nib.Nifti1Image(arr, affine))
    return np.asanyarray(img.dataobj), img.affine


def _render(bg2d, seg2d, labels):
    lo, hi = np.percentile(bg2d[bg2d > 0], [1, 99]) if np.any(bg2d > 0) else (0, 1)
    g = np.clip((bg2d - lo) / max(hi - lo, 1e-6), 0, 1)
    rgb = np.stack([g * 255] * 3, -1).astype(np.float32)
    for lab, col in COLORS.items():
        m = seg2d == lab
        rgb[m] = 0.45 * rgb[m] + 0.55 * np.array(col)
    im = Image.fromarray(rgb.astype(np.uint8)).resize((bg2d.shape[1] * 2, bg2d.shape[0] * 2), Image.NEAREST)
    d = ImageDraw.Draw(im)
    w, h = im.size
    top, bottom, left, right = labels
    d.text((w // 2 - 3, 2), top, fill=(255, 255, 0)); d.text((w // 2 - 3, h - 12), bottom, fill=(255, 255, 0))
    d.text((3, h // 2), left, fill=(255, 255, 0)); d.text((w - 10, h // 2), right, fill=(255, 255, 0))
    return im


def snapshots(bg: np.ndarray, seg: np.ndarray, affine: np.ndarray) -> list:
    b, _ = _canonical(bg.astype(np.float32), affine)
    s, _ = _canonical(seg.astype(np.uint8), affine)
    c = np.argwhere(s > 0).mean(0).astype(int) if s.any() else np.array(s.shape) // 2
    ax = _render(np.flipud(b[:, :, c[2]].T), np.flipud(s[:, :, c[2]].T), ("A", "P", "L", "R"))
    co = _render(np.flipud(b[:, c[1], :].T), np.flipud(s[:, c[1], :].T), ("S", "I", "L", "R"))
    sa = _render(np.flipud(b[c[0], :, :].T), np.flipud(s[c[0], :, :].T), ("S", "I", "P", "A"))
    return [("Axial", ax), ("Coronal", co), ("Sagittal", sa)]


def build_pdf(path: Path, meta: dict, bg: np.ndarray | None = None, seg: np.ndarray | None = None,
              affine: np.ndarray | None = None) -> Path:
    st = getSampleStyleSheet()
    small = st["BodyText"].clone("small", fontSize=8, leading=10)
    warn = st["BodyText"].clone("warn", fontSize=9, leading=11, textColor=colors.HexColor("#9a3412"))
    el = [Paragraph("NeuroScope 3D - Segmentation Report", st["Title"]), Paragraph(DISCLAIMER, warn), Spacer(1, 4 * mm)]
    el.append(Paragraph(f"Run ID: {meta['run_id']} &nbsp;&nbsp; Generated (UTC): {meta['timestamp_utc']}", small))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph("Suspected tumour region predicted by the model - estimated volumes", st["Heading3"]))
    v = meta["volumes_ml"]
    rows = [["Region", "Estimated volume (mL)", "Voxels"]] + [
        [k, f"{v['baseline'][k]:.2f}", str(v["baseline"]["voxels"][k])] for k in ("WT", "TC", "ET")]
    t = Table(rows, hAlign="LEFT")
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey)]))
    el += [t, Paragraph(f"Volume = voxel count x {meta['voxel_spacing_mm'][0]:.3g} x {meta['voxel_spacing_mm'][1]:.3g} x "
                        f"{meta['voxel_spacing_mm'][2]:.3g} mm / 1000 (spacing from the T1Gd header). WT = labels 1+2+4, "
                        f"TC = labels 1+4, ET = label 4.", small), Spacer(1, 3 * mm)]
    if bg is not None and seg is not None:
        imgs, snaps = [], snapshots(bg, seg, affine)
        for _, im in snaps:
            buf = io.BytesIO(); im.save(buf, format="PNG"); buf.seek(0)
            imgs.append(RLImage(buf, width=55 * mm, height=55 * mm * im.size[1] / im.size[0]))
        el += [Table([imgs, [n for n, _ in snaps]]),
               Paragraph("Overlay on T1Gd: red = label 1 (NCR/NET), green = label 2 (edema), yellow = label 4 (enhancing). "
                         "Neurological convention (patient right on image right).", small), Spacer(1, 3 * mm)]
    if meta.get("expert_comparison"):
        el.append(Paragraph("Comparison with the supplied expert mask", st["Heading3"]))
        ec = meta["expert_comparison"]
        rows = [["Region", "Dice", "Sensitivity", "Predicted mL", "Expert mL"]] + [
            [k, f"{ec[k]['dice']:.3f}", "n/a" if ec[k]["sensitivity"] != ec[k]["sensitivity"] else f"{ec[k]['sensitivity']:.3f}",
             f"{ec[k]['pred_ml']:.2f}", f"{ec[k]['ref_ml']:.2f}"] for k in ("WT", "TC", "ET")]
        t = Table(rows, hAlign="LEFT"); t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey)]))
        el += [t, Spacer(1, 3 * mm)]
    el.append(Paragraph("Mathematical post-processing / graph analysis", st["Heading3"]))
    r = meta["refinement"]
    el.append(Paragraph(
        f"Optional refinement ({r['method']}) is shown for comparison only; the primary output is the unrefined model prediction. "
        f"Refined volumes (mL): WT {v['refined']['WT']:.2f}, TC {v['refined']['TC']:.2f}, ET {v['refined']['ET']:.2f}. "
        f"Removed voxels are predicted voxels removed by a rule; they are not confirmed false positives.", small))
    g = meta.get("geodesic", {})
    if g.get("applied"):
        el.append(Paragraph(f"Dijkstra geodesic extent of WT from TC (through predicted tissue, physical edge weights): "
                            f"max {g['max_mm']:.1f} mm, 95th percentile {g['p95_mm']:.1f} mm. Descriptive only.", small))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph("Provenance", st["Heading3"]))
    m = meta["model"]
    prov = [
        ["Model", m["name"]], ["Weights", f"{m['version']} (sha256 {meta['checkpoint_sha256'][:16]}...)"],
        ["Training data", m["training_data"]], ["Weights licence", m["weights_licence"]], ["Code licence", m["code_licence"]],
        ["Preprocessing", m["preprocessing"]], ["Inference", m["inference"]],
        ["Code version", meta["code_version"]], ["Device", meta["device"]],
        ["Timings (s)", ", ".join(f"{k}={v:.1f}" for k, v in meta["timings_s"].items())],
    ] + [[f"SHA-256 {k}", h] for k, h in meta["input_sha256"].items()]
    t = Table([[Paragraph(a, small), Paragraph(str(b), small)] for a, b in prov], colWidths=[35 * mm, 135 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.3, colors.grey), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el += [t, Spacer(1, 3 * mm)]
    if meta.get("input_sanity", {}).get("issues"):
        el.append(Paragraph("Input warnings", st["Heading3"]))
        for i in meta["input_sanity"]["issues"]:
            el.append(Paragraph(f"[{i['level']}] {i['message']}", small))
    el.append(Paragraph("Limitations", st["Heading3"]))
    for line in meta["limitations"]:
        el.append(Paragraph("- " + line, small))
    el += [Spacer(1, 3 * mm), Paragraph(DISCLAIMER, warn)]
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=12 * mm,
                      bottomMargin=12 * mm, title="NeuroScope 3D report").build(el)
    return path
