import os
import io
import tempfile
import pytest
import numpy as np
import nibabel as nib
from fastapi.testclient import TestClient

from backend.app.main import app, STUDY_STORE, COMPARISON_STORE


client = TestClient(app)


def test_api_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["model"]["weights_loaded"] is True
    assert "SegResNet" in data["model"]["name"]
    assert "SimpleITK" in data["registration_backend"]


def make_nifti_bytes(shape=(32, 32, 32)):
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
        tmp_name = tmp.name
    try:
        x, y, z = np.mgrid[:shape[0], :shape[1], :shape[2]]
        mask = (((x - 16) / 10)**2 + ((y - 16) / 8)**2 + ((z - 16) / 7)**2) <= 1.0
        arr = np.zeros(shape, dtype=np.float32)
        arr[mask] = 80.0 + (x[mask] * 1.5).astype(np.float32)

        img = nib.Nifti1Image(arr, np.eye(4))
        nib.save(img, tmp_name)
        with open(tmp_name, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)


def test_api_study_validation_and_comparison_flow():
    # 1. Upload valid study
    raw_nii = make_nifti_bytes()
    files = [
        ("T1", ("t1.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
        ("T1Gd", ("t1gd.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
        ("T2", ("t2.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
        ("FLAIR", ("flair.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
    ]
    data = {"role": "previous", "label": "Baseline 2026", "date": "2026-01-15"}
    resp1 = client.post("/api/studies/validate", data=data, files=files)
    assert resp1.status_code == 200
    p_body = resp1.json()
    assert p_body["valid"] is True, f"Issues: {p_body.get('issues')}"
    prev_study_id = p_body["study_id"]

    # 2. Upload current study
    files2 = [
        ("T1", ("t1.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
        ("T1Gd", ("t1gd.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
        ("T2", ("t2.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
        ("FLAIR", ("flair.nii.gz", io.BytesIO(raw_nii), "application/octet-stream")),
    ]
    data2 = {"role": "current", "label": "Followup 2026", "date": "2026-06-20"}
    resp2 = client.post("/api/studies/validate", data=data2, files=files2)
    assert resp2.status_code == 200
    c_body = resp2.json()
    assert c_body["valid"] is True
    cur_study_id = c_body["study_id"]

    # 3. Create comparison
    comp_resp = client.post("/api/comparisons", json={"study_ids": [prev_study_id, cur_study_id]})
    assert comp_resp.status_code == 200
    comp_id = comp_resp.json()["comparison_id"]

    # 4. Check status
    stat_resp = client.get(f"/api/comparisons/{comp_id}/status")
    assert stat_resp.status_code == 200
    assert "stage" in stat_resp.json()

    # 5. Execute synchronous pipeline step directly for testing
    from backend.app.main import execute_comparison_pipeline
    execute_comparison_pipeline(comp_id)

    # 6. Verify completed status
    stat_resp2 = client.get(f"/api/comparisons/{comp_id}/status")
    assert stat_resp2.status_code == 200
    assert stat_resp2.json()["stage"] == "complete"

    # 7. Verify quantitative results
    res_resp = client.get(f"/api/comparisons/{comp_id}/results")
    assert res_resp.status_code == 200
    results = res_resp.json()
    assert results["comparison_id"] == comp_id
    assert len(results["studies"]) == 2
    assert "registration" in results
    assert "grid" in results
    assert results["grid"]["masks"] is not None
    assert "assessment" in results
    assert results["assessment"]["bettermentHeadline"] is not None
    assert results["assessment"]["riskLevel"] in ["low", "moderate", "high", "indeterminate"]

    # 8. Download PDF report
    pdf_resp = client.get(f"/api/comparisons/{comp_id}/report.pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert len(pdf_resp.content) > 1000

    # 9. Clean up deletion
    del_resp = client.delete(f"/api/comparisons/{comp_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True
