from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.contracts import RenderJob
from engine.renderer import render
from engine.scene_builder import SceneBuilder
from engine.validators import assert_renderable


def parse_args(argv: list[str]) -> argparse.Namespace:
    # blender passes script args after "--"; running bpy as a module passes them directly.
    separator = argv.index("--") + 1 if "--" in argv else 1
    parser = argparse.ArgumentParser(prog="render_scene")
    parser.add_argument("--job", required=True)
    parser.add_argument("--assets", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--template", default="")
    parser.add_argument("--result", default="")
    return parser.parse_args(argv[separator:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    job = RenderJob.model_validate_json(Path(args.job).read_text())
    asset_root = Path(args.assets)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    assert_renderable(job, asset_root)

    builder = SceneBuilder(job, asset_root, Path(args.template) if args.template else None)
    build_report = builder.build()

    result = render(job, output_path)
    payload = {**result.model_dump(), "build": build_report}

    destination = Path(args.result) if args.result else output_path.with_suffix(".result.json")
    destination.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
