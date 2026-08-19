"""The wire contract. content-service builds these; the renderer consumes them."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .brand import rules as R
from .brand import tokens as T
from .brand.geometry import POST, SINGLE, Geometry, geometry_for

SurfaceName = Literal["azure", "photo", "white"]
FormatName = Literal["post", "story", "single"]
EyebrowKind = Literal["label", "claim"]
Anchor = Literal["top", "centre", "bottom"]


class Eyebrow(BaseModel):
    text: str = Field(min_length=2, max_length=48)
    kind: EyebrowKind = "label"

    @field_validator("text")
    @classmethod
    def upper(cls, value: str) -> str:
        return value.strip().upper()


class Row(BaseModel):
    title: str = Field(min_length=2, max_length=40)
    body: str = Field(min_length=2, max_length=90)

    @field_validator("title")
    @classmethod
    def upper(cls, value: str) -> str:
        return value.strip().upper()


class Action(BaseModel):
    index: str = Field(min_length=1, max_length=2)
    text: str = Field(min_length=2, max_length=70)


class Cta(BaseModel):
    text: str = Field(default=T.SITE, min_length=2, max_length=32)
    arrow: bool = True


class SlideSpec(BaseModel):
    surface: SurfaceName
    photo: str | None = Field(
        default=None,
        description="photo reference resolved inside RENDER_PHOTO_DIR",
    )
    eyebrow: Eyebrow | None = None
    headline: list[str] = Field(default_factory=list, max_length=T.MAX_HEADLINE_LINES)
    strike_line: int | None = Field(
        default=None, ge=0, description="index of the headline line to strike through in coral"
    )
    subs: list[str] = Field(default_factory=list, max_length=2)
    rows: list[Row] = Field(default_factory=list)
    closing: str | None = Field(default=None, max_length=90)
    actions: list[Action] = Field(default_factory=list)
    cta: Cta | None = None
    coral_rule: bool = False
    anchor: Anchor | None = None
    dense_scrim: bool = False
    photo_focus: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="horizontal centre of interest when cropping the photo to the canvas",
    )

    @field_validator("headline")
    @classmethod
    def non_empty_lines(cls, value: list[str]) -> list[str]:
        cleaned = [line.strip() for line in value if line and line.strip()]
        if not cleaned:
            raise ValueError("headline must have at least one line")
        return cleaned

    @field_validator("rows")
    @classmethod
    def exactly_three_or_none(cls, value: list[Row]) -> list[Row]:
        if value and len(value) != 3:
            raise ValueError("a list slide carries exactly three rows")
        return value

    @field_validator("actions")
    @classmethod
    def three_actions_or_none(cls, value: list[Action]) -> list[Action]:
        if value and len(value) != 3:
            raise ValueError("an action block carries exactly three actions")
        return value

    @model_validator(mode="after")
    def coherent(self) -> SlideSpec:
        if self.surface == R.PHOTO and not self.photo:
            raise ValueError("a photo surface needs a photo")
        if self.surface != R.PHOTO and self.photo:
            raise ValueError("only a photo surface may carry a photo")
        if self.rows and self.surface != R.WHITE:
            raise ValueError("list rows are a white-surface component")
        if self.strike_line is not None and self.strike_line >= len(self.headline):
            raise ValueError("strike_line is outside the headline")
        if self.coral_rule and self.strike_line is not None:
            raise ValueError("one coral element per slide: rule or strike, not both")
        claim = self.eyebrow is not None and self.eyebrow.kind == "claim"
        if claim and (self.coral_rule or self.strike_line is not None):
            raise ValueError("one coral element per slide")
        return self

    @property
    def shows_site(self) -> bool:
        """The domain appears exactly once: in the header, unless a CTA pill carries it."""
        return self.cta is None


class PostSpec(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    format: FormatName = POST
    slides: list[SlideSpec] = Field(min_length=1, max_length=R.MAX_FRAMES)
    enforce_surface_order: bool | None = None

    @property
    def geometry(self) -> Geometry:
        return geometry_for(self.format)

    @model_validator(mode="after")
    def surface_order(self) -> PostSpec:
        # Stories are separate frames rather than one swipeable set, so the
        # first/last-azure and no-adjacent-azure rules do not apply to them.
        enforce = self.enforce_surface_order
        if enforce is None:
            enforce = self.format == POST
        if self.format == SINGLE and len(self.slides) != 1:
            raise ValueError("a single post is exactly one frame")
        if enforce:
            R.validate_surface_order([slide.surface for slide in self.slides])
        return self


class RenderedSlide(BaseModel):
    index: int
    filename: str
    surface: SurfaceName
    headline_size: int
    bytes: int


class AuditFinding(BaseModel):
    slide: int
    rule: str
    detail: str
    severity: Literal["error", "warning"]


class RenderResult(BaseModel):
    slug: str
    format: FormatName
    width: int
    height: int
    slides: list[RenderedSlide]
    findings: list[AuditFinding]
    passed: bool
