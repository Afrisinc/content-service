from __future__ import annotations

import json
from pathlib import Path

from . import audio_manager, camera_manager, lip_sync
from .animation_manager import AnimationManager
from .assets import AssetLibrary
from .blender_env import blender_version, bpy
from .character_manager import CharacterManager
from .contracts import Lighting, RenderJob, Vector3
from .environment_manager import EnvironmentManager
from .lighting_manager import apply_lighting

DEFAULT_LIGHTING = Lighting(preset="natural", intensity=3.0, colour_kelvin=5600, shadows=True)


def reset_scene() -> None:
    modules = bpy()
    modules.ops.wm.read_factory_settings(use_empty=True)


def load_template(template_path: Path | None) -> None:
    modules = bpy()
    if template_path and template_path.exists():
        modules.ops.wm.open_mainfile(filepath=str(template_path))
    else:
        reset_scene()


class SceneBuilder:
    def __init__(self, job: RenderJob, asset_root: Path, template_path: Path | None = None) -> None:
        self.job = job
        self.asset_root = asset_root
        self.template_path = template_path
        self.library = AssetLibrary(asset_root)
        self.characters = CharacterManager(self.library, job.asset_manifest)
        self.environment = EnvironmentManager(self.library, job.asset_manifest)
        self.animation = AnimationManager(self.library, job.settings.fps)
        self.report: dict[str, object] = {}

    def build(self) -> dict[str, object]:
        load_template(self.template_path)

        modules = bpy()
        scene = modules.context.scene
        fps = self.job.settings.fps
        scene.render.fps = int(round(fps))
        scene.frame_start = 1

        total_frames = max(1, int(round(self.job.scene.duration_seconds * fps)))
        scene.frame_end = total_frames

        if self.job.scene.animation_mode == "2d":
            layers = self.environment.build_parallax(self.job.scene)
            self.report["layers"] = layers
        else:
            self.environment.load_environment(self.job.scene)

        apply_lighting(self.job.scene.lighting or DEFAULT_LIGHTING)

        cursor = 1
        cameras: list[str] = []
        visemes_applied = 0
        audio_strips = 0

        for shot in self.job.scene.shots:
            shot_frames = max(1, int(round(shot.duration_seconds * fps)))
            shot_end = cursor + shot_frames - 1

            if shot.lighting is not None:
                apply_lighting(shot.lighting, collection_name=f"lights_{shot.shot_id}")

            focus = Vector3()
            for position, character in enumerate(shot.characters):
                obj = self.characters.place(
                    character, cursor, default=Vector3(x=position * 1.6 - 0.8, y=0.0, z=0.0)
                )
                self.characters.apply_expression(character.character_id, character.emotion, cursor)
                if character.facing:
                    self.animation.face(obj, character.facing, cursor)
                for command in character.animations:
                    self.animation.apply(obj, command, cursor)
                if position == 0 and character.position:
                    focus = character.position

                if character.speaking_track_id:
                    visemes_applied += self._apply_lip_sync(obj, character.speaking_track_id, cursor, fps)

            for prop in shot.props:
                self.environment.load_prop(prop, cursor)

            camera = camera_manager.create_shot_camera(shot, focus, cursor, shot_end)
            camera_manager.bind_camera_to_marker(camera, cursor, f"mk_{shot.shot_id}")
            cameras.append(camera.name)

            audio_strips += audio_manager.attach_shot_audio(
                shot, self.job.audio_manifest, self.asset_root, cursor, fps
            )

            cursor = shot_end + 1

        scene.camera = modules.data.objects.get(cameras[0]) if cameras else scene.camera

        self.report.update(
            {
                "frames": total_frames,
                "cameras": cameras,
                "characters": sorted(self.characters.loaded.keys()),
                "props": sorted(self.environment.props.keys()),
                "audio_strips": audio_strips,
                "visemes": visemes_applied,
                "blender_version": blender_version(),
            }
        )
        return self.report

    def _apply_lip_sync(self, obj, track_id: str, start_frame: int, fps: float) -> int:
        mapped = self.job.audio_manifest.get(f"{track_id}.visemes")
        if not mapped:
            return 0

        path = Path(mapped)
        if not path.is_absolute():
            path = self.asset_root / path
        if not path.exists():
            return 0

        payload = json.loads(path.read_text())
        visemes = [
            lip_sync.Viseme(shape=item["shape"], start=float(item["start"]), end=float(item["end"]))
            for item in payload.get("visemes", [])
        ]
        return lip_sync.apply_to_object(obj, visemes, fps, offset_seconds=(start_frame - 1) / fps)
