"""Full case report (POST /api/runs/{id}/report): real case through the real pipeline, sections only when data exists."""
import json
import shutil

import pytest

from conftest import case_paths

RID = "f" * 32


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import importlib
    import backend.main as bm
    monkeypatch.setenv("NEUROSCOPE_LAZY_MODEL", "1")
    importlib.reload(bm)
    monkeypatch.setattr(bm, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(bm, "LEGACY_TEMP", tmp_path / "x1")
    monkeypatch.setattr(bm, "LEGACY_RESULTS", tmp_path / "x2")
    (tmp_path / "runs").mkdir()
    from fastapi.testclient import TestClient
    with TestClient(bm.app) as c:
        yield c, tmp_path / "runs"


def _pages(pdf: bytes) -> int:
    return pdf.count(b"/Type /Page\n") + pdf.count(b"/Type /Page ")


def test_full_report_sections_follow_available_data(client, segmenter):
    from ml.pipeline import run_case
    c, runs = client
    sid, paths, label = case_paths(41)
    d = runs / RID
    d.mkdir()
    for m, p in paths.items():  # the API keeps t1c/t2f; mimic that layout
        shutil.copy(p, d / f"{m}.nii.gz")
    run_case({m: d / f"{m}.nii.gz" for m in paths}, d, segmenter, RID, expert_path=label)
    shutil.copy(label, d / "expert.nii.gz")
    r = c.post(f"/api/runs/{RID}/report")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sections"][:3] == ["overview", "mri_sequences", "segmentation"]
    assert "refinement" in body["sections"] and "expert" in body["sections"] and body["sections"][-1] == "appendix"
    pdf = c.get(body["file"])
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf" and pdf.content[:5] == b"%PDF-"
    assert _pages(pdf.content) >= 4
    assert b"C:\\\\Users" not in pdf.content and b"OneDrive" not in pdf.content       # no local paths
    # a chosen graph selection is honoured; invalid selections are refused, not silently replaced
    assert c.post(f"/api/runs/{RID}/report", params={"src": "c1", "dst": "c1"}).status_code == 200
    assert c.post(f"/api/runs/{RID}/report", params={"src": "bad", "dst": "c1"}).status_code == 422
    # without an expert mask the expert section is omitted (no placeholder metrics)
    (d / "expert.nii.gz").unlink()
    meta = json.loads((d / "result.json").read_text())
    meta.pop("expert_comparison", None)
    (d / "result.json").write_text(json.dumps(meta))
    body2 = c.post(f"/api/runs/{RID}/report").json()
    assert "expert" not in body2["sections"] and "graph" in body2["sections"]
