"""Printer's marks and the logo watermark — the quiet layer under the type."""

from __future__ import annotations

from functools import lru_cache

from PIL import Image, ImageDraw

from ..brand import rules as R
from ..brand import tokens as T
from ..brand.geometry import Geometry
from ..config import settings
from ..errors import LogoMissingError


@lru_cache(maxsize=1)
def _logo() -> Image.Image:
    path = settings.logo_path
    if not path.is_file():
        raise LogoMissingError(f"logo not found: {path}")
    return Image.open(path).convert("RGBA")


def verify_logo() -> None:
    _logo()


@lru_cache(maxsize=16)
def tinted_logo(size: int, colour: T.RGB, alpha: float) -> Image.Image:
    mark = _logo().resize((size, size), Image.LANCZOS)
    solid = Image.new("RGBA", (size, size), colour + (0,))
    solid.putalpha(mark.split()[3].point(lambda v: int(v * alpha)))
    return solid


def masthead(draw: ImageDraw.ImageDraw, geo: Geometry, colour: T.RGB) -> None:
    draw.line(
        [(0, geo.masthead_y), (geo.width, geo.masthead_y)],
        fill=colour + (int(255 * T.MASTHEAD_ALPHA),),
        width=1,
    )


def registration_marks(draw: ImageDraw.ImageDraw, geo: Geometry, colour: T.RGB) -> None:
    """They frame the usable area — on a story that is the safe zone, not the canvas."""
    left, top, right, bottom = geo.mark_box
    arm = T.REG_MARK_ARM
    fill = colour + (int(255 * T.REG_MARK_ALPHA),)
    corners = (
        (left, top, 1, 1),
        (right, top, -1, 1),
        (left, bottom, 1, -1),
        (right, bottom, -1, -1),
    )
    for x, y, dx, dy in corners:
        draw.line([(x, y), (x + dx * arm, y)], fill=fill, width=T.REG_MARK_WIDTH)
        draw.line([(x, y), (x, y + dy * arm)], fill=fill, width=T.REG_MARK_WIDTH)


def watermark(overlay: Image.Image, geo: Geometry, surface: str) -> None:
    spec = R.watermark(surface)
    if spec is None:
        return
    colour, alpha = spec
    overlay.alpha_composite(tinted_logo(geo.watermark_size, colour, alpha), geo.watermark_pos)


def coral_rule(draw: ImageDraw.ImageDraw, geo: Geometry, y: int) -> None:
    draw.rectangle(
        [geo.margin, y, geo.margin + T.CORAL_RULE_WIDTH, y + T.CORAL_RULE_HEIGHT],
        fill=T.CORAL + (255,),
    )


def arrow(draw: ImageDraw.ImageDraw, x: float, centre_y: float, colour: T.RGB) -> None:
    """Poppins has no U+2192, so the arrow is drawn rather than typed."""
    fill = colour + (255,)
    draw.line([(x, centre_y), (x + 26, centre_y)], fill=fill, width=4)
    draw.line(
        [(x + 17, centre_y - 9), (x + 26, centre_y), (x + 17, centre_y + 9)],
        fill=fill,
        width=4,
        joint="curve",
    )
