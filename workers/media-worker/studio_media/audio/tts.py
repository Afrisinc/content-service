from __future__ import annotations

import io
import subprocess
import wave
from pathlib import Path

from ..config import CONFIG
from ..shell import MediaCommandError


KOKORO_LANGUAGES = {"en-us", "en-gb", "fr-fr", "ja", "ko", "cmn", "es", "hi", "it", "pt-br"}

LANGUAGE_ALIASES = {
    "en": "en-us",
    "us": "en-us",
    "gb": "en-gb",
    "uk": "en-gb",
    "fr": "fr-fr",
    "pt": "pt-br",
    "zh": "cmn",
    "zh-cn": "cmn",
    "jp": "ja",
}

VOICE_PREFIX_LANGUAGE = {
    "a": "en-us",
    "b": "en-gb",
    "f": "fr-fr",
    "j": "ja",
    "z": "cmn",
    "e": "es",
    "h": "hi",
    "i": "it",
    "p": "pt-br",
}


def resolve_language(language: str | None, voice_id: str = "") -> str:
    """Kokoro speaks espeak locales; the voice contract carries short codes like "en"."""
    tag = (language or "").strip().lower().replace("_", "-")
    if tag in KOKORO_LANGUAGES:
        return tag
    alias = LANGUAGE_ALIASES.get(tag)
    if alias:
        return alias
    return VOICE_PREFIX_LANGUAGE.get(voice_id[:1].lower(), "en-us")


class TtsEngine:
    name = "base"
    version = "0"

    def voices(self) -> list[str]:
        raise NotImplementedError

    def synthesize(self, text: str, voice_id: str, speed: float, pitch: float, language: str) -> bytes:
        raise NotImplementedError


class KokoroEngine(TtsEngine):
    name = "kokoro"
    version = "v1.0"

    def __init__(self) -> None:
        self._pipeline = None

    def _load(self):
        if self._pipeline is not None:
            return self._pipeline
        from kokoro_onnx import Kokoro

        self._pipeline = Kokoro(CONFIG.kokoro_model, CONFIG.kokoro_voices)
        return self._pipeline

    def voices(self) -> list[str]:
        pipeline = self._load()
        return sorted(pipeline.get_voices())

    def synthesize(self, text: str, voice_id: str, speed: float, pitch: float, language: str) -> bytes:
        import numpy as np

        pipeline = self._load()
        samples, sample_rate = pipeline.create(
            text, voice=voice_id, speed=speed, lang=resolve_language(language, voice_id)
        )
        if pitch:
            samples = _shift_pitch(np.asarray(samples), sample_rate, pitch)
        return _to_wav(samples, sample_rate)


class PiperEngine(TtsEngine):
    name = "piper"
    version = "1"

    def voices(self) -> list[str]:
        directory = Path(CONFIG.piper_model).parent
        if not directory.exists():
            return []
        return sorted(path.stem for path in directory.glob("*.onnx"))

    def synthesize(self, text: str, voice_id: str, speed: float, pitch: float, language: str) -> bytes:
        model = Path(CONFIG.piper_model).parent / f"{voice_id}.onnx"
        if not model.exists():
            model = Path(CONFIG.piper_model)
        completed = subprocess.run(
            ["piper", "--model", str(model), "--length_scale", str(1.0 / max(0.1, speed)), "--output_file", "-"],
            input=text.encode(),
            capture_output=True,
            timeout=600,
        )
        if completed.returncode != 0:
            raise MediaCommandError(f"piper exited {completed.returncode}: {completed.stderr.decode()[-2000:]}")
        return completed.stdout


class SilenceEngine(TtsEngine):
    name = "silence"
    version = "1"

    def voices(self) -> list[str]:
        return ["silent"]

    def synthesize(self, text: str, voice_id: str, speed: float, pitch: float, language: str) -> bytes:
        import numpy as np

        seconds = max(0.6, len(text.split()) / (2.6 * max(0.5, speed)))
        samples = np.zeros(int(seconds * CONFIG.sample_rate), dtype="float32")
        return _to_wav(samples, CONFIG.sample_rate)


def _shift_pitch(samples, sample_rate: int, semitones: float):
    import numpy as np

    factor = 2.0 ** (semitones / 12.0)
    indices = np.arange(0, len(samples), factor)
    indices = indices[indices < len(samples) - 1].astype("float32")
    lower = indices.astype("int32")
    weight = indices - lower
    return (samples[lower] * (1 - weight) + samples[lower + 1] * weight).astype("float32")


def _to_wav(samples, sample_rate: int) -> bytes:
    import numpy as np

    clipped = np.clip(np.asarray(samples, dtype="float32"), -1.0, 1.0)
    pcm = (clipped * 32767).astype("<i2")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return buffer.getvalue()


def wav_duration(body: bytes) -> float:
    with wave.open(io.BytesIO(body), "rb") as handle:
        return handle.getnframes() / float(handle.getframerate() or 1)


_ENGINES: dict[str, TtsEngine] = {}


def get_engine(name: str | None = None) -> TtsEngine:
    key = (name or CONFIG.tts_engine).lower()
    if key not in _ENGINES:
        if key == "kokoro":
            _ENGINES[key] = KokoroEngine()
        elif key == "piper":
            _ENGINES[key] = PiperEngine()
        else:
            _ENGINES[key] = SilenceEngine()
    return _ENGINES[key]
