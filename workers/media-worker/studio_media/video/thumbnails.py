from __future__ import annotations

import hashlib
from pathlib import Path

from ..shell import duration_of, probe, run_ffmpeg


def extract_candidates(video: Path, count: int, width: int, height: int, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = duration_of(probe(video))
    step = duration / (count + 1)

    paths: list[Path] = []
    for index in range(count):
        at = step * (index + 1)
        destination = out_dir / f"candidate_{index:02d}.jpg"
        run_ffmpeg(
            [
                "-ss",
                f"{at:.3f}",
                "-i",
                str(video),
                "-frames:v",
                "1",
                "-vf",
                f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
                "-q:v",
                "2",
                str(destination),
            ]
        )
        paths.append(destination)
    return paths


def score(path: Path) -> dict[str, float]:
    from PIL import Image, ImageFilter, ImageStat

    with Image.open(path) as image:
        grey = image.convert("L")
        stat = ImageStat.Stat(grey)
        contrast = float(stat.stddev[0]) / 128.0

        edges = grey.filter(ImageFilter.FIND_EDGES)
        sharpness = float(ImageStat.Stat(edges).mean[0]) / 64.0

        centre = grey.crop(
            (
                int(grey.width * 0.25),
                int(grey.height * 0.15),
                int(grey.width * 0.75),
                int(grey.height * 0.85),
            )
        )
        centre_energy = float(ImageStat.Stat(centre.filter(ImageFilter.FIND_EDGES)).mean[0]) / 64.0

    subject = min(1.0, centre_energy / max(0.01, sharpness))
    total = min(1.0, contrast) * 40 + min(1.0, sharpness) * 35 + subject * 25

    return {
        "contrast": round(min(1.0, contrast), 4),
        "sharpness": round(min(1.0, sharpness), 4),
        "face_area_ratio": round(subject, 4),
        "score": round(total, 2),
    }


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
