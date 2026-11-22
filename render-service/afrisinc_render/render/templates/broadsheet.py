from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, ImageDraw

from ...brand import tokens as T
from ...brand.geometry import Geometry
from ...errors import LayoutOverflowError
from ...schema import SlideSpec
from .. import marks, surfaces
from .. import typography as ty
from ..slide import RenderedFrame
from .base import FitReport, Template, flatten, layer
from .rich import Paragraph, wrap_plain

EDGE_SHARE = 0.041
RIGHT_PAD = 42
LOGO_SIZE = 52
LOGO_PAD = 28
COLUMN_PAD = 34
PHOTO_SHARE = 0.515
MASTHEAD_TOP = 16
MASTHEAD_HEIGHT = 117
MASTHEAD_PAD = 38
MASTHEAD_SIZES = tuple(range(100, 52, -4))
META_WIDTH = 226
META_SIZE = 19
META_GAP = 20
HAIRLINE_Y = 158
PHOTO_TOP = 184
COLUMN_TOP_PAD = 38
LEAD_SIZES = tuple(range(150, 44, -4))
HEADLINE_SIZES = (60, 56, 52, 48, 44, 40, 36)
HEADLINE_LEADING = 1.04
LEAD_TO_HEADLINE = 36
HEADLINE_TO_RULE = 32
RULE_TO_BODY = 34
PARAGRAPH_SIZES = (28, 26, 24, 22)
PARAGRAPH_LEADING = 1.42
PARAGRAPH_GAP = 40
CLOSER_SIZES = (72, 66, 60, 56, 52, 48, 44, 40)
CLOSER_LEADING = 1.12
CLOSER_LAST_RATIO = 0.8
CLOSER_BOTTOM_PAD = 52
BODY_TO_CLOSER = 46


@dataclass(frozen=True)
class Plan:
    left: int
    right: int
    column: int
    photo_right: int
    lead: tuple[str, int, float] | None
    headline: list[str]
    headline_size: int
    headline_top: float
    rule_y: float
    paragraphs: list[Paragraph]
    paragraph_tops: list[float]
    closer: list[tuple[str, int]]
    closer_top: float
    needed: float
    limit: float
    fits: bool


def _serif(size: int):
    return ty.display_font(ty.SERIF, size, ty.SERIF_BLACK)


def _serif_bold(size: int):
    return ty.display_font(ty.SERIF, size, ty.SERIF_BOLD)


def _cap(fnt) -> float:
    return ty.cap_height(fnt)


def _closer_lines(text: str, size: int, width: float) -> list[tuple[str, int]]:
    blocks = [block for block in text.split("\n") if block.strip()]
    lines: list[tuple[str, int]] = []
    for index, block in enumerate(blocks):
        last = index == len(blocks) - 1 and len(blocks) > 1
        line_size = round(size * CLOSER_LAST_RATIO) if last else size
        lines.extend((line, line_size) for line in wrap_plain(block, _serif_bold(line_size), width))
    return lines


def _closer_height(lines: list[tuple[str, int]]) -> float:
    if not lines:
        return 0.0
    pitch = sum(size * CLOSER_LEADING for _, size in lines[:-1])
    return pitch + _cap(_serif_bold(lines[-1][1])) + lines[-1][1] * 0.2


