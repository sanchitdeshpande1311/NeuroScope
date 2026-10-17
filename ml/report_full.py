"""
NeuroScope 3D full case report (PDF), generated on demand from the CURRENT run's saved outputs.

Sections (each only when its data exists; nothing is invented):
  1 Report overview      2 MRI sequences        3 Segmentation results
  4 Mathematical refinement (before/after of the saved masks)
  5 Graph analysis (spatial lattice graph + Dijkstra path actually computed for this report)
  6 Expert comparison (only when a validated expert mask was supplied with the run)
  7 Technical appendix

Branding: Cherry Cola #4A202B / Vanilla Cream #F6EBDD. The research/education disclaimer appears once (overview
callout); the running footer carries only the report name and page number.
Figures are rendered with Pillow in the canonical RAS frame, neurological convention (patient right on
image right), with orientation letters.
"""
from __future__ import annotations

import datetime as dt
import io
import re
from pathlib import Path

import nibabel as nib
import numpy as np
from PIL import Image, ImageDraw
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (Image as RLImage, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)
from scipy import ndimage

from .report import snapshots

CHERRY = colors.HexColor("#4A202B")
CREAM = colors.HexColor("#F6EBDD")
CREAM_DARK = colors.HexColor("#EADBC8")
INK = colors.HexColor("#2B1D21")
MUTED = colors.HexColor("#6E5A5F")
LINE = colors.HexColor("#D9C6B4")
DISCLAIMER = ("NeuroScope 3D is a research and educational prototype. Its outputs require interpretation by a qualified "
              "medical professional and are not a standalone clinical diagnosis.")
LABEL_RGB = {1: (220, 50, 50), 2: (60, 200, 90), 4: (250, 210, 40)}
CLASS_LABEL = {"non_tumour_brain": "Non-tumour brain", "ncr_net": "NCR/NET", "edema": "Edema", "enhancing": "Enhancing"}

# ---------------------------------------------------------------- styles
_base = dict(fontName="Helvetica", textColor=INK, alignment=TA_LEFT)
S = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=CHERRY),
    "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=10.5, leading=14, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=CHERRY, spaceBefore=4, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK, spaceBefore=6, spaceAfter=3),
    "body": ParagraphStyle("body", fontSize=9.5, leading=13.5, **_base),
    "small": ParagraphStyle("small", fontSize=8, leading=10.5, textColor=MUTED, fontName="Helvetica"),
    "cell": ParagraphStyle("cell", fontSize=8.5, leading=11, **_base),
    "cellb": ParagraphStyle("cellb", fontSize=8.5, leading=11, fontName="Helvetica-Bold", textColor=INK),
    "note": ParagraphStyle("note", fontSize=9, leading=12.5, textColor=INK, fontName="Helvetica"),
    "tiny": ParagraphStyle("tiny", fontSize=7, leading=9, textColor=INK, fontName="Courier"),
}


class _NumberedCanvas(rl_canvas.Canvas):
    """Draws the running header/footer with 'Page X of Y' after all pages are known."""

    def __init__(self, *a, case_id="", **k):
        super().__init__(*a, **k)
        self._pages = []
        self._case = case_id

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        n = len(self._pages)
        for p in self._pages:
            self.__dict__.update(p)
            self._chrome(n)
            super().showPage()
        super().save()

    def _chrome(self, n):
        w, h = A4
        self.setFillColor(CHERRY)
        self.rect(0, h - 12 * mm, w, 12 * mm, stroke=0, fill=1)
        self.setFillColor(CREAM)
        self.setFont("Helvetica-Bold", 10)
        self.drawString(15 * mm, h - 7.8 * mm, "NeuroScope 3D")
        self.setFont("Helvetica", 8.5)
        self.drawRightString(w - 15 * mm, h - 7.8 * mm, f"Research report · Case {self._case}")
        self.setStrokeColor(LINE)
        self.line(15 * mm, 12 * mm, w - 15 * mm, 12 * mm)
        self.setFillColor(MUTED)
        self.setFont("Helvetica", 7.5)
        self.drawString(15 * mm, 7.5 * mm, "NeuroScope 3D research report")
        self.drawRightString(w - 15 * mm, 7.5 * mm, f"Page {self._pageNumber} of {n}")


def _img(im: Image.Image, width_mm: float) -> RLImage:
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    buf.seek(0)
    return RLImage(buf, width=width_mm * mm, height=width_mm * mm * im.size[1] / im.size[0])


