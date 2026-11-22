from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

WORKERS_ROOT = Path(__file__).resolve().parents[1]
if str(WORKERS_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKERS_ROOT))

from shared.config import CONFIG as WORKER_CONFIG
from shared.logging_setup import get_logger, log
from shared.queue import Consumer, publish
from studio_media.audio import lipsync, mix, stt, tts
from studio_media.config import CONFIG
from studio_media.contracts import (
    ComposeRequest,
    MixRequest,
    QualityRequest,
    SegmentTiming,
    VariantSpec,
)
from studio_media.qa.inspect import inspect_media
from studio_media.shell import duration_of, probe
from studio_media.store import fetch, store
from studio_media.video import compose
from studio_media.video.subtitles import RENDERERS, build_cues

logger = get_logger("studio.media")

QUEUE_BY_ROLE = {
    "audio": "audio.generate",
    "transcribe": "audio.transcribe",
    "mix": "audio.mix",
    "compose": "video.compose",
    "qa": "qa.inspect",
}


def workspace() -> Path:
    Path(CONFIG.work_dir).mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="job-", dir=CONFIG.work_dir))


def handle_audio(message: dict) -> dict:
    job = message["payload"]
    root = workspace()
    try:
        engine = tts.get_engine()
        body = engine.synthesize(
            job["text"],
            job["voice"]["voice_id"],
            float(job["voice"].get("speed", 1.0)),
            float(job["voice"].get("pitch", 0.0)),
            job["voice"].get("language", "en"),
        )

        audio_path = root / "track.wav"
        audio_path.write_bytes(body)
        uploaded = store().upload(audio_path, job["output_key"], content_type="audio/wav")

        language, duration, segments = stt.transcribe(audio_path, job["voice"].get("language"), True)
        visemes = lipsync.build(audio_path, segments, job.get("text"))

        viseme_path = root / "visemes.json"
        viseme_path.write_text(__import__("json").dumps({"visemes": visemes}))
        viseme_key = f"{job['output_key']}.visemes.json"
        store().upload(viseme_path, viseme_key, content_type="application/json")

        result = {
            **uploaded,
            "track_id": job["track_id"],
            "duration_seconds": duration or tts.wav_duration(body),
            "language": language,
            "viseme_key": viseme_key,
            "segments": [segment.model_dump() for segment in segments],
            "engine": f"{engine.name}-{engine.version}",
        }
        log(logger, "info", "studio.audio.completed", track_id=job["track_id"], key=job["output_key"])
        return result
    finally:
        shutil.rmtree(root, ignore_errors=True)


def handle_transcribe(message: dict) -> dict:
    job = message["payload"]
    root = workspace()
    try:
        audio_path = fetch(job["audio_key"], root)
        language, duration, segments = stt.transcribe(audio_path, job.get("language"), True)

        cues = build_cues(segments, job.get("max_chars_per_line", 42), job.get("max_lines", 2))
        keys: dict[str, str] = {}
        for fmt in job.get("formats", ["srt"]):
            path = root / f"subtitles.{fmt}"
            path.write_text(RENDERERS[fmt](cues), encoding="utf-8")
            key = f"{job['output_prefix']}/{language}.{fmt}"
            store().upload(path, key, content_type="text/plain")
            keys[fmt] = key

        return {
            "language": language,
            "duration_seconds": duration,
            "subtitle_keys": keys,
            "cue_count": len(cues),
            "segments": [segment.model_dump() for segment in segments],
        }
    finally:
        shutil.rmtree(root, ignore_errors=True)


def handle_mix(message: dict) -> dict:
    request = MixRequest.model_validate(message["payload"])
    root = workspace()
    try:
        inputs = [fetch(track.storage_key, root) for track in request.tracks]
        output = root / "master.wav"
        measured = mix.render_master(inputs, request.tracks, output, request.target_lufs, request.true_peak_db)
        uploaded = store().upload(output, request.output_key, content_type="audio/wav")
        return {
            **uploaded,
            "integrated_lufs": float(measured.get("output_i", request.target_lufs)),
            "true_peak_db": float(measured.get("output_tp", request.true_peak_db)),
        }
    finally:
        shutil.rmtree(root, ignore_errors=True)


