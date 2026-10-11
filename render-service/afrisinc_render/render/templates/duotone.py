from __future__ import annotations

from ...brand.geometry import Geometry
from ...schema import SlideSpec
from .. import components as C
from .. import surfaces
from ..slide import RenderedFrame, build_news_stack
from .base import Template, render_on_photo


class Duotone(Template):
    name = "news.duotone"
    title = "Duotone"
    description = (
        "Photograph printed in ink and azure, white headline at the foot. "
        "Unmistakably on-brand, and it rescues weak or mismatched stock photos."
    )

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        return build_news_stack(spec, size)

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        text_geo = self.text_geometry(spec, geo)
        stack, size = self.layout(spec, geo)
        photo = surfaces.duotone(
            surfaces.prepare_photo(spec.photo or "", geo, focus=spec.photo_focus)
        )
        base = surfaces.grain(surfaces.vignette(surfaces.scrim(photo, dense=True)))
        return render_on_photo(spec, geo, base, stack, size, text_geo, self.anchor)
