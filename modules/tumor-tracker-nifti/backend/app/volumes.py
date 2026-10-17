from typing import Dict, Any, List, Optional
import numpy as np


def compute_study_volumes(subregions: Dict[str, np.ndarray], spacing: List[float]) -> Dict[str, Dict[str, float]]:
    """
    Computes region volumes from voxel counts and voxel spacing.
    Volume in mL = voxels * voxel_volume_mm3 / 1000.0
    """
    voxel_vol_mm3 = abs(float(spacing[0] * spacing[1] * spacing[2]))
    result = {}

    for region in ["WT", "TC", "ET"]:
        arr = subregions.get(region)
        if arr is not None:
            voxels = int(np.count_nonzero(arr))
            vol_ml = (voxels * voxel_vol_mm3) / 1000.0
            result[region] = {
                "voxels": voxels,
                "voxelVolumeMm3": round(voxel_vol_mm3, 4),
                "volumeMl": round(vol_ml, 4),
            }
        else:
            result[region] = {
                "voxels": 0,
                "voxelVolumeMm3": round(voxel_vol_mm3, 4),
                "volumeMl": 0.0,
            }

    return result


def compute_volume_differences(
    prev_volumes: Optional[Dict[str, Dict[str, float]]],
    cur_volumes: Optional[Dict[str, Dict[str, float]]]
) -> List[Dict[str, Any]]:
    """
    Computes volume differences between previous and current studies.
    Safely handles zero previous volume to avoid division by zero.
    """
    diffs = []
    for region in ["WT", "TC", "ET"]:
        pv = prev_volumes.get(region) if prev_volumes else None
        cv = cur_volumes.get(region) if cur_volumes else None

        if not pv or not cv:
            diffs.append({
                "region": region,
                "previousMl": pv["volumeMl"] if pv else None,
                "currentMl": cv["volumeMl"] if cv else None,
                "absoluteMl": None,
                "percent": None,
                "status": "unavailable",
                "direction": "no change",
            })
            continue

        p_ml = pv["volumeMl"]
        c_ml = cv["volumeMl"]
        abs_diff = c_ml - p_ml

        if abs_diff > 0:
            direction = "increase"
        elif abs_diff < 0:
            direction = "decrease"
        else:
            direction = "no change"

        if p_ml == 0.0:
            diffs.append({
                "region": region,
                "previousMl": 0.0,
                "currentMl": round(c_ml, 4),
                "absoluteMl": round(abs_diff, 4),
                "percent": None,
                "status": "undefined_zero_previous",
                "direction": direction,
                "note": "Percentage change undefined because baseline/previous volume is zero."
            })
        else:
            pct = (abs_diff / p_ml) * 100.0
            diffs.append({
                "region": region,
                "previousMl": round(p_ml, 4),
                "currentMl": round(c_ml, 4),
                "absoluteMl": round(abs_diff, 4),
                "percent": round(pct, 2),
                "status": "ok",
                "direction": direction,
            })

    return diffs


