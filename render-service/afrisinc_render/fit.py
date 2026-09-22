"""Measures whether a set's words fit their measure before anything is drawn."""

from __future__ import annotations

from .brand import tokens as T
from .brand.geometry import Geometry, geometry_for
from .render import components as C
from .render import typography as ty
from .schema import (
    FittedLine,
    FittedSlide,
    HeadlineFitRequest,
    HeadlineFitResult,
    HeadlineFitSlide,
    Row,
)


def _headline_lines(lines: list[str], geo: Geometry) -> tuple[int, list[FittedLine]]:
    fit = ty.headline_fit(lines, geo.content_width, T.BRAND_HEADLINE_SIZES)
    return fit.size, [
        FittedLine(
            role="headline line",
            text=line.text,
            width=round(line.width, 1),
            overflow=round(line.overflow, 1),
            fits=line.fits,
        )
        for line in fit.lines
    ]


def _row_lines(rows: list[Row], geo: Geometry) -> list[FittedLine]:
    if not rows:
        return []
    measured = C.Rows([(row.title, row.body) for row in rows]).measure(geo)
    return [
        FittedLine(
            role=role,
            text=text,
            width=round(width, 1),
            overflow=round(width - limit, 1),
            fits=width <= limit,
        )
        for role, text, width, limit in measured
    ]


def _fit_slide(index: int, slide: HeadlineFitSlide, geo: Geometry) -> FittedSlide:
    size, lines = _headline_lines(slide.headline, geo)
    lines.extend(_row_lines(slide.rows, geo))
    return FittedSlide(
        index=index,
        headline_size=size,
        fits=all(line.fits for line in lines),
        lines=lines,
    )


def fit_headlines(request: HeadlineFitRequest) -> HeadlineFitResult:
    geo = geometry_for(request.format)
    slides = [_fit_slide(index, slide, geo) for index, slide in enumerate(request.slides)]

    return HeadlineFitResult(
        measure=geo.content_width,
        min_headline_size=T.HEADLINE_BRAND_FLOOR,
        fits=all(slide.fits for slide in slides),
        slides=slides,
    )
