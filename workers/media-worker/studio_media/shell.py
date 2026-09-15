from __future__ import annotations

import json
import subprocess
from pathlib import Path

from .config import CONFIG


class MediaCommandError(RuntimeError):
    pass


def run(command: list[str], timeout: int | None = None) -> str:
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout or CONFIG.ffmpeg_timeout,
    )
    if completed.returncode != 0:
        tail = (completed.stderr or completed.stdout or "")[-4000:]
        raise MediaCommandError(f"{command[0]} exited {completed.returncode}: {tail}")
    return completed.stdout


def run_ffmpeg(args: list[str], timeout: int | None = None) -> str:
    completed = subprocess.run(
        [CONFIG.ffmpeg, "-hide_banner", "-nostdin", "-y", *args],
        capture_output=True,
        text=True,
        timeout=timeout or CONFIG.ffmpeg_timeout,
    )
    if completed.returncode != 0:
        tail = (completed.stderr or "")[-4000:]
        raise MediaCommandError(f"ffmpeg exited {completed.returncode}: {tail}")
    return completed.stderr


def probe(path: Path) -> dict:
    output = run(
        [
            CONFIG.ffprobe,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        timeout=120,
    )
    return json.loads(output)


def stream_of(payload: dict, kind: str) -> dict | None:
    for stream in payload.get("streams", []):
        if stream.get("codec_type") == kind:
            return stream
    return None


def duration_of(payload: dict) -> float:
    fmt = payload.get("format", {})
    if "duration" in fmt:
        return float(fmt["duration"])
    video = stream_of(payload, "video")
    if video and "duration" in video:
        return float(video["duration"])
    return 0.0


def fps_of(payload: dict) -> float:
    video = stream_of(payload, "video")
    if not video:
        return 0.0
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    numerator, _, denominator = rate.partition("/")
    try:
        denominator_value = float(denominator or 1)
        return float(numerator) / denominator_value if denominator_value else 0.0
    except ValueError:
        return 0.0
