from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.blender_env import bpy
from engine.contracts import Lighting
from engine.lighting_manager import apply_lighting

TEMPLATES = {
    "cinematic_3d": Lighting(preset="three_point", intensity=4.0, colour_kelvin=5200, shadows=True),
    "cartoon_3d": Lighting(preset="high_key", intensity=5.0, colour_kelvin=6200, shadows=True),
    "stylized_3d": Lighting(preset="golden_hour", intensity=4.5, colour_kelvin=4200, shadows=True),
    "flat_2d": Lighting(preset="natural", intensity=2.0, colour_kelvin=6500, shadows=False),
}


def main() -> int:
    modules = bpy()
    destination = ROOT / "templates"
    destination.mkdir(parents=True, exist_ok=True)

    for name, lighting in TEMPLATES.items():
        modules.ops.wm.read_factory_settings(use_empty=True)
        scene = modules.context.scene
        scene.render.fps = 30
        scene.render.resolution_x = 1920
        scene.render.resolution_y = 1080
        scene.world = modules.data.worlds.new(f"world_{name}")
        scene.world.use_nodes = True
        apply_lighting(lighting)
        modules.ops.wm.save_as_mainfile(filepath=str(destination / f"{name}.blend"))
        print(f"wrote {name}.blend")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