def handle_compose(message: dict) -> dict:
    request = ComposeRequest.model_validate(message["payload"])
    root = workspace()
    try:
        scene_paths = [fetch(key, root) for key in request.scene_keys]
        fps = request.variants[0].fps

        silent = compose.concat(scene_paths, root / "master_silent.mp4", fps)
        audio_path = fetch(request.master_audio_key, root) if request.master_audio_key else None
        master = compose.mux(silent, audio_path, root / "master.mp4")

        master_key = f"{request.output_prefix}/master.mp4"
        store().upload(master, master_key, content_type="video/mp4")

        subtitle_path = fetch(request.subtitle_key, root) if request.subtitle_key else None
        watermark_path = fetch(request.watermark_key, root) if request.watermark_key else None

        outputs = []
        for spec in request.variants:
            outputs.append(render_one(master, spec, root, request.output_prefix, subtitle_path, watermark_path))

        publish(
            "qa.inspect",
            {
                "queue": "qa.inspect",
                "productionId": message.get("productionId"),
                "idempotencyKey": f"qa:master:{request.production_id}",
                "attempt": 1,
                "correlationId": message.get("correlationId"),
                "payload": {"target": "master", "target_id": request.production_id, "video_key": master_key},
            },
        )

        publish(
            "video.encode",
            {
                "queue": "video.encode",
                "productionId": message.get("productionId"),
                "idempotencyKey": f"compose-result:{request.production_id}",
                "attempt": 1,
                "correlationId": message.get("correlationId"),
                "payload": {
                    "production_id": request.production_id,
                    "master_key": master_key,
                    "master_duration_seconds": duration_of(probe(master)),
                    "has_audio": bool(request.master_audio_key),
                    "outputs": outputs,
                },
            },
        )

        return {"master_key": master_key, "outputs": outputs}
    finally:
        shutil.rmtree(root, ignore_errors=True)


def render_one(
    master: Path,
    spec: VariantSpec,
    root: Path,
    prefix: str,
    subtitle_path: Path | None,
    watermark_path: Path | None,
) -> dict:
    slug = spec.format.replace(":", "x")
    destination = root / f"variant_{slug}.mp4"
    summary = compose.render_variant(master, spec, destination, subtitle_path, watermark_path)
    key = f"{prefix}/variant_{slug}.mp4"
    store().upload(destination, key, content_type="video/mp4")
    return {**summary, "output_key": key}


def handle_qa(message: dict) -> dict:
    job = message["payload"]
    expected = job.get("expected", {})
    request = QualityRequest.model_validate(
        {
            "target": job.get("target", "scene"),
            "target_id": job.get("target_id"),
            "video_key": job.get("video_key"),
            "audio_key": job.get("audio_key"),
            "expected_duration_seconds": expected.get("duration_seconds", job.get("expected_duration_seconds", 0)),
            "thresholds": {
                "expected_width": expected.get("width", 1920),
                "expected_height": expected.get("height", 1080),
                "expected_fps": expected.get("fps", 30),
                **job.get("thresholds", {}),
            },
        }
    )

    root = workspace()
    try:
        key = request.video_key or request.audio_key
        path = fetch(key, root)
        report = inspect_media(
            path, request.target, request.target_id, request.expected_duration_seconds, request.thresholds
        )

        publish(
            "qa.approve" if report.verdict != "failed" else "qa.reject",
            {
                "queue": "qa.approve" if report.verdict != "failed" else "qa.reject",
                "productionId": message.get("productionId"),
                "idempotencyKey": f"qa-result:{request.target}:{request.target_id}",
                "attempt": 1,
                "correlationId": message.get("correlationId"),
                "payload": report.model_dump(),
            },
        )

        log(
            logger,
            "info",
            "studio.qa.completed",
            target=request.target,
            target_id=request.target_id,
            verdict=report.verdict,
            failures=report.failures,
        )
        return report.model_dump()
    finally:
        shutil.rmtree(root, ignore_errors=True)


HANDLERS = {
    "audio.generate": handle_audio,
    "audio.transcribe": handle_transcribe,
    "audio.mix": handle_mix,
    "video.compose": handle_compose,
    "qa.inspect": handle_qa,
}


def main(argv: list[str]) -> int:
    role = argv[1] if len(argv) > 1 else "qa"
    queue = QUEUE_BY_ROLE.get(role, role)
    handler = HANDLERS.get(queue)
    if handler is None:
        raise SystemExit(f"no handler for queue {queue}")

    log(logger, "info", "studio.media_worker.starting", queue=queue, worker=WORKER_CONFIG.worker_name)
    Consumer(queue, handler).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
