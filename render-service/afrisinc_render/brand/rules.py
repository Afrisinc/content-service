"""Brand rules that decide colour and composition. Enforced, not advisory."""

from __future__ import annotations

from . import tokens as T

Surface = str  # "azure" | "photo" | "white"

AZURE: Surface = "azure"
PHOTO: Surface = "photo"
WHITE: Surface = "white"

SURFACES: frozenset[Surface] = frozenset({AZURE, PHOTO, WHITE})

# Instagram's own ceiling for a carousel post.
MAX_FRAMES = 10
DARK_SURFACES: frozenset[Surface] = frozenset({AZURE, PHOTO})


def is_dark(surface: Surface) -> bool:
    return surface in DARK_SURFACES


def foreground(surface: Surface) -> T.RGB:
    return T.WHITE if is_dark(surface) else T.INK


def pill_colours(surface: Surface, *, claim: bool) -> tuple[T.RGB, T.RGB]:
    """(fill, text). Coral marks a claim or an offer; a section label never gets one."""
    if claim:
        return T.CORAL, T.WHITE
    if surface == AZURE:
        return T.WHITE, T.AZURE
    if surface == WHITE:
        return T.AZURE, T.WHITE
    return T.CORAL, T.WHITE


def footer_dot(surface: Surface) -> T.RGB:
    return T.WHITE if is_dark(surface) else T.CORAL


def site_colour(surface: Surface) -> T.RGB:
    return T.WHITE if is_dark(surface) else T.AZURE


def headline_colours(surface: Surface, line_count: int) -> list[T.RGB]:
    """White surfaces carry a two-tone headline: ink, then azure from the second line."""
    if surface == WHITE:
        return [T.INK if i == 0 else T.AZURE for i in range(line_count)]
    return [T.WHITE] * line_count


def watermark(surface: Surface) -> tuple[T.RGB, float] | None:
    if surface == PHOTO:
        return None
    if surface == AZURE:
        return T.WHITE, T.WATERMARK_ALPHA_DARK
    return T.AZURE, T.WATERMARK_ALPHA_LIGHT


class BrandRuleError(ValueError):
    """A post that violates a rule the system exists to enforce."""


def validate_surface_order(surfaces: list[Surface]) -> None:
    if not surfaces:
        raise BrandRuleError("a post needs at least one frame")
    if len(surfaces) > MAX_FRAMES:
        raise BrandRuleError(
            f"a post is at most {MAX_FRAMES} slides, got {len(surfaces)}"
        )

    unknown = [s for s in surfaces if s not in SURFACES]
    if unknown:
        raise BrandRuleError(f"unknown surface(s): {sorted(set(unknown))}")

    if len(surfaces) > 1:
        if surfaces[0] != AZURE:
            raise BrandRuleError("the first slide must be azure")
        if surfaces[-1] != AZURE:
            raise BrandRuleError("the last slide must be azure")

    for i in range(1, len(surfaces)):
        if surfaces[i] == AZURE and surfaces[i - 1] == AZURE:
            raise BrandRuleError(f"slides {i} and {i + 1} are both azure — never adjacent")
