"""Design tokens that do not depend on canvas size. Geometry lives in geometry.py."""

from __future__ import annotations

from typing import Final

RGB = tuple[int, int, int]

BASELINE_UNIT: Final[int] = 8

# 12-column field inside the margins: 12 * 52 + 11 * 24 == 888
COLUMN_WIDTH: Final[int] = 52
GUTTER: Final[int] = 24
COLUMN_COUNT: Final[int] = 12

# ── colour ──────────────────────────────────────────────────────────────────
AZURE: Final[RGB] = (2, 147, 228)
CORAL: Final[RGB] = (255, 59, 71)
INK: Final[RGB] = (11, 26, 42)
TINT: Final[RGB] = (242, 247, 252)
BODY: Final[RGB] = (76, 92, 110)
WHITE: Final[RGB] = (255, 255, 255)

MAX_CORAL_COVERAGE: Final[float] = 0.03
# Every audited band is WCAG 'large text' (>=24px regular / >=18.66px bold),
# so 3:1 is the AA threshold. White on azure measures 3.34:1 and passes.
MIN_TEXT_CONTRAST: Final[float] = 3.0

# ── type ────────────────────────────────────────────────────────────────────
TYPE_SCALE: Final[tuple[int, ...]] = (135, 108, 86, 69, 55, 44, 35, 28, 22, 18)
HEADLINE_SIZES: Final[tuple[int, ...]] = (135, 108, 86, 69)
MIN_HEADLINE_SIZE: Final[int] = 69
MAX_HEADLINE_LINES: Final[int] = 4
MIN_HEADLINE_LINES: Final[int] = 1

SIZE_WORDMARK: Final[int] = 34
SIZE_SITE: Final[int] = 26
SIZE_EYEBROW: Final[int] = 20
SIZE_PILL: Final[int] = 22
SIZE_SUB: Final[int] = 28
SIZE_ROW_TITLE: Final[int] = 28
SIZE_ROW_BODY: Final[int] = 28
SIZE_HANDLE: Final[int] = 28
SIZE_RAIL: Final[int] = 24
SIZE_SPEC: Final[int] = 18
SIZE_CTA: Final[int] = 30

LEADING_TIGHT: Final[float] = 0.92  # 3+ headline lines
LEADING_OPEN: Final[float] = 0.98  # 1–2 headline lines

PILL_HEIGHT: Final[int] = 58
PILL_PADDING: Final[int] = 32
CTA_HEIGHT: Final[int] = 88
CTA_PADDING: Final[int] = 32
ROW_RADIUS: Final[int] = 12
ROW_BAR_WIDTH: Final[int] = 4
ROW_PADDING_X: Final[int] = 32
ROW_PADDING_Y: Final[int] = 22
ROW_GAP: Final[int] = 16
ROW_TITLE_BODY_GAP: Final[int] = 14

# ── surface treatment ───────────────────────────────────────────────────────
GRAIN_AMOUNT: Final[float] = 0.035
GRAIN_AMOUNT_WHITE: Final[float] = 0.022
GRAIN_SEED: Final[int] = 11
VIGNETTE_STRENGTH: Final[float] = 0.055

SCRIM_TOP_ALPHA: Final[float] = 0.46
SCRIM_BOTTOM_ALPHA: Final[float] = 0.76
SCRIM_START: Final[float] = 0.42
SCRIM_BOTTOM_ALPHA_DENSE: Final[float] = 0.88
SCRIM_START_DENSE: Final[float] = 0.32

PHOTO_RED_GAIN: Final[float] = 0.965
PHOTO_BLUE_GAIN: Final[float] = 1.045
PHOTO_CONTRAST: Final[float] = 1.06
# A photograph that has to carry white type is exposed for the type, not for the
# photograph. Pulling six per cent protects the highlights — a blown monitor or a
# white bench cannot be recovered once it clips, and that is where type disappears.
PHOTO_EXPOSURE: Final[float] = 0.94

WATERMARK_ALPHA_DARK: Final[float] = 0.085
WATERMARK_ALPHA_LIGHT: Final[float] = 0.06

REG_MARK_ARM: Final[int] = 22
REG_MARK_WIDTH: Final[int] = 2
REG_MARK_ALPHA: Final[float] = 0.30
MASTHEAD_ALPHA: Final[float] = 0.14
RAIL_ALPHA: Final[float] = 0.88

CORAL_RULE_WIDTH: Final[int] = 96
CORAL_RULE_HEIGHT: Final[int] = 6

# ── contact ─────────────────────────────────────────────────────────────────
PHONE_PRIMARY: Final[str] = "+250 786 077 754"
PHONE_SECONDARY: Final[str] = "+250 793 145 487"
EMAIL: Final[str] = "support@afrisinc.com"
SITE: Final[str] = "afrisinc.com"
HANDLE: Final[str] = "@afrisinc_inc"
WORDMARK: Final[str] = "AFRISINC"

CONTACT_SEPARATOR: Final[str] = "   ·   "
CONTACT_RAIL: Final[str] = CONTACT_SEPARATOR.join((PHONE_PRIMARY, PHONE_SECONDARY, EMAIL))
