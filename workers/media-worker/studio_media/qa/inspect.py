from __future__ import annotations

import json
import re
from pathlib import Path

from ..contracts import QualityCheck, QualityResponse, QualityThresholds
from ..shell import duration_of, fps_of, probe, run_ffmpeg, stream_of

BLACK_INTERVAL = re.compile(r"black_start:(?P<start>[\d.]+)\s+black_end:(?P<end>[\d.]+)")
SILENCE_START = re.compile(r"silence_start:\s*(?P<start>-?[\d.]+)")
SILENCE_END = re.compile(r"silence_end:\s*(?P<end>[\d.]+)")
LOUDNORM_JSON = re.compile(r"\{[^{}]*\"input_i\"[^{}]*\}", re.DOTALL)


def detect_black(path: Path, duration: float) -> tuple[float, list[tuple[float, float]]]:
    stderr = run_ffmpeg(
        ["-i", str(path), "-vf", "blackdetect=d=0.1:pix_th=0.10", "-an", "-f", "null", "-"]
    )
    intervals = [
        (float(match.group("start")), float(match.group("end"))) for match in BLACK_INTERVAL.finditer(stderr)
    ]
    black_seconds = sum(end - start for start, end in intervals)
    return (black_seconds / duration if duration > 0 else 0.0), intervals


def detect_silence(path: Path, duration: float) -> tuple[float, float, list[tuple[float, float]]]:
    stderr = run_ffmpeg(
        ["-i", str(path), "-af", "silencedetect=noise=-45dB:d=0.6", "-vn", "-f", "null", "-"]
    )
    starts = [float(match.group("start")) for match in SILENCE_START.finditer(stderr)]
    ends = [float(match.group("end")) for match in SILENCE_END.finditer(stderr)]

    intervals: list[tuple[float, float]] = []
    for index, start in enumerate(starts):
        end = ends[index] if index < len(ends) else duration
        intervals.append((max(0.0, start), min(duration, end)))

    silent_seconds = sum(end - start for start, end in intervals)
    leading = intervals[0][1] if intervals and intervals[0][0] <= 0.05 else 0.0
    return (silent_seconds / duration if duration > 0 else 0.0), leading, intervals


def measure_loudness(path: Path) -> dict:
    stderr = run_ffmpeg(
        ["-i", str(path), "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]
    )
    matches = LOUDNORM_JSON.findall(stderr)
    return json.loads(matches[-1]) if matches else {}


def inspect_media(
    path: Path,
    target: str,
    target_id: str | None,
    expected_duration: float,
    thresholds: QualityThresholds,
) -> QualityResponse:
    payload = probe(path)
    video = stream_of(payload, "video")
    audio = stream_of(payload, "audio")

    duration = duration_of(payload)
    fps = fps_of(payload)
    checks: list[QualityCheck] = []

    checks.append(
        QualityCheck(
            name="container_readable",
            passed=bool(payload.get("format")),
            actual=str(payload.get("format", {}).get("format_name", "")),
        )
    )

    checks.append(
        QualityCheck(
            name="duration_present",
            passed=duration >= thresholds.min_duration_seconds,
            expected=f">= {thresholds.min_duration_seconds}s",
            actual=f"{duration:.2f}s",
        )
    )

    drift = abs(duration - expected_duration)
    checks.append(
        QualityCheck(
            name="duration_matches_plan",
            passed=drift <= thresholds.max_duration_drift_seconds,
            expected=f"{expected_duration:.2f}s +/- {thresholds.max_duration_drift_seconds}s",
            actual=f"{duration:.2f}s",
        )
    )

    if target != "audio":
        checks.append(
            QualityCheck(
                name="resolution",
                passed=bool(video)
                and int(video.get("width", 0)) == thresholds.expected_width
                and int(video.get("height", 0)) == thresholds.expected_height,
                expected=f"{thresholds.expected_width}x{thresholds.expected_height}",
                actual=f"{video.get('width', 0)}x{video.get('height', 0)}" if video else "no video stream",
            )
        )

        checks.append(
            QualityCheck(
                name="frame_rate",
                passed=abs(fps - thresholds.expected_fps) <= 0.5,
                expected=str(thresholds.expected_fps),
                actual=f"{fps:.2f}",
            )
        )

        checks.append(
            QualityCheck(
                name="frame_count_consistent",
                passed=bool(video) and int(video.get("nb_frames", 0) or 0) != 0 or duration > 0,
                severity="warning",
                actual=str(video.get("nb_frames", "unknown")) if video else "none",
            )
        )

        black_ratio, black_intervals = detect_black(path, duration)
        checks.append(
            QualityCheck(
                name="no_unintended_black_frames",
                passed=black_ratio <= thresholds.max_black_frame_ratio,
                expected=f"<= {thresholds.max_black_frame_ratio:.0%}",
                actual=f"{black_ratio:.2%}",
                detail=f"{len(black_intervals)} black interval(s)",
            )
        )
    else:
        black_ratio = 0.0

    has_audio = audio is not None
    checks.append(
        QualityCheck(
            name="audio_present",
            passed=has_audio or not thresholds.require_audio,
            severity="error" if thresholds.require_audio else "warning",
            actual="present" if has_audio else "missing",
        )
    )

    silence_ratio = 0.0
    loudness: dict = {}
    if has_audio:
        silence_ratio, leading_silence, silence_intervals = detect_silence(path, duration)
        checks.append(
            QualityCheck(
                name="no_excessive_silence",
                passed=silence_ratio <= thresholds.max_silence_ratio,
                expected=f"<= {thresholds.max_silence_ratio:.0%}",
                actual=f"{silence_ratio:.2%}",
                detail=f"{len(silence_intervals)} silent span(s)",
            )
        )
        checks.append(
            QualityCheck(
                name="no_long_leading_silence",
                passed=leading_silence <= thresholds.max_leading_silence_seconds,
                severity="warning",
                expected=f"<= {thresholds.max_leading_silence_seconds}s",
                actual=f"{leading_silence:.2f}s",
            )
        )

        loudness = measure_loudness(path)
        if loudness:
            integrated = float(loudness.get("input_i", 0))
            true_peak = float(loudness.get("input_tp", 0))
            checks.append(
                QualityCheck(
                    name="loudness_in_range",
                    passed=abs(integrated - thresholds.target_lufs) <= thresholds.lufs_tolerance,
                    expected=f"{thresholds.target_lufs} LUFS +/- {thresholds.lufs_tolerance}",
                    actual=f"{integrated:.2f} LUFS",
                )
            )
            checks.append(
                QualityCheck(
                    name="no_clipping",
                    passed=true_peak <= thresholds.max_true_peak_db + 0.1,
                    expected=f"<= {thresholds.max_true_peak_db} dBTP",
                    actual=f"{true_peak:.2f} dBTP",
                )
            )

    failures = [check.name for check in checks if not check.passed and check.severity == "error"]
    warnings = [check.name for check in checks if not check.passed and check.severity == "warning"]
    verdict = "failed" if failures else ("warning" if warnings else "passed")

    return QualityResponse(
        target=target,
        target_id=target_id,
        verdict=verdict,
        checks=checks,
        failures=failures,
        warnings=warnings,
        probe={
            "duration_seconds": duration,
            "fps": fps,
            "width": int(video.get("width", 0)) if video else 0,
            "height": int(video.get("height", 0)) if video else 0,
            "has_audio": has_audio,
            "black_ratio": round(black_ratio, 5),
            "silence_ratio": round(silence_ratio, 5),
            "loudness": loudness,
        },
    )
