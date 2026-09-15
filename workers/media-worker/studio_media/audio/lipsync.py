from __future__ import annotations

import json
import subprocess
from pathlib import Path

from ..config import CONFIG
from ..contracts import SegmentTiming

VISEME_SHAPES = {"REST", "A", "B", "C", "D", "E", "F", "G", "H", "X"}

LETTER_TO_SHAPE = {
    "A": "D", "E": "C", "I": "C", "O": "E", "U": "F",
    "B": "B", "M": "B", "P": "B",
    "F": "G", "V": "G",
    "L": "H", "T": "H", "D": "H", "N": "H",
    "W": "F", "R": "F",
}


def from_rhubarb(audio_path: Path, dialogue: str | None = None) -> list[dict]:
    command = [CONFIG.rhubarb, "-f", "json", "--machineReadable", str(audio_path)]
    dialogue_file: Path | None = None
    if dialogue:
        dialogue_file = audio_path.with_suffix(".txt")
        dialogue_file.write_text(dialogue)
        command.extend(["-d", str(dialogue_file)])

    completed = subprocess.run(command, capture_output=True, text=True, timeout=900)
    if completed.returncode != 0:
        raise RuntimeError(f"rhubarb exited {completed.returncode}: {completed.stderr[-2000:]}")

    cues = json.loads(completed.stdout).get("mouthCues", [])
    visemes: list[dict] = []
    for index, cue in enumerate(cues):
        start = float(cue["start"])
        end = float(cue.get("end", cues[index + 1]["start"] if index + 1 < len(cues) else start + 0.1))
        shape = str(cue["value"]).upper()
        visemes.append({"shape": shape if shape in VISEME_SHAPES else "REST", "start": start, "end": end})
    return visemes


def from_segments(segments: list[SegmentTiming]) -> list[dict]:
    visemes: list[dict] = []
    for segment in segments:
        for word in segment.words:
            letters = [character for character in word.word.upper() if character.isalpha()]
            if not letters:
                continue
            span = max(0.02, (word.end - word.start) / len(letters))
            for position, letter in enumerate(letters):
                start = word.start + position * span
                visemes.append(
                    {
                        "shape": LETTER_TO_SHAPE.get(letter, "A"),
                        "start": round(start, 4),
                        "end": round(start + span, 4),
                    }
                )
            visemes.append({"shape": "REST", "start": round(word.end, 4), "end": round(word.end + 0.05, 4)})
    return visemes


def build(audio_path: Path, segments: list[SegmentTiming], dialogue: str | None = None) -> list[dict]:
    try:
        return from_rhubarb(audio_path, dialogue)
    except (FileNotFoundError, RuntimeError, subprocess.TimeoutExpired):
        return from_segments(segments)
