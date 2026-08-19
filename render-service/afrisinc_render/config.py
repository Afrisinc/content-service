"""Runtime configuration. Nothing in this service reads os.environ directly."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parent
_SERVICE_ROOT = _PACKAGE_ROOT.parent

_DEFAULT_FONT_DIR = _SERVICE_ROOT / "assets" / "fonts"
_DEFAULT_LOGO = _SERVICE_ROOT / "assets" / "brand" / "afrisinc-logo.png"


def _path(name: str, default: Path) -> Path:
    raw = os.environ.get(name)
    return Path(raw) if raw else default


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    font_dir: Path
    logo_path: Path
    photo_dir: Path
    output_dir: Path
    api_key: str
    max_photo_bytes: int
    request_timeout_seconds: int

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            font_dir=_path("RENDER_FONT_DIR", _DEFAULT_FONT_DIR),
            logo_path=_path("RENDER_LOGO_PATH", _DEFAULT_LOGO),
            photo_dir=_path("RENDER_PHOTO_DIR", Path("/tmp/afrisinc-photos")),
            output_dir=_path("RENDER_OUTPUT_DIR", Path("/tmp/afrisinc-render")),
            api_key=os.environ.get("RENDER_API_KEY", ""),
            max_photo_bytes=_int("RENDER_MAX_PHOTO_BYTES", 12 * 1024 * 1024),
            request_timeout_seconds=_int("RENDER_TIMEOUT_SECONDS", 30),
        )


settings = Settings.from_env()
