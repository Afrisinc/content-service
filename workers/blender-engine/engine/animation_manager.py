from __future__ import annotations

import math

from .assets import AssetLibrary
from .blender_env import bpy
from .contracts import AnimationCommand

LOCOMOTION = {"walk": 1.4, "run": 3.6}

MOVE_AXIS = {
    "forward": (0.0, 1.0, 0.0),
    "backward": (0.0, -1.0, 0.0),
    "left": (-1.0, 0.0, 0.0),
    "right": (1.0, 0.0, 0.0),
    "up": (0.0, 0.0, 1.0),
    "down": (0.0, 0.0, -1.0),
}

FACING_YAW = {
    "forward": 0.0,
    "backward": math.pi,
    "left": math.pi / 2,
    "right": -math.pi / 2,
    "clockwise": -math.pi / 2,
    "counter_clockwise": math.pi / 2,
}


class AnimationManager:
    def __init__(self, library: AssetLibrary, fps: float) -> None:
        self.library = library
        self.fps = fps
        self.actions: dict[str, str] = {}

    def _clip(self, action: str):
        modules = bpy()
        if action in self.actions:
            return modules.data.actions.get(self.actions[action])

        path = self.library.animation_clip(action)
        if not path.exists():
            return None

        before = set(modules.data.actions.keys())
        with modules.data.libraries.load(str(path), link=False) as (source, target):
            target.actions = list(source.actions)
        new_names = sorted(set(modules.data.actions.keys()) - before)
        if not new_names:
            return None

        self.actions[action] = new_names[0]
        return modules.data.actions[new_names[0]]

    def apply(self, obj, command: AnimationCommand, shot_start_frame: int) -> None:
        start = shot_start_frame + int(round(command.start_time * self.fps))
        end = start + max(1, int(round(command.duration * self.fps)))

        clip = self._clip(command.action)
        if clip is not None:
            self._push_strip(obj, clip, command, start, end)

        if command.action in LOCOMOTION:
            self._translate(obj, command, start, end)
        elif command.action == "turn" and command.direction:
            self._rotate(obj, command, start, end)

    def _push_strip(self, obj, clip, command: AnimationCommand, start: int, end: int) -> None:
        if obj.animation_data is None:
            obj.animation_data_create()

        track = obj.animation_data.nla_tracks.new()
        track.name = f"{command.action}_{start}"
        strip = track.strips.new(name=command.action, start=start, action=clip)
        strip.frame_end = end
        strip.scale = max(0.1, (end - start) / max(1.0, clip.frame_range[1] - clip.frame_range[0]))
        strip.repeat = 1 if not command.loop else max(1.0, (end - start) / max(1.0, clip.frame_range[1]))
        strip.blend_type = "REPLACE"
        strip.extrapolation = "HOLD"

    def _translate(self, obj, command: AnimationCommand, start: int, end: int) -> None:
        axis = MOVE_AXIS.get(command.direction or "forward", (0.0, 1.0, 0.0))
        distance = LOCOMOTION[command.action] * command.speed * command.duration

        obj.keyframe_insert(data_path="location", frame=start)
        obj.location = (
            obj.location[0] + axis[0] * distance,
            obj.location[1] + axis[1] * distance,
            obj.location[2] + axis[2] * distance,
        )
        obj.keyframe_insert(data_path="location", frame=end)

    def _rotate(self, obj, command: AnimationCommand, start: int, end: int) -> None:
        obj.keyframe_insert(data_path="rotation_euler", frame=start)
        rotation = list(obj.rotation_euler)
        rotation[2] += FACING_YAW.get(command.direction or "left", math.pi / 2)
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", frame=end)

    def face(self, obj, direction: str, frame: int) -> None:
        rotation = list(obj.rotation_euler)
        rotation[2] = FACING_YAW.get(direction, rotation[2])
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
