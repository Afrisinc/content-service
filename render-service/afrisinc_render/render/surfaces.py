"""Surface construction: flat colour, photography, and the finish applied to both."""

from __future__ import annotations

import random
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

from ..brand import rules as R
from ..brand import tokens as T
from ..brand.geometry import Geometry
from ..config import settings
from ..errors import PhotoUnavailableError
from . import photo_source


@lru_cache(maxsize=8)
def _noise(size: tuple[int, int], amount: float, seed: int) -> Image.Image:
    rng = random.Random(seed)
    raw = bytes(rng.getrandbits(8) for _ in range(size[0] * size[1]))
    layer = Image.frombytes("L", size, raw)
    return layer.point(lambda v: int(128 + (v - 128) * amount * 2)).convert("RGB")


def grain(image: Image.Image, amount: float = T.GRAIN_AMOUNT) -> Image.Image:
    """Generated at 1:1 and never scaled — scaled noise reads as a filter, not a surface."""
    return ImageChops.overlay(image.convert("RGB"), _noise(image.size, amount, T.GRAIN_SEED))


@lru_cache(maxsize=8)
def _vignette_mask(size: tuple[int, int], strength: float) -> Image.Image:
    width, height = size
    ys, xs = np.mgrid[0:height, 0:width]
    cx, cy = width / 2, height / 2
    radius = np.sqrt(((xs - cx) / cx) ** 2 + ((ys - cy) / cy) ** 2) / np.sqrt(2)
    mask = np.clip(radius, 0, 1) ** 2.2 * strength * 255
    return Image.fromarray(mask.astype("uint8"), "L")


def vignette(image: Image.Image, strength: float = T.VIGNETTE_STRENGTH) -> Image.Image:
    black = Image.new("RGB", image.size, (0, 0, 0))
    return Image.composite(black, image, _vignette_mask(image.size, strength))


@lru_cache(maxsize=8)
def _scrim_mask(
    size: tuple[int, int], top_alpha: float, bottom_alpha: float, start: float
) -> Image.Image:
    height = size[1]
    column = Image.new("L", (1, height), 0)
    pixels = column.load()
    for y in range(height):
        fraction = y / height
        value = 0
        if fraction < 0.24:
            value = int(255 * top_alpha * (1 - fraction / 0.24))
        if fraction > start:
            ramp = (fraction - start) / (1 - start)
            value = max(value, int(255 * bottom_alpha * (ramp**1.22)))
        pixels[0, y] = value
    return column.resize(size)


def scrim(image: Image.Image, *, dense: bool = False) -> Image.Image:
    bottom = T.SCRIM_BOTTOM_ALPHA_DENSE if dense else T.SCRIM_BOTTOM_ALPHA
    start = T.SCRIM_START_DENSE if dense else T.SCRIM_START
    mask = _scrim_mask(image.size, T.SCRIM_TOP_ALPHA, bottom, start)
    return Image.composite(Image.new("RGB", image.size, T.INK), image, mask)


def grade(image: Image.Image) -> Image.Image:
    red, green, blue = image.split()
    red = red.point(lambda v: min(255, int(v * T.PHOTO_RED_GAIN)))
    blue = blue.point(lambda v: min(255, int(v * T.PHOTO_BLUE_GAIN)))
    merged = Image.merge("RGB", (red, green, blue))
    return ImageEnhance.Contrast(merged).enhance(T.PHOTO_CONTRAST)


def cover_crop(image: Image.Image, target: tuple[int, int], focus: float = 0.5) -> Image.Image:
    """Crop to the target aspect ratio without distortion, biased by `focus` (0..1)."""
    width, height = image.size
    target_ratio = target[0] / target[1]
    source_ratio = width / height
    focus = min(max(focus, 0.0), 1.0)

    if source_ratio > target_ratio:
        new_width = int(round(height * target_ratio))
        left = int(round((width - new_width) * focus))
        box = (left, 0, left + new_width, height)
    else:
        new_height = int(round(width / target_ratio))
        top = int(round((height - new_height) * focus))
        box = (0, top, width, top + new_height)

    return image.crop(box)


def _resolve_photo(reference: str) -> Path:
    # The photograph library lives in another service and holds urls, not files
    # this service can see, so a reference may be either.
    if photo_source.is_remote(reference):
        return photo_source.fetch(reference)

    candidate = (settings.photo_dir / reference).resolve()
    root = settings.photo_dir.resolve()
    if root not in candidate.parents and candidate != root:
        raise PhotoUnavailableError("photo reference escapes the photo directory")
    if not candidate.is_file():
        raise PhotoUnavailableError(f"photo not found: {reference}")
    if candidate.stat().st_size > settings.max_photo_bytes:
        raise PhotoUnavailableError(f"photo exceeds the size limit: {reference}")
    return candidate


def prepare_photo(reference: str, geo: Geometry, *, focus: float = 0.5) -> Image.Image:
    try:
        source = Image.open(_resolve_photo(reference)).convert("RGB")
    except PhotoUnavailableError:
        raise
    except OSError as exc:
        raise PhotoUnavailableError(f"photo could not be read: {reference}") from exc

    cropped = cover_crop(source, geo.size, focus).resize(geo.size, Image.LANCZOS)
    return grade(cropped.filter(ImageFilter.UnsharpMask(2, 55, 3)))


def build(
    surface: str,
    geo: Geometry,
    *,
    photo: str | None = None,
    dense_scrim: bool = False,
    focus: float = 0.5,
) -> Image.Image:
    """White is paper — it takes grain but never a vignette, which would read as dirt."""
    if surface == R.WHITE:
        return grain(Image.new("RGB", geo.size, T.WHITE), T.GRAIN_AMOUNT_WHITE)

    if surface == R.AZURE:
        base = Image.new("RGB", geo.size, T.AZURE)
    else:
        if not photo:
            raise PhotoUnavailableError("photo surface requires a photo reference")
        base = scrim(prepare_photo(photo, geo, focus=focus), dense=dense_scrim)

    return grain(vignette(base))