class Broadsheet(Template):
    name = "news.broadsheet"
    title = "Broadsheet"
    description = (
        "Newspaper front page: masthead with red and black blocks, tall photograph on the left, "
        "serif name, condensed headline, two paragraphs and a serif closing line on the right."
    )

    def plan(self, spec: SlideSpec, geo: Geometry) -> Plan:
        left = round(geo.width * EDGE_SHARE)
        right = geo.width - RIGHT_PAD
        photo_right = round(geo.width * PHOTO_SHARE)
        column_left = photo_right + COLUMN_PAD
        column = right - COLUMN_PAD - column_left + COLUMN_PAD
        top = PHOTO_TOP + COLUMN_TOP_PAD
        bottom = geo.height - CLOSER_BOTTOM_PAD

        y = float(top)
        lead = None
        if spec.lead:
            text = spec.lead.upper()
            size = next(
                (s for s in LEAD_SIZES if ty.text_width(text, _serif(s)) <= column), LEAD_SIZES[-1]
            )
            lead = (text, size, y)
            y += _cap(_serif(size)) + LEAD_TO_HEADLINE

        headline = [line.upper() for line in spec.headline]
        headline_size = next(
            (
                s
                for s in HEADLINE_SIZES
                if all(
                    ty.text_width(line, ty.display_font(ty.CONDENSED_BOLD, s)) <= column
                    for line in headline
                )
            ),
            HEADLINE_SIZES[-1],
        )
        headline_fits = all(
            ty.text_width(line, ty.display_font(ty.CONDENSED_BOLD, headline_size)) <= column
            for line in headline
        )
        headline_top = y
        pitch = headline_size * HEADLINE_LEADING
        y += (len(headline) - 1) * pitch + _cap(ty.display_font(ty.CONDENSED_BOLD, headline_size))

        rule_y = y + HEADLINE_TO_RULE
        body_top = rule_y + RULE_TO_BODY

        closer: list[tuple[str, int]] = []
        closer_top = float(bottom)
        for size in CLOSER_SIZES if spec.closing else ():
            closer = _closer_lines(spec.closing, size, column)
            if len(closer) <= 4:
                break
        closer_height = _closer_height(closer)
        closer_top = bottom - closer_height

        best: tuple[list[Paragraph], list[float], float] | None = None
        for size in PARAGRAPH_SIZES:
            paragraphs = [
                Paragraph.fit(text, size, column, PARAGRAPH_LEADING, ty.REGULAR)
                for text in spec.subs
            ]
            tops: list[float] = []
            cursor = body_top
            for paragraph in paragraphs:
                tops.append(cursor)
                cursor += paragraph.height() + PARAGRAPH_GAP
            end = cursor - PARAGRAPH_GAP if paragraphs else body_top
            best = (paragraphs, tops, end)
            gap = BODY_TO_CLOSER if closer else 0
            if end + gap <= closer_top:
                break

        paragraphs, tops, end = best
        needed = (end - top) + (BODY_TO_CLOSER + closer_height if closer else 0)
        limit = bottom - top
        fits = headline_fits and needed <= limit
        return Plan(
            left,
            right,
            column,
            photo_right,
            lead,
            headline,
            headline_size,
            headline_top,
            rule_y,
            paragraphs,
            tops,
            closer,
            closer_top,
            needed,
            limit,
            fits,
        )

    def layout(self, spec: SlideSpec, geo: Geometry):
        plan = self.plan(spec, geo)
        if not plan.fits:
            raise LayoutOverflowError(
                f"the column needs {plan.needed:.0f}px but holds {plan.limit:.0f}px, "
                "or a headline line is wider than the column — shorten the copy"
            )
        return plan

    def report(self, spec: SlideSpec, geo: Geometry) -> FitReport:
        plan = self.plan(spec, geo)
        return FitReport(plan.headline_size, plan.needed, plan.limit, plan.fits)

    def _masthead(self, spec: SlideSpec, draw: ImageDraw.ImageDraw, plan: Plan) -> None:
        label = spec.eyebrow.text if spec.eyebrow else "NEWS"
        head, _, tail = label.partition(" ")
        max_width = plan.right - META_WIDTH - META_GAP - plan.left
        size = MASTHEAD_SIZES[-1]
        for candidate in MASTHEAD_SIZES:
            fnt = _serif(candidate)
            total = ty.text_width(head, fnt) + 2 * MASTHEAD_PAD
            total += ty.text_width(tail, fnt) + 2 * MASTHEAD_PAD if tail else 0
            if total <= max_width:
                size = candidate
                break
        fnt = _serif(size)
        centre = MASTHEAD_TOP + MASTHEAD_HEIGHT / 2
        x = plan.left
        for text, fill in ((head, T.BROADSHEET_RED), (tail, T.NEWSPRINT_INK)):
            if not text:
                continue
            width = ty.text_width(text, fnt) + 2 * MASTHEAD_PAD
            draw.rectangle(
                [x, MASTHEAD_TOP, x + width, MASTHEAD_TOP + MASTHEAD_HEIGHT], fill=fill + (255,)
            )
            ty.draw_cap_centred(draw, x + MASTHEAD_PAD, centre, text, fnt, T.WHITE + (255,))
            x += width

    def _meta(self, spec: SlideSpec, draw: ImageDraw.ImageDraw, plan: Plan) -> None:
        fnt = ty.font(ty.REGULAR, META_SIZE)
        track = META_SIZE * 0.06
        ink = T.NEWSPRINT_INK + (255,)
        y = MASTHEAD_TOP + 8
        for block in (spec.section or "").upper().split("\n")[:2]:
            for line in wrap_plain(block, fnt, META_WIDTH):
                ty.draw_cap_centred(
                    draw, plan.right, y + 10, line, fnt, ink, track, align_right=True
                )
                y += 26
        rule_y = max(y + 8, MASTHEAD_TOP + 66)
        draw.line([(plan.right - META_WIDTH, rule_y), (plan.right, rule_y)], fill=ink, width=2)
        date = (spec.dateline or "").upper()
        size = META_SIZE
        while (
            size > 13 and ty.text_width(date, ty.font(ty.REGULAR, size), size * 0.06) > META_WIDTH
        ):
            size -= 1
        ty.draw_cap_centred(
            draw,
            plan.right,
            rule_y + 36,
            date,
            ty.font(ty.REGULAR, size),
            ink,
            size * 0.06,
            align_right=True,
        )

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        plan = self.layout(spec, geo)
        column_left = plan.photo_right + COLUMN_PAD
        ink = T.NEWSPRINT_INK + (255,)

        base = surfaces.grain(Image.new("RGB", geo.size, T.PAPER), T.GRAIN_AMOUNT_WHITE).convert(
            "RGBA"
        )
        photo = surfaces.prepare_photo(
            spec.photo or "",
            geo,
            focus=spec.photo_focus,
            size=(plan.photo_right, geo.height - PHOTO_TOP),
        )
        base.paste(photo, (0, PHOTO_TOP))
        base.alpha_composite(
            marks.tinted_logo(LOGO_SIZE, T.WHITE, 0.92),
            (LOGO_PAD, geo.height - LOGO_SIZE - LOGO_PAD),
        )

        overlay, draw = layer(geo)
        self._masthead(spec, draw, plan)
        self._meta(spec, draw, plan)
        draw.line([(plan.left, HAIRLINE_Y), (plan.right, HAIRLINE_Y)], fill=ink, width=2)

        if plan.lead:
            text, size, top = plan.lead
            fnt = _serif(size)
            offset, _ = ty.cap_metrics(fnt)
            ty.draw_tracked(draw, (column_left, top - offset), text, fnt, ink, -size * 0.01)

        condensed = ty.display_font(ty.CONDENSED_BOLD, plan.headline_size)
        offset, _ = ty.cap_metrics(condensed)
        for index, line in enumerate(plan.headline):
            y = plan.headline_top + index * plan.headline_size * HEADLINE_LEADING
            ty.draw_tracked(draw, (column_left, y - offset), line, condensed, ink)

        draw.line(
            [(column_left, plan.rule_y), (plan.right - COLUMN_PAD + COLUMN_PAD, plan.rule_y)],
            fill=ink,
            width=2,
        )

        for paragraph, top in zip(plan.paragraphs, plan.paragraph_tops, strict=True):
            paragraph.draw(draw, column_left, top, plan.column, ink)

        y = plan.closer_top
        for line, size in plan.closer:
            fnt = _serif_bold(size)
            offset, cap = ty.cap_metrics(fnt)
            ty.draw_tracked(draw, (column_left, y - offset), line, fnt, ink)
            y += size * CLOSER_LEADING

        return RenderedFrame(flatten(base, overlay), plan.headline_size, [], [])
