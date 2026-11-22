from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw

from ...brand import tokens as T
from ...brand.geometry import Geometry
from ...errors import LayoutOverflowError
from ...luminance import Rect
from ...schema import SlideSpec
from .. import plate, surfaces
from .. import typography as ty
from ..slide import RenderedFrame
from .base import FitReport, Template, flatten, layer, white_on
from .rich import Paragraph

DEFAULT_LEAD = "BREAKING NEWS"
HEADLINE_SIZES = (56, 48, 42, 38, 34)
PARAGRAPH_SIZES = (28, 26, 24, 22)
PARAGRAPH_WIDTH = 760
PARAGRAPH_LEADING = 1.32
HEADLINE_LEADING = 1.18
LEAD_CAP = 95
LEAD_SUB_RATIO = 0.64
LEAD_WORD_GAP = 22
INSET_EXTRA = 24
PILL_HEIGHT = 34
PILL_TO_LEAD = 18
LEAD_TO_BODY = 56
GROUP_GAP = 34
RULE_HEIGHT = 2
RULE_SHARE = 0.78
URL_SHARE = 0.903
URL_TO_BODY = 88
URL_SIZE = 22
SHADE_STRENGTH = 0.97
SHADE_RAMP_START = 380
SHADE_RAMP_END = 30
DATE_SIZE = 28
DATE_YEAR = re.compile(r"^(.*\S)\s+(\d{4})$")


@dataclass(frozen=True)
class Plan:
    inset: int
    pill_top: int
    lead_words: list[tuple[str, int, float]]
    lead_top: float
    lead_bottom: float
    url_y: float
    headline: list[str]
    headline_size: int
    headline_height: float
    paragraph: Paragraph | None
    group_top: float
    group_height: float
    limit: float
    fits: bool


def _cap(fnt) -> float:
    return ty.cap_height(fnt)


def _lead_words(text: str, inset: int, top: float, max_width: float) -> tuple[list, float]:
    words = text.upper().split()
    head, tail = words[0], " ".join(words[1:])
    size = round(LEAD_CAP / 0.7)
    while size > 40 and ty.text_width(head, ty.display_font(ty.CONDENSED_ITALIC, size)) > max_width:
        size -= 2
    placed = [(head, size, top)]
    bottom = top + _cap(ty.display_font(ty.CONDENSED_ITALIC, size))
    if tail:
        sub = round(size * LEAD_SUB_RATIO)
        sub_top = bottom + LEAD_WORD_GAP
        placed.append((tail, sub, sub_top))
        bottom = sub_top + _cap(ty.display_font(ty.CONDENSED_ITALIC, sub))
    return placed, bottom


def _shade(image: Image.Image, start: float, end: float) -> Image.Image:
    rows = np.arange(image.height, dtype=np.float32)
    ramp = np.clip((rows - start) / max(end - start, 1.0), 0.0, 1.0)
    alpha = SHADE_STRENGTH * ramp * ramp * (3 - 2 * ramp)
    mask = Image.fromarray(
        (np.repeat(alpha[:, None], image.width, axis=1) * 255).astype("uint8"), "L"
    )
    return Image.composite(Image.new("RGB", image.size, T.BREAKING_SHADE), image, mask)


def _date_lines(text: str) -> list[tuple[str, str]]:
    match = DATE_YEAR.match(text)
    if match:
        return [(match.group(1), ty.BOLD), (match.group(2), ty.LIGHT)]
    return [(text, ty.BOLD)]


