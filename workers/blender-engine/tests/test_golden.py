from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.contracts import RenderJob
from engine.validators import validate_manifest, validate_scene

GOLDEN = Path(__file__).parent / "golden"


def golden_jobs() -> list[Path]:
    return sorted(GOLDEN.glob("*.json"))


@pytest.mark.parametrize("path", golden_jobs(), ids=lambda path: path.stem)
def test_golden_job_parses(path: Path):
    job = RenderJob.model_validate_json(path.read_text())
    assert job.scene.shots
    assert job.output_key


@pytest.mark.parametrize("path", golden_jobs(), ids=lambda path: path.stem)
def test_golden_scene_has_no_validation_problems(path: Path):
    job = RenderJob.model_validate_json(path.read_text())
    assert validate_scene(job.scene) == []


@pytest.mark.parametrize("path", golden_jobs(), ids=lambda path: path.stem)
def test_golden_shot_durations_sum_to_scene(path: Path):
    job = RenderJob.model_validate_json(path.read_text())
    total = sum(shot.duration_seconds for shot in job.scene.shots)
    assert abs(total - job.scene.duration_seconds) < 0.01


def test_manifest_validation_reports_missing_files(tmp_path: Path):
    job = RenderJob.model_validate_json((GOLDEN / "simple_walk.json").read_text())
    problems = validate_manifest(job, tmp_path)
    assert any("asset file missing" in problem for problem in problems)


def test_manifest_validation_passes_when_files_exist(tmp_path: Path):
    payload = json.loads((GOLDEN / "simple_walk.json").read_text())
    for relative in payload["asset_manifest"].values():
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"stub")

    job = RenderJob.model_validate(payload)
    assert validate_manifest(job, tmp_path) == []
