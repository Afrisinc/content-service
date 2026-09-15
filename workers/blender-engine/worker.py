from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

WORKERS_ROOT = Path(__file__).resolve().parents[1]
if str(WORKERS_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKERS_ROOT))

from shared.config import CONFIG
from shared.logging_setup import get_logger, log
from shared.queue import Consumer, publish
from shared.storage import ObjectStore

logger = get_logger("studio.blender")
store = ObjectStore()

QUEUE = "animation.render.3d"
TEMPLATE_BY_STYLE = {
    "cinematic": "cinematic_3d",
    "cartoon": "cartoon_3d",
    "stylized": "stylized_3d",
    "flat": "flat_2d",
}


class RenderFailed(RuntimeError):
    pass


def pick_template(job: dict) -> Path | None:
    style = str(job.get("template") or job.get("style") or "").lower()
    for marker, name in TEMPLATE_BY_STYLE.items():
        if marker in style:
            return Path(__file__).resolve().parent / "templates" / f"{name}.blend"
    default = Path(__file__).resolve().parent / "templates" / "cinematic_3d.blend"
    return default if default.exists() else None


def handle(message: dict) -> dict:
    job = message["payload"]
    job_id = job["job_id"]
    work_dir = Path(CONFIG.work_dir) / job_id
    assets_dir = work_dir / "assets"
    output_path = work_dir / "out" / f"{job['scene']['scene_id']}.mp4"

    if store.exists(job["output_key"]):
        log(logger, "info", "studio.render.cache_hit", job_id=job_id, key=job["output_key"])
        return {"job_id": job_id, "output_key": job["output_key"], "cached": True}

    work_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    try:
        resolved_assets = store.download_manifest(job.get("asset_manifest", {}), assets_dir)
        resolved_audio = store.download_manifest(job.get("audio_manifest", {}), assets_dir)

        prepared = {**job, "asset_manifest": resolved_assets, "audio_manifest": resolved_audio}
        job_file = work_dir / "job.json"
        job_file.write_text(json.dumps(prepared))

        result_file = work_dir / "result.json"
        template = pick_template(job)

        command = [
            CONFIG.blender_bin,
            "--background",
            "--factory-startup",
            "--python",
            str(Path(__file__).resolve().parent / "scripts" / "render_scene.py"),
            "--",
            "--job",
            str(job_file),
            "--assets",
            str(assets_dir),
            "--output",
            str(output_path),
            "--result",
            str(result_file),
        ]
        if template and template.exists():
            command.extend(["--template", str(template)])

        started = time.time()
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=min(int(job.get("timeout_seconds", 3600)), CONFIG.job_timeout_seconds),
        )

        if completed.returncode != 0:
            tail = (completed.stderr or completed.stdout or "")[-4000:]
            raise RenderFailed(f"blender exited {completed.returncode}: {tail}")

        if not result_file.exists():
            raise RenderFailed("blender produced no result file")

        result = json.loads(result_file.read_text())
        rendered = Path(result.get("local_path", output_path))
        if not rendered.exists():
            candidates = sorted((work_dir / "out").glob("*.mp4"))
            if not candidates:
                raise RenderFailed("blender produced no video file")
            rendered = candidates[-1]

        uploaded = store.upload(rendered, job["output_key"], content_type="video/mp4")
        payload = {
            **result,
            **uploaded,
            "output_key": job["output_key"],
            "worker": CONFIG.worker_name,
            "duration_ms": int((time.time() - started) * 1000),
        }

        publish(
            "qa.inspect",
            {
                "queue": "qa.inspect",
                "productionId": message.get("productionId"),
                "idempotencyKey": f"qa:{job_id}",
                "attempt": 1,
                "correlationId": message.get("correlationId"),
                "payload": {
                    "target": "scene",
                    "target_id": job["scene"]["scene_id"],
                    "job_id": job_id,
                    "video_key": job["output_key"],
                    "expected": {
                        "width": job["settings"]["width"],
                        "height": job["settings"]["height"],
                        "fps": job["settings"]["fps"],
                        "duration_seconds": job["scene"]["duration_seconds"],
                    },
                },
            },
        )

        log(logger, "info", "studio.render.completed", job_id=job_id, key=job["output_key"], **uploaded)
        return payload
    finally:
        if not CONFIG.keep_workdir:
            shutil.rmtree(work_dir, ignore_errors=True)


def main() -> int:
    Consumer(QUEUE, handle).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