class Breaking(Template):
    name = "news.breaking"
    title = "Breaking"
    description = (
        "Live-news poster: red LIVE tag, giant condensed BREAKING NEWS, centred caps headline "
        "and standfirst on a warm dark fade. Portrait 1080×1350 reads best."
    )

    def plan(self, spec: SlideSpec, geo: Geometry) -> Plan:
        inset = geo.margin + INSET_EXTRA
        content = geo.width - 2 * inset
        pill_top = geo.header_y - 10
        lead_top = pill_top + PILL_HEIGHT + PILL_TO_LEAD
        words, lead_bottom = _lead_words(
            spec.lead or DEFAULT_LEAD, inset, lead_top, 0.62 * geo.width
        )

        url_y = min(round(geo.height * URL_SHARE), geo.safe_bottom - 60)
        body_bottom = url_y - URL_TO_BODY
        limit = body_bottom - (lead_bottom + LEAD_TO_BODY)

        headline = [line.upper() for line in spec.headline]
        headline_size = next(
            (
                size
                for size in HEADLINE_SIZES
                if all(ty.fits(line, ty.BOLD, size, content) for line in headline)
            ),
            HEADLINE_SIZES[-1],
        )
        headline_fits = all(ty.fits(line, ty.BOLD, headline_size, content) for line in headline)
        cap = _cap(ty.font(ty.BOLD, headline_size))
        headline_height = (len(headline) - 1) * headline_size * HEADLINE_LEADING + cap

        text = spec.subs[0] if spec.subs else None
        chosen: Paragraph | None = None
        group_height = headline_height
        fits = headline_fits and headline_height <= limit
        for size in PARAGRAPH_SIZES if text else ():
            chosen = Paragraph.fit(text, size, min(PARAGRAPH_WIDTH, content), PARAGRAPH_LEADING)
            group_height = headline_height + GROUP_GAP * 2 + RULE_HEIGHT + chosen.height()
            fits = headline_fits and group_height <= limit
            if fits:
                break

        return Plan(
            inset,
            pill_top,
            words,
            lead_top,
            lead_bottom,
            url_y,
            headline,
            headline_size,
            headline_height,
            chosen,
            body_bottom - group_height,
            group_height,
            limit,
            fits,
        )

    def layout(self, spec: SlideSpec, geo: Geometry):
        plan = self.plan(spec, geo)
        if not plan.fits:
            raise LayoutOverflowError(
                f"the headline and standfirst need {plan.group_height:.0f}px but only "
                f"{plan.limit:.0f}px sit between the title and the footer — shorten the copy"
            )
        return plan

    def report(self, spec: SlideSpec, geo: Geometry) -> FitReport:
        plan = self.plan(spec, geo)
        return FitReport(plan.headline_size, plan.group_height, plan.limit, plan.fits)

    def _pill(self, spec: SlideSpec, draw: ImageDraw.ImageDraw, plan: Plan) -> None:
        if spec.eyebrow is None:
            return
        fnt = ty.display_font(ty.CONDENSED_ITALIC, 24)
        text_width = ty.text_width(spec.eyebrow.text, fnt, 1.5)
        claim = spec.eyebrow.kind == "claim"
        fill, text_colour = (T.CORAL, T.WHITE) if claim else (T.WHITE, T.INK)
        right = plan.inset + 34 + text_width + 16
        draw.rounded_rectangle(
            [plan.inset, plan.pill_top, right, plan.pill_top + PILL_HEIGHT],
            radius=PILL_HEIGHT // 2,
            fill=fill + (255,),
        )
        centre = plan.pill_top + PILL_HEIGHT / 2
        draw.ellipse(
            [plan.inset + 14, centre - 5, plan.inset + 24, centre + 5], fill=T.INK + (255,)
        )
        ty.draw_cap_centred(
            draw, plan.inset + 34, centre, spec.eyebrow.text, fnt, text_colour + (255,), 1.5
        )

    def _date(self, spec: SlideSpec, draw: ImageDraw.ImageDraw, geo: Geometry, plan: Plan) -> Rect:
        lines = _date_lines(spec.dateline or "")
        right = geo.width - plan.inset
        top = plan.pill_top + 4
        widest = 0.0
        for index, (text, weight) in enumerate(lines):
            fnt = ty.font(weight, DATE_SIZE)
            y = top + index * DATE_SIZE * 1.4
            ty.draw_cap_centred(
                draw, right, y + _cap(fnt) / 2, text, fnt, T.WHITE + (255,), align_right=True
            )
            widest = max(widest, ty.text_width(text, fnt))
        return (right - widest, top, right, top + (len(lines) - 1) * DATE_SIZE * 1.4 + DATE_SIZE)

    def _rule(self, overlay: Image.Image, geo: Geometry, y: float) -> None:
        width = round(geo.width * RULE_SHARE)
        t = np.linspace(0.0, 1.0, width)
        alpha = (np.sin(np.pi * t) ** 0.55 * 255).astype("uint8")
        strip = np.zeros((RULE_HEIGHT, width, 4), dtype="uint8")
        strip[..., :3] = T.CORAL
        strip[..., 3] = alpha
        overlay.alpha_composite(
            Image.fromarray(strip, "RGBA"), ((geo.width - width) // 2, round(y))
        )

    def _url(self, draw: ImageDraw.ImageDraw, geo: Geometry, plan: Plan) -> None:
        name, _, tld = T.SITE.rpartition(".")
        parts = [("www.", ty.LIGHT), (name, ty.BOLD), (f".{tld}", ty.LIGHT)]
        track = URL_SIZE * 0.22
        total = sum(
            ty.text_width(text, ty.font(weight, URL_SIZE), track) + track for text, weight in parts
        )
        x = (geo.width - total) / 2
        for text, weight in parts:
            fnt = ty.font(weight, URL_SIZE)
            ty.draw_cap_centred(draw, x, plan.url_y, text, fnt, T.WHITE + (255,), track)
            x += ty.text_width(text, fnt, track) + track

    def render(self, spec: SlideSpec, geo: Geometry) -> RenderedFrame:
        plan = self.layout(spec, geo)
        content = geo.width - 2 * plan.inset

        base = surfaces.scrim(
            surfaces.prepare_photo(spec.photo or "", geo, focus=spec.photo_focus), top_only=True
        )
        base = _shade(base, plan.group_top - SHADE_RAMP_START, plan.group_top - SHADE_RAMP_END)

        overlay, draw = layer(geo)
        lead_rects: list[Rect] = []
        for word, size, top in plan.lead_words:
            fnt = ty.display_font(ty.CONDENSED_ITALIC, size)
            lead_rects.append(
                (plan.inset, top, plan.inset + ty.text_width(word, fnt), top + _cap(fnt))
            )

        date_rect = self._date(spec, ImageDraw.Draw(Image.new("RGBA", (1, 1))), geo, plan)
        plate_rects = [*lead_rects, date_rect]
        base = plate.apply(base, geo, plate_rects)

        self._pill(spec, draw, plan)
        for word, size, top in plan.lead_words:
            fnt = ty.display_font(ty.CONDENSED_ITALIC, size)
            offset, _ = ty.cap_metrics(fnt)
            ty.draw_tracked(
                draw, (plan.inset - 4, top - offset), word, fnt, T.WHITE + (255,), -size * 0.01
            )
        self._date(spec, draw, geo, plan)

        y = plan.group_top
        rects: list[Rect] = []
        lead = plan.headline_size * HEADLINE_LEADING
        fnt = ty.font(ty.BOLD, plan.headline_size)
        for line in plan.headline:
            width = ty.text_width(line, fnt, ty.tracking(plan.headline_size))
            x = (geo.width - width) / 2
            offset, cap = ty.cap_metrics(fnt)
            ty.draw_tracked(
                draw, (x, y - offset), line, fnt, T.WHITE + (255,), ty.tracking(plan.headline_size)
            )
            rects.append((x, y, x + width, y + cap))
            y += lead

        if plan.paragraph is not None:
            rule_y = plan.group_top + plan.headline_height + GROUP_GAP
            self._rule(overlay, geo, rule_y)
            left = (geo.width - min(PARAGRAPH_WIDTH, content)) / 2
            top = rule_y + RULE_HEIGHT + GROUP_GAP
            width = min(PARAGRAPH_WIDTH, content)
            plan.paragraph.draw(draw, left, top, width, T.WHITE + (255,), centre=True)
            rects.extend(plan.paragraph.bounds(left, top, width, centre=True))

        self._url(draw, geo, plan)
        contrast = white_on(base, plate_rects + rects)
        base = surfaces.grain(base)

        return RenderedFrame(flatten(base, overlay), plan.headline_size, rects, contrast)
