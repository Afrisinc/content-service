from __future__ import annotations

import base64
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .audio import lipsync, mix, stt, tts
from .config import CONFIG
from .contracts import (
    AssembleRequest,
    AssembleResponse,
    ComposeOutput,
    ComposeRequest,
    ComposeResponse,
    LastFrameRequest,
    LastFrameResponse,
    MixRequest,
    MixResponse,
    QualityRequest,
    QualityResponse,
    SegmentTiming,
    SubtitleRequest,
    SubtitleResponse,
    ThumbnailCandidate,
    ThumbnailRequest,
    ThumbnailResponse,
    TranscribeRequest,
    TranscribeResponse,
    TtsRequest,
    TtsResponse,
)
from .qa.inspect import inspect_media
from .shell import MediaCommandError, duration_of, probe
from .store import fetch, store
from .video import compose, thumbnails
from .video.subtitles import RENDERERS, build_cues

app = FastAPI(title="studio-media-worker", version="1.0.0")


def guard(api_key: str | None) -> None:
    if CONFIG.api_key and api_key != CONFIG.api_key:
        raise HTTPException(status_code=401, detail="invalid api key")


def workspace() -> Path:
    root = Path(tempfile.mkdtemp(prefix="media-", dir=CONFIG.work_dir))
    root.mkdir(parents=True, exist_ok=True)
    return root


@app.exception_handler(MediaCommandError)
async def media_error_handler(_request, exc: MediaCommandError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "tts_engine": CONFIG.tts_engine, "whisper_model": CONFIG.whisper_model}


@app.get("/ready")
async def ready() -> dict:
    checks = {
        "ffmpeg": shutil.which(CONFIG.ffmpeg) is not None,
        "ffprobe": shutil.which(CONFIG.ffprobe) is not None,
        "rhubarb": shutil.which(CONFIG.rhubarb) is not None,
        "work_dir": Path(CONFIG.work_dir).exists() or _make_workdir(),
    }
    healthy = checks["ffmpeg"] and checks["ffprobe"] and checks["work_dir"]
    return {"status": "healthy" if healthy else "degraded", "checks": checks}


def _make_workdir() -> bool:
    try:
        Path(CONFIG.work_dir).mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False


@app.get("/audio/voices")
async def voices(x_api_key: str | None = Header(default=None)) -> dict:
    guard(x_api_key)
    return {"voices": tts.get_engine().voices(), "engine": CONFIG.tts_engine}


@app.post("/audio/tts", response_model=TtsResponse)
async def synthesize(request: TtsRequest, x_api_key: str | None = Header(default=None)) -> TtsResponse:
    guard(x_api_key)
    engine = tts.get_engine()
    body = engine.synthesize(
        request.text, request.voice_id, request.speed, request.pitch, request.language
    )
    return TtsResponse(
        audio_base64=base64.b64encode(body).decode(),
        mime_type="audio/wav",
        duration_seconds=tts.wav_duration(body),
        voice_id=request.voice_id,
        engine_version=f"{engine.name}-{engine.version}",
    )


