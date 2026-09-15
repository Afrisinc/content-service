from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

VISEME_SHAPES = ["REST", "A", "B", "C", "D", "E", "F", "G", "H", "X"]

SHAPE_TO_KEY = {
    "REST": "mouth_rest",
    "A": "mouth_a",
    "B": "mouth_mbp",
    "C": "mouth_e",
    "D": "mouth_ah",
    "E": "mouth_o",
    "F": "mouth_u",
    "G": "mouth_fv",
    "H": "mouth_l",
    "X": "mouth_rest",
}

PHONEME_TO_SHAPE = {
    "AA": "D", "AE": "A", "AH": "A", "AO": "E", "AW": "E", "AY": "A",
    "B": "B", "CH": "C", "D": "C", "DH": "H", "EH": "A", "ER": "F",
    "EY": "A", "F": "G", "G": "C", "HH": "A", "IH": "C", "IY": "C",
    "JH": "C", "K": "C", "L": "H", "M": "B", "N": "C", "NG": "C",
    "OW": "E", "OY": "E", "P": "B", "R": "F", "S": "C", "SH": "C",
    "T": "C", "TH": "H", "UH": "F", "UW": "F", "V": "G", "W": "F",
    "Y": "C", "Z": "C", "ZH": "C",
}


@dataclass(frozen=True)
class Viseme:
    shape: str
    start: float
    end: float


def from_rhubarb(audio_path: Path, dialogue_path: Path | None, executable: str = "rhubarb") -> list[Viseme]:
    command = [executable, "-f", "json", "--machineReadable", str(audio_path)]
    if dialogue_path is not None:
        command.extend(["-d", str(dialogue_path)])

    completed = subprocess.run(command, capture_output=True, text=True, check=True)
    payload = json.loads(completed.stdout)
    cues = payload.get("mouthCues", [])

    visemes: list[Viseme] = []
    for index, cue in enumerate(cues):
        start = float(cue["start"])
        end = float(cue.get("end", cues[index + 1]["start"] if index + 1 < len(cues) else start + 0.1))
        shape = cue["value"].upper()
        visemes.append(Viseme(shape=shape if shape in VISEME_SHAPES else "REST", start=start, end=end))
    return visemes


def from_word_timings(segments: list[dict]) -> list[Viseme]:
    visemes: list[Viseme] = []
    for segment in segments:
        for word in segment.get("words", []):
            start = float(word["start"])
            end = float(word["end"])
            text = str(word.get("word", "")).strip().upper()
            if not text:
                continue
            letters = [character for character in text if character.isalpha()]
            if not letters:
                continue
            step = (end - start) / len(letters)
            for position, letter in enumerate(letters):
                shape = PHONEME_TO_SHAPE.get(letter, "A")
                visemes.append(
                    Viseme(shape=shape, start=start + position * step, end=start + (position + 1) * step)
                )
            visemes.append(Viseme(shape="REST", start=end, end=end + 0.04))
    return visemes


def apply_to_object(obj, visemes: list[Viseme], fps: float, offset_seconds: float = 0.0) -> int:
    applied = 0
    meshes = [obj, *getattr(obj, "children_recursive", [])]

    for viseme in visemes:
        frame = int(round((viseme.start + offset_seconds) * fps))
        key_name = SHAPE_TO_KEY.get(viseme.shape, "mouth_rest")
        for mesh in meshes:
            shape_keys = getattr(getattr(mesh, "data", None), "shape_keys", None)
            if not shape_keys:
                continue
            for key in shape_keys.key_blocks:
                if not key.name.startswith("mouth_"):
                    continue
                key.value = 1.0 if key.name == key_name else 0.0
                key.keyframe_insert(data_path="value", frame=frame)
                applied += 1
    return applied
