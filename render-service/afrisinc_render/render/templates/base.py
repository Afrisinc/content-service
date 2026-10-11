from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar, NamedTuple

from PIL import Image, ImageDraw

from ...brand import tokens as T
from ...brand.geometry import Geometry, news_geometry
from ...errors import LayoutOverflowError
from ...luminance import Rect, contrast_on_white, region_luminance
from ...schema import SlideSpec
from .. import components as C
from .. import furniture, plate
from ..slide import RenderedFrame, fit_stack, furniture_bounds

SEAM_PILL_CLEARANCE = 40
CARD_RADIUS = 22


class FitReport(NamedTuple):
    size: int
    height: float
    limit: float
    fits: bool


class Template(ABC):
    name: ClassVar[str]
    title: ClassVar[str]
    description: ClassVar[str]
    sizes: ClassVar[tuple[int, ...]] = T.NEWS_HEADLINE_SIZES
    anchor: ClassVar[str] = "bottom"

    def text_geometry(self, spec: SlideSpec, geo: Geometry) -> Geometry:
        return news_geometry(geo)

    def build(self, spec: SlideSpec, size: int) -> C.Stack:
        raise NotImplementedError

    @abstractmethod
    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame: ...

    def layout(self, spec: SlideSpec, geo: Geometry) -> tuple[C.Stack, int]:
        return fit_stack(spec, self.text_geometry(spec, geo), build=self.build, sizes=self.sizes)

    def report(self, spec: SlideSpec, geo: Geometry) -> FitReport:
        text_geo = self.text_geometry(spec, geo)
        try:
            _, size = self.layout(spec, geo)
            fits = True
        except LayoutOverflowError:
            size, fits = T.MIN_HEADLINE_SIZE, False
        return FitReport(size, self.build(spec, size).height(text_geo), text_geo.band_height, fits)


def layer(geo: Geometry) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    overlay = Image.new("RGBA", geo.size, (0, 0, 0, 0))
    return overlay, ImageDraw.Draw(overlay)


def flatten(base: Image.Image, overlay: Image.Image) -> Image.Image:
    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def white_on(base: Image.Image, rects: list[Rect]) -> list[tuple[Rect, float]]:
    return [(rect, contrast_on_white(region_luminance(base, rect))) for rect in rects]


def header_rects(geo: Geometry) -> list[Rect]:
    return furniture_bounds(geo, "news")[:1]


def seam_pill(spec: SlideSpec, label_fill: T.RGB, label_text: T.RGB) -> C.EyebrowPill | None:
    if spec.eyebrow is None:
        return None
    if spec.eyebrow.kind == "claim":
        return C.EyebrowPill(spec.eyebrow.text, T.CORAL, T.WHITE)
    return C.EyebrowPill(spec.eyebrow.text, label_fill, label_text)


def draw_seam_pill(
    pill: C.EyebrowPill | None,
    draw: ImageDraw.ImageDraw,
    overlay: Image.Image,
    seam_y: float,
    geo: Geometry,
) -> list[Rect]:
    if pill is None:
        return []
    top = seam_y - T.PILL_HEIGHT / 2
    pill.draw(draw, overlay, top, geo)
    return pill.bounds(top, geo)


def rounded(image: Image.Image, radius: int = CARD_RADIUS) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *image.size], radius=radius, fill=255)
    card = image.convert("RGBA")
    card.putalpha(mask)
    return card


def render_on_photo(
    spec: SlideSpec,
    geo: Geometry,
    base: Image.Image,
    stack: C.Stack,
    size: int,
    text_geo: Geometry,
    anchor: str,
) -> RenderedFrame:
    plate_rects = stack.plate_bounds(anchor, text_geo)
    base = plate.apply(base, geo, plate_rects + furniture_bounds(geo, spec.layout))
    contrast = white_on(base, plate_rects)

    overlay, draw = layer(geo)
    furniture.header(overlay, draw, geo, spec.surface, show_site=False, show_brand=False)
    furniture.news_badge(draw, geo, T.BADGE_LABELS[spec.layout])
    stack.draw(draw, overlay, anchor, text_geo)
    furniture.dateline(draw, geo, spec.dateline or "", spec.surface)

    return RenderedFrame(flatten(base, overlay), size, stack.bounds(anchor, text_geo), contrast)
