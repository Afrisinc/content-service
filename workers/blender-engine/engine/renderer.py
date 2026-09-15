from __future__ import annotations

import hashlib
import time
from pathlib import Path

from .blender_env import blender_version, bpy
from .contracts import RenderJob, RenderResult

PROFILE_SAMPLES = {"preview": 8, "draft": 24, "production": 64, "premium": 256}


def settings_engine(job: RenderJob) -> str:
    return "CYCLES" if job.settings.engine == "CYCLES" else "EEVEE"
PROFILE_SCALE = {"preview": 0.25, "draft": 0.5, "production": 1.0, "premium": 1.0}


def ensure_engine_available(engine: str) -> None:
    """Cycles ships enabled in the Blender application but not in the bpy module."""
    modules = bpy()
    available = {item.identifier for item in modules.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    if engine in available:
        return
    if engine == "CYCLES":
        modules.ops.preferences.addon_enable(module="cycles")


def configure_render(job: RenderJob, output_path: Path) -> None:
    modules = bpy()
    ensure_engine_available(settings_engine(job))
    scene = modules.context.scene
    settings = job.settings

    scale = PROFILE_SCALE.get(job.profile, 1.0)
    scene.render.resolution_x = max(64, int(settings.width * scale))
    scene.render.resolution_y = max(64, int(settings.height * scale))
    scene.render.resolution_percentage = 100
    scene.render.fps = int(round(settings.fps))
    scene.render.film_transparent = settings.transparent

    if settings.engine == "CYCLES":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = PROFILE_SAMPLES.get(job.profile, settings.samples)
        scene.cycles.use_denoising = True
        scene.cycles.device = "GPU" if _gpu_available() else "CPU"
    else:
        scene.render.engine = _eevee_engine()
        if hasattr(scene, "eevee"):
            taa = PROFILE_SAMPLES.get(job.profile, settings.samples)
            if hasattr(scene.eevee, "taa_render_samples"):
                scene.eevee.taa_render_samples = taa
            if hasattr(scene.eevee, "use_gtao"):
                scene.eevee.use_gtao = True

    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = _crf_label(settings.crf)
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.ffmpeg.audio_codec = "AAC"
    scene.render.ffmpeg.audio_bitrate = 192
    scene.render.filepath = str(output_path)


def _eevee_engine() -> str:
    modules = bpy()
    available = {item.identifier for item in modules.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in available:
            return candidate
    return "BLENDER_EEVEE"


def _crf_label(crf: int) -> str:
    if crf <= 14:
        return "PERC_LOSSLESS"
    if crf <= 18:
        return "HIGH"
    if crf <= 23:
        return "MEDIUM"
    if crf <= 28:
        return "LOW"
    return "VERYLOW"


def _gpu_available() -> bool:
    modules = bpy()
    try:
        preferences = modules.context.preferences.addons["cycles"].preferences
        preferences.refresh_devices()
        return any(device.type in {"CUDA", "OPTIX", "HIP", "METAL"} for device in preferences.devices)
    except (KeyError, AttributeError):
        return False


def render(job: RenderJob, output_path: Path) -> RenderResult:
    modules = bpy()
    started = time.time()

    configure_render(job, output_path)
    modules.ops.render.render(animation=True)

    produced = _resolve_output(output_path)
    body = produced.read_bytes()
    scene = modules.context.scene

    return RenderResult(
        job_id=job.job_id,
        output_key=job.output_key,
        width=scene.render.resolution_x,
        height=scene.render.resolution_y,
        fps=float(scene.render.fps),
        duration_seconds=job.scene.duration_seconds,
        bytes=len(body),
        checksum=hashlib.sha256(body).hexdigest(),
        has_audio=scene.sequence_editor is not None and len(scene.sequence_editor.sequences) > 0,
        frames_rendered=scene.frame_end - scene.frame_start + 1,
        engine_version=f"blender-{blender_version()}",
        duration_ms=int((time.time() - started) * 1000),
    )


def _resolve_output(output_path: Path) -> Path:
    if output_path.exists():
        return output_path
    candidates = sorted(output_path.parent.glob(f"{output_path.stem}*"))
    if not candidates:
        raise FileNotFoundError(f"blender produced no file at {output_path}")
    return candidates[-1]
