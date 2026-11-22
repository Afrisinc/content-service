from __future__ import annotations

from pathlib import Path

from .contracts import RenderJob, Scene


class SceneValidationError(ValueError):
    pass


def validate_scene(scene: Scene) -> list[str]:
    problems: list[str] = []

    seen_shots: set[str] = set()
    for shot in scene.shots:
        if shot.shot_id in seen_shots:
            problems.append(f"duplicate shot_id {shot.shot_id}")
        seen_shots.add(shot.shot_id)

        if shot.duration_seconds < 0.4:
            problems.append(f"{shot.shot_id} is shorter than the 0.4s minimum")

        for character in shot.characters:
            locomotion = [
                animation
                for animation in character.animations
                if animation.action in {"walk", "run", "jump", "fall"}
            ]
            for first in range(len(locomotion)):
                for second in range(first + 1, len(locomotion)):
                    a, b = locomotion[first], locomotion[second]
                    if a.start_time < b.start_time + b.duration and b.start_time < a.start_time + a.duration:
                        problems.append(
                            f"{character.character_id} has overlapping locomotion in {shot.shot_id}"
                        )

        if scene.animation_mode == "2d" and shot.camera.position is not None:
            problems.append(f"{shot.shot_id} sets a 3D camera position in a 2D scene")

    return problems


def validate_manifest(job: RenderJob, root: Path) -> list[str]:
    problems: list[str] = []
    required: set[str] = {job.scene.environment_id}

    for shot in job.scene.shots:
        for character in shot.characters:
            required.add(character.character_id)
        for prop in shot.props:
            required.add(prop.prop_id)

    for identifier in sorted(required):
        path = job.asset_manifest.get(identifier)
        if not path:
            problems.append(f"no asset mapped for {identifier}")
            continue
        if not (root / path).exists():
            problems.append(f"asset file missing for {identifier}: {path}")

    for shot in job.scene.shots:
        for track_id in shot.audio.narration_track_ids + shot.audio.dialogue_track_ids:
            path = job.audio_manifest.get(track_id)
            if not path:
                problems.append(f"no audio mapped for {track_id}")
            elif not (root / path).exists():
                problems.append(f"audio file missing for {track_id}: {path}")

    return problems


def assert_renderable(job: RenderJob, root: Path) -> None:
    problems = validate_scene(job.scene) + validate_manifest(job, root)
    if problems:
        raise SceneValidationError("; ".join(problems))
