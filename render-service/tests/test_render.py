from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from afrisinc_render import audit
from afrisinc_render.brand import tokens as T
from afrisinc_render.brand.geometry import POST_GEOMETRY as POST_GEO
from afrisinc_render.brand.geometry import STORY_GEOMETRY as STORY_GEO
from afrisinc_render.errors import LayoutOverflowError, PhotoUnavailableError
from afrisinc_render.render import post as post_module
from afrisinc_render.render import slide, surfaces
from afrisinc_render.schema import Eyebrow, PostSpec, SlideSpec


def _render(spec: SlideSpec, geo=POST_GEO) -> Image.Image:
    image = slide.render(spec, geo).image
    return image


def test_slide_renders_at_canvas_size(azure_slide):
    assert _render(azure_slide).size == POST_GEO.size


@pytest.mark.parametrize("fixture", ["azure_slide", "photo_slide", "white_slide", "cta_slide"])
def test_every_surface_passes_its_own_audit(request, fixture):
    spec = request.getfixturevalue(fixture)
    image = slide.render(spec, POST_GEO).image
    findings = audit.audit_slide(0, spec, image, POST_GEO)
    assert [f for f in findings if f.severity == "error"] == []


@pytest.mark.parametrize("geo", [POST_GEO, STORY_GEO])
def test_stack_always_clears_the_contact_rail(photo_slide, geo):
    stack, _ = slide.fit_stack(photo_slide, geo)
    top = stack.top_for(slide.resolve_anchor(photo_slide, geo), geo)
    assert top >= geo.band_top
    assert top + stack.height(geo) <= geo.band_bottom


def test_headline_shrinks_rather_than_overflowing():
    dense = SlideSpec(
        surface="white",
        eyebrow=Eyebrow(text="How we build", kind="label"),
        headline=["Ship in weeks,", "not quarters."],
        rows=[
            {"title": "Discovery first", "body": "We map your real workflow before code."},
            {"title": "Working software", "body": "You see it running, not described."},
            {"title": "Yours to keep", "body": "Your repo, your servers, your data."},
        ],
        closing="Handover, documentation and team training included.",
    )
    _, size = slide.fit_stack(dense, POST_GEO)
    assert size < T.HEADLINE_SIZES[0]


def test_impossible_content_raises_rather_than_colliding():
    impossible = SlideSpec(
        surface="white",
        eyebrow=Eyebrow(text="How we build", kind="label"),
        headline=["One", "Two", "Three", "Four"],
        rows=[
            {"title": "Row one title here", "body": "A reasonably long supporting line of copy."},
            {"title": "Row two title here", "body": "A reasonably long supporting line of copy."},
            {"title": "Row three title", "body": "A reasonably long supporting line of copy."},
        ],
        closing="A closing line that sits underneath the three rows.",
        subs=["An extra sub line", "And another sub line to push it over"],
    )
    with pytest.raises(LayoutOverflowError):
        slide.fit_stack(impossible, POST_GEO)


def test_a_headline_line_too_wide_for_any_size_raises_rather_than_overflowing():
    # A single unbroken line: headline lines are pre-split by the caller, so
    # there is no word-wrap to fall back on if it is too wide even at the
    # smallest size on the scale.
    too_wide = SlideSpec(
        surface="white",
        eyebrow=Eyebrow(text="How we build", kind="label"),
        headline=["Supercalifragilisticexpialidocioussupercalifragilisticexpialidocious"],
    )
    with pytest.raises(LayoutOverflowError):
        slide.fit_stack(too_wide, POST_GEO)


def test_coral_stays_inside_budget(cta_slide):
    image = _render(cta_slide)
    assert audit.coral_coverage(image) <= T.MAX_CORAL_COVERAGE


def test_azure_slide_without_an_accent_has_no_coral():
    plain = SlideSpec(
        surface="azure",
        eyebrow=Eyebrow(text="Software development", kind="label"),
        headline=["Your process.", "Not a template."],
    )
    assert audit.coral_coverage(_render(plain)) < 0.0005


def test_white_surface_is_not_vignetted():
    plain = surfaces.build("white", POST_GEO)
    pixels = np.asarray(plain.convert("RGB")).astype(int)
    corner = pixels[0:40, 0:40].mean()
    centre = pixels[520:560, 520:560].mean()
    assert abs(corner - centre) < 4


def test_azure_surface_is_vignetted():
    pixels = np.asarray(surfaces.build("azure", POST_GEO).convert("RGB")).astype(int)
    assert pixels[0:40, 0:40].mean() < pixels[520:560, 520:560].mean()


def test_missing_photo_is_rejected():
    with pytest.raises(PhotoUnavailableError):
        surfaces.build("photo", POST_GEO, photo="does-not-exist.png")


def test_photo_reference_cannot_escape_the_photo_directory():
    with pytest.raises(PhotoUnavailableError):
        surfaces.build("photo", POST_GEO, photo="../../etc/passwd")


def test_cover_crop_matches_a_square_target():
    cropped = surfaces.cover_crop(Image.new("RGB", (1536, 1024)), POST_GEO.size, 0.2)
    assert cropped.width == cropped.height == 1024


def test_cover_crop_matches_a_portrait_target():
    cropped = surfaces.cover_crop(Image.new("RGB", (1536, 1024)), STORY_GEO.size, 0.5)
    assert round(cropped.width / cropped.height, 3) == round(1080 / 1920, 3)


def test_cover_crop_never_upscales_beyond_the_source():
    cropped = surfaces.cover_crop(Image.new("RGB", (800, 1200)), POST_GEO.size, 0.5)
    assert cropped.size == (800, 800)


def test_carousel_writes_every_slide(carousel: PostSpec):
    result = post_module.render_post(carousel)
    assert len(result.slides) == len(carousel.slides)
    assert [s.filename for s in result.slides] == [
        "slide-01.png",
        "slide-02.png",
        "slide-03.png",
        "slide-04.png",
    ]
    assert all(s.bytes > 0 for s in result.slides)
    assert result.passed


def test_a_cta_slide_drops_the_header_domain():
    spec = SlideSpec(
        surface="azure",
        eyebrow=Eyebrow(text="Free scoping session", kind="claim"),
        headline=["Tell us the workflow."],
        cta={"text": "afrisinc.com"},
    )
    assert spec.shows_site is False
    image = slide.render(spec, POST_GEO).image
    findings = audit.audit_slide(0, spec, image, POST_GEO)
    assert all(f.rule != "duplicate_domain" for f in findings)


def test_banned_word_is_a_warning_not_a_block():
    spec = SlideSpec(
        surface="azure",
        eyebrow=Eyebrow(text="Software development", kind="label"),
        headline=["Seamless delivery."],
    )
    image = slide.render(spec, POST_GEO).image
    findings = audit.audit_slide(0, spec, image, POST_GEO)
    banned = [f for f in findings if f.rule == "banned_word"]
    assert banned and banned[0].severity == "warning"
