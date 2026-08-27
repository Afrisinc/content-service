"""Assembles one frame: surface, marks, furniture and a measured block stack."""

from __future__ import annotations

from typing import NamedTuple

from PIL import Image, ImageDraw

from ..brand import rules as R
from ..brand import tokens as T
from ..brand.geometry import STORY, Geometry
from ..errors import LayoutOverflowError
from ..luminance import contrast_on_white, region_luminance
from ..schema import SlideSpec
from . import components as C
from . import furniture, marks, plate, surfaces
from . import typography as ty

GAP_EYEBROW_HEADLINE = 62
GAP_HEADLINE_SUB = 44
GAP_SUB_SUB = 46
GAP_HEADLINE_RULE = 76
GAP_RULE_ACTIONS = 70
GAP_HEADLINE_ROWS = 16
GAP_ROWS_CLOSING = 26
GAP_HEADLINE_CTA = 92
GAP_CTA_SUB = 44


def resolve_anchor(spec: SlideSpec, geo: Geometry) -> str:
    """A story's band is far taller than a post's, so content centres instead of hugging the top."""
    if spec.anchor:
        return spec.anchor
    if spec.surface == R.PHOTO:
        return "bottom"
    return "centre" if geo.name == STORY else "top"


def _eyebrow_block(spec: SlideSpec) -> C.Block | None:
    if spec.eyebrow is None:
        return None
    if spec.eyebrow.kind == "claim":
        fill, text_colour = R.pill_colours(spec.surface, claim=True)
        return C.EyebrowPill(spec.eyebrow.text, fill, text_colour)
    return C.EyebrowLabel(spec.eyebrow.text, R.foreground(spec.surface))


def build_stack(spec: SlideSpec, headline_size: int) -> C.Stack:
    foreground = R.foreground(spec.surface)
    stack = C.Stack()

    eyebrow = _eyebrow_block(spec)
    if eyebrow is not None:
        stack.add(eyebrow)

    stack.add(
        C.Headline(
            lines=spec.headline,
            size=headline_size,
            colours=R.headline_colours(spec.surface, len(spec.headline)),
            strike_line=spec.strike_line,
        ),
        GAP_EYEBROW_HEADLINE if eyebrow is not None else 0.0,
    )

    if spec.coral_rule:
        stack.add(C.CoralRule(), GAP_HEADLINE_RULE)

    if spec.rows:
        stack.add(C.Rows([(row.title, row.body) for row in spec.rows]), GAP_HEADLINE_ROWS)
        if spec.closing:
            stack.add(C.SubLine(spec.closing, T.AZURE, T.SIZE_SUB), GAP_ROWS_CLOSING)

    if spec.actions:
        gap = GAP_RULE_ACTIONS if spec.coral_rule else GAP_HEADLINE_SUB
        stack.add(
            C.Actions([(action.index, action.text) for action in spec.actions], foreground), gap
        )

    if spec.cta:
        fill, text_colour = (T.WHITE, T.AZURE) if R.is_dark(spec.surface) else (T.AZURE, T.WHITE)
        stack.add(C.CtaPill(spec.cta.text, fill, text_colour, spec.cta.arrow), GAP_HEADLINE_CTA)

    previous_was_cta = spec.cta is not None
    for index, text in enumerate(spec.subs):
        if index == 0:
            gap = GAP_CTA_SUB if previous_was_cta else GAP_HEADLINE_SUB
            stack.add(C.SubLine(text, foreground, T.SIZE_SUB), gap)
        else:
            stack.add(C.SubLine(text, foreground, 26, alpha=0.88), GAP_SUB_SUB)

    return stack


def fit_stack(spec: SlideSpec, geo: Geometry) -> tuple[C.Stack, int]:
    """Shrink the headline through the scale until every line clears the content
    width and the whole stack clears the contact rail.

    `ty.headline_size` falls back to the smallest size on the scale when no size
    makes every line fit width-wise — it never invents a size off-scale, so that
    fallback is not a real fit. Re-checking width here (not just stack height)
    means that case raises below instead of silently drawing a line past the
    right margin.
    """
    natural = ty.headline_size(spec.headline, geo.content_width)
    candidates = [size for size in T.HEADLINE_SIZES if size <= natural]

    for size in candidates:
        if not all(ty.fits(line, ty.BOLD, size, geo.content_width) for line in spec.headline):
            continue
        stack = build_stack(spec, size)
        if stack.height(geo) <= geo.band_height:
            return stack, size

    raise LayoutOverflowError(
        f"content does not fit the {geo.name} band even at {T.MIN_HEADLINE_SIZE}px — "
        "cut words, not points"
    )


def furniture_bounds(geo: Geometry) -> list[plate.Rect]:
    """The fixed elements are white on every dark surface, so they need protecting
    from a bright photograph exactly as the headline does."""
    return [
        (geo.margin, geo.header_y - 26, geo.right_edge, geo.header_y + 26),
        (geo.margin, geo.contact_rail_y - 20, geo.right_edge, geo.contact_rail_y + 20),
        (geo.margin, geo.footer_y - 22, geo.right_edge, geo.footer_y + 22),
    ]


class RenderedFrame(NamedTuple):
    image: Image.Image
    headline_size: int
    bounds: list[plate.Rect]
    # Measured on the prepared surface *before* the type is drawn. Measuring the
    # finished frame would sample the white glyphs themselves and report 1:1.
    contrast: list[tuple[plate.Rect, float]]


def render(spec: SlideSpec, geo: Geometry) -> RenderedFrame:
    base = surfaces.build(
        spec.surface,
        geo,
        photo=spec.photo,
        dense_scrim=spec.dense_scrim,
        focus=spec.photo_focus,
    )

    stack, headline_size = fit_stack(spec, geo)
    anchor = resolve_anchor(spec, geo)
    all_rects = stack.bounds(anchor, geo)
    plate_rects = stack.plate_bounds(anchor, geo)

    # Two passes: find where the type lands, darken the photograph behind it, and
    # only then draw. A single pass cannot know that a lit monitor sits mid-frame.
    if spec.surface == R.PHOTO:
        base = plate.apply(base, geo, plate_rects + furniture_bounds(geo))

    contrast = (
        [(rect, contrast_on_white(region_luminance(base, rect))) for rect in plate_rects]
        if R.is_dark(spec.surface)
        else []
    )

    base = base.convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    foreground = R.foreground(spec.surface)

    marks.watermark(overlay, geo, spec.surface)
    marks.masthead(draw, geo, foreground)
    marks.registration_marks(draw, geo, foreground)

    furniture.header(overlay, draw, geo, spec.surface, show_site=spec.shows_site)
    stack.draw(draw, overlay, anchor, geo)
    furniture.contact_rail(draw, geo, spec.surface)
    furniture.footer(draw, geo, spec.surface)

    return RenderedFrame(
        Image.alpha_composite(base, overlay).convert("RGB"), headline_size, all_rects, contrast
    )
