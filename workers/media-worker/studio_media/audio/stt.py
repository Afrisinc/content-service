from __future__ import annotations

from pathlib import Path

from ..config import CONFIG
from ..contracts import SegmentTiming, WordTiming

_model = None
_model_name = ""


def _load():
    global _model, _model_name
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel

    device = CONFIG.whisper_device
    if device == "auto":
        device = "cuda" if _cuda_available() else "cpu"

    compute = CONFIG.whisper_compute
    if device == "cpu" and compute in {"float16", "int8_float16"}:
        compute = "int8"

    _model = WhisperModel(CONFIG.whisper_model, device=device, compute_type=compute)
    _model_name = f"faster-whisper-{CONFIG.whisper_model}-{device}"
    return _model


def _cuda_available() -> bool:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


def model_name() -> str:
    _load()
    return _model_name


def transcribe(path: Path, language: str | None, word_timestamps: bool) -> tuple[str, float, list[SegmentTiming]]:
    model = _load()
    segments, info = model.transcribe(
        str(path),
        language=language,
        word_timestamps=word_timestamps,
        vad_filter=True,
        beam_size=5,
    )

    results: list[SegmentTiming] = []
    for segment in segments:
        words = [
            WordTiming(word=word.word.strip(), start=float(word.start), end=float(word.end))
            for word in (segment.words or [])
            if word.word.strip()
        ]
        results.append(
            SegmentTiming(
                text=segment.text.strip(),
                start=float(segment.start),
                end=float(segment.end),
                words=words,
            )
        )

    return info.language or language or "en", float(info.duration or 0.0), results
