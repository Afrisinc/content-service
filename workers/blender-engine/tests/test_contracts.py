from __future__ import annotations

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.assets import parse_ref
from engine.contracts import Scene
from engine.validators import validate_scene


def shot(shot_id: str, index: int, duration: float, **overrides) -> dict:
    base = {
        "shot_id": shot_id,
        "index": index,
        "duration_seconds": duration,
        "camera": {"shot_size": "medium", "lens_mm": 50},
        "characters": [],
        "props": [],
        "audio": {"narration_track_ids": [], "dialogue_track_ids": [], "sfx": []},
        "transition_out": "cut",
    }
    base.update(overrides)
    return base


def scene(**overrides) -> dict:
    base = {
        "scene_id": "scene_001",
        "index": 0,
        "duration_seconds": 6.0,
        "environment_id": "village_v1",
        "animation_mode": "3d",
        "shots": [shot("shot_000", 0, 3.0), shot("shot_001", 1, 3.0)],
    }
    base.update(overrides)
    return base


def test_scene_accepts_matching_durations():
    parsed = Scene.model_validate(scene())
    assert parsed.duration_seconds == 6.0
    assert len(parsed.shots) == 2


def test_scene_rejects_duration_mismatch():
    with pytest.raises(ValidationError, match="shot durations total"):
        Scene.model_validate(scene(duration_seconds=20.0))


def test_scene_rejects_out_of_order_shot_index():
    with pytest.raises(ValidationError, match="does not match position"):
        Scene.model_validate(scene(shots=[shot("shot_000", 5, 3.0), shot("shot_001", 1, 3.0)]))


def test_scene_rejects_animation_past_shot_end():
    speaking = shot(
        "shot_000",
        0,
        3.0,
        characters=[
            {
                "character_id": "david_v1",
                "emotion": "curious",
                "animations": [
                    {"character_id": "david_v1", "action": "walk", "start_time": 2.0, "duration": 5.0}
                ],
            }
        ],
    )
    with pytest.raises(ValidationError, match="runs past"):
        Scene.model_validate(scene(shots=[speaking, shot("shot_001", 1, 3.0)]))


def test_validator_flags_overlapping_locomotion():
    overlapping = shot(
        "shot_000",
        0,
        3.0,
        characters=[
            {
                "character_id": "david_v1",
                "emotion": "neutral",
                "animations": [
                    {"character_id": "david_v1", "action": "walk", "start_time": 0.0, "duration": 2.0},
                    {"character_id": "david_v1", "action": "run", "start_time": 1.0, "duration": 1.5},
                ],
            }
        ],
    )
    problems = validate_scene(Scene.model_validate(scene(shots=[overlapping, shot("shot_001", 1, 3.0)])))
    assert any("overlapping locomotion" in problem for problem in problems)


def test_validator_flags_3d_camera_in_2d_scene():
    positioned = shot("shot_000", 0, 3.0, camera={"shot_size": "wide", "lens_mm": 35, "position": {"x": 1, "y": 2, "z": 3}})
    problems = validate_scene(
        Scene.model_validate(scene(animation_mode="2d", shots=[positioned, shot("shot_001", 1, 3.0)]))
    )
    assert any("3D camera position" in problem for problem in problems)


def test_validator_flags_short_shot():
    problems = validate_scene(
        Scene.model_validate(scene(duration_seconds=3.2, shots=[shot("shot_000", 0, 0.2), shot("shot_001", 1, 3.0)]))
    )
    assert any("0.4s minimum" in problem for problem in problems)


def test_parse_ref_extracts_slug_and_version():
    ref = parse_ref("grandmother_house_v3")
    assert ref.slug == "grandmother_house"
    assert ref.version == 3
    assert ref.identifier == "grandmother_house_v3"


def test_parse_ref_rejects_unversioned_id():
    with pytest.raises(ValueError, match="not a versioned asset id"):
        parse_ref("grandmother_house")


def test_render_scene_parses_args_from_a_direct_python_invocation():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "render_scene", Path(__file__).resolve().parents[1] / "scripts/render_scene.py"
    )
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except RuntimeError:
        pytest.skip("bpy is not installed in this environment")

    args = module.parse_args(["scripts/render_scene.py", "--job", "j.json", "--assets", "a", "--output", "o.mp4"])
    assert args.job == "j.json"
    assert args.output == "o.mp4"


def test_render_scene_parses_args_from_a_blender_cli_invocation():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "render_scene", Path(__file__).resolve().parents[1] / "scripts/render_scene.py"
    )
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except RuntimeError:
        pytest.skip("bpy is not installed in this environment")

    args = module.parse_args(
        ["blender", "--background", "--python", "render_scene.py", "--", "--job", "j.json", "--assets", "a", "--output", "o.mp4"]
    )
    assert args.job == "j.json"


def test_default_camera_position_returns_a_vector_not_a_tuple():
    from engine.camera_manager import default_position
    from engine.contracts import Camera, Vector3

    position = default_position(Camera(shot_size="wide", lens_mm=35), Vector3())
    assert isinstance(position, Vector3)
    assert position.as_tuple() == (position.x, position.y, position.z)


def test_tighter_shots_place_the_camera_closer():
    from engine.camera_manager import default_position
    from engine.contracts import Camera, Vector3

    wide = default_position(Camera(shot_size="extreme_wide", lens_mm=24), Vector3())
    close = default_position(Camera(shot_size="close_up", lens_mm=85), Vector3())
    assert abs(close.y) < abs(wide.y)


def test_camera_sits_above_the_focus_point():
    from engine.camera_manager import default_position
    from engine.contracts import Camera, Vector3

    assert default_position(Camera(shot_size="medium", lens_mm=50), Vector3()).z > 0


def test_camera_aims_at_subject_height_not_the_ground():
    from engine.camera_manager import aim_point
    from engine.contracts import Camera, Vector3

    aim = aim_point(Camera(shot_size="medium", lens_mm=50), Vector3())
    assert aim.z > 1.0


def test_closer_shots_aim_higher_up_the_subject():
    from engine.camera_manager import aim_point
    from engine.contracts import Camera, Vector3

    wide = aim_point(Camera(shot_size="extreme_wide", lens_mm=24), Vector3())
    close = aim_point(Camera(shot_size="extreme_close_up", lens_mm=100), Vector3())
    assert close.z > wide.z


def test_aim_point_follows_the_subject_position():
    from engine.camera_manager import aim_point
    from engine.contracts import Camera, Vector3

    aim = aim_point(Camera(shot_size="medium", lens_mm=50), Vector3(x=3.0, y=-2.0, z=0.5))
    assert (aim.x, aim.y) == (3.0, -2.0)
    assert aim.z > 1.5


def test_translating_moves_reframe_but_rotations_do_not():
    from engine.camera_manager import REFRAMING_MOVES

    assert {"dolly", "truck", "crane", "tracking"} <= REFRAMING_MOVES
    assert not REFRAMING_MOVES & {"pan", "tilt", "handheld", "static", "zoom"}
