from __future__ import annotations

from dataclasses import replace

from ...brand import tokens as T
from ...brand.geometry import Geometry, news_geometry
from ...schema import SlideSpec
from .. import components as C
from .. import furniture, plate, surfaces
from .. import typography as ty
from ..slide import RenderedFrame, build_news_stack
from .base import Template, flatten, header_rects, layer, white_on

BAND_SHARE = 0.40
BAND_PAD = 56
EDGE = 6
TAB_HEIGHT = 52
TAB_PAD = 28
TAB_SIZE = 22


class Bulletin(Template):
    name = "news.bulletin"
    title = "Bulletin"
    description = (
        "Broadcast lower-third: the photograph stays clean, a white strap carries the "
        "headline, the eyebrow becomes a tab. Best for breaking and live stories."
    )

    def text_geometry(self, spec: SlideSpec, geo: Geometry) -> Geometry:
        return replace(news_geometry(geo), band_top=round(geo.height * BAND_SHARE))

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        return build_news_stack(spec, size, "white", with_eyebrow=False)

    def _tab(self, spec: SlideSpec, draw, geo: Geometry, band_y: int) -> None:
        if spec.eyebrow is None:
            return
        fnt = ty.font(ty.BOLD, TAB_SIZE)
        track = ty.tracking(TAB_SIZE, caps=True)
        width = ty.text_width(spec.eyebrow.text, fnt, track) + TAB_PAD * 2
        fill = T.CORAL if spec.eyebrow.kind == "claim" else T.AZURE
        top = band_y - TAB_HEIGHT
        draw.rectangle([geo.margin, top, geo.margin + width, band_y + EDGE], fill=fill + (255,))
        ty.draw_cap_centred(
            draw,
            geo.margin + TAB_PAD,
            top + TAB_HEIGHT / 2,
            spec.eyebrow.text,
            fnt,
            T.WHITE + (255,),
            track,
        )

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        text_geo = self.text_geometry(spec, geo)
        stack, size = self.layout(spec, geo)
        band_y = round(stack.top_for(self.anchor, text_geo) - BAND_PAD)

        photo = surfaces.prepare_photo(spec.photo or "", geo, focus=spec.photo_focus)
        base = surfaces.vignette(surfaces.scrim(photo, top_only=True))
        base = plate.apply(base, geo, header_rects(geo))
        contrast = white_on(base, header_rects(geo))
        paper = surfaces.build("white", geo).crop((0, band_y, geo.width, geo.height))
        base.paste(paper, (0, band_y))
        base = surfaces.grain(base)

        overlay, draw = layer(geo)
        draw.rectangle([0, band_y, geo.width, band_y + EDGE], fill=T.AZURE + (255,))
        self._tab(spec, draw, geo, band_y)
        furniture.header(overlay, draw, geo, spec.surface, show_site=False, show_brand=False)
        furniture.news_badge(draw, geo, T.BADGE_LABELS[spec.layout])
        stack.draw(draw, overlay, self.anchor, text_geo)
        furniture.dateline(draw, geo, spec.dateline or "", "white")

        return RenderedFrame(
            flatten(base, overlay), size, stack.bounds(self.anchor, text_geo), contrast
        )
