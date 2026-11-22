from __future__ import annotations

from dataclasses import replace

from PIL import Image

from ...brand import tokens as T
from ...brand.geometry import Geometry, news_geometry
from ...schema import SlideSpec
from .. import components as C
from .. import furniture, plate, surfaces
from ..slide import RenderedFrame, build_news_stack
from .base import (
    SEAM_PILL_CLEARANCE,
    Template,
    draw_seam_pill,
    flatten,
    header_rects,
    layer,
    seam_pill,
    white_on,
)

MIN_PHOTO_SHARE = 0.34
SEAM_BAR = 8


class Split(Template):
    name = "news.split"
    title = "Split"
    description = (
        "Photograph on top, ink panel below. The eyebrow straddles the seam. "
        "Reads fastest when the headline is the story."
    )

    def text_geometry(self, spec: SlideSpec, geo: Geometry) -> Geometry:
        photo = round(geo.height * MIN_PHOTO_SHARE)
        top = photo + SEAM_BAR + T.PILL_HEIGHT // 2 + SEAM_PILL_CLEARANCE
        return replace(news_geometry(geo), band_top=top)

    def _seam(self, stack: C.Stack, text_geo: Geometry) -> int:
        top = stack.top_for(self.anchor, text_geo)
        return round(top - SEAM_BAR - T.PILL_HEIGHT // 2 - SEAM_PILL_CLEARANCE)

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        return build_news_stack(spec, size, "photo", with_eyebrow=False)

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        text_geo = self.text_geometry(spec, geo)
        stack, size = self.layout(spec, geo)
        seam = self._seam(stack, text_geo)

        photo = surfaces.prepare_photo(
            spec.photo or "", geo, focus=spec.photo_focus, size=(geo.width, seam)
        )
        base = Image.new("RGB", geo.size, T.INK)
        base.paste(surfaces.scrim(photo, top_only=True), (0, 0))
        base = plate.apply(base, geo, header_rects(geo))
        contrast = white_on(base, header_rects(geo))
        base = surfaces.grain(base)

        overlay, draw = layer(geo)
        draw.rectangle([0, seam, geo.width, seam + SEAM_BAR], fill=T.AZURE + (255,))
        furniture.header(overlay, draw, geo, spec.surface, show_site=False, show_brand=False)
        furniture.news_badge(draw, geo, T.BADGE_LABELS[spec.layout])
        pill_bounds = draw_seam_pill(
            seam_pill(spec, T.WHITE, T.INK), draw, overlay, seam + SEAM_BAR / 2, geo
        )
        stack.draw(draw, overlay, self.anchor, text_geo)
        furniture.dateline(draw, geo, spec.dateline or "", spec.surface)

        return RenderedFrame(
            flatten(base, overlay),
            size,
            stack.bounds(self.anchor, text_geo) + pill_bounds,
            contrast,
        )
