"""Perceptual brightness measurement. A leaf module — the renderer and the audit both
need it, and neither should have to import the other to get it."""

from __future__ import annotations

import numpy as np
from PIL import Image

Rect = tuple[float, float, float, float]  # left, top, right, bottom

# White type fails wherever the background is brightest, however small that area is —
# a lit monitor behind two words is enough. Averaging the whole rect hides it, and so
# does a percentile once the bright area is a small fraction of the region. Instead the
# rect is reduced to a coarse grid of area-averages and the brightest cell decides.
GRID = 12


def relative_luminance(pixels: np.ndarray) -> float:
    channels = pixels.astype(np.float64) / 255.0
    linear = np.where(channels <= 0.03928, channels / 12.92, ((channels + 0.055) / 1.055) ** 2.4)
    weighted = 0.2126 * linear[..., 0] + 0.7152 * linear[..., 1] + 0.0722 * linear[..., 2]
    return float(weighted.mean())


def contrast_on_white(luminance: float) -> float:
    return 1.05 / (luminance + 0.05)


def region_luminance(image: Image.Image, rect: Rect, grid: int = GRID) -> float:
    """Brightness of the worst cell behind the type, not the average of the whole rect."""
    left, top, right, bottom = (int(round(value)) for value in rect)
    left, top = max(left, 0), max(top, 0)
    right, bottom = min(right, image.width), min(bottom, image.height)
    if right <= left or bottom <= top:
        return 0.0

    patch = image.convert("RGB").crop((left, top, right, bottom))
    cells = (max(1, min(grid, patch.width)), max(1, min(grid, patch.height)))
    reduced = np.asarray(patch.resize(cells, Image.BOX)).reshape(-1, 3)

    return max(relative_luminance(cell.reshape(1, 3)) for cell in reduced)