def _table(rows, widths, header=True, zebra=True, align_right_from=1):
    data = [[Paragraph(str(c), S["cellb"] if (header and i == 0) else S["cell"]) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], hAlign="LEFT")
    style = [("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
             ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5)]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), CREAM_DARK), ("LINEBELOW", (0, 0), (-1, 0), 0.8, CHERRY)]
    if zebra:
        for i in range(1 if header else 0, len(rows)):
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FBF5EE")))
    t.setStyle(TableStyle(style))
    return t


def _callout(text, bg=CREAM, border=CHERRY):
    t = Table([[Paragraph(text, S["note"])]], colWidths=[180 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 2.5, border),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


def _f(v, d=2):
    return "—" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:,.{d}f}"


# ---------------------------------------------------------------- figures
def _canon(arr, affine):
    img = nib.as_closest_canonical(nib.Nifti1Image(arr, affine))
    return np.asanyarray(img.dataobj), img.affine


def _gray(a2d):
    nz = a2d[a2d > 0]
    lo, hi = np.percentile(nz, [1, 99]) if nz.size else (0, 1)
    return np.clip((a2d - lo) / max(hi - lo, 1e-6), 0, 1)


def _labels(im, top, bottom, left, right, colour=(255, 230, 120)):
    d = ImageDraw.Draw(im)
    w, h = im.size
    d.text((w // 2 - 3, 3), top, fill=colour); d.text((w // 2 - 3, h - 13), bottom, fill=colour)
    d.text((4, h // 2 - 5), left, fill=colour); d.text((w - 11, h // 2 - 5), right, fill=colour)
    return im


def mri_previews(volumes: dict, seg, affine) -> list:
    """Axial slice through the tumour centroid of each retained sequence (no overlay)."""
    s, _ = _canon(seg.astype(np.uint8), affine)
    z = int(np.argwhere(s > 0).mean(0)[2]) if s.any() else s.shape[2] // 2
    out = []
    for name, vol in volumes.items():
        b, _ = _canon(vol.astype(np.float32), affine)
        g = (np.flipud(_gray(b[:, :, z]).T) * 255).astype(np.uint8)
        im = Image.fromarray(g).convert("RGB").resize((g.shape[1] * 2, g.shape[0] * 2), Image.BILINEAR)
        out.append((name, _labels(im, "A", "P", "L", "R")))
    return out


def refinement_figure(bg, seg, refined, affine):
    """Axial projection: before WT (green), voxels removed by refinement (magenta), over a T1Gd MIP."""
    b, _ = _canon(bg.astype(np.float32), affine)
    s0, _ = _canon((seg > 0).astype(np.uint8), affine)
    s1, _ = _canon((refined > 0).astype(np.uint8), affine)
    base = _gray(b.max(axis=2))
    rgb = np.stack([base * 200] * 3, -1)
    wt = s0.max(axis=2) > 0
    removed = (s0.astype(bool) & ~s1.astype(bool)).max(axis=2)
    rgb[wt] = 0.5 * rgb[wt] + 0.5 * np.array(LABEL_RGB[2])
    if removed.any():
        dil = ndimage.binary_dilation(removed, iterations=2)
        rgb[dil] = np.array([230, 40, 200])
    im = Image.fromarray(np.flipud(rgb.transpose(1, 0, 2)).astype(np.uint8)).resize((rgb.shape[0] * 2, rgb.shape[1] * 2), Image.NEAREST)
    return _labels(im, "A", "P", "L", "R")


def graph_figure(brain, seg, affine, path_points_mm=None, path_classes=None):
    """Axial projection (canonical RAS): brain outline, WT projection and the Dijkstra path vertices/segments."""
    bm, caff = _canon(brain.astype(np.uint8), affine)
    s, _ = _canon(seg.astype(np.uint8), affine)
    proj = bm.max(axis=2) > 0
    rgb = np.zeros(proj.shape + (3,), np.float32) + 18
    rgb[proj] = 70
    edge = proj & ~ndimage.binary_erosion(proj, iterations=1)
    rgb[edge] = 150
    for lab in (2, 1, 4):
        m = (s == lab).max(axis=2)
        rgb[m] = np.array(LABEL_RGB[lab]) * 0.85
    scale = 2
    img = np.flipud(rgb.transpose(1, 0, 2)).astype(np.uint8)
    im = Image.fromarray(img).resize((img.shape[1] * scale, img.shape[0] * scale), Image.NEAREST)
    if path_points_mm:
        inv = np.linalg.inv(caff)
        H = img.shape[0]
        pts = []
        for p in path_points_mm:
            v = inv @ np.array([*p, 1.0])
            pts.append((v[0] * scale, (H - 1 - v[1]) * scale))  # x = i, y flipped (anterior up)
        d = ImageDraw.Draw(im)
        for i in range(len(pts) - 1):
            tumour = path_classes and path_classes[i] != "non_tumour_brain" and path_classes[i + 1] != "non_tumour_brain"
            d.line([pts[i], pts[i + 1]], fill=(70, 125, 238) if tumour else (255, 120, 20), width=3)
        for (x, y), col in ((pts[0], (0, 230, 255)), (pts[-1], (255, 0, 255))):
            d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=col, outline=(255, 255, 255))
    return _labels(im, "A", "P", "L", "R")


def expert_figure(bg, seg, expert, et_label, affine):
    """Axial slice at the tumour centroid: prediction filled, expert WT outline in blue."""
    b, _ = _canon(bg.astype(np.float32), affine)
    s, _ = _canon(seg.astype(np.uint8), affine)
    e, _ = _canon(expert.astype(np.int16), affine)
    z = int(np.argwhere(s > 0).mean(0)[2]) if s.any() else s.shape[2] // 2
    g = _gray(b[:, :, z])
    rgb = np.stack([g * 255] * 3, -1)
    for lab, col in LABEL_RGB.items():
        m = s[:, :, z] == lab
        rgb[m] = 0.5 * rgb[m] + 0.5 * np.array(col)
    ew = e[:, :, z] > 0
    outline = ew & ~ndimage.binary_erosion(ew, iterations=1)
    rgb[ndimage.binary_dilation(outline)] = (60, 140, 255)
    img = np.flipud(rgb.transpose(1, 0, 2)).astype(np.uint8)
    im = Image.fromarray(img).resize((img.shape[1] * 2, img.shape[0] * 2), Image.NEAREST)
    return _labels(im, "A", "P", "L", "R")


# ---------------------------------------------------------------- document
def build_full_report(out_path: Path, meta: dict, run_dir: Path, refinement: dict | None, graph: dict | None,
                      evidence: dict | None = None) -> dict:
    run_dir = Path(run_dir)
    seg_img = nib.load(str(run_dir / "seg.nii.gz"))
    seg = np.asarray(seg_img.dataobj).astype(np.int16)
    affine = seg_img.affine
    vols = {}
    for f, name in (("t1c.nii.gz", "T1Gd"), ("t2f.nii.gz", "FLAIR")):
        if (run_dir / f).exists():
            vols[name] = np.asarray(nib.load(str(run_dir / f)).dataobj).astype(np.float32)
    bg = vols.get("T1Gd")
    refined = np.asarray(nib.load(str(run_dir / "seg_refined.nii.gz")).dataobj).astype(np.int16) if (run_dir / "seg_refined.nii.gz").exists() else None
    case = meta["run_id"][:8]
    v = meta["volumes_ml"]["baseline"]
    sp = meta["voxel_spacing_mm"]
    sections = []
    el = []
    num = [0]

    def H(title):  # sequential section numbers (sections without data are omitted)
        num[0] += 1
        return Paragraph(f"{num[0]}&nbsp;&nbsp;{title}", S["h1"])

    # 1 ---------------------------------------------------------- overview
    el += [Paragraph("Brain MRI Segmentation Report", S["title"]), Spacer(1, 2 * mm),
           Paragraph(f"Case {case} &nbsp;·&nbsp; Report generated {dt.date.today().isoformat()} &nbsp;·&nbsp; "
                     f"Segmentation run {meta.get('timestamp_utc', '')[:10]}", S["subtitle"]), Spacer(1, 6 * mm)]
    comps = (graph or {}).get("components") or []
    n_comp = meta.get("graph", {}).get("n_components", {}).get("WT")
    findings = [f"The model segmented a suspected tumour region with an estimated whole-tumour (WT) volume of "
                f"<b>{_f(v['WT'])} mL</b>, tumour core (TC) <b>{_f(v['TC'])} mL</b> and enhancing tumour (ET) <b>{_f(v['ET'])} mL</b>."]
    if n_comp is not None:
        findings.append(f"The predicted region consists of {n_comp} connected component{'s' if n_comp != 1 else ''}.")
    if meta.get("expert_comparison"):
        ec = meta["expert_comparison"]
        findings.append(f"Agreement with the supplied expert reference (Dice): WT {_f(ec['WT']['dice'], 3)}, "
                        f"TC {_f(ec['TC']['dice'], 3)}, ET {_f(ec['ET']['dice'], 3)}.")
    el += [H("Report overview"), Paragraph(" ".join(findings), S["body"]), Spacer(1, 3 * mm),
           _table([["Region", "Definition", "Estimated volume"],
                   ["Whole tumour (WT)", "NCR/NET + edema + enhancing (labels 1, 2, 4)", f"{_f(v['WT'])} mL"],
                   ["Tumour core (TC)", "NCR/NET + enhancing (labels 1, 4)", f"{_f(v['TC'])} mL"],
                   ["Enhancing tumour (ET)", "Enhancing (label 4)", f"{_f(v['ET'])} mL"]], [45, 95, 40]),
           Spacer(1, 4 * mm), _callout(f"<b>Specialist interpretation required.</b> {DISCLAIMER}")]
    sections.append("overview")

    # 2 ---------------------------------------------------------- MRI sequences
    el += [Spacer(1, 6 * mm), H("MRI sequences")]
    shape = meta.get("shape", [])
    rows = [["Sequence", "Role", "Grid (voxels)", "Voxel spacing (mm)", "SHA-256 (first 12)"]]
    for key, name, role in (("t1n", "T1", "native T1-weighted"), ("t1c", "T1Gd", "contrast-enhanced T1"),
                            ("t2w", "T2", "T2-weighted"), ("t2f", "FLAIR", "T2-FLAIR")):
        h = meta.get("input_sha256", {}).get(key, "")
        rows.append([name, role, " × ".join(map(str, shape)), " × ".join(f"{z:.2f}" for z in sp), h[:12]])
    el += [_table(rows, [22, 44, 34, 38, 42]),
           Paragraph(f"All four sequences share one voxel grid (orientation {''.join(meta.get('axcodes', []))}). "
                     "Previews: axial slice through the tumour centre.", S["small"])]
    if vols:
        prev = mri_previews(vols, seg, affine)
        el += [Spacer(1, 2 * mm), Table([[_img(im, 62) for _, im in prev], [Paragraph(n, S["small"]) for n, _ in prev]], hAlign="LEFT")]
    sections.append("mri_sequences")

    # 3 ---------------------------------------------------------- segmentation
    el += [PageBreak(), H("Segmentation results")]
    vx = v.get("voxels", {})
    el += [_table([["Region", "Estimated volume (mL)", "Voxels"]] +
                  [[k, _f(v[k]), f"{vx.get(k, 0):,}"] for k in ("WT", "TC", "ET")], [50, 50, 40]),
           Spacer(1, 3 * mm)]
    if bg is not None:
        snaps = snapshots(bg, seg, affine)
        el += [Table([[_img(im, 56) for _, im in snaps], [Paragraph(n, S["small"]) for n, _ in snaps]], hAlign="LEFT"),
               Paragraph("T1Gd through the tumour centre: red NCR/NET, green edema, yellow enhancing tumour. "
                         "Patient right on image right.", S["small"])]
    sections.append("segmentation")

    # 4 ---------------------------------------------------------- refinement
    if refinement and refined is not None:
        pc = refinement["prediction_change"]["regions"]
        changed = sum(pc[k]["removed_voxels"] + pc[k]["added_voxels"] for k in pc)
        el += [Spacer(1, 6 * mm), H("Mathematical refinement"),
               Paragraph("Comparison of the model prediction with a refined copy. The unrefined prediction is the primary result.",
                         S["body"]), Spacer(1, 2 * mm)]
        rows = [["Metric", "Before", "After", "Difference", "Relative change"]]
        for k in ("WT", "TC", "ET"):
            r = pc[k]
            rel = "0.00 %" if r["abs_change_ml"] == 0 else ("—" if r["pct_change"] is None else f"{r['pct_change']:+.3f} %")
            rows.append([f"{k} volume (mL)", _f(r["baseline_ml"], 3), _f(r["refined_ml"], 3), f"{r['abs_change_ml']:+.3f}", rel])
        for k in ("WT", "TC", "ET"):
            r = pc[k]
            rows.append([f"{k} connected components", str(r["components_baseline"]), str(r["components_refined"]),
                         f"{r['components_refined'] - r['components_baseline']:+d}", "—"])
        rows.append(["Voxels changed (all regions)", "—", "—", f"{changed:,}", "—"])
        el.append(_table(rows, [58, 30, 30, 30, 32]))
        if changed == 0:
            el.append(Paragraph("The refinement did not change this segmentation.", S["body"]))
        sections.append("refinement")

    # 5 ---------------------------------------------------------- graph
    if graph and graph.get("stats"):
        st = graph["stats"]
        el += [PageBreak(), H("Graph analysis"),
               Paragraph("A lattice graph over the brain, weighted by physical distance, with Dijkstra's shortest path between the "
                         "selected locations. It describes spatial connectivity only and does not predict tumour growth or spread.",
                         S["body"]), Spacer(1, 2 * mm),
               _table([["Vertices", "Edges", "Connected components", "Isolated vertices", "Lattice spacing"],
                       [f"{st['vertices']:,}", f"{st['edges']:,}", str(st["connected_components"]), str(st["isolated_vertices"]),
                        " × ".join(f"{x:.1f}" for x in st["lattice_spacing_mm"]) + " mm"]], [34, 34, 40, 36, 36], zebra=False),
               Spacer(1, 3 * mm), Paragraph("Tumour components" + (f" (largest 8 of {len(comps)})" if len(comps) > 8 else ""), S["h2"])]
        crow = [["ID", "Volume (mL)", "Centroid (mm)", "NCR/NET · Edema · Enh. (mL)"]]
        for c in comps[:8]:
            lm = c.get("labels_ml", {})
            crow.append([str(c["id"]), _f(c["volume_ml"], 2), ", ".join(f"{x:.0f}" for x in c["centroid_mm"]),
                         f"{_f(lm.get('ncr_net'), 1)} · {_f(lm.get('edema'), 1)} · {_f(lm.get('enhancing'), 1)}"])
        el.append(_table(crow, [16, 30, 52, 62]))
        p = graph.get("path")
        if p and p.get("reachable"):
            lbc = p["length_by_class_mm"]
            el += [Paragraph("Shortest path", S["h2"]),
                   _table([["Source", "Destination", "Cost mode", "Path length", "Straight line"],
                           [p.get("source_how", "—"), p.get("destination_how", "—"),
                            "A — physical distance" if p["mode"] == "A" else f"B — experimental (α = {p['alpha']})",
                            f"{p['length_mm']:.1f} mm", f"{p['euclidean_mm']:.1f} mm"]], [40, 40, 40, 30, 30], zebra=False),
                   Spacer(1, 2 * mm),
                   _table([["Tissue along the path", "Length (mm)"]] + [[CLASS_LABEL[k], _f(val, 1)] for k, val in lbc.items()], [60, 30])]
        elif p:
            el.append(Paragraph(f"No path exists between the selected locations: {p.get('reason', '')}", S["body"]))
        if graph.get("figure") is not None:
            el += [Spacer(1, 3 * mm), _img(graph["figure"], 78),
                   Paragraph("Brain seen from above with the predicted regions and the shortest path: blue within the tumour, "
                             "orange through non-tumour tissue; source cyan, destination magenta.", S["small"])]
        sections.append("graph")

    # 6 ---------------------------------------------------------- expert
    if meta.get("expert_comparison") and (run_dir / "expert.nii.gz").exists():
        ec = meta["expert_comparison"]
        exp = np.round(np.asarray(nib.load(str(run_dir / "expert.nii.gz")).dataobj)).astype(np.int16)
        et_label = 3 if (exp == 3).any() and not (exp == 4).any() else 4
        prec = lambda r: None if r["tp_voxels"] + r["fp_voxels"] == 0 else r["tp_voxels"] / (r["tp_voxels"] + r["fp_voxels"])  # noqa: E731
        rows = [["Metric", "WT", "TC", "ET"],
                ["Model volume (mL)"] + [_f(ec[k]["pred_ml"]) for k in ("WT", "TC", "ET")],
                ["Expert volume (mL)"] + [_f(ec[k]["ref_ml"]) for k in ("WT", "TC", "ET")],
                ["Dice"] + [_f(ec[k]["dice"], 3) for k in ("WT", "TC", "ET")],
                ["Sensitivity (recall)"] + [_f(ec[k]["sensitivity"], 3) for k in ("WT", "TC", "ET")],
                ["Precision"] + [_f(prec(ec[k]), 3) for k in ("WT", "TC", "ET")],
                ["False-positive voxels"] + [f"{ec[k]['fp_voxels']:,}" for k in ("WT", "TC", "ET")],
                ["False-negative voxels"] + [f"{ec[k]['fn_voxels']:,}" for k in ("WT", "TC", "ET")]]
        el += [PageBreak() if "graph" not in sections else Spacer(1, 6 * mm), H("Expert comparison"),
               Paragraph("Model prediction compared with the expert reference supplied for this case. The metrics describe agreement "
                         "with this reference only, not clinical accuracy.", S["body"]),
               Spacer(1, 2 * mm), _table(rows, [58, 40, 40, 40])]
        if bg is not None:
            el += [Spacer(1, 3 * mm), _img(expert_figure(bg, seg, exp, et_label, affine), 70),
                   Paragraph("Model prediction (filled) and expert whole-tumour outline (blue).", S["small"])]
        sections.append("expert")

    # 7 ---------------------------------------------------------- appendix
    m = meta["model"]
    el += [PageBreak(), H("Technical appendix"), Paragraph("Model and processing", S["h2"]),
           _table([["Item", "Value"], ["Model", m["name"]], ["Architecture", m["architecture"]],
                   ["Weights", f"{m['version']} (SHA-256 {meta['checkpoint_sha256'][:16]}…)"], ["Training data", m["training_data"]],
                   ["Licences", f"{m['code_licence']}. {m['weights_licence']}"], ["Preprocessing", m["preprocessing"]],
                   ["Inference", m["inference"]],
                   ["Output labels", "0 background, 1 NCR/NET, 2 edema, 4 enhancing; written on the original image grid and affine"],
                   ["Code version", meta.get("code_version", "—")], ["Compute device", meta.get("device", "—")]], [38, 142]),
           Paragraph("Methods", S["h2"])]
    meth = [["Method", "Description"],
            ["Volumes", "Voxel count × voxel spacing product ÷ 1000 (mL); WT = labels 1+2+4, TC = 1+4, ET = 4."]]
    if refinement:
        mt = re.search(r"smaller than ([0-9.]+) mm", refinement.get("method", ""))
        meth.append(["Refinement", (f"Removes isolated predicted fragments smaller than {float(mt.group(1)):g} mm³" if mt else refinement.get("method", "—"))
                     + "; compared voxel by voxel with the prediction."])
    if graph and graph.get("stats"):
        st = graph["stats"]
        meth.append(["Spatial graph", f"Vertices on a {' × '.join(f'{x:.1f}' for x in st['lattice_spacing_mm'])} mm lattice over the brain, "
                                      "each labelled by its predicted tissue; edges join neighbouring vertices, weighted by physical distance."])
        meth.append(["Shortest path", "Dijkstra's algorithm. Mode A: cost = distance. Mode B (experimental): steps through non-tumour "
                                      "tissue cost α times more."])
    meth.append(["Overlap metrics", "Dice = 2TP/(2TP+FP+FN); sensitivity = TP/(TP+FN); precision = TP/(TP+FP); voxel counts on the input grid."])
    el.append(_table(meth, [38, 142]))
    if evidence:
        md = evidence["mean_delta_dice"]
        el += [Paragraph("Development evaluation (context, not this case)", S["h2"]),
               Paragraph(f"On {evidence['n_cases']} patient-disjoint held-out development cases the refinement changed mean Dice by "
                         f"WT {md['WT']:+.4f}, TC {md['TC']:+.4f}, ET {md['ET']:+.4f}. {evidence['conclusion'].split(': ')[0].rstrip('.')}.", S["body"])]
    names = {"t1n": "T1", "t1c": "T1Gd", "t2w": "T2", "t2f": "FLAIR"}
    el += [Paragraph("Input file hashes (SHA-256)", S["h2"])] + [
        Paragraph(f"{names.get(k, k):<6} {h}".replace(" ", "&nbsp;"), S["tiny"]) for k, h in meta.get("input_sha256", {}).items()]
    el += [Paragraph("Limitations", S["h2"])] + [Paragraph("•&nbsp; " + x, S["small"]) for x in meta.get("limitations", [])]
    sections.append("appendix")

    doc = SimpleDocTemplate(str(out_path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=20 * mm,
                            bottomMargin=18 * mm, title=f"NeuroScope 3D report — case {case}", author="NeuroScope 3D")
    doc.build(el, canvasmaker=lambda *a, **k: _NumberedCanvas(*a, case_id=case, **k))
    return {"sections": sections, "path": str(out_path)}
