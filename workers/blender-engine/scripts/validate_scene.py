from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.contracts import RenderJob
from engine.validators import validate_manifest, validate_scene


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: validate_scene.py <job.json> <asset-root>", file=sys.stderr)
        return 2

    job = RenderJob.model_validate_json(Path(argv[1]).read_text())
    root = Path(argv[2])
    problems = validate_scene(job.scene) + validate_manifest(job, root)

    print(json.dumps({"valid": not problems, "problems": problems}, indent=2))
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
