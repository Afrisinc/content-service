"""Drawable blocks. Every block measures itself so the layout engine can stack it."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from PIL import Image, ImageDraw

from ..brand import tokens as T
from ..brand.geometry import Geometry
from . import marks
from . import typography as ty

Rect = tuple[float, float, float, float]

DESCENDERS = frozenset("gjpqy,;")
SUB_SIZES: tuple[int, ...] = (T.SIZE_SUB, 26, 24, 22)
ROW_BODY_SIZES: tuple[int, ...] = (T.SIZE_ROW_BODY, 26, 24, 22)
ACTION_LINE_GAP = 60
ACTION_INDEX_WIDTH = 74
OPTICAL_LIFT = 0.025


def _descender_pad(text: str, size: int) -> float:
    return size * 0.12 if any(char in DESCENDERS for char in text) else 0.0


class Block(Protocol):
    def height(self, geo: Geometry) -> float: ...

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None: ...

    def bounds(self, top: float, geo: Geometry) -> list[Rect]: ...

    def plate_bounds(self, top: float, geo: Geometry) -> list[Rect]: ...


class TextBlock:
    """Unfilled type: it depends on whatever is behind it for contrast, so its
    bounds are what the surface has to be prepared for."""

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:  # pragma: no cover - overridden
        raise NotImplementedError

    def plate_bounds(self, top: float, geo: Geometry) -> list[Rect]:
        return self.bounds(top, geo)


class FilledBlock:
    """Carries its own background — a pill, a rule, a tinted row."""

    def plate_bounds(self, top: float, geo: Geometry) -> list[Rect]:
        return []


@dataclass
class EyebrowLabel(TextBlock):
    """Section name. Wide caps, no pill — a pill would spend the coral budget."""

    text: str
    colour: T.RGB
    size: int = T.SIZE_EYEBROW

    def height(self, geo: Geometry) -> float:
        return ty.cap_height(ty.font(ty.LIGHT, self.size))

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        fnt = ty.font(ty.LIGHT, self.size)
        offset, _ = ty.cap_metrics(fnt)
        ty.draw_tracked(
            draw, (geo.margin, top - offset), self.text, fnt, self.colour + (242,), self.size * 0.20
        )

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        fnt = ty.font(ty.LIGHT, self.size)
        width = ty.text_width(self.text, fnt, self.size * 0.20)
        return [(geo.margin, top, geo.margin + width, top + self.height(geo))]


@dataclass
class EyebrowPill(FilledBlock):
    text: str
    fill: T.RGB
    text_colour: T.RGB
    size: int = T.SIZE_PILL

    def height(self, geo: Geometry) -> float:
        return T.PILL_HEIGHT

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        fnt = ty.font(ty.BOLD, self.size)
        track = ty.tracking(self.size, caps=True)
        width = ty.text_width(self.text, fnt, track) + T.PILL_PADDING * 2
        draw.rounded_rectangle(
            [geo.margin, top, geo.margin + width, top + T.PILL_HEIGHT],
            radius=T.PILL_HEIGHT // 2,
            fill=self.fill + (255,),
        )
        ty.draw_cap_centred(
            draw,
            geo.margin + T.PILL_PADDING,
            top + T.PILL_HEIGHT / 2,
            self.text,
            fnt,
            self.text_colour + (255,),
            track,
        )

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        fnt = ty.font(ty.BOLD, self.size)
        text = ty.text_width(self.text, fnt, ty.tracking(self.size, caps=True))
        width = text + T.PILL_PADDING * 2
        # A filled pill supplies its own contrast; it only needs the overflow check.
        return [(geo.margin, top, geo.margin + width, top + T.PILL_HEIGHT)]


@dataclass
class Headline(TextBlock):
    lines: list[str]
    size: int
    colours: list[T.RGB]
    strike_line: int | None = None

    def leading(self) -> float:
        return ty.headline_leading(self.size, len(self.lines))

    def height(self, geo: Geometry) -> float:
        cap = ty.cap_height(ty.font(ty.BOLD, self.size))
        pad = _descender_pad(self.lines[-1], self.size)
        return (len(self.lines) - 1) * self.leading() + cap + pad

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        fnt = ty.font(ty.BOLD, self.size)
        offset, cap = ty.cap_metrics(fnt)
        track = ty.tracking(self.size)
        leading = self.leading()

        for index, line in enumerate(self.lines):
            colour = self.colours[min(index, len(self.colours) - 1)]
            x = geo.margin + ty.hang(line[0], self.size)
            y = top + index * leading
            ty.draw_tracked(draw, (x, y - offset), line, fnt, colour + (255,), track)

            if index == self.strike_line:
                self._strike(draw, line, fnt, x, y + cap, track)

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        fnt = ty.font(ty.BOLD, self.size)
        track = ty.tracking(self.size)
        cap = ty.cap_height(fnt)
        leading = self.leading()
        rects: list[Rect] = []

        for index, line in enumerate(self.lines):
            x = geo.margin + ty.hang(line[0], self.size)
            y = top + index * leading
            width = ty.text_width(line, fnt, track)
            rects.append((x, y, x + width, y + cap + _descender_pad(line, self.size)))

        return rects

    def _strike(
        self,
        draw: ImageDraw.ImageDraw,
        line: str,
        fnt,
        x: float,
        baseline: float,
        track: float,
    ) -> None:
        """Half the x-height above the baseline. A cap-height strike floats and reads as a fault."""
        centre = baseline - ty.x_height(fnt) / 2
        width = ty.text_width(line, fnt, track)
        thickness = max(4, round(self.size * 0.07))
        draw.line(
            [(x - 10, centre), (x + width - 20, centre)],
            fill=T.CORAL + (255,),
            width=thickness,
        )


@dataclass
class SubLine(TextBlock):
    """Shrinks a step at a time to hold the measure, and wraps only when shrinking
    is not enough. Sub-lines used to be drawn at a fixed size with no measurement,
    which is how copy ended up running off the right edge of a frame."""

    text: str
    colour: T.RGB
    size: int = T.SIZE_SUB
    alpha: float = 1.0

    def _fitted(self, geo: Geometry) -> tuple[int, list[str]]:
        sizes = tuple(step for step in SUB_SIZES if step <= self.size) or (self.size,)
        size = ty.fit_body_size(self.text, ty.REGULAR, sizes, geo.content_width)
        lines = ty.wrap_to_width(self.text, ty.REGULAR, size, geo.content_width)
        return size, lines

    def height(self, geo: Geometry) -> float:
        size, lines = self._fitted(geo)
        cap = ty.cap_height(ty.font(ty.REGULAR, size))
        leading = size * 1.32
        return (len(lines) - 1) * leading + cap + _descender_pad(lines[-1], size)

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        size, lines = self._fitted(geo)
        fnt = ty.font(ty.REGULAR, size)
        offset, _ = ty.cap_metrics(fnt)
        fill = self.colour + (int(255 * self.alpha),)
        leading = size * 1.32

        for index, line in enumerate(lines):
            draw.text((geo.margin, top + index * leading - offset), line, font=fnt, fill=fill)

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        size, lines = self._fitted(geo)
        fnt = ty.font(ty.REGULAR, size)
        cap = ty.cap_height(fnt)
        leading = size * 1.32
        rects: list[Rect] = []

        for index, line in enumerate(lines):
            y = top + index * leading
            width = ty.text_width(line, fnt, ty.tracking(size))
            rects.append((geo.margin, y, geo.margin + width, y + cap + _descender_pad(line, size)))

        return rects


@dataclass
class CoralRule(FilledBlock):
    def height(self, geo: Geometry) -> float:
        return T.CORAL_RULE_HEIGHT

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        marks.coral_rule(draw, geo, int(round(top)))

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        return [(geo.margin, top, geo.margin + T.CORAL_RULE_WIDTH, top + T.CORAL_RULE_HEIGHT)]


@dataclass
class Rows(FilledBlock):
    items: list[tuple[str, str]]
    gap: int = T.ROW_GAP

    def _measure(self, geo: Geometry) -> float:
        return geo.content_width - T.ROW_PADDING_X * 2

    def _body_size(self, geo: Geometry) -> int:
        """Sized by the widest body as drawn. Character count is not width — the
        longest string is often not the widest one."""
        measure = self._measure(geo)
        reference = ty.font(ty.REGULAR, T.SIZE_ROW_BODY)
        widest = max(
            (body for _, body in self.items),
            key=lambda body: ty.text_width(body, reference, ty.tracking(T.SIZE_ROW_BODY)),
            default="",
        )
        return ty.fit_body_size(widest, ty.REGULAR, ROW_BODY_SIZES, measure)

    def _row_height(self, geo: Geometry) -> float:
        title = ty.font(ty.BOLD, T.SIZE_ROW_TITLE)
        body = ty.font(ty.REGULAR, self._body_size(geo))
        return (
            T.ROW_PADDING_Y * 2
            + ty.cap_height(title)
            + T.ROW_TITLE_BODY_GAP
            + ty.cap_height(body)
        )

    def height(self, geo: Geometry) -> float:
        count = len(self.items)
        return count * self._row_height(geo) + (count - 1) * self.gap

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        row_height = self._row_height(geo)
        rects: list[Rect] = []
        y = top
        for _ in self.items:
            rects.append((geo.margin, y, geo.right_edge, y + row_height))
            y += row_height + self.gap
        return rects

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        title_font = ty.font(ty.BOLD, T.SIZE_ROW_TITLE)
        body_font = ty.font(ty.REGULAR, self._body_size(geo))
        title_offset, title_cap = ty.cap_metrics(title_font)
        body_offset, _ = ty.cap_metrics(body_font)
        row_height = self._row_height(geo)
        y = top

        for title, body in self.items:
            draw.rounded_rectangle(
                [geo.margin, y, geo.right_edge, y + row_height],
                radius=T.ROW_RADIUS,
                fill=T.TINT + (255,),
            )
            draw.rounded_rectangle(
                [geo.margin, y, geo.margin + T.ROW_BAR_WIDTH, y + row_height],
                radius=2,
                fill=T.AZURE + (255,),
            )
            ty.draw_tracked(
                draw,
                (geo.margin + T.ROW_PADDING_X, y + T.ROW_PADDING_Y - title_offset),
                title,
                title_font,
                T.INK + (255,),
                T.SIZE_ROW_TITLE * 0.02,
            )
            draw.text(
                (
                    geo.margin + T.ROW_PADDING_X,
                    y + T.ROW_PADDING_Y + title_cap + T.ROW_TITLE_BODY_GAP - body_offset,
                ),
                body,
                font=body_font,
                fill=T.BODY + (255,),
            )
            y += row_height + self.gap


@dataclass
class Actions(TextBlock):
    items: list[tuple[str, str]]
    colour: T.RGB
    gap: int = ACTION_LINE_GAP

    def height(self, geo: Geometry) -> float:
        cap = ty.cap_height(ty.font(ty.REGULAR, T.SIZE_SUB))
        return (len(self.items) - 1) * self.gap + cap + T.SIZE_SUB * 0.12

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        index_font = ty.font(ty.LIGHT, 26)
        text_font = ty.font(ty.REGULAR, T.SIZE_SUB)
        cap = ty.cap_height(text_font)

        for position, (index, text) in enumerate(self.items):
            centre = top + position * self.gap + cap / 2
            ty.draw_cap_centred(
                draw, geo.margin, centre, index, index_font, self.colour + (140,), 26 * 0.10
            )
            ty.draw_cap_centred(
                draw,
                geo.margin + ACTION_INDEX_WIDTH,
                centre,
                text,
                text_font,
                self.colour + (255,),
            )

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        fnt = ty.font(ty.REGULAR, T.SIZE_SUB)
        cap = ty.cap_height(fnt)
        rects: list[Rect] = []

        for position, (_, text) in enumerate(self.items):
            y = top + position * self.gap
            width = ACTION_INDEX_WIDTH + ty.text_width(text, fnt)
            rects.append((geo.margin, y, geo.margin + width, y + cap))

        return rects


@dataclass
class CtaPill(FilledBlock):
    text: str
    fill: T.RGB
    text_colour: T.RGB
    arrow: bool = True
    size: int = T.SIZE_CTA

    def height(self, geo: Geometry) -> float:
        return T.CTA_HEIGHT

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, top: float, geo: Geometry
    ) -> None:
        fnt = ty.font(ty.BOLD, self.size)
        offset, cap = ty.cap_metrics(fnt)
        text_width = fnt.getlength(self.text)
        width = text_width + T.CTA_PADDING * 2 + (44 if self.arrow else 0)

        draw.rounded_rectangle(
            [geo.margin, top, geo.margin + width, top + T.CTA_HEIGHT],
            radius=T.CTA_HEIGHT // 2,
            fill=self.fill + (255,),
        )
        centre = top + T.CTA_HEIGHT / 2
        draw.text(
            (geo.margin + T.CTA_PADDING, centre - cap / 2 - offset),
            self.text,
            font=fnt,
            fill=self.text_colour + (255,),
        )
        if self.arrow:
            marks.arrow(
                draw, geo.margin + T.CTA_PADDING + text_width + 20, centre, self.text_colour
            )

    def bounds(self, top: float, geo: Geometry) -> list[Rect]:
        fnt = ty.font(ty.BOLD, self.size)
        width = fnt.getlength(self.text) + T.CTA_PADDING * 2 + (44 if self.arrow else 0)
        return [(geo.margin, top, geo.margin + width, top + T.CTA_HEIGHT)]


@dataclass
class Stack:
    """A vertical run of blocks with explicit gaps, anchored inside the content band."""

    entries: list[tuple[Block, float]] = field(default_factory=list)

    def add(self, block: Block, gap_before: float = 0.0) -> Stack:
        self.entries.append((block, gap_before if self.entries else 0.0))
        return self

    def height(self, geo: Geometry) -> float:
        return sum(block.height(geo) + gap for block, gap in self.entries)

    def top_for(self, anchor: str, geo: Geometry) -> float:
        total = self.height(geo)
        if anchor == "bottom":
            return geo.band_bottom - total
        if anchor == "centre":
            # Optical centre sits above the geometric one.
            return geo.band_top + (geo.band_height - total) / 2 - geo.height * OPTICAL_LIFT
        return geo.band_top

    def draw(
        self, draw: ImageDraw.ImageDraw, overlay: Image.Image, anchor: str, geo: Geometry
    ) -> None:
        y = self.top_for(anchor, geo)
        for block, gap in self.entries:
            y += gap
            block.draw(draw, overlay, y, geo)
            y += block.height(geo)

    def _walk(self, anchor: str, geo: Geometry, plates_only: bool) -> list[Rect]:
        rects: list[Rect] = []
        y = self.top_for(anchor, geo)
        for block, gap in self.entries:
            y += gap
            rects.extend(block.plate_bounds(y, geo) if plates_only else block.bounds(y, geo))
            y += block.height(geo)
        return rects

    def bounds(self, anchor: str, geo: Geometry) -> list[Rect]:
        """Every drawn element, for the overflow check."""
        return self._walk(anchor, geo, plates_only=False)

    def plate_bounds(self, anchor: str, geo: Geometry) -> list[Rect]:
        """Only the unfilled text, which is what the surface has to be prepared for."""
        return self._walk(anchor, geo, plates_only=True)
