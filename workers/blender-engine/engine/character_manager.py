from __future__ import annotations

from pathlib import Path

from .assets import AssetLibrary, parse_ref
from .blender_env import bpy
from .contracts import ShotCharacter, Vector3

EXPRESSION_KEYS = {
    "neutral": {},
    "happy": {"mouth_smile": 0.9, "brow_raise": 0.3, "eye_squint": 0.35},
    "sad": {"mouth_frown": 0.8, "brow_inner_up": 0.7, "eye_droop": 0.4},
    "angry": {"brow_down": 0.9, "mouth_tight": 0.7, "nose_flare": 0.4},
    "scared": {"brow_raise": 0.9, "eye_wide": 0.95, "mouth_open": 0.5},
    "surprised": {"brow_raise": 1.0, "eye_wide": 0.85, "mouth_open": 0.7},
    "curious": {"brow_raise": 0.45, "head_tilt": 0.3},
    "determined": {"brow_down": 0.5, "mouth_tight": 0.5},
    "tired": {"eye_droop": 0.7, "brow_inner_up": 0.3},
    "excited": {"mouth_smile": 1.0, "brow_raise": 0.6, "eye_wide": 0.5},
}


class CharacterManager:
    def __init__(self, library: AssetLibrary, manifest: dict[str, str]) -> None:
        self.library = library
        self.manifest = manifest
        self.loaded: dict[str, str] = {}

    def load(self, character_id: str):
        modules = bpy()
        if character_id in self.loaded:
            return modules.data.objects.get(self.loaded[character_id])

        path = self.library.resolve(character_id, self.manifest)
        before = set(modules.data.objects.keys())

        with modules.data.libraries.load(str(path), link=False) as (source, target):
            target.objects = list(source.objects)

        collection = modules.data.collections.new(f"character_{character_id}")
        modules.context.scene.collection.children.link(collection)

        root = None
        for name in set(modules.data.objects.keys()) - before:
            obj = modules.data.objects[name]
            collection.objects.link(obj)
            if obj.type == "ARMATURE" and root is None:
                root = obj
            elif root is None and obj.parent is None:
                root = obj

        if root is None:
            raise FileNotFoundError(f"{path} contained no usable object for {character_id}")

        root.name = f"char_{character_id}"
        self.loaded[character_id] = root.name
        return root

    def place(self, character: ShotCharacter, frame: int, default: Vector3 | None = None):
        obj = self.load(character.character_id)
        position = character.position or default or Vector3()
        obj.location = position.as_tuple()
        obj.keyframe_insert(data_path="location", frame=frame)
        return obj

    def apply_expression(self, character_id: str, emotion: str, frame: int) -> None:
        modules = bpy()
        obj = modules.data.objects.get(self.loaded.get(character_id, ""))
        if obj is None:
            return

        targets = EXPRESSION_KEYS.get(emotion, {})
        for mesh in [obj, *obj.children_recursive]:
            shape_keys = getattr(getattr(mesh, "data", None), "shape_keys", None)
            if not shape_keys:
                continue
            for key in shape_keys.key_blocks:
                if key.name == "Basis":
                    continue
                key.value = targets.get(key.name, 0.0)
                key.keyframe_insert(data_path="value", frame=frame)

    def expression_library(self, character_id: str) -> Path:
        return self.library.expression_set(parse_ref(character_id))
