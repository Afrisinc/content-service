from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class MediaConfig:
    api_key: str = field(default_factory=lambda: os.environ.get("MEDIA_WORKER_API_KEY", ""))
    work_dir: str = field(default_factory=lambda: os.environ.get("STUDIO_WORK_DIR", "/tmp/studio"))
    ffmpeg: str = field(default_factory=lambda: os.environ.get("FFMPEG_BIN", "ffmpeg"))
    ffprobe: str = field(default_factory=lambda: os.environ.get("FFPROBE_BIN", "ffprobe"))
    rhubarb: str = field(default_factory=lambda: os.environ.get("RHUBARB_BIN", "rhubarb"))
    tts_engine: str = field(default_factory=lambda: os.environ.get("STUDIO_TTS_ENGINE", "kokoro"))
    kokoro_model: str = field(default_factory=lambda: os.environ.get("KOKORO_MODEL_PATH", "/models/kokoro/kokoro-v1.0.onnx"))
    kokoro_voices: str = field(default_factory=lambda: os.environ.get("KOKORO_VOICES_PATH", "/models/kokoro/voices-v1.0.bin"))
    piper_model: str = field(default_factory=lambda: os.environ.get("PIPER_MODEL_PATH", "/models/piper/en_US-amy-medium.onnx"))
    whisper_model: str = field(default_factory=lambda: os.environ.get("WHISPER_MODEL", "base"))
    whisper_device: str = field(default_factory=lambda: os.environ.get("WHISPER_DEVICE", "auto"))
    whisper_compute: str = field(default_factory=lambda: os.environ.get("WHISPER_COMPUTE_TYPE", "int8"))
    sample_rate: int = field(default_factory=lambda: _int("STUDIO_SAMPLE_RATE", 48000))
    target_lufs: float = field(default_factory=lambda: _float("STUDIO_TARGET_LUFS", -14.0))
    ffmpeg_timeout: int = field(default_factory=lambda: _int("STUDIO_FFMPEG_TIMEOUT_SECONDS", 3600))


CONFIG = MediaConfig()
