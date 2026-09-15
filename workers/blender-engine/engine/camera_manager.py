from __future__ import annotations

import math

from .blender_env import bpy, mathutils
from .contracts import Camera, CameraMove, Shot, Vector3

SHOT_DISTANCE = {
    "extreme_wide": 24.0,
    "wide": 14.0,
    "medium_wide": 9.0,
    "medium": 6.0,
    "medium_close_up": 4.0,
    "close_up": 2.4,
    "extreme_close_up": 1.2,
    "over_the_shoulder": 3.2,
    "pov": 0.6,
}

SHOT_HEIGHT = {
    "extreme_wide": 6.0,
    "wide": 3.2,
    "medium_wide": 2.0,
    "medium": 1.7,
    "medium_close_up": 1.6,
    "close_up": 1.6,
    "extreme_close_up": 1.6,
    "over_the_shoulder": 1.7,
    "pov": 1.65,
}

# A subject's origin sits at its feet, so aiming straight at it tilts the camera
# into the ground. These are the heights a camera actually frames a person at.
AIM_HEIGHT = {
    "extreme_wide": 1.00,
    "wide": 1.10,
    "medium_wide": 1.15,
    "medium": 1.20,
    "medium_close_up": 1.28,
    "close_up": 1.34,
    "extreme_close_up": 1.38,
    "over_the_shoulder": 1.30,
    "pov": 1.55,
}

REFRAMING_MOVES = {"dolly", "truck", "crane", "tracking"}

MOVE_AXIS = {
    "forward": (0.0, 1.0, 0.0),
    "backward": (0.0, -1.0, 0.0),
    "left": (-1.0, 0.0, 0.0),
    "right": (1.0, 0.0, 0.0),
    "up": (0.0, 0.0, 1.0),
    "down": (0.0, 0.0, -1.0),
}

EASING = {
    "linear": "LINEAR",
    "ease_in": "SINE",
    "ease_out": "SINE",
    "ease_in_out": "SINE",
}


def aim_point(camera: Camera, focus: Vector3) -> Vector3:
    return Vector3(
        x=focus.x,
        y=focus.y,
        z=focus.z + AIM_HEIGHT.get(camera.shot_size, 1.2),
    )


def default_position(camera: Camera, focus: Vector3) -> Vector3:
    distance = SHOT_DISTANCE.get(camera.shot_size, 6.0)
    height = SHOT_HEIGHT.get(camera.shot_size, 1.7)
    angle = math.radians(35.0 if camera.shot_size != "pov" else 0.0)
    return Vector3(
        x=focus.x + distance * math.sin(angle),
        y=focus.y - distance * math.cos(angle),
        z=focus.z + height,
    )


def _aim(camera_object, target: tuple[float, float, float]) -> None:
    m = mathutils()
    direction = m.Vector(target) - camera_object.location
    camera_object.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_shot_camera(shot: Shot, focus: Vector3, start_frame: int, end_frame: int):
    modules = bpy()
    data = modules.data.cameras.new(name=f"cam_{shot.shot_id}")
    data.lens = shot.camera.lens_mm
    data.dof.use_dof = shot.camera.depth_of_field

    camera_object = modules.data.objects.new(name=f"cam_{shot.shot_id}", object_data=data)
    modules.context.collection.objects.link(camera_object)

    look_at = shot.camera.look_at or aim_point(shot.camera, focus)
    position = shot.camera.position or default_position(shot.camera, look_at)
    camera_object.location = position.as_tuple()
    _aim(camera_object, look_at.as_tuple())

    if shot.camera.depth_of_field:
        data.dof.focus_distance = max(
            0.1,
            math.dist(camera_object.location, look_at.as_tuple()),
        )
        data.dof.aperture_fstop = 2.8

    _apply_movement(camera_object, data, shot.camera.movement, look_at, start_frame, end_frame)
    return camera_object


def _apply_movement(
    camera_object,
    camera_data,
    movement: CameraMove,
    look_at: Vector3,
    start_frame: int,
    end_frame: int,
) -> None:
    if movement.type == "static" or movement.amount == 0:
        camera_object.keyframe_insert(data_path="location", frame=start_frame)
        return

    modules = bpy()
    m = mathutils()

    camera_object.keyframe_insert(data_path="location", frame=start_frame)
    camera_object.keyframe_insert(data_path="rotation_euler", frame=start_frame)

    if movement.type == "zoom":
        camera_data.keyframe_insert(data_path="lens", frame=start_frame)
        camera_data.lens = max(8.0, camera_data.lens + movement.amount * 10.0)
        camera_data.keyframe_insert(data_path="lens", frame=end_frame)
        return

    if movement.type in {"pan", "tilt"}:
        axis = 2 if movement.type == "pan" else 0
        rotation = list(camera_object.rotation_euler)
        rotation[axis] += math.radians(movement.amount * 5.0)
        camera_object.rotation_euler = rotation
        camera_object.keyframe_insert(data_path="rotation_euler", frame=end_frame)
        return

    if movement.type == "orbit":
        radius = math.dist(camera_object.location, look_at.as_tuple())
        angle = math.radians(movement.amount * 15.0)
        current = m.Vector(camera_object.location) - m.Vector(look_at.as_tuple())
        rotated = m.Matrix.Rotation(angle, 3, "Z") @ current
        camera_object.location = m.Vector(look_at.as_tuple()) + rotated
        _aim(camera_object, look_at.as_tuple())
        camera_object.keyframe_insert(data_path="location", frame=end_frame)
        camera_object.keyframe_insert(data_path="rotation_euler", frame=end_frame)
        return

    axis = MOVE_AXIS.get(movement.direction or "forward", (0.0, 1.0, 0.0))
    camera_object.location = (
        camera_object.location[0] + axis[0] * movement.amount,
        camera_object.location[1] + axis[1] * movement.amount,
        camera_object.location[2] + axis[2] * movement.amount,
    )
    # A translating camera keeps its subject framed; only pan and tilt are pure
    # rotations, and only handheld is meant to drift.
    if movement.type in REFRAMING_MOVES:
        _aim(camera_object, look_at.as_tuple())
        camera_object.keyframe_insert(data_path="rotation_euler", frame=end_frame)
    camera_object.keyframe_insert(data_path="location", frame=end_frame)

    for curve in (camera_object.animation_data.action.fcurves if camera_object.animation_data else []):
        for point in curve.keyframe_points:
            point.interpolation = EASING.get(movement.easing, "SINE")
            if movement.easing == "ease_in":
                point.easing = "EASE_IN"
            elif movement.easing == "ease_out":
                point.easing = "EASE_OUT"
            else:
                point.easing = "EASE_IN_OUT"

    modules.context.view_layer.update()


def bind_camera_to_marker(camera_object, frame: int, name: str) -> None:
    modules = bpy()
    marker = modules.context.scene.timeline_markers.new(name, frame=frame)
    marker.camera = camera_object
