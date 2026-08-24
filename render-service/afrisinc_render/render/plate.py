"""Adaptive text plates.

A fixed top-and-bottom scrim assumes the bright part of a photograph is at the top
or the bottom. It often is not — a lit monitor sits in the middle of the frame, and
white type laid over it disappears. These plates measure the background behind each
text block and darken only where the type actually lands, feathered widely enough
that the result reads as light falling off rather than a box behind the words.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

from ..brand import tokens as T
from ..brand.geometry import Geometry
from ..luminance import Rect, contrast_on_white, region_luminance, relative_luminance

# The plate is dilated before it is blurred: blurring a thin rect by this much would
# hollow out its centre, so the shape is grown first and the blur only softens edges.
FEATHER = 110
PADDING = 84
MAX_ALPHA = 0.82
# White type on a photograph needs more headroom than on flat colour: the
# background varies underneath the glyphs, so the mean is optimistic.
TARGET_CONTRAST = 4.5

# Every text region gets this much ink whether the measurement asks for it or not.
#
# Two reasons, and the second is the important one:
#
# 1. Contrast is a ratio of averages; legibility is also a matter of the *texture*
#    behind the glyphs. A busy mid-tone background can clear 4.5:1 and still make
#    type hard to read because the edges of the letters compete with edges in the
#    photograph. A light wash settles the background down without hiding it. This is
#    the same reasoning behind a broadcast lower-third and Material's scrim.
# 2. A plate that appears only when a measurement trips means some frames in a
#    carousel are washed and others are not, and the set reads as unevenly
#    processed — which is itself one of the tells. A constant floor makes the
#    treatment a house style rather than a repair.
#
# 0.16 is deliberately below the threshold of being *seen*: on a mid-tone photograph
# it is roughly a half-stop, which reads as exposure rather than as an overlay.
FLOOR = 0.16


def required_alpha(luminance: float, target: float = TARGET_CONTRAST) -> float:
    """How much ink to lay over a region so white type clears the target ratio.

    Compositing INK at alpha a gives L' ≈ L·(1−a) + L_ink·a, and we need
    1.05 / (L' + 0.05) ≥ target.
    """
    if contrast_on_white(luminance) >= target:
        return 0.0

    ink_luminance = relative_luminance(np.array([[T.INK]], dtype=np.uint8))
    needed = 1.05 / target - 0.05

    if luminance <= ink_luminance:
        return 0.0

    alpha = (luminance - needed) / (luminance - ink_luminance)
    return float(min(max(alpha, 0.0), MAX_ALPHA))


def build_mask(geo: Geometry, plates: list[tuple[Rect, float]]) -> Image.Image | None:
    """One feathered mask carrying every plate at its own strength."""
    if not plates:
        return None

    mask = Image.new("L", geo.size, 0)
    draw = ImageDraw.Draw(mask)

    # Weakest first. Rects overlap, and a later fill overwrites an earlier one — draw
    # them in the other order and a light plate erases the strong one it sits on.
    for rect, alpha in sorted(plates, key=lambda plate: plate[1]):
        if alpha <= 0.01:
            continue
        left, top, right, bottom = rect
        draw.rounded_rectangle(
            [left - PADDING, top - PADDING, right + PADDING, bottom + PADDING],
            radius=48,
            fill=int(round(255 * alpha)),
        )

    if not mask.getbbox():
        return None

    return mask.filter(ImageFilter.GaussianBlur(FEATHER))


def apply(
    image: Image.Image, geo: Geometry, rects: list[Rect], *, floor: float = FLOOR
) -> Image.Image:
    """Lay a light constant wash behind every text rect, and top it up wherever the
    background is bright enough to swallow the type."""
    plates = [(rect, max(floor, required_alpha(region_luminance(image, rect)))) for rect in rects]

    mask = build_mask(geo, plates)
    if mask is None:
        return image

    source = image.convert("RGB")
    ink = Image.new("RGB", geo.size, T.INK)
    plated = Image.composite(ink, source, mask)

    # The plate is brand navy rather than flat black so the shadow carries the same
    # tint as the scrim. Navy is lighter than a deep shadow in green and blue, though,
    # so on an already-dark frame a plain blend would *lift* it. Taking the darker of
    # the two makes the operation subtractive by construction: a plate can only ever
    # remove light, never add it.
    return ImageChops.darker(plated, source)