@app.post("/audio/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest, x_api_key: str | None = Header(default=None)) -> TranscribeResponse:
    guard(x_api_key)
    root = workspace()
    try:
        audio_path = root / "input.wav"
        audio_path.write_bytes(base64.b64decode(request.audio_base64))
        language, duration, segments = stt.transcribe(audio_path, request.language, request.word_timestamps)
        return TranscribeResponse(
            language=language, duration_seconds=duration, model=stt.model_name(), segments=segments
        )
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/audio/lipsync")
async def build_lipsync(payload: dict, x_api_key: str | None = Header(default=None)) -> dict:
    guard(x_api_key)
    root = workspace()
    try:
        audio_path = fetch(payload["audio_key"], root)
        segments = [SegmentTiming(**item) for item in payload.get("segments", [])]
        visemes = lipsync.build(audio_path, segments, payload.get("dialogue"))

        output = root / "visemes.json"
        output.write_text(json.dumps({"visemes": visemes}))
        uploaded = store().upload(output, payload["output_key"], content_type="application/json")
        return {**uploaded, "viseme_count": len(visemes)}
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/audio/mix", response_model=MixResponse)
async def mix_audio(request: MixRequest, x_api_key: str | None = Header(default=None)) -> MixResponse:
    guard(x_api_key)
    root = workspace()
    try:
        inputs = [fetch(track.storage_key, root) for track in request.tracks]
        output = root / "master.wav"
        measured = mix.render_master(inputs, request.tracks, output, request.target_lufs, request.true_peak_db)

        uploaded = store().upload(output, request.output_key, content_type="audio/wav")
        return MixResponse(
            output_key=request.output_key,
            duration_seconds=duration_of(probe(output)),
            integrated_lufs=float(measured.get("output_i", request.target_lufs)),
            true_peak_db=float(measured.get("output_tp", request.true_peak_db)),
            bytes=int(uploaded["bytes"]),
            checksum=str(uploaded["checksum"]),
        )
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/video/subtitles", response_model=SubtitleResponse)
async def make_subtitles(request: SubtitleRequest, x_api_key: str | None = Header(default=None)) -> SubtitleResponse:
    guard(x_api_key)
    root = workspace()
    try:
        cues = build_cues(request.segments, request.max_chars_per_line, request.max_lines)
        keys: dict[str, str] = {}
        for fmt in request.formats:
            renderer = RENDERERS[fmt]
            path = root / f"subtitles.{fmt}"
            path.write_text(renderer(cues), encoding="utf-8")
            key = f"{request.output_prefix}/{request.language}.{fmt}"
            store().upload(path, key, content_type="text/plain")
            keys[fmt] = key
        return SubtitleResponse(keys=keys, cue_count=len(cues))
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/video/compose", response_model=ComposeResponse)
async def compose_video(request: ComposeRequest, x_api_key: str | None = Header(default=None)) -> ComposeResponse:
    guard(x_api_key)
    root = workspace()
    try:
        scene_paths = [fetch(key, root) for key in request.scene_keys]
        fps = request.variants[0].fps

        silent_master = compose.concat(scene_paths, root / "master_silent.mp4", fps)
        audio_path = fetch(request.master_audio_key, root) if request.master_audio_key else None
        master = compose.mux(silent_master, audio_path, root / "master.mp4")

        master_key = f"{request.output_prefix}/master.mp4"
        store().upload(master, master_key, content_type="video/mp4")

        subtitle_path = fetch(request.subtitle_key, root) if request.subtitle_key else None
        watermark_path = fetch(request.watermark_key, root) if request.watermark_key else None

        outputs: list[ComposeOutput] = []
        for spec in request.variants:
            slug = spec.format.replace(":", "x")
            destination = root / f"variant_{slug}.mp4"
            summary = compose.render_variant(master, spec, destination, subtitle_path, watermark_path)
            key = f"{request.output_prefix}/variant_{slug}.mp4"
            store().upload(destination, key, content_type="video/mp4")
            outputs.append(ComposeOutput(output_key=key, **summary))

        return ComposeResponse(
            master_key=master_key,
            master_duration_seconds=duration_of(probe(master)),
            outputs=outputs,
        )
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/video/assemble", response_model=AssembleResponse)
async def assemble(request: AssembleRequest, x_api_key: str | None = Header(default=None)) -> AssembleResponse:
    guard(x_api_key)
    root = workspace()
    try:
        shots = [fetch(key, root) for key in request.shot_keys]
        output = root / f"{request.scene_id}.mp4"
        summary = compose.assemble_shots(shots, output, request.fps, request.width, request.height)
        store().upload(output, request.output_key, content_type="video/mp4")
        return AssembleResponse(output_key=request.output_key, **summary)
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/video/last-frame", response_model=LastFrameResponse)
async def last_frame(request: LastFrameRequest, x_api_key: str | None = Header(default=None)) -> LastFrameResponse:
    guard(x_api_key)
    root = workspace()
    try:
        video = fetch(request.video_key, root)
        output = root / "last.png"
        summary = compose.extract_last_frame(video, output, request.offset_seconds)
        store().upload(output, request.output_key, content_type="image/png")
        return LastFrameResponse(output_key=request.output_key, **summary)
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/video/thumbnails", response_model=ThumbnailResponse)
async def make_thumbnails(request: ThumbnailRequest, x_api_key: str | None = Header(default=None)) -> ThumbnailResponse:
    guard(x_api_key)
    root = workspace()
    try:
        video = fetch(request.video_key, root)
        duration = duration_of(probe(video))
        paths = thumbnails.extract_candidates(
            video, request.candidate_count, request.width, request.height, root / "thumbs"
        )

        candidates: list[ThumbnailCandidate] = []
        step = duration / (request.candidate_count + 1)
        for index, path in enumerate(paths):
            metrics = thumbnails.score(path)
            key = f"{request.output_prefix}/candidate_{index:02d}.jpg"
            store().upload(path, key, content_type="image/jpeg")
            candidates.append(
                ThumbnailCandidate(
                    index=index,
                    output_key=key,
                    at_seconds=round(step * (index + 1), 3),
                    **metrics,
                )
            )

        selected = max(candidates, key=lambda candidate: candidate.score).index if candidates else 0
        return ThumbnailResponse(candidates=candidates, selected_index=selected)
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.post("/qa/inspect", response_model=QualityResponse)
async def inspect(request: QualityRequest, x_api_key: str | None = Header(default=None)) -> QualityResponse:
    guard(x_api_key)
    key = request.video_key or request.audio_key
    if not key:
        raise HTTPException(status_code=400, detail="video_key or audio_key is required")

    root = workspace()
    try:
        path = fetch(key, root)
        return inspect_media(
            path, request.target, request.target_id, request.expected_duration_seconds, request.thresholds
        )
    finally:
        shutil.rmtree(root, ignore_errors=True)


def file_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
