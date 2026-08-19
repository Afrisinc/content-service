"""Renders a whole set to disk and audits every frame."""

from __future__ import annotations

from pathlib import Path

from ..audit import audit_post, audit_slide, has_errors
from ..config import settings
from ..schema import PostSpec, RenderedSlide, RenderResult
from . import slide as slide_renderer


def output_dir(slug: str) -> Path:
    target = (settings.output_dir / slug).resolve()
    root = settings.output_dir.resolve()
    if root not in target.parents:
        raise ValueError("slug escapes the output directory")
    target.mkdir(parents=True, exist_ok=True)
    return target


def render_post(spec: PostSpec) -> RenderResult:
    geo = spec.geometry
    target = output_dir(spec.slug)
    rendered: list[RenderedSlide] = []
    findings = audit_post(spec.slides)

    for index, slide_spec in enumerate(spec.slides):
        image, headline_size = slide_renderer.render(slide_spec, geo)
        filename = f"{geo.filename_prefix}-{index + 1:02d}.png"
        path = target / filename
        image.save(path, format="PNG", optimize=True)

        findings.extend(audit_slide(index, slide_spec, image, geo))
        rendered.append(
            RenderedSlide(
                index=index,
                filename=filename,
                surface=slide_spec.surface,
                headline_size=headline_size,
                bytes=path.stat().st_size,
            )
        )

    return RenderResult(
        slug=spec.slug,
        format=spec.format,
        width=geo.width,
        height=geo.height,
        slides=rendered,
        findings=findings,
        passed=not has_errors(findings),
    )
