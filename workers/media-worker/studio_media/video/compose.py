from __future__ import annotations

import hashlib
from pathlib import Path

from ..contracts import VariantSpec
from ..shell import duration_of, fps_of, probe, run_ffmpeg

FORMAT_TARGETS = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "4:5": (1080, 1350),
    "1:1": (1080, 1080),
}


def concat(scene_paths: list[Path], output: Path, fps: float) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    listing = output.parent / "concat.txt"
    listing.write_text("\n".join(f"file '{path.as_posix()}'" for path in scene_paths) + "\n")

    run_ffmpeg(
        [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(listing),
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(output),
        ]
    )
    return output


def mux(video: Path, audio: Path | None, output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    args = ["-i", str(video)]
    if audio is not None:
        args.extend(["-i", str(audio)])

    args.extend(["-map", "0:v:0"])
    if audio is not None:
        # apad before -shortest: without it a master shorter than the picture
        # silently truncates the video instead of padding the audio.
        args.extend(["-map", "1:a:0", "-c:a", "aac", "-b:a", "256k", "-af", "apad"])

    args.extend(["-c:v", "copy", "-shortest", str(output)])
    run_ffmpeg(args)
    return output


def scale_filter(spec: VariantSpec, source_width: int, source_height: int) -> str:
    target_width, target_height = spec.width, spec.height
    source_ratio = source_width / max(1, source_height)
    target_ratio = target_width / max(1, target_height)

    if abs(source_ratio - target_ratio) < 0.01:
        return f"scale={target_width}:{target_height}:flags=lanczos"

    if source_ratio > target_ratio:
        crop = f"crop=ih*{target_ratio}:ih"
    else:
        crop = f"crop=iw:iw/{target_ratio}"

    padding = spec.safe_area_padding
    if padding > 0:
        inner_width = int(target_width * (1 - padding))
        inner_height = int(target_height * (1 - padding))
        return (
            f"{crop},scale={inner_width}:{inner_height}:flags=lanczos,"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black"
        )

    return f"{crop},scale={target_width}:{target_height}:flags=lanczos"


def render_variant(
    master: Path,
    spec: VariantSpec,
    output: Path,
    subtitle_path: Path | None = None,
    watermark_path: Path | None = None,
) -> dict:
    payload = probe(master)
    video_stream = next((stream for stream in payload["streams"] if stream["codec_type"] == "video"), {})
    source_width = int(video_stream.get("width", spec.width))
    source_height = int(video_stream.get("height", spec.height))

    filters = [scale_filter(spec, source_width, source_height)]
    if spec.burn_subtitles and subtitle_path is not None:
        escaped = str(subtitle_path).replace(":", "\\:").replace("'", "\\'")
        filters.append(f"subtitles='{escaped}'")

    args = ["-i", str(master)]
    if watermark_path is not None:
        args.extend(["-i", str(watermark_path)])

    output.parent.mkdir(parents=True, exist_ok=True)

    if watermark_path is not None:
        graph = f"[0:v]{','.join(filters)}[base];[base][1:v]overlay=W-w-40:H-h-40[v]"
        args.extend(["-filter_complex", graph, "-map", "[v]", "-map", "0:a?"])
    else:
        args.extend(["-vf", ",".join(filters), "-map", "0:v:0", "-map", "0:a?"])

    if spec.max_duration_seconds:
        args.extend(["-t", str(spec.max_duration_seconds)])

    args.extend(
        [
            "-r",
            str(spec.fps),
            "-c:v",
            "libx264",
            "-profile:v",
            "high",
            "-level",
            "4.1",
            "-preset",
            "slow",
            "-crf",
            str(spec.crf),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            str(output),
        ]
    )
    run_ffmpeg(args)

    body = output.read_bytes()
    result = probe(output)
    return {
        "format": spec.format,
        "width": spec.width,
        "height": spec.height,
        "fps": fps_of(result),
        "duration_seconds": duration_of(result),
        "bytes": len(body),
        "checksum": hashlib.sha256(body).hexdigest(),
    }


def assemble_shots(shot_paths: list[Path], output: Path, fps: float, width: int | None, height: int | None) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    listing = output.parent / "shots.txt"
    listing.write_text("\n".join(f"file '{path.as_posix()}'" for path in shot_paths) + "\n")

    first = probe(shot_paths[0])
    stream = next((s for s in first["streams"] if s["codec_type"] == "video"), {})
    target_w = width or int(stream.get("width", 1280))
    target_h = height or int(stream.get("height", 720))

    run_ffmpeg(
        [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(listing),
            "-vf",
            f"scale={target_w}:{target_h}:flags=lanczos,fps={fps}",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(output),
        ]
    )

    body = output.read_bytes()
    result = probe(output)
    return {
        "width": target_w,
        "height": target_h,
        "fps": fps_of(result),
        "duration_seconds": duration_of(result),
        "bytes": len(body),
        "checksum": hashlib.sha256(body).hexdigest(),
    }


def extract_last_frame(video: Path, output: Path, offset_seconds: float = 0.0) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    duration = duration_of(probe(video))
    at = max(0.0, duration - max(0.04, offset_seconds or 0.08))

    run_ffmpeg(["-ss", f"{at:.3f}", "-i", str(video), "-frames:v", "1", "-q:v", "2", str(output)])

    body = output.read_bytes()
    return {"bytes": len(body), "checksum": hashlib.sha256(body).hexdigest(), "at_seconds": round(at, 3)}
