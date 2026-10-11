from __future__ import annotations

from ...brand import tokens as T
from ...brand.geometry import Geometry
from ...schema import SlideSpec
from .. import components as C
from .. import surfaces
from ..slide import GAP_HEADLINE_SUB, RenderedFrame, _eyebrow_block
from .base import Template, render_on_photo

GAP_STRIPS = 40


class Spotlight(Template):
    name = "news.spotlight"
    title = "Spotlight"
    description = (
        "Headline set on solid strips that bleed off the left edge, last line in azure. "
        "High-energy look for sport, culture and punchy headlines."
    )

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        stack = C.Stack()
        eyebrow = _eyebrow_block(spec)
        if eyebrow is not None:
            stack.add(eyebrow)
        stack.add(C.StripHeadline(spec.headline, size), GAP_STRIPS if eyebrow is not None else 0.0)
        for text in spec.subs:
            stack.add(C.SubLine(text, T.WHITE, T.SIZE_STANDFIRST), GAP_HEADLINE_SUB)
        return stack

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        text_geo = self.text_geometry(spec, geo)
        stack, size = self.layout(spec, geo)
        base = surfaces.build(
            spec.surface, geo, photo=spec.photo, dense_scrim=True, focus=spec.photo_focus
        )
        return render_on_photo(spec, geo, base, stack, size, text_geo, self.anchor)
