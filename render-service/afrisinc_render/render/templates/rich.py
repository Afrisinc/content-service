from __future__ import annotations

from dataclasses import dataclass

from PIL import ImageDraw

from ...luminance import Rect
from .. import typography as ty

Segment = tuple[str, bool]
Line = list[Segment]

DESCENDER_PAD = 0.12


def parse_runs(text: str) -> list[Segment]:
    segments: list[Segment] = []
    for index, chunk in enumerate(text.split("**")):
        segments.extend((word, index % 2 == 1) for word in chunk.split())
    return segments


def line_width(line: Line, size: int, regular: str = ty.LIGHT) -> float:
    plain, bold = ty.font(regular, size), ty.font(ty.BOLD, size)
    space = plain.getlength(" ")
    words = sum(ty.text_width(word, bold if heavy else plain) for word, heavy in line)
    return words + space * (len(line) - 1)


def wrap_runs(
    segments: list[Segment], size: int, width: float, regular: str = ty.LIGHT
) -> list[Line]:
    lines: list[Line] = []
    current: Line = []
    for segment in segments:
        trial = [*current, segment]
        if current and line_width(trial, size, regular) > width:
            lines.append(current)
            current = [segment]
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


@dataclass(frozen=True)
class Paragraph:
    lines: list[Line]
    size: int
    leading: float
    regular: str = ty.LIGHT

    @classmethod
    def fit(
        cls, text: str, size: int, width: float, leading_ratio: float, regular: str = ty.LIGHT
    ) -> Paragraph:
        lines = wrap_runs(parse_runs(text), size, width, regular)
        return cls(lines, size, size * leading_ratio, regular)

    def height(self) -> float:
        cap = ty.cap_height(ty.font(self.regular, self.size))
        return (len(self.lines) - 1) * self.leading + cap + self.size * DESCENDER_PAD

    def widest(self) -> float:
        return max(line_width(line, self.size, self.regular) for line in self.lines)

    def _x(self, left: float, width: float, line: Line, centre: bool) -> float:
        if not centre:
            return left
        return left + (width - line_width(line, self.size, self.regular)) / 2

    def draw(
        self,
        draw: ImageDraw.ImageDraw,
        left: float,
        top: float,
        width: float,
        fill: tuple[int, ...],
        *,
        centre: bool = False,
    ) -> None:
        plain, bold = ty.font(self.regular, self.size), ty.font(ty.BOLD, self.size)
        offset, _ = ty.cap_metrics(plain)
        space = plain.getlength(" ")

        for index, line in enumerate(self.lines):
            x = self._x(left, width, line, centre)
            y = top + index * self.leading - offset
            for word, heavy in line:
                fnt = bold if heavy else plain
                draw.text((x, y), word, font=fnt, fill=fill)
                x += fnt.getlength(word) + space

    def bounds(self, left: float, top: float, width: float, *, centre: bool = False) -> list[Rect]:
        cap = ty.cap_height(ty.font(self.regular, self.size))
        rects: list[Rect] = []
        for index, line in enumerate(self.lines):
            x = self._x(left, width, line, centre)
            y = top + index * self.leading
            rects.append((x, y, x + line_width(line, self.size, self.regular), y + cap))
        return rects


def wrap_plain(text: str, fnt, width: float) -> list[str]:
    lines: list[str] = []
    for block in text.split("\n"):
        words = block.split()
        if not words:
            continue
        current = words[0]
        for word in words[1:]:
            if ty.text_width(f"{current} {word}", fnt) <= width:
                current = f"{current} {word}"
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines
