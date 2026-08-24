from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from afrisinc_render import audit
from afrisinc_render.brand import tokens as T
from afrisinc_render.brand.geometry import POST_GEOMETRY as POST_GEO
from afrisinc_render.brand.geometry import STORY_GEOMETRY as STORY_GEO
from afrisinc_render.luminance import contrast_on_white, region_luminance
from afrisinc_render.render import components as C
from afrisinc_render.render import plate, slide
from afrisinc_render.render import typography as ty
from afrisinc_render.schema import Eyebrow, SlideSpec

SERVICE_FIXTURES = "tests/fixtures"

# The sub-line from the story that shipped with type running off the right edge.
LONG_SUB = "Trade a slow night for a site that keeps working after you go home."


@pytest.fixture(scope="module")
def bright_photo(tmp_path_factory) -> str:
    """A frame that is blown out exactly where a headline lands — the failure mode a
    top-and-bottom scrim cannot see."""
    import os
    from pathlib import Path

    directory = Path(os.environ["RENDER_PHOTO_DIR"])
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "bright-middle.png"

    image = Image.new("RGB", (1536, 1536), (18, 24, 36))
    band = Image.new("RGB", (1536, 700), (246, 248, 252))
    image.paste(band, (0, 420))
    image.save(path)
    return path.name


# ── the measurement itself ───────────────────────────────────────────────────


def test_a_bright_region_needs_ink_and_a_dark_one_does_not():
    assert plate.required_alpha(0.9) > 0
    assert plate.required_alpha(0.02) == 0.0


def test_more_ink_is_asked_for_as_the_background_brightens():
    assert plate.required_alpha(0.9) > plate.required_alpha(0.4)


def test_the_alpha_asked_for_actually_reaches_the_target():
    for luminance in (0.35, 0.6, 0.8, 0.95):
        alpha = plate.required_alpha(luminance)
        ink = 0.0105  # near-black at INK
        mixed = luminance * (1 - alpha) + ink * alpha
        assert contrast_on_white(mixed) >= plate.TARGET_CONTRAST - 0.35


def test_a_small_blown_out_patch_still_counts():
    """Four percent of the rect is enough to swallow two words, so the average is
    the wrong measure — the worst cell decides."""
    from afrisinc_render.luminance import relative_luminance

    image = Image.new("RGB", (200, 200), (10, 10, 10))
    image.paste(Image.new("RGB", (40, 40), (255, 255, 255)), (80, 80))
    rect = (0, 0, 200, 200)

    average = relative_luminance(np.asarray(image).reshape(-1, 3))

    assert region_luminance(image, rect) > average * 5
    assert plate.required_alpha(region_luminance(image, rect)) > 0


def test_a_uniformly_dark_region_asks_for_nothing():
    image = Image.new("RGB", (200, 200), (14, 20, 30))
    assert plate.required_alpha(region_luminance(image, (0, 0, 200, 200))) == 0.0


def test_an_empty_rect_measures_as_dark_rather_than_exploding():
    image = Image.new("RGB", (100, 100), (255, 255, 255))
    assert region_luminance(image, (50, 50, 40, 40)) == 0.0


# ── the plate ────────────────────────────────────────────────────────────────


def test_a_plate_can_only_ever_remove_light():
    """The plate is brand navy, which is lighter than a deep shadow in green and blue.
    A plain blend would lift an already-dark frame."""
    for colour in ((12, 18, 28), (4, 4, 4), (74, 84, 96), (245, 247, 250)):
        source = Image.new("RGB", POST_GEO.size, colour)
        plated = plate.apply(source, POST_GEO, [(96, 400, 900, 520)])
        assert (np.asarray(plated).astype(int) <= np.asarray(source).astype(int)).all()


def test_a_dark_frame_is_barely_touched():
    dark = Image.new("RGB", POST_GEO.size, (12, 18, 28))
    rect = (96, 400, 900, 520)

    before = np.asarray(dark.crop(rect)).mean()
    after = np.asarray(plate.apply(dark, POST_GEO, [rect]).crop(rect)).mean()

    assert before - after < 2


