"""Per-format canvas geometry. Everything positional is derived from here, never hardcoded."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Final

POST: Final[str] = "post"
STORY: Final[str] = "story"
SINGLE: Final[str] = "single"


@dataclass(frozen=True)
class Geometry:
    name: str
    width: int
    height: int
    margin: int

    header_y: int
    masthead_y: int
    band_top: int
    band_bottom: int
    contact_rail_y: int
    footer_y: int

    watermark_size: int
    watermark_pos: tuple[int, int]

    # Registration marks frame the usable area, which on a story is the safe zone
    # rather than the canvas: left, top, right, bottom.
    mark_box: tuple[int, int, int, int]

    filename_prefix: str

    # Vertical extent the platform guarantees is not covered by its own chrome.
    safe_top: int
    safe_bottom: int

    @property
    def right_edge(self) -> int:
        return self.width - self.margin

    @property
    def content_width(self) -> int:
        return self.width - 2 * self.margin

    @property
    def band_height(self) -> int:
        return self.band_bottom - self.band_top

    @property
    def rail_clearance(self) -> int:
        """Air between the last line of the stack and the contact rail. Type that ends
        one baseline above the rail reads as a collision even when nothing overlaps."""
        return self.contact_rail_y - self.band_bottom

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def size(self) -> tuple[int, int]:
        return self.width, self.height


# 1080 × 1080. The measured layout the carousels already use.
POST_GEOMETRY: Final[Geometry] = Geometry(
    name=POST,
    width=1080,
    height=1080,
    margin=96,
    header_y=128,
    masthead_y=200,
    band_top=240,
    band_bottom=850,
    contact_rail_y=906,
    footer_y=968,
    watermark_size=560,
    watermark_pos=(620, 640),
    mark_box=(52, 52, 1028, 1028),
    filename_prefix="slide",
    safe_top=0,
    safe_bottom=1080,
)

# 1080 × 1920. Instagram and Facebook overlay their own UI on the top 250px and the
# bottom 340px, so nothing that has to be read is placed there.
STORY_GEOMETRY: Final[Geometry] = Geometry(
    name=STORY,
    width=1080,
    height=1920,
    margin=96,
    header_y=320,
    masthead_y=392,
    band_top=432,
    band_bottom=1376,
    contact_rail_y=1432,
    footer_y=1496,
    watermark_size=700,
    watermark_pos=(620, 1296),
    mark_box=(56, 256, 1024, 1576),
    filename_prefix="story",
    safe_top=250,
    safe_bottom=1580,
)

# A standalone square frame. Same canvas as a carousel slide — what differs is that
# it stands alone, so it carries the whole message rather than one beat of a sequence.
SINGLE_GEOMETRY: Final[Geometry] = replace(
    POST_GEOMETRY, name=SINGLE, filename_prefix="main"
)

FORMATS: Final[dict[str, Geometry]] = {
    POST: POST_GEOMETRY,
    STORY: STORY_GEOMETRY,
    SINGLE: SINGLE_GEOMETRY,
}


def geometry_for(name: str) -> Geometry:
    try:
        return FORMATS[name]
    except KeyError as exc:
        raise ValueError(f"unknown format '{name}', expected one of {sorted(FORMATS)}") from exc
