from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studio_media.contracts import QualityThresholds
from studio_media.qa import inspect as qa

THRESHOLDS = QualityThresholds(expected_width=1920, expected_height=1080, expected_fps=30)

CLEAN_PROBE = {
    "format": {"format_name": "mov,mp4", "duration": "10.0"},
    "streams": [
        {"codec_type": "video", "width": 1920, "height": 1080, "avg_frame_rate": "30/1", "nb_frames": "300"},
        {"codec_type": "audio", "codec_name": "aac"},
    ],
}


def run(probe_payload, black=(0.0, []), silence=(0.1, 0.2, []), loudness=None):
    loudness = loudness if loudness is not None else {"input_i": "-14.2", "input_tp": "-1.4"}
    with (
        patch.object(qa, "probe", return_value=probe_payload),
        patch.object(qa, "detect_black", return_value=black),
        patch.object(qa, "detect_silence", return_value=silence),
        patch.object(qa, "measure_loudness", return_value=loudness),
    ):
        return qa.inspect_media(Path("/tmp/x.mp4"), "scene", "scene_001", 10.0, THRESHOLDS)


def test_clean_media_passes():
    report = run(CLEAN_PROBE)
    assert report.verdict == "passed"
    assert report.failures == []


def test_wrong_resolution_fails():
    payload = {
        "format": CLEAN_PROBE["format"],
        "streams": [
            {"codec_type": "video", "width": 1280, "height": 720, "avg_frame_rate": "30/1"},
            {"codec_type": "audio"},
        ],
    }
    report = run(payload)
    assert report.verdict == "failed"
    assert "resolution" in report.failures


def test_duration_drift_fails():
    payload = {"format": {"format_name": "mp4", "duration": "20.0"}, "streams": CLEAN_PROBE["streams"]}
    report = run(payload)
    assert "duration_matches_plan" in report.failures


def test_black_frames_fail():
    report = run(CLEAN_PROBE, black=(0.5, [(1.0, 6.0)]))
    assert "no_unintended_black_frames" in report.failures


def test_missing_audio_fails_when_required():
    payload = {
        "format": CLEAN_PROBE["format"],
        "streams": [{"codec_type": "video", "width": 1920, "height": 1080, "avg_frame_rate": "30/1"}],
    }
    report = run(payload)
    assert "audio_present" in report.failures


def test_excessive_silence_fails():
    report = run(CLEAN_PROBE, silence=(0.8, 0.2, [(0.0, 8.0)]))
    assert "no_excessive_silence" in report.failures


def test_clipping_fails():
    report = run(CLEAN_PROBE, loudness={"input_i": "-14.0", "input_tp": "0.8"})
    assert "no_clipping" in report.failures


def test_loudness_out_of_range_fails():
    report = run(CLEAN_PROBE, loudness={"input_i": "-25.0", "input_tp": "-2.0"})
    assert "loudness_in_range" in report.failures


def test_leading_silence_is_a_warning_not_a_failure():
    report = run(CLEAN_PROBE, silence=(0.1, 4.0, [(0.0, 4.0)]))
    assert "no_long_leading_silence" in report.warnings
    assert report.verdict == "warning"
