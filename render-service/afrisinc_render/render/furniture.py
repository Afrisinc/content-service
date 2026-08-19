"""Fixed elements that appear on every frame, in the same place, always."""

from __future__ import annotations

from PIL import Image, ImageDraw

from ..brand import rules as R
from ..brand import tokens as T
from ..brand.geometry import Geometry
from . import marks
from . import typography as ty

LOGO_MARK_SIZE = 56
LOGO_TEXT_GAP = 20
FOOTER_DOT_RADIUS = 6
FOOTER_TEXT_GAP = 28
RAIL_SIZE_STEPS = (T.SIZE_RAIL, 23, 22, 21, 20)


def header(
    overlay: Image.Image,
    draw: ImageDraw.ImageDraw,
    geo: Geometry,
    surface: str,
    *,
    show_site: bool,
) -> None:
    colour = R.foreground(surface)
    mark_colour = colour if R.is_dark(surface) else T.AZURE
    mark = marks.tinted_logo(LOGO_MARK_SIZE, mark_colour, 1.0)
    overlay.alpha_composite(mark, (geo.margin, geo.header_y - LOGO_MARK_SIZE // 2))

    ty.draw_cap_centred(
        draw,
        geo.margin + LOGO_MARK_SIZE + LOGO_TEXT_GAP,
        geo.header_y,
        T.WORDMARK,
        ty.font(ty.BOLD, T.SIZE_WORDMARK),
        colour + (255,),
        T.SIZE_WORDMARK * 0.08,
    )

    if show_site:
        ty.draw_cap_centred(
            draw,
            geo.right_edge,
            geo.header_y,
            T.SITE,
            ty.font(ty.MEDIUM, T.SIZE_SITE),
            R.site_colour(surface) + (255,),
            align_right=True,
        )


def contact_rail(draw: ImageDraw.ImageDraw, geo: Geometry, surface: str) -> None:
    """Shrink the type before shortening the content — every contact point stays on."""
    size = RAIL_SIZE_STEPS[-1]
    for candidate in RAIL_SIZE_STEPS:
        if ty.text_width(T.CONTACT_RAIL, ty.font(ty.MEDIUM, candidate)) <= geo.content_width:
            size = candidate
            break

    ty.draw_cap_centred(
        draw,
        geo.margin,
        geo.contact_rail_y,
        T.CONTACT_RAIL,
        ty.font(ty.MEDIUM, size),
        R.foreground(surface) + (int(255 * T.RAIL_ALPHA),),
    )


def footer(draw: ImageDraw.ImageDraw, geo: Geometry, surface: str) -> None:
    colour = R.foreground(surface)
    draw.ellipse(
        [
            geo.margin,
            geo.footer_y - FOOTER_DOT_RADIUS,
            geo.margin + FOOTER_DOT_RADIUS * 2,
            geo.footer_y + FOOTER_DOT_RADIUS,
        ],
        fill=R.footer_dot(surface) + (255,),
    )
    ty.draw_cap_centred(
        draw,
        geo.margin + FOOTER_TEXT_GAP,
        geo.footer_y,
        T.HANDLE,
        ty.font(ty.REGULAR, T.SIZE_HANDLE),
        colour + (255,),
    )
