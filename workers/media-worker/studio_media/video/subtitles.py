from __future__ import annotations

from ..contracts import SegmentTiming, WordTiming


def _timestamp(seconds: float, separator: str = ",") -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{separator}{millis:03d}"


def _ass_timestamp(seconds: float) -> str:
    total_cs = max(0, int(round(seconds * 100)))
    hours, remainder = divmod(total_cs, 360_000)
    minutes, remainder = divmod(remainder, 6_000)
    secs, centis = divmod(remainder, 100)
    return f"{hours:d}:{minutes:02d}:{secs:02d}.{centis:02d}"


def wrap(text: str, max_chars: int, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word

    if current:
        lines.append(current)

    if len(lines) <= max_lines:
        return lines

    merged = lines[: max_lines - 1]
    merged.append(" ".join(lines[max_lines - 1 :]))
    return merged


def build_cues(
    segments: list[SegmentTiming], max_chars: int = 42, max_lines: int = 2
) -> list[dict]:
    cues: list[dict] = []

    for segment in segments:
        if not segment.words:
            cues.append(
                {"start": segment.start, "end": segment.end, "lines": wrap(segment.text, max_chars, max_lines)}
            )
            continue

        buffer: list[WordTiming] = []
        for word in segment.words:
            candidate = " ".join([item.word for item in buffer] + [word.word])
            if len(candidate) > max_chars * max_lines and buffer:
                cues.append(
                    {
                        "start": buffer[0].start,
                        "end": buffer[-1].end,
                        "lines": wrap(" ".join(item.word for item in buffer), max_chars, max_lines),
                    }
                )
                buffer = []
            buffer.append(word)

        if buffer:
            cues.append(
                {
                    "start": buffer[0].start,
                    "end": buffer[-1].end,
                    "lines": wrap(" ".join(item.word for item in buffer), max_chars, max_lines),
                }
            )

    return cues


def to_srt(cues: list[dict]) -> str:
    blocks: list[str] = []
    for index, cue in enumerate(cues, start=1):
        blocks.append(
            f"{index}\n{_timestamp(cue['start'])} --> {_timestamp(cue['end'])}\n" + "\n".join(cue["lines"])
        )
    return "\n\n".join(blocks) + "\n"


def to_vtt(cues: list[dict]) -> str:
    blocks = ["WEBVTT", ""]
    for cue in cues:
        blocks.append(f"{_timestamp(cue['start'], '.')} --> {_timestamp(cue['end'], '.')}")
        blocks.extend(cue["lines"])
        blocks.append("")
    return "\n".join(blocks)


def to_ass(cues: list[dict], width: int = 1080, height: int = 1920) -> str:
    header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic,"
        " BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Burn,Arial,{int(height * 0.045)},&H00FFFFFF,&H00000000,&H80000000,-1,0,1,4,2,2,80,80,{int(height * 0.12)},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for cue in cues:
        text = "\\N".join(cue["lines"]).replace("\n", "")
        header.append(f"Dialogue: 0,{_ass_timestamp(cue['start'])},{_ass_timestamp(cue['end'])},Burn,,0,0,0,,{text}")
    return "\n".join(header) + "\n"


RENDERERS = {"srt": to_srt, "vtt": to_vtt, "ass": to_ass}
