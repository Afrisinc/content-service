"""Breaks a news headline into the lines a news frame will set it in."""

from __future__ import annotations

from .brand import tokens as T
from .brand.geometry import Geometry, geometry_for, news_geometry
from .render import typography as ty
from .schema import HeadlineWrapRequest, HeadlineWrapResult

ELLIPSIS = "…"
SEARCH_STEPS = 24


def _wrap(text: str, size: int, width: float) -> list[str]:
    return ty.wrap_to_width(text, ty.BOLD, size, width)


def _holds(lines: list[str], size: int, width: float) -> bool:
    return len(lines) <= T.MAX_HEADLINE_LINES and all(
        ty.fits(line, ty.BOLD, size, width) for line in lines
    )


def _balanced(text: str, size: int, width: float, line_count: int) -> list[str]:
    fnt = ty.font(ty.BOLD, size)
    track = ty.tracking(size)
    low = max(ty.text_width(word, fnt, track) for word in text.split())
    high = width

    for _ in range(SEARCH_STEPS):
        middle = (low + high) / 2
        if len(_wrap(text, size, middle)) <= line_count:
            high = middle
        else:
            low = middle

    return _wrap(text, size, high)


def _clipped(line: str, size: int, width: float, *, ellipsis: bool) -> str:
    suffix = ELLIPSIS if ellipsis else ""
    while line and not ty.fits(line + suffix, ty.BOLD, size, width):
        line = line[:-1].rstrip()
    return line + suffix


def _truncated(text: str, size: int, width: float) -> HeadlineWrapResult:
    kept = _wrap(text, size, width)[: T.MAX_HEADLINE_LINES]
    lines = [
        _clipped(line, size, width, ellipsis=index == len(kept) - 1)
        for index, line in enumerate(kept)
    ]
    return HeadlineWrapResult(lines=lines, size=size, truncated=True)


def wrap_headline(request: HeadlineWrapRequest, geo: Geometry | None = None) -> HeadlineWrapResult:
    frame = geo or news_geometry(geometry_for(request.format))
    text = " ".join(request.text.split())

    for size in T.NEWS_HEADLINE_SIZES:
        lines = _wrap(text, size, frame.content_width)
        if _holds(lines, size, frame.content_width):
            balanced = _balanced(text, size, frame.content_width, len(lines))
            return HeadlineWrapResult(lines=balanced, size=size, truncated=False)

    return _truncated(text, T.NEWS_HEADLINE_FLOOR, frame.content_width)