def test_the_floor_can_be_switched_off():
    dark = Image.new("RGB", POST_GEO.size, (12, 18, 28))
    assert plate.apply(dark, POST_GEO, [(96, 400, 900, 520)], floor=0.0) is dark


def test_the_floor_lands_on_a_frame_that_needs_no_repair():
    """A mid-tone photograph that already clears the ratio still gets the wash, so a
    carousel does not come out with some frames washed and others not."""
    mid = Image.new("RGB", POST_GEO.size, (74, 84, 96))
    rect = (96, 400, 900, 520)

    assert plate.required_alpha(region_luminance(mid, rect)) == 0.0
    assert np.asarray(plate.apply(mid, POST_GEO, [rect]).crop(rect)).mean() < np.asarray(
        mid.crop(rect)
    ).mean()


def test_a_light_plate_cannot_erase_a_strong_one_it_overlaps():
    bright = Image.new("RGB", POST_GEO.size, (245, 247, 250))
    strong = (96, 400, 900, 520)
    weak = (96, 380, 900, 560)  # drawn around it, needs only the floor on a dark frame

    plated = plate.apply(bright, POST_GEO, [strong, weak])

    assert contrast_on_white(region_luminance(plated, strong)) >= T.MIN_TEXT_CONTRAST


def test_a_bright_frame_is_darkened_where_the_type_lands():
    bright = Image.new("RGB", POST_GEO.size, (240, 244, 250))
    rect = (96, 400, 900, 520)

    plated = plate.apply(bright, POST_GEO, [rect])

    assert region_luminance(plated, rect) < region_luminance(bright, rect)
    assert contrast_on_white(region_luminance(plated, rect)) >= T.MIN_TEXT_CONTRAST


def test_the_darkening_falls_off_instead_of_ending_in_an_edge():
    bright = Image.new("RGB", POST_GEO.size, (240, 244, 250))
    plated = np.asarray(plate.apply(bright, POST_GEO, [(96, 400, 900, 520)]).convert("RGB"))

    column = plated[:, 500].mean(axis=1)
    # No single row may jump hard: a visible seam is worse than no plate at all.
    assert np.abs(np.diff(column)).max() < 12


# ── overflow ─────────────────────────────────────────────────────────────────


def test_the_sub_line_that_used_to_overflow_now_fits():
    block = C.SubLine(LONG_SUB, T.WHITE)
    for left, _, right, _ in block.bounds(400, POST_GEO):
        assert right <= POST_GEO.right_edge
        assert left >= POST_GEO.margin


def test_a_sub_line_shrinks_before_it_wraps():
    block = C.SubLine(LONG_SUB, T.WHITE)
    size, lines = block._fitted(POST_GEO)
    assert size < T.SIZE_SUB
    assert len(lines) == 1


def test_an_unshrinkable_sub_line_wraps_rather_than_overflowing():
    block = C.SubLine(" ".join(["word"] * 60), T.WHITE)
    size, lines = block._fitted(POST_GEO)
    assert len(lines) > 1
    for _, _, right, _ in block.bounds(400, POST_GEO):
        assert right <= POST_GEO.right_edge


def test_a_wrapped_sub_line_reports_the_taller_height():
    short = C.SubLine("Short line.", T.WHITE)
    long = C.SubLine(" ".join(["word"] * 60), T.WHITE)
    assert long.height(POST_GEO) > short.height(POST_GEO)


def test_row_bodies_are_measured_too():
    rows = C.Rows(
        [
            ("DISCOVERY FIRST", "We map the workflow you already have before a line of code."),
            ("EVERY SPRINT", "You see it running rather than described in a status report."),
            ("YOURS TO KEEP", "Your repository, your servers, your data, and no lock-in."),
        ]
    )
    measure = POST_GEO.content_width - T.ROW_PADDING_X * 2
    size = rows._body_size(POST_GEO)
    for _, body in rows.items:
        assert ty.text_width(body, ty.font(ty.REGULAR, size), ty.tracking(size)) <= measure


