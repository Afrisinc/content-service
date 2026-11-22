from __future__ import annotations

from pathlib import Path

from .blender_env import bpy
from .contracts import Shot


def audio_supported() -> bool:
    """Some Blender builds, including the bpy PyPI wheel, ship without Audaspace.
    The master audio is muxed by FFmpeg downstream, so scene audio is optional."""
    options = getattr(bpy().app, "build_options", None)
    return bool(getattr(options, "audaspace", False))


def ensure_sequencer():
    modules = bpy()
    scene = modules.context.scene
    if scene.sequence_editor is None:
        scene.sequence_editor_create()
    return scene.sequence_editor


def add_track(name: str, path: Path, start_frame: int, channel: int, volume: float = 1.0):
    if not audio_supported():
        return None
    editor = ensure_sequencer()
    try:
        strip = editor.sequences.new_sound(name=name, filepath=str(path), channel=channel, frame_start=start_frame)
    except RuntimeError:
        return None
    strip.volume = volume
    return strip


def attach_shot_audio(shot: Shot, manifest: dict[str, str], root: Path, start_frame: int, fps: float) -> int:
    if not audio_supported():
        return 0

    attached = 0
    channel = 2

    for track_id in shot.audio.narration_track_ids + shot.audio.dialogue_track_ids:
        mapped = manifest.get(track_id)
        if not mapped:
            continue
        path = Path(mapped)
        if not path.is_absolute():
            path = root / path
        if not path.exists():
            continue
        if add_track(f"{shot.shot_id}_{track_id}", path, start_frame, channel) is None:
            continue
        channel += 1
        attached += 1

    for cue in shot.audio.sfx:
        mapped = manifest.get(cue.name)
        if not mapped:
            continue
        path = Path(mapped)
        if not path.is_absolute():
            path = root / path
        if not path.exists():
            continue
        strip = add_track(
            f"{shot.shot_id}_sfx_{cue.name}",
            path,
            start_frame + int(round(cue.at * fps)),
            channel,
            volume=0.7,
        )
        if strip is None:
            continue
        channel += 1
        attached += 1

    return attached
