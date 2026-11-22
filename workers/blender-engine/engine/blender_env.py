from __future__ import annotations

import importlib
from types import ModuleType


def bpy() -> ModuleType:
    try:
        return importlib.import_module("bpy")
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "this module must run inside Blender: blender --background --python scripts/render_scene.py"
        ) from exc


def mathutils() -> ModuleType:
    return importlib.import_module("mathutils")


def blender_version() -> str:
    return ".".join(str(part) for part in bpy().app.version)
