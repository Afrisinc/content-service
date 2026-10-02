"""Measures whether a set's words fit their measure before anything is drawn."""

from __future__ import annotations

from pydantic import ValidationError

from .brand import tokens as T
from .brand.geometry import Geometry, geometry_for, news_geometry
from .errors import LayoutOverflowError
from .render import components as C
from .render import typography as ty
from .render.slide import build_stack, fit_stack
from .schema import (
    is_editorial,
    FittedLine,
    FittedSlide,
    HeadlineFitRequest,
    HeadlineFitResult,
    HeadlineFitSlide,
    Row,
    SlideSpec,
)


def _headline_lines(
    lines: list[str], geo: Geometry, layout: str = "brand"
) -> tuple[int, list[FittedLine]]:
    sizes = T.NEWS_HEADLINE_SIZES if is_editorial(layout) else T.BRAND_HEADLINE_SIZES
    fit = ty.headline_fit(lines, geo.content_width, sizes)
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


def _stack_line(slide: HeadlineFitSlide, geo: Geometry) -> FittedLine | None:
    try:
        spec = SlideSpec(
            surface="photo" if is_editorial(slide.layout) else "azure",
            photo="fit-check" if is_editorial(slide.layout) else None,
            layout=slide.layout,
            dateline="fit check" if is_editorial(slide.layout) else None,
            headline=slide.headline,
            eyebrow=slide.eyebrow,
            subs=slide.subs,
            rows=slide.rows,
            closing=slide.closing,
            cta=slide.cta,
            coral_rule=slide.coral_rule,
        )
    except ValidationError:
        return None

    try:
        _, size = fit_stack(spec, geo)
        fits = True
    except LayoutOverflowError:
        size, fits = T.MIN_HEADLINE_SIZE, False

    height = build_stack(spec, size).height(geo)
    return FittedLine(
        role="stack height",
        text=" / ".join(spec.headline),
        width=round(height, 1),
        overflow=round(height - geo.band_height, 1),
        fits=fits,
    )


def _fit_slide(index: int, slide: HeadlineFitSlide, geo: Geometry) -> FittedSlide:
    size, lines = _headline_lines(slide.headline, geo, slide.layout)
    lines.extend(_row_lines(slide.rows, geo))
    if all(line.fits for line in lines):
        stack = _stack_line(slide, geo)
        if stack is not None:
            lines.append(stack)
    return FittedSlide(
        index=index,
        headline_size=size,
        fits=all(line.fits for line in lines),
        lines=lines,
    )


def fit_headlines(request: HeadlineFitRequest) -> HeadlineFitResult:
    base = geometry_for(request.format)
    slides = [
        _fit_slide(index, slide, news_geometry(base) if is_editorial(slide.layout) else base)
        for index, slide in enumerate(request.slides)
    ]
    all_news = all(is_editorial(slide.layout) for slide in request.slides)

    return HeadlineFitResult(
        measure=base.content_width,
        min_headline_size=T.NEWS_HEADLINE_FLOOR if all_news else T.HEADLINE_BRAND_FLOOR,
        fits=all(slide.fits for slide in slides),
        slides=slides,
    )