def evaluate_longitudinal_assessment(
    prev_volumes: Optional[Dict[str, Dict[str, float]]],
    cur_volumes: Optional[Dict[str, Dict[str, float]]],
    vol_diffs: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Evaluates longitudinal tumor changes according to RANO 2.0-adapted 3D volumetric criteria.
    Determines whether there is improvement (betterment), stability, or progression (worsening/risk).
    Categorizes clinical risk (low, moderate, high) and produces qualitative research observations.
    """
    if not prev_volumes or not cur_volumes:
        return {
            "category": "indeterminate",
            "bettermentStatus": "indeterminate",
            "bettermentHeadline": "Longitudinal Assessment Unavailable",
            "isImprovement": False,
            "riskLevel": "indeterminate",
            "riskLabel": "Undetermined",
            "summary": "Volumetric data missing for one or both time points. Cannot establish longitudinal trend.",
            "clinicalInterpretation": "Assessment requires valid volumetric segmentation across both time points.",
            "subregions": [],
            "riskFactors": [],
            "keyFindings": ["Incomplete longitudinal volumetric data."],
            "criteriaReference": "RANO 2.0 volumetric criteria adapted for 3D MRI segmentation"
        }

    if vol_diffs is None:
        vol_diffs = compute_volume_differences(prev_volumes, cur_volumes)

    diff_map = {d["region"]: d for d in vol_diffs}

    def get_val(region: str, key: str, default: float = 0.0) -> float:
        vol = prev_volumes.get(region) if key == "prev" else cur_volumes.get(region)
        return float(vol.get("volumeMl", default)) if vol else default

    p_et = get_val("ET", "prev")
    c_et = get_val("ET", "cur")
    d_et = diff_map.get("ET", {})
    d_et_ml = float(d_et.get("absoluteMl") if d_et.get("absoluteMl") is not None else (c_et - p_et))
    d_et_pct = d_et.get("percent")

    p_tc = get_val("TC", "prev")
    c_tc = get_val("TC", "cur")
    d_tc = diff_map.get("TC", {})
    d_tc_ml = float(d_tc.get("absoluteMl") if d_tc.get("absoluteMl") is not None else (c_tc - p_tc))
    d_tc_pct = d_tc.get("percent")

    p_wt = get_val("WT", "prev")
    c_wt = get_val("WT", "cur")
    d_wt = diff_map.get("WT", {})
    d_wt_ml = float(d_wt.get("absoluteMl") if d_wt.get("absoluteMl") is not None else (c_wt - p_wt))
    d_wt_pct = d_wt.get("percent")

    # Determine Subregion Trends
    def classify_trend(p: float, c: float, d_ml: float, d_pct: Optional[float]) -> str:
        if p == 0.0 and c > 0.05:
            return "new"
        if p == 0.0 and c == 0.0:
            return "absent"
        if d_pct is not None:
            if d_pct <= -25.0 and d_ml <= -0.1:
                return "decreasing"
            if d_pct >= 25.0 and d_ml >= 0.1:
                return "increasing"
        elif d_ml > 0.1:
            return "increasing"
        elif d_ml < -0.1:
            return "decreasing"
        return "stable"

    et_trend = classify_trend(p_et, c_et, d_et_ml, d_et_pct)
    tc_trend = classify_trend(p_tc, c_tc, d_tc_ml, d_tc_pct)
    wt_trend = classify_trend(p_wt, c_wt, d_wt_ml, d_wt_pct)

    # Subregion breakdowns
    region_names = {
        "ET": "Enhancing Tumour (Active Neovascular Burden)",
        "TC": "Tumour Core (Solid Tumour & Necrotic Cavity)",
        "WT": "Whole Tumour (Core + Peritumoral Vasogenic Edema)"
    }

    subregions = [
        {
            "region": "ET",
            "name": region_names["ET"],
            "previousMl": round(p_et, 3),
            "currentMl": round(c_et, 3),
            "deltaMl": round(d_et_ml, 3),
            "deltaPercent": round(d_et_pct, 1) if d_et_pct is not None else None,
            "trend": et_trend,
            "summary": (
                f"New enhancing focus observed (+{c_et:.2f} mL)" if et_trend == "new" else
                f"Contracted by {abs(d_et_ml):.2f} mL ({d_et_pct:.1f}%)" if et_trend == "decreasing" else
                f"Expanded by +{d_et_ml:.2f} mL (+{d_et_pct:.1f}%)" if et_trend == "increasing" else
                "Negligible/No enhancing volume detected" if et_trend == "absent" else
                f"Stable within ±25% margin ({d_et_ml:+.2f} mL)"
            )
        },
        {
            "region": "TC",
            "name": region_names["TC"],
            "previousMl": round(p_tc, 3),
            "currentMl": round(c_tc, 3),
            "deltaMl": round(d_tc_ml, 3),
            "deltaPercent": round(d_tc_pct, 1) if d_tc_pct is not None else None,
            "trend": tc_trend,
            "summary": (
                f"New solid core observed (+{c_tc:.2f} mL)" if tc_trend == "new" else
                f"Contracted by {abs(d_tc_ml):.2f} mL ({d_tc_pct:.1f}%)" if tc_trend == "decreasing" else
                f"Expanded by +{d_tc_ml:.2f} mL (+{d_tc_pct:.1f}%)" if tc_trend == "increasing" else
                "Negligible/No core volume detected" if tc_trend == "absent" else
                f"Stable within ±25% margin ({d_tc_ml:+.2f} mL)"
            )
        },
        {
            "region": "WT",
            "name": region_names["WT"],
            "previousMl": round(p_wt, 3),
            "currentMl": round(c_wt, 3),
            "deltaMl": round(d_wt_ml, 3),
            "deltaPercent": round(d_wt_pct, 1) if d_wt_pct is not None else None,
            "trend": wt_trend,
            "summary": (
                f"Significant decrease by {abs(d_wt_ml):.2f} mL ({d_wt_pct:.1f}%)" if wt_trend == "decreasing" else
                f"Increased hyperintensity by +{d_wt_ml:.2f} mL (+{d_wt_pct:.1f}%)" if wt_trend == "increasing" else
                f"Stable hyperintensity extent ({d_wt_ml:+.2f} mL)"
            )
        }
    ]

    # Evaluate Overall Response & Betterment
    # 1. New enhancing lesion
    if et_trend == "new" and c_et >= 0.2:
        category = "new_lesion"
        betterment_status = "progression"
        is_improvement = False
        risk_level = "high"
        risk_label = "High Risk - Progressive Lesion"
        betterment_headline = "No Improvement - New Enhancing Lesion Emerged"
        summary = (
            f"A new contrast-enhancing lesion of {c_et:.2f} mL has emerged where no enhancing tumor was "
            "measurable at baseline. In accordance with RANO guidelines, emergence of a new enhancing focus "
            "represents disease progression and elevated clinical risk."
        )
        clin_interp = (
            "Suggests recurrent or newly vascularized active neoplastic activity. Urgent clinical correlation "
            "with patient neurological status and radiation oncology history is advised."
        )

    # 2. Disease Progression (Growth > 25% with volume increase)
    elif (
        (d_et_pct is not None and d_et_pct > 25.0 and d_et_ml >= 0.25) or
        (d_tc_pct is not None and d_tc_pct > 25.0 and d_tc_ml >= 0.35) or
        (tc_trend == "new" and c_tc >= 0.4)
    ):
        category = "progression"
        betterment_status = "progression"
        is_improvement = False
        risk_level = "high"
        risk_label = "High Risk - Volumetric Progression"
        max_growth_pct = d_et_pct if (d_et_pct and d_et_pct > 25.0) else (d_tc_pct or 0.0)
        betterment_headline = f"No Improvement - Disease Progression Observed (+{max_growth_pct:.1f}%)"
        summary = (
            f"Tumour volume increased significantly (+{max(d_et_ml, d_tc_ml):.2f} mL, exceeding the +25% progression threshold). "
            "The expansion of enhancing and core tissue indicates active disease progression rather than stability."
        )
        clin_interp = (
            "Volumetric growth exceeds the standard threshold for treatment failure or progression. "
            "Differentiate from pseudoprogression if patient underwent recent radiotherapy or immunotherapy."
        )

    # 3. Marked Improvement / Significant Betterment (Reduction >= 50%)
    elif (
        ((d_et_pct is not None and d_et_pct <= -50.0 and d_et_ml <= -0.2) or
         (p_et < 0.2 and d_tc_pct is not None and d_tc_pct <= -50.0 and d_tc_ml <= -0.3)) and
        (d_wt_pct is None or d_wt_pct <= 25.0)
    ):
        category = "marked_improvement"
        betterment_status = "significant_improvement"
        is_improvement = True
        risk_level = "low"
        risk_label = "Low Risk - Favorable Treatment Response"
        drop_pct = abs(d_et_pct) if d_et_pct is not None else abs(d_tc_pct or 0.0)
        betterment_headline = f"Significant Betterment - Marked Volumetric Regression (-{drop_pct:.1f}%)"
        summary = (
            f"Substantial reduction in active tumor burden: enhancing tumour decreased by {abs(d_et_ml):.2f} mL "
            f"({d_et_pct:.1f}% reduction). This fulfills criteria for marked partial/complete therapeutic response."
        )
        clin_interp = (
            "Reflects favorable response to current therapy with contraction of active neoplastic tissue. "
            "Correlate with reduced steroid requirement and clinical symptom stability."
        )

    # 4. Partial Improvement / Moderate Betterment (Reduction 25% to 50%)
    elif (
        ((d_et_pct is not None and d_et_pct <= -25.0 and d_et_ml <= -0.15) or
         (p_et < 0.2 and d_tc_pct is not None and d_tc_pct <= -25.0 and d_tc_ml <= -0.25)) and
        (d_wt_pct is None or d_wt_pct <= 25.0)
    ):
        category = "partial_improvement"
        betterment_status = "partial_improvement"
        is_improvement = True
        risk_level = "low"
        risk_label = "Low-to-Moderate Risk - Favorable Trend"
        drop_pct = abs(d_et_pct) if d_et_pct is not None else abs(d_tc_pct or 0.0)
        betterment_headline = f"Definite Betterment - Partial Volumetric Regression (-{drop_pct:.1f}%)"
        summary = (
            f"Measurable contraction of active tumor components ({d_et_pct if d_et_pct is not None else d_tc_pct:.1f}% decrease, "
            f"{abs(d_et_ml):.2f} mL reduction). Consistent with favorable therapeutic regression."
        )
        clin_interp = (
            "Indicates positive therapeutic response. Continued longitudinal surveillance recommended to confirm sustained benefit."
        )

    # 5. Edema expansion with stable core
    elif (d_wt_pct is not None and d_wt_pct > 30.0 and d_wt_ml >= 1.5) and (d_et_pct is None or d_et_pct <= 25.0):
        category = "edema_expansion"
        betterment_status = "stable"
        is_improvement = False
        risk_level = "moderate"
        risk_label = "Moderate Risk - Edema/Infiltration Expansion"
        betterment_headline = f"Guarded Status - Non-Enhancing / Edema Expansion (+{d_wt_pct:.1f}%)"
        summary = (
            f"T2/FLAIR whole tumour hyperintensity increased by +{d_wt_ml:.2f} mL (+{d_wt_pct:.1f}%), "
            "while enhancing and core volumes remained stable. May reflect increased vasogenic edema, treatment changes, or infiltrative spread."
        )
        clin_interp = (
            "Assess for symptoms of elevated intracranial pressure. Clinical differentiation between infiltrative tumor recurrence "
            "and therapy-induced inflammation/edema is necessary."
        )

    # 6. Stable Disease (Within -25% to +25%)
    else:
        category = "stable_disease"
        betterment_status = "stable"
        is_improvement = False
        risk_level = "moderate"
        risk_label = "Moderate Risk - Stable Volumetric Status"
        betterment_headline = "Stable Disease - No Significant Progression or Betterment"
        summary = (
            f"Estimated tumor volumes remain within the ±25% longitudinal stability threshold. "
            f"Enhancing change: {d_et_ml:+.2f} mL ({d_et_pct if d_et_pct is not None else 0.0:+.1f}%), "
            f"Core change: {d_tc_ml:+.2f} mL ({d_tc_pct if d_tc_pct is not None else 0.0:+.1f}%). "
            "No definitive signs of tumor progression or marked regression."
        )
        clin_interp = (
            "Consistent with disease stabilization under current management. Routine interval surveillance is appropriate."
        )

    # Construct Risk Factors list
    risk_factors = [
        {
            "title": "Enhancing Vascularized Burden",
            "level": "high" if et_trend in ("new", "increasing") else "low" if et_trend == "decreasing" else "moderate",
            "details": (
                "Expanding or newly emergent contrast-enhancing lesion indicating high metabolic/angiogenic activity." if et_trend in ("new", "increasing") else
                "Substantial regression in contrast-enhancing tissue, indicating low active angiogenic risk." if et_trend == "decreasing" else
                "Stable enhancing volume without evidence of rapid neo-vascular expansion."
            )
        },
        {
            "title": "Tumour Core & Necrotic Burden",
            "level": "high" if tc_trend in ("new", "increasing") else "low" if tc_trend == "decreasing" else "moderate",
            "details": (
                "Solid core expansion observed." if tc_trend in ("new", "increasing") else
                "Core tissue regression noted." if tc_trend == "decreasing" else
                "Core volume remains stable."
            )
        },
        {
            "title": "Peritumoural Edema & Mass Effect",
            "level": "high" if (d_wt_ml > 5.0 or (d_wt_pct and d_wt_pct > 40)) else "moderate" if wt_trend == "increasing" else "low",
            "details": (
                f"Elevated risk of mass effect: whole tumour edema/infiltration change is {d_wt_ml:+.2f} mL." if wt_trend == "increasing" else
                "Peritumoural edema is stable or resolving favorably."
            )
        },
        {
            "title": "Longitudinal Trajectory",
            "level": risk_level,
            "details": f"Overall status classified as {betterment_headline} ({risk_label})."
        }
    ]

    key_findings = [
        f"Longitudinal Trajectory: {betterment_headline}",
        f"Betterment / Improvement: {'Yes — Measurable volumetric improvement (betterment) observed' if is_improvement else 'No — Stable disease or progressive tumor burden'}",
        f"Risk Category: {risk_label}",
        f"Enhancing Tumour Delta: {d_et_ml:+.2f} mL ({d_et_pct:+.1f}%)" if d_et_pct is not None else f"Enhancing Tumour Delta: {d_et_ml:+.2f} mL (new focus)",
        f"Whole Tumour Delta: {d_wt_ml:+.2f} mL ({d_wt_pct:+.1f}%)" if d_wt_pct is not None else f"Whole Tumour Delta: {d_wt_ml:+.2f} mL",
    ]

    return {
        "category": category,
        "bettermentStatus": betterment_status,
        "bettermentHeadline": betterment_headline,
        "isImprovement": is_improvement,
        "riskLevel": risk_level,
        "riskLabel": risk_label,
        "summary": summary,
        "clinicalInterpretation": clin_interp,
        "subregions": subregions,
        "riskFactors": risk_factors,
        "keyFindings": key_findings,
        "criteriaReference": "RANO 2.0 volumetric criteria adapted for 3D MRI segmentation"
    }

