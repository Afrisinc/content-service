from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes"}


@dataclass(frozen=True)
class WorkerConfig:
    rabbitmq_url: str = field(default_factory=lambda: os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"))
    s3_endpoint: str = field(default_factory=lambda: os.environ.get("STUDIO_S3_ENDPOINT", "http://localhost:9000"))
    s3_bucket: str = field(default_factory=lambda: os.environ.get("STUDIO_S3_BUCKET", "animation-platform"))
    s3_region: str = field(default_factory=lambda: os.environ.get("STUDIO_S3_REGION", "us-east-1"))
    s3_access_key: str = field(default_factory=lambda: os.environ.get("STUDIO_S3_ACCESS_KEY", ""))
    s3_secret_key: str = field(default_factory=lambda: os.environ.get("STUDIO_S3_SECRET_KEY", ""))
    work_dir: str = field(default_factory=lambda: os.environ.get("STUDIO_WORK_DIR", "/tmp/studio"))
    asset_root: str = field(default_factory=lambda: os.environ.get("STUDIO_ASSET_ROOT", "/assets"))
    blender_bin: str = field(default_factory=lambda: os.environ.get("BLENDER_BIN", "blender"))
    rhubarb_bin: str = field(default_factory=lambda: os.environ.get("RHUBARB_BIN", "rhubarb"))
    ffmpeg_bin: str = field(default_factory=lambda: os.environ.get("FFMPEG_BIN", "ffmpeg"))
    ffprobe_bin: str = field(default_factory=lambda: os.environ.get("FFPROBE_BIN", "ffprobe"))
    prefetch: int = field(default_factory=lambda: _int("STUDIO_WORKER_PREFETCH", 1))
    job_timeout_seconds: int = field(default_factory=lambda: _int("STUDIO_JOB_TIMEOUT_SECONDS", 7200))
    keep_workdir: bool = field(default_factory=lambda: _bool("STUDIO_KEEP_WORKDIR", False))
    worker_name: str = field(default_factory=lambda: os.environ.get("STUDIO_WORKER_NAME", "worker"))


CONFIG = WorkerConfig()
