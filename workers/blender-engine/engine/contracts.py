from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

ShotSize = Literal[
    "extreme_wide",
    "wide",
    "medium_wide",
    "medium",
    "medium_close_up",
    "close_up",
    "extreme_close_up",
    "over_the_shoulder",
    "pov",
]

CameraMovement = Literal[
    "static", "pan", "tilt", "dolly", "truck", "crane", "orbit", "tracking", "zoom", "handheld"
]

Direction = Literal[
    "forward", "backward", "left", "right", "up", "down", "clockwise", "counter_clockwise"
]

Emotion = Literal[
    "neutral", "happy", "sad", "angry", "scared", "surprised", "curious", "determined", "tired", "excited"
]

Action = Literal[
    "idle", "walk", "run", "jump", "sit", "stand", "kneel", "turn", "wave", "point", "reach",
    "pick_up", "look", "look_left", "look_right", "talk", "laugh", "cry", "fall", "celebrate",
]

Transition = Literal["cut", "dissolve", "fade_in", "fade_out", "wipe", "match_cut"]
LightingPreset = Literal["three_point", "natural", "low_key", "high_key", "silhouette", "golden_hour"]
Easing = Literal["linear", "ease_in", "ease_out", "ease_in_out"]
AnimationMode = Literal["2d", "hybrid", "3d"]
RenderProfile = Literal["preview", "draft", "production", "premium"]


class Vector3(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def as_tuple(self) -> tuple[float, float, float]:
        return (self.x, self.y, self.z)


class CameraMove(BaseModel):
    type: CameraMovement = "static"
    direction: Direction | None = None
    amount: float = 0.0
    easing: Easing = "ease_in_out"


class Camera(BaseModel):
    shot_size: ShotSize
    lens_mm: float = Field(default=50.0, ge=8, le=300)
    position: Vector3 | None = None
    look_at: Vector3 | None = None
    focus_target: str | None = None
    depth_of_field: bool = False
    movement: CameraMove = Field(default_factory=CameraMove)


class AnimationCommand(BaseModel):
    character_id: str
    action: Action
    start_time: float = Field(ge=0)
    duration: float = Field(gt=0)
    direction: Direction | None = None
    speed: float = Field(default=1.0, ge=0.1, le=3.0)
    target: str | None = None
    loop: bool = False


class ShotCharacter(BaseModel):
    character_id: str
    position: Vector3 | None = None
    facing: Direction | None = None
    emotion: Emotion = "neutral"
    animations: list[AnimationCommand] = Field(default_factory=list)
    speaking_track_id: str | None = None


class ShotProp(BaseModel):
    prop_id: str
    position: Vector3 | None = None


class Lighting(BaseModel):
    preset: LightingPreset = "natural"
    intensity: float = Field(default=3.0, ge=0, le=20)
    colour_kelvin: float = Field(default=5600, ge=1000, le=12000)
    shadows: bool = True


class SfxCue(BaseModel):
    name: str
    at: float = Field(ge=0)


class ShotAudio(BaseModel):
    narration_track_ids: list[str] = Field(default_factory=list)
    dialogue_track_ids: list[str] = Field(default_factory=list)
    sfx: list[SfxCue] = Field(default_factory=list)
    ambience: str | None = None


class Shot(BaseModel):
    shot_id: str
    index: int = Field(ge=0)
    duration_seconds: float = Field(gt=0)
    camera: Camera
    characters: list[ShotCharacter] = Field(default_factory=list)
    props: list[ShotProp] = Field(default_factory=list)
    lighting: Lighting | None = None
    audio: ShotAudio = Field(default_factory=ShotAudio)
    transition_out: Transition = "cut"


class BackgroundLayer(BaseModel):
    asset_key: str
    depth: float = Field(ge=0, le=1)


class Scene(BaseModel):
    scene_id: str
    index: int = Field(ge=0)
    duration_seconds: float = Field(gt=0)
    environment_id: str
    animation_mode: AnimationMode = "3d"
    background_layers: list[BackgroundLayer] = Field(default_factory=list)
    lighting: Lighting | None = None
    shots: list[Shot] = Field(min_length=1)

    @model_validator(mode="after")
    def durations_match(self) -> "Scene":
        total = sum(shot.duration_seconds for shot in self.shots)
        if abs(total - self.duration_seconds) > 0.5:
            raise ValueError(
                f"shot durations total {total}s but the scene is {self.duration_seconds}s"
            )
        for position, shot in enumerate(self.shots):
            if shot.index != position:
                raise ValueError(f"shot index {shot.index} does not match position {position}")
            for character in shot.characters:
                for animation in character.animations:
                    if animation.start_time + animation.duration > shot.duration_seconds + 0.01:
                        raise ValueError(
                            f"{animation.action} on {animation.character_id} runs past {shot.shot_id}"
                        )
        return self


class RenderSettings(BaseModel):
    width: int = Field(ge=64, le=7680)
    height: int = Field(ge=64, le=7680)
    fps: float = Field(gt=0, le=120)
    samples: int = Field(default=64, ge=1, le=4096)
    engine: Literal["EEVEE", "CYCLES", "REMOTION", "WAN"] = "EEVEE"
    video_codec: str = "h264"
    audio_codec: str = "aac"
    crf: int = Field(default=18, ge=0, le=51)
    transparent: bool = False


class RenderJob(BaseModel):
    job_id: str
    production_id: str
    scene: Scene
    profile: RenderProfile = "production"
    settings: RenderSettings
    asset_manifest: dict[str, str] = Field(default_factory=dict)
    audio_manifest: dict[str, str] = Field(default_factory=dict)
    output_key: str
    timeout_seconds: int = 3600


class RenderResult(BaseModel):
    job_id: str
    output_key: str
    width: int
    height: int
    fps: float
    duration_seconds: float
    bytes: int
    checksum: str
    has_audio: bool = False
    frames_rendered: int = 0
    engine_version: str
    duration_ms: int = 0
