from __future__ import annotations

from dataclasses import replace

from ...brand import tokens as T
from ...brand.geometry import Geometry, news_geometry
from ...schema import SlideSpec
from .. import components as C
from .. import furniture, surfaces
from ..slide import RenderedFrame, build_news_stack
from .base import (
    SEAM_PILL_CLEARANCE,
    Template,
    draw_seam_pill,
    flatten,
    layer,
    rounded,
    seam_pill,
)

PHOTO_TOP_GAP = 52
MIN_PHOTO_SHARE = 0.30


class Frame(Template):
    name = "news.frame"
    title = "Frame"
    description = (
        "Light editorial card: a rounded photograph on paper, ink headline underneath. "
        "The calm option for explainers and business news."
    )

    def text_geometry(self, spec: SlideSpec, geo: Geometry) -> Geometry:
        top = geo.header_y + PHOTO_TOP_GAP + round(geo.height * MIN_PHOTO_SHARE)
        return replace(news_geometry(geo), band_top=top + T.PILL_HEIGHT // 2 + SEAM_PILL_CLEARANCE)

    def _photo_box(
        self, geo: Geometry, stack: C.Stack, text_geo: Geometry
    ) -> tuple[int, int, int, int]:
        bottom = stack.top_for(self.anchor, text_geo) - T.PILL_HEIGHT // 2 - SEAM_PILL_CLEARANCE
        return geo.margin, geo.header_y + PHOTO_TOP_GAP, geo.right_edge, round(bottom)

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        return build_news_stack(spec, size, "white", with_eyebrow=False)

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        text_geo = self.text_geometry(spec, geo)
        stack, size = self.layout(spec, geo)
        left, top, right, bottom = self._photo_box(geo, stack, text_geo)

        base = surfaces.build("white", geo).convert("RGBA")
        photo = surfaces.prepare_photo(
            spec.photo or "", geo, focus=spec.photo_focus, size=(right - left, bottom - top)
        )
        base.alpha_composite(rounded(photo), (left, top))

        overlay, draw = layer(geo)
        furniture.header(overlay, draw, geo, "white", show_site=False, show_brand=False)
        furniture.news_badge(
            draw, geo, T.BADGE_LABELS[spec.layout], fill=T.INK, text_colour=T.WHITE
        )
        pill_bounds = draw_seam_pill(seam_pill(spec, T.AZURE, T.WHITE), draw, overlay, bottom, geo)
        stack.draw(draw, overlay, self.anchor, text_geo)
        furniture.dateline(draw, geo, spec.dateline or "", "white")

        return RenderedFrame(
            flatten(base, overlay),
            size,
            stack.bounds(self.anchor, text_geo) + pill_bounds,
            [],
        )
