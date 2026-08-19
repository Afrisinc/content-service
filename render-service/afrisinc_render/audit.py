"""Deterministic craft audit. Mechanical rules run as code so nobody has to remember them."""

from __future__ import annotations

import numpy as np
from PIL import Image

from .brand import rules as R
from .brand import tokens as T
from .brand.geometry import STORY, Geometry
from .schema import AuditFinding, SlideSpec

_CORAL = np.array(T.CORAL, dtype=np.int16)
_CORAL_TOLERANCE = 45

BANNED_WORDS = frozenset(
    {
        "cutting-edge",
        "world-class",
        "seamless",
        "innovative",
        "premium",
        "best-in-class",
        "revolutionary",
        "unlock",
        "elevate",
        "empower",
        "game-changer",
        "leverage",
        "holistic",
        "streamline",
    }
)


def text_bands(geo: Geometry) -> tuple[tuple[str, int, int], ...]:
    return (
        ("header", geo.header_y - 24, geo.header_y + 24),
        ("contact_rail", geo.contact_rail_y - 18, geo.contact_rail_y + 18),
        ("footer", geo.footer_y - 20, geo.footer_y + 20),
    )


def _relative_luminance(pixels: np.ndarray) -> float:
    channels = pixels.astype(np.float64) / 255.0
    linear = np.where(channels <= 0.03928, channels / 12.92, ((channels + 0.055) / 1.055) ** 2.4)
    weighted = 0.2126 * linear[..., 0] + 0.7152 * linear[..., 1] + 0.0722 * linear[..., 2]
    return float(weighted.mean())


def _contrast_against(luminance: float, foreground_is_white: bool) -> float:
    lighter, darker = (1.0, luminance) if foreground_is_white else (luminance, 0.0)
    return (lighter + 0.05) / (darker + 0.05)


def coral_coverage(image: Image.Image) -> float:
    pixels = np.asarray(image.convert("RGB")).astype(np.int16)
    matches = np.abs(pixels - _CORAL).sum(axis=2) < _CORAL_TOLERANCE
    return float(matches.sum()) / (image.width * image.height)


def audit_slide(
    index: int, spec: SlideSpec, image: Image.Image, geo: Geometry
) -> list[AuditFinding]:
    findings: list[AuditFinding] = []

    def add(rule: str, detail: str, severity: str = "error") -> None:
        findings.append(AuditFinding(slide=index, rule=rule, detail=detail, severity=severity))

    if image.size != geo.size:
        add("canvas", f"expected {geo.width}x{geo.height}, got {image.size[0]}x{image.size[1]}")

    coverage = coral_coverage(image)
    if coverage > T.MAX_CORAL_COVERAGE:
        add(
            "coral_budget",
            f"coral covers {coverage:.1%} of the frame, limit {T.MAX_CORAL_COVERAGE:.0%}",
        )

    if not (T.MIN_HEADLINE_LINES <= len(spec.headline) <= T.MAX_HEADLINE_LINES):
        add("headline_lines", f"{len(spec.headline)} lines, allowed 1–{T.MAX_HEADLINE_LINES}")

    pixels = np.asarray(image.convert("RGB"))
    foreground_is_white = R.is_dark(spec.surface)
    for name, top, bottom in text_bands(geo):
        band = pixels[top:bottom, geo.margin : geo.right_edge]
        mask = band.sum(axis=2) < 600 if foreground_is_white else band.sum(axis=2) > 240
        sample = band[mask] if mask.sum() > 50 else band.reshape(-1, 3)
        ratio = _contrast_against(_relative_luminance(sample), foreground_is_white)
        if ratio < T.MIN_TEXT_CONTRAST:
            add("contrast", f"{name} band is {ratio:.1f}:1, minimum {T.MIN_TEXT_CONTRAST}:1")

    # On a story the platform draws its own UI over the top and bottom of the canvas.
    if geo.name == STORY:
        if geo.header_y - 40 < geo.safe_top:
            add("safe_zone", f"the header at y={geo.header_y} sits under the platform UI")
        if geo.footer_y + 40 > geo.safe_bottom:
            add("safe_zone", f"the footer at y={geo.footer_y} sits under the reply bar")

    text = " ".join(
        [*spec.headline, *spec.subs, spec.closing or "", spec.eyebrow.text if spec.eyebrow else ""]
    ).lower()
    for word in sorted(BANNED_WORDS):
        if word in text:
            add("banned_word", f"copy contains '{word}'", "warning")

    if spec.cta and spec.shows_site:
        add("duplicate_domain", "the domain appears in both the header and the CTA pill")

    return findings


def audit_post(specs: list[SlideSpec]) -> list[AuditFinding]:
    findings: list[AuditFinding] = []
    coral_slides = [
        index
        for index, spec in enumerate(specs)
        if spec.coral_rule
        or spec.strike_line is not None
        or (spec.eyebrow is not None and spec.eyebrow.kind == "claim")
    ]
    if len(specs) > 2 and not coral_slides:
        findings.append(
            AuditFinding(
                slide=-1,
                rule="coral_absent",
                detail="no slide carries the accent — the set has nothing to look at",
                severity="warning",
            )
        )
    return findings


def has_errors(findings: list[AuditFinding]) -> bool:
    return any(finding.severity == "error" for finding in findings)
