from __future__ import annotations

import numpy as np
import pytest

from afrisinc_render import audit
from afrisinc_render.brand.geometry import POST_GEOMETRY as POST_GEO
from afrisinc_render.brand.geometry import SINGLE_GEOMETRY as SINGLE_GEO
from afrisinc_render.brand.geometry import STORY_GEOMETRY as STORY_GEO
from afrisinc_render.render import post as post_module
from afrisinc_render.render import slide
from afrisinc_render.schema import Eyebrow, PostSpec, SlideSpec


@pytest.fixture
def story_frame() -> SlideSpec:
    return SlideSpec(
        surface="azure",
        eyebrow=Eyebrow(text="Free diagnostic", kind="claim"),
        headline=["We fix what", "we sell."],
        subs=["Computers, laptops, printers, CCTV, POS and networks."],
        cta={"text": "afrisinc.com"},
    )


@pytest.fixture
def story_photo_frame() -> SlideSpec:
    return SlideSpec(
        surface="photo",
        photo="bench.png",
        eyebrow=Eyebrow(text="Shipped, not slideware.", kind="claim"),
        headline=["Web apps.", "Mobile. APIs."],
        subs=["Built to fit the way your business already works."],
    )


def test_story_renders_at_nine_by_sixteen(story_frame):
    image, _ = slide.render(story_frame, STORY_GEO)
    assert image.size == (1080, 1920)


def test_story_passes_its_own_audit(story_frame):
    image, _ = slide.render(story_frame, STORY_GEO)
    findings = audit.audit_slide(0, story_frame, image, STORY_GEO)
    assert [f for f in findings if f.severity == "error"] == []


def test_story_photo_frame_passes_its_own_audit(story_photo_frame):
    image, _ = slide.render(story_photo_frame, STORY_GEO)
    findings = audit.audit_slide(0, story_photo_frame, image, STORY_GEO)
    assert [f for f in findings if f.severity == "error"] == []


def test_nothing_readable_lands_under_the_platform_ui(story_frame):
    """The top 250px and bottom 340px belong to Instagram, not to us."""
    image, _ = slide.render(story_frame, STORY_GEO)
    pixels = np.asarray(image.convert("RGB")).astype(int)

    background = pixels[STORY_GEO.height // 2, 8]
    top_strip = pixels[0 : STORY_GEO.safe_top - 40, STORY_GEO.margin : STORY_GEO.right_edge]
    bottom_strip = pixels[STORY_GEO.safe_bottom + 40 :, STORY_GEO.margin : STORY_GEO.right_edge]

    for strip in (top_strip, bottom_strip):
        # Only the surface treatment should vary here; type would swing far wider.
        assert np.abs(strip - background).max() < 60


def test_content_centres_on_a_story_and_tops_out_on_a_post(story_frame):
    assert slide.resolve_anchor(story_frame, STORY_GEO) == "centre"
    assert slide.resolve_anchor(story_frame, POST_GEO) == "top"


def test_a_photo_frame_still_anchors_low_on_a_story(story_photo_frame):
    assert slide.resolve_anchor(story_photo_frame, STORY_GEO) == "bottom"


def test_an_explicit_anchor_wins(story_frame):
    story_frame.anchor = "top"
    assert slide.resolve_anchor(story_frame, STORY_GEO) == "top"


def test_story_files_are_named_for_the_format(story_frame):
    spec = PostSpec(slug="story-set", format="story", slides=[story_frame])
    result = post_module.render_post(spec)
    assert [s.filename for s in result.slides] == ["story-01.png"]
    assert result.format == "story"
    assert (result.width, result.height) == (1080, 1920)


def test_stories_are_not_bound_by_the_carousel_surface_arc(story_photo_frame, story_frame):
    """A story set is separate frames, so first/last-azure does not apply."""
    spec = PostSpec(slug="story-mixed", format="story", slides=[story_photo_frame, story_frame])
    assert len(spec.slides) == 2


def test_a_post_carousel_still_enforces_the_arc(story_photo_frame, story_frame):
    with pytest.raises(ValueError, match="first slide"):
        PostSpec(slug="bad-post", format="post", slides=[story_photo_frame, story_frame])


def test_a_story_set_can_opt_into_the_arc(story_photo_frame, story_frame):
    with pytest.raises(ValueError, match="first slide"):
        PostSpec(
            slug="strict-story",
            format="story",
            slides=[story_photo_frame, story_frame],
            enforce_surface_order=True,
        )


def test_story_headline_can_run_larger_than_the_post_equivalent(story_frame):
    _, story_size = slide.fit_stack(story_frame, STORY_GEO)
    _, post_size = slide.fit_stack(story_frame, POST_GEO)
    assert story_size >= post_size


def test_unknown_format_is_rejected_at_the_contract(story_frame):
    with pytest.raises(ValueError):
        PostSpec(slug="bad-format", format="billboard", slides=[story_frame])


def test_a_single_post_shares_the_square_canvas(story_frame):
    assert SINGLE_GEO.size == POST_GEO.size
    assert SINGLE_GEO.filename_prefix == "main"


def test_a_single_post_renders_one_named_frame(story_frame):
    spec = PostSpec(slug="single-set", format="single", slides=[story_frame])
    result = post_module.render_post(spec)
    assert [s.filename for s in result.slides] == ["main-01.png"]
    assert (result.width, result.height) == (1080, 1080)


def test_a_single_post_refuses_more_than_one_frame(story_frame, story_photo_frame):
    with pytest.raises(ValueError, match="exactly one frame"):
        PostSpec(slug="too-many", format="single", slides=[story_frame, story_photo_frame])


def test_a_single_post_anchors_like_a_post_not_a_story(story_frame):
    assert slide.resolve_anchor(story_frame, SINGLE_GEO) == "top"
