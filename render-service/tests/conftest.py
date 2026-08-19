from __future__ import annotations

import os
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent

os.environ.setdefault("RENDER_FONT_DIR", str(SERVICE_ROOT / "assets" / "fonts"))
os.environ.setdefault(
    "RENDER_LOGO_PATH", str(SERVICE_ROOT / "assets" / "brand" / "afrisinc-logo.png")
)
os.environ.setdefault("RENDER_PHOTO_DIR", str(SERVICE_ROOT / "tests" / "fixtures"))
os.environ.setdefault("RENDER_OUTPUT_DIR", str(SERVICE_ROOT / "tests" / ".out"))

import pytest  # noqa: E402
from PIL import Image  # noqa: E402

from afrisinc_render.schema import Eyebrow, PostSpec, SlideSpec  # noqa: E402

FIXTURES = SERVICE_ROOT / "tests" / "fixtures"


@pytest.fixture(scope="session", autouse=True)
def photo_fixture() -> Path:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path = FIXTURES / "bench.png"
    if not path.is_file():
        Image.new("RGB", (1536, 1024), (30, 44, 62)).save(path)
    return path


@pytest.fixture
def azure_slide() -> SlideSpec:
    return SlideSpec(
        surface="azure",
        eyebrow=Eyebrow(text="Software development", kind="label"),
        headline=["Your process.", "Not a template."],
        strike_line=1,
    )


@pytest.fixture
def photo_slide() -> SlideSpec:
    return SlideSpec(
        surface="photo",
        photo="bench.png",
        eyebrow=Eyebrow(text="Shipped, not slideware.", kind="claim"),
        headline=["Web apps.", "Mobile. APIs.", "Dashboards."],
        subs=["Built to fit the way your business already works."],
    )


@pytest.fixture
def white_slide() -> SlideSpec:
    return SlideSpec(
        surface="white",
        eyebrow=Eyebrow(text="How we build", kind="label"),
        headline=["Ship in weeks,", "not quarters."],
        rows=[
            {"title": "Discovery first", "body": "We map your workflow before any code."},
            {"title": "Working software", "body": "You see it running, not described."},
            {"title": "Yours to keep", "body": "Your repo, your servers, your data. No lock-in."},
        ],
        closing="Handover, documentation and team training included.",
    )


@pytest.fixture
def cta_slide() -> SlideSpec:
    return SlideSpec(
        surface="azure",
        eyebrow=Eyebrow(text="Free scoping session", kind="claim"),
        headline=["Tell us the workflow.", "We'll tell you what", "it takes to build."],
        cta={"text": "afrisinc.com"},
    )


@pytest.fixture
def carousel(azure_slide, photo_slide, white_slide, cta_slide) -> PostSpec:
    return PostSpec(
        slug="test-carousel",
        slides=[azure_slide, photo_slide, white_slide, cta_slide],
    )
