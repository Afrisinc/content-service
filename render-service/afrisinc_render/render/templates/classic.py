from __future__ import annotations

from ...brand.geometry import Geometry
from ...schema import SlideSpec
from .. import components as C
from .. import slide
from .base import Template


class Classic(Template):
    name = "news.classic"
    title = "Classic"
    description = (
        "Full-bleed photograph, headline and standfirst at the foot, news badge top right."
    )

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        return slide.build_news_stack(spec, size)

    def render(self, spec: SlideSpec, geo: Geometry) -> slide.RenderedFrame:
        return slide.render(spec, geo)
