from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TrackKind = Literal["vo", "dialogue", "sfx", "ambience", "music"]
SubtitleFormat = Literal["srt", "ass", "vtt"]
Verdict = Literal["passed", "warning", "failed"]


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice_id: str
    language: str = "en"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=0.0, ge=-12, le=12)
    emotion: str = "neutral"
    format: Literal["wav", "mp3"] = "wav"


class TtsResponse(BaseModel):
    audio_base64: str
    mime_type: str
    duration_seconds: float
    voice_id: str
    engine_version: str


class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class SegmentTiming(BaseModel):
    text: str
    start: float
    end: float
    words: list[WordTiming] = Field(default_factory=list)


class TranscribeRequest(BaseModel):
    audio_base64: str
    language: str | None = None
    word_timestamps: bool = True


class TranscribeResponse(BaseModel):
    language: str
    duration_seconds: float
    model: str
    segments: list[SegmentTiming] = Field(default_factory=list)


class MixTrack(BaseModel):
    kind: TrackKind
    storage_key: str
    gain_db: float = 0.0
    start_at: float = 0.0
    fade_in_ms: int = 0
    fade_out_ms: int = 0
    duck_under: Literal["vo", "dialogue"] | None = None


class MixRequest(BaseModel):
    production_id: str
    target_lufs: float = -14.0
    true_peak_db: float = -1.0
    tracks: list[MixTrack] = Field(min_length=1)
    output_key: str


class MixResponse(BaseModel):
    output_key: str
    duration_seconds: float
    integrated_lufs: float
    true_peak_db: float
    bytes: int
    checksum: str


class VariantSpec(BaseModel):
    format: Literal["16:9", "9:16", "4:5", "1:1"]
    width: int
    height: int
    fps: float
    crf: int = 20
    max_duration_seconds: int | None = None
    burn_subtitles: bool = False
    safe_area_padding: float = 0.0


class ComposeRequest(BaseModel):
    production_id: str
    scene_keys: list[str] = Field(min_length=1)
    master_audio_key: str | None = None
    subtitle_key: str | None = None
    intro_key: str | None = None
    outro_key: str | None = None
    watermark_key: str | None = None
    variants: list[VariantSpec] = Field(min_length=1)
    output_prefix: str
    target_lufs: float = -14.0


class ComposeOutput(BaseModel):
    format: str
    output_key: str
    width: int
    height: int
    fps: float
    duration_seconds: float
    bytes: int
    checksum: str


class ComposeResponse(BaseModel):
    master_key: str
    master_duration_seconds: float
    outputs: list[ComposeOutput] = Field(default_factory=list)


class SubtitleRequest(BaseModel):
    segments: list[SegmentTiming]
    formats: list[SubtitleFormat] = Field(default_factory=lambda: ["srt"])
    output_prefix: str
    language: str = "en"
    max_chars_per_line: int = 42
    max_lines: int = 2


class SubtitleResponse(BaseModel):
    keys: dict[str, str]
    cue_count: int


class QualityThresholds(BaseModel):
    min_duration_seconds: float = 1.0
    max_duration_drift_seconds: float = 1.5
    expected_width: int
    expected_height: int
    expected_fps: float
    max_black_frame_ratio: float = 0.02
    max_silence_ratio: float = 0.35
    max_leading_silence_seconds: float = 1.5
    target_lufs: float = -14.0
    lufs_tolerance: float = 2.0
    max_true_peak_db: float = -1.0
    require_audio: bool = True


class QualityRequest(BaseModel):
    target: Literal["scene", "master", "variant", "audio", "subtitle"]
    target_id: str | None = None
    video_key: str | None = None
    audio_key: str | None = None
    expected_duration_seconds: float
    thresholds: QualityThresholds


class QualityCheck(BaseModel):
    name: str
    passed: bool
    severity: Literal["info", "warning", "error"] = "error"
    expected: str | None = None
    actual: str | None = None
    detail: str | None = None


class QualityResponse(BaseModel):
    target: str
    target_id: str | None = None
    verdict: Verdict
    checks: list[QualityCheck] = Field(default_factory=list)
    failures: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    probe: dict = Field(default_factory=dict)


class ThumbnailRequest(BaseModel):
    production_id: str
    video_key: str
    candidate_count: int = Field(default=5, ge=1, le=12)
    width: int = 1280
    height: int = 720
    output_prefix: str


class ThumbnailCandidate(BaseModel):
    index: int
    output_key: str
    at_seconds: float
    sharpness: float
    contrast: float
    face_area_ratio: float
    score: float


class ThumbnailResponse(BaseModel):
    candidates: list[ThumbnailCandidate] = Field(default_factory=list)
    selected_index: int


class AssembleRequest(BaseModel):
    production_id: str
    scene_id: str
    shot_keys: list[str] = Field(min_length=1)
    fps: float = 30.0
    width: int | None = None
    height: int | None = None
    output_key: str


class AssembleResponse(BaseModel):
    output_key: str
    width: int
    height: int
    fps: float
    duration_seconds: float
    bytes: int
    checksum: str


class LastFrameRequest(BaseModel):
    video_key: str
    output_key: str
    offset_seconds: float = 0.0


class LastFrameResponse(BaseModel):
    output_key: str
    bytes: int
    checksum: str
    at_seconds: float
