"""Type measurement and drawing. Every optical rule in the design system lives here."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import ImageDraw, ImageFont

from ..brand import tokens as T
from ..config import settings
from ..errors import FontMissingError

Weight = str  # "Light" | "Regular" | "Medium" | "Bold"

LIGHT: Weight = "Light"
REGULAR: Weight = "Regular"
MEDIUM: Weight = "Medium"
BOLD: Weight = "Bold"

REQUIRED_WEIGHTS: tuple[Weight, ...] = (LIGHT, REGULAR, MEDIUM, BOLD)

# Line-opening characters hang outside the margin so flush-left reads as flush-left.
_HANG_WIDE = frozenset("AVWYTJvwy")
_HANG_ROUND = frozenset("OCGQSoces")
_HANG_QUOTES = frozenset("\"'“‘")


def font_path(weight: Weight) -> Path:
    return settings.font_dir / f"Poppins-{weight}.ttf"


def verify_fonts() -> None:
    missing = [w for w in REQUIRED_WEIGHTS if not font_path(w).is_file()]
    if missing:
        raise FontMissingError(
            f"missing Poppins weights {missing} in {settings.font_dir}"
        )


@lru_cache(maxsize=256)
def font(weight: Weight, size: int) -> ImageFont.FreeTypeFont:
    path = font_path(weight)
    if not path.is_file():
        raise FontMissingError(f"font not found: {path}")
    return ImageFont.truetype(str(path), size)


def tracking(size: int, *, caps: bool = False) -> float:
    """Letter-fit is drawn for text sizes; display type needs negative tracking to close up."""
    if caps and size <= 22:
        return size * 0.16
    if size >= 100:
        return -size * 0.022
    if size >= 72:
        return -size * 0.020
    if size >= 44:
        return -size * 0.012
    if size >= 28:
        return -size * 0.005
    return 0.0


def hang(char: str, size: int) -> float:
    if char in _HANG_QUOTES:
        return -size * 0.30
    if char in _HANG_WIDE:
        return -size * 0.035
    if char in _HANG_ROUND:
        return -size * 0.015
    return 0.0


def text_width(text: str, fnt: ImageFont.FreeTypeFont, track: float = 0.0) -> float:
    if not text:
        return 0.0
    return sum(fnt.getlength(c) for c in text) + track * (len(text) - 1)


def cap_metrics(fnt: ImageFont.FreeTypeFont) -> tuple[float, float]:
    """(offset from draw origin to cap top, cap height)."""
    box = fnt.getbbox("H")
    return box[1], box[3] - box[1]


def cap_height(fnt: ImageFont.FreeTypeFont) -> float:
    return cap_metrics(fnt)[1]


def x_height(fnt: ImageFont.FreeTypeFont) -> float:
    box = fnt.getbbox("x")
    return box[3] - box[1]


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, ...],
    track: float = 0.0,
    *,
    align_right: bool = False,
) -> float:
    x, y = xy
    if align_right:
        x -= text_width(text, fnt, track)
    for char in text:
        draw.text((x, y), char, font=fnt, fill=fill)
        x += fnt.getlength(char) + track
    return x


def draw_cap_centred(
    draw: ImageDraw.ImageDraw,
    x: float,
    centre_y: float,
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, ...],
    track: float = 0.0,
    *,
    align_right: bool = False,
) -> float:
    top, height = cap_metrics(fnt)
    return draw_tracked(
        draw, (x, centre_y - height / 2 - top), text, fnt, fill, track, align_right=align_right
    )


def fits(text: str, weight: Weight, size: int, width: float, *, caps: bool = False) -> bool:
    return text_width(text, font(weight, size), tracking(size, caps=caps)) <= width


def fit_size(
    text: str,
    weight: Weight,
    sizes: tuple[int, ...],
    width: float,
    *,
    caps: bool = False,
) -> int:
    """Largest size from the scale at which the text fits. Never invent a size off-scale."""
    for size in sizes:
        if fits(text, weight, size, width, caps=caps):
            return size
    return sizes[-1]


def headline_size(lines: list[str], width: float) -> int:
    for size in T.HEADLINE_SIZES:
        fnt = font(BOLD, size)
        track = tracking(size)
        if all(text_width(line, fnt, track) <= width for line in lines):
            return size
    return T.HEADLINE_SIZES[-1]


def headline_leading(size: int, line_count: int) -> float:
    return size * (T.LEADING_TIGHT if line_count > 2 else T.LEADING_OPEN)


def rag_violations(lines: list[str]) -> list[str]:
    """Rag rules from the art-direction system. Returned, not raised — the caller decides."""
    problems: list[str] = []
    orphans = {"a", "an", "the", "of", "to", "and", "or", "in", "for", "with"}

    for i, line in enumerate(lines[:-1]):
        last = line.rstrip(".,;:—-").split()[-1].lower() if line.split() else ""
        if last in orphans:
            problems.append(f"line {i + 1} ends on '{last}'")

    if len(lines) > 1:
        widths = [len(line) for line in lines]
        longest = max(widths)
        if longest and widths[-1] / longest < 0.25:
            problems.append("last line is under 25% of the longest")

    return problems
