from __future__ import annotations

import math

from .blender_env import bpy
from .contracts import Lighting

PRESETS = {
    "three_point": [
        ("key", "AREA", (4.0, -4.0, 5.0), 1.0),
        ("fill", "AREA", (-5.0, -3.0, 3.0), 0.35),
        ("rim", "AREA", (0.0, 6.0, 5.0), 0.6),
    ],
    "natural": [
        ("sun", "SUN", (6.0, -6.0, 12.0), 1.0),
        ("bounce", "AREA", (-4.0, -2.0, 2.0), 0.25),
    ],
    "low_key": [
        ("key", "SPOT", (3.0, -3.0, 4.0), 1.0),
        ("rim", "AREA", (-1.0, 5.0, 4.0), 0.4),
    ],
    "high_key": [
        ("key", "AREA", (3.0, -4.0, 5.0), 1.0),
        ("fill", "AREA", (-3.0, -4.0, 4.0), 0.9),
        ("top", "AREA", (0.0, 0.0, 7.0), 0.7),
    ],
    "silhouette": [("back", "AREA", (0.0, 8.0, 4.0), 1.4)],
    "golden_hour": [
        ("sun", "SUN", (8.0, -8.0, 3.0), 1.0),
        ("bounce", "AREA", (-4.0, -2.0, 1.5), 0.4),
    ],
}


def kelvin_to_rgb(kelvin: float) -> tuple[float, float, float]:
    temperature = max(1000.0, min(12000.0, kelvin)) / 100.0

    if temperature <= 66:
        red = 1.0
        green = min(1.0, max(0.0, (99.4708025861 * math.log(temperature) - 161.1195681661) / 255.0))
    else:
        red = min(1.0, max(0.0, (329.698727446 * (temperature - 60) ** -0.1332047592) / 255.0))
        green = min(1.0, max(0.0, (288.1221695283 * (temperature - 60) ** -0.0755148492) / 255.0))

    if temperature >= 66:
        blue = 1.0
    elif temperature <= 19:
        blue = 0.0
    else:
        blue = min(1.0, max(0.0, (138.5177312231 * math.log(temperature - 10) - 305.0447927307) / 255.0))

    return (red, green, blue)


def apply_lighting(lighting: Lighting, collection_name: str = "studio_lights") -> list[str]:
    modules = bpy()
    created: list[str] = []

    existing = modules.data.collections.get(collection_name)
    if existing:
        for obj in list(existing.objects):
            modules.data.objects.remove(obj, do_unlink=True)
    else:
        existing = modules.data.collections.new(collection_name)
        modules.context.scene.collection.children.link(existing)

    colour = kelvin_to_rgb(lighting.colour_kelvin)

    for name, light_type, position, weight in PRESETS.get(lighting.preset, PRESETS["natural"]):
        data = modules.data.lights.new(name=f"{collection_name}_{name}", type=light_type)
        data.energy = lighting.intensity * weight * (1000.0 if light_type == "AREA" else 1.0)
        data.color = colour
        if hasattr(data, "shadow_soft_size"):
            data.shadow_soft_size = 1.5
        if light_type == "AREA":
            data.size = 4.0
        if light_type == "SPOT":
            data.spot_size = math.radians(50)

        light_object = modules.data.objects.new(name=data.name, object_data=data)
        light_object.location = position
        existing.objects.link(light_object)
        created.append(light_object.name)

    scene = modules.context.scene
    if not lighting.shadows and scene.render.engine.startswith("BLENDER_EEVEE"):
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = False

    return created