def test_wrapping_never_loses_a_word():
    lines = ty.wrap_to_width(LONG_SUB, ty.REGULAR, 28, 400)
    assert " ".join(lines).split() == LONG_SUB.split()


# ── end to end ───────────────────────────────────────────────────────────────


def test_white_type_survives_a_blown_out_middle(bright_photo):
    spec = SlideSpec(
        surface="photo",
        photo=bright_photo,
        eyebrow=Eyebrow(text="Get listed", kind="claim"),
        headline=["Build your", "front door."],
        subs=[LONG_SUB],
    )

    frame = slide.render(spec, POST_GEO)
    findings = audit.audit_slide(0, spec, frame.image, POST_GEO, frame.bounds, frame.contrast)

    assert [f for f in findings if f.severity == "error"] == []
    assert all(ratio >= T.MIN_TEXT_CONTRAST for _, ratio in frame.contrast)


def test_the_same_frame_as_a_story_also_holds(bright_photo):
    spec = SlideSpec(
        surface="photo",
        photo=bright_photo,
        eyebrow=Eyebrow(text="Get listed", kind="claim"),
        headline=["Build your", "front door."],
        subs=[LONG_SUB],
    )

    frame = slide.render(spec, STORY_GEO)
    findings = audit.audit_slide(0, spec, frame.image, STORY_GEO, frame.bounds, frame.contrast)

    assert [f for f in findings if f.severity == "error"] == []


def test_contrast_is_measured_before_the_type_is_drawn(bright_photo):
    """Measuring the finished frame samples the white glyphs and reports 1:1."""
    spec = SlideSpec(
        surface="photo",
        photo=bright_photo,
        headline=["Build your", "front door."],
    )
    frame = slide.render(spec, POST_GEO)

    assert frame.contrast
    assert all(ratio > 1.5 for _, ratio in frame.contrast)


def test_a_flat_surface_reports_no_contrast_samples():
    """Azure and white are known quantities; only photography needs measuring."""
    spec = SlideSpec(surface="white", headline=["Ship in weeks,", "not quarters."])
    assert slide.render(spec, POST_GEO).contrast == []


def test_the_audit_catches_type_pushed_outside_the_measure():
    spec = SlideSpec(surface="azure", headline=["Your process."])
    frame = slide.render(spec, POST_GEO)
    runaway = [(POST_GEO.margin, 400.0, POST_GEO.right_edge + 60.0, 460.0)]

    findings = audit.audit_slide(0, spec, frame.image, POST_GEO, runaway, [])

    assert any(finding.rule == "overflow" for finding in findings)


def test_an_optical_hang_is_not_reported_as_overflow():
    spec = SlideSpec(surface="azure", headline=["Your process."])
    frame = slide.render(spec, POST_GEO)
    hung = [(POST_GEO.margin - 5.0, 400.0, POST_GEO.right_edge - 10.0, 460.0)]

    findings = audit.audit_slide(0, spec, frame.image, POST_GEO, hung, [])

    assert not any(finding.rule == "overflow" for finding in findings)


def test_a_filled_pill_is_not_asked_to_prove_its_contrast():
    pill = C.CtaPill("afrisinc.com", T.WHITE, T.AZURE)
    assert pill.plate_bounds(400, POST_GEO) == []
    assert pill.bounds(400, POST_GEO) != []


# ── clearance ────────────────────────────────────────────────────────────────


def test_every_format_leaves_air_above_the_contact_rail():
    from afrisinc_render.brand.geometry import FORMATS

    for name, geo in FORMATS.items():
        assert geo.rail_clearance >= 48, f"{name} crowds the rail at {geo.rail_clearance}px"


def test_the_stack_stops_short_of_the_contact_rail(bright_photo):
    spec = SlideSpec(
        surface="photo",
        photo=bright_photo,
        eyebrow=Eyebrow(text="Get listed", kind="claim"),
        headline=["Build your", "front door."],
        subs=[LONG_SUB],
    )

    for geo in (POST_GEO, STORY_GEO):
        frame = slide.render(spec, geo)
        assert max(bottom for _, _, _, bottom in frame.bounds) <= geo.band_bottom
