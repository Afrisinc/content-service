from __future__ import annotations

import pytest

from afrisinc_render.brand import geometry as G
from afrisinc_render.brand import rules as R
from afrisinc_render.brand import tokens as T


def test_first_and_last_slide_must_be_azure():
    with pytest.raises(R.BrandRuleError, match="first slide"):
        R.validate_surface_order([R.PHOTO, R.WHITE, R.AZURE])
    with pytest.raises(R.BrandRuleError, match="last slide"):
        R.validate_surface_order([R.AZURE, R.WHITE, R.PHOTO])


def test_azure_slides_are_never_adjacent():
    with pytest.raises(R.BrandRuleError, match="both azure"):
        R.validate_surface_order([R.AZURE, R.AZURE, R.PHOTO, R.AZURE])


def test_proven_orders_pass():
    R.validate_surface_order([R.AZURE, R.PHOTO, R.WHITE, R.AZURE])
    R.validate_surface_order([R.AZURE, R.PHOTO, R.WHITE, R.PHOTO, R.AZURE])


def test_single_slide_has_no_order_constraint():
    R.validate_surface_order([R.PHOTO])


def test_carousel_length_is_capped_at_the_instagram_ceiling():
    with pytest.raises(R.BrandRuleError, match="at most 10"):
        R.validate_surface_order([R.AZURE] * 11)


def test_ten_slides_are_allowed_when_they_alternate():
    surfaces = [R.AZURE, R.PHOTO, R.WHITE, R.PHOTO, R.WHITE] * 2
    surfaces[-1] = R.AZURE
    R.validate_surface_order(surfaces)


def test_empty_carousel_rejected():
    with pytest.raises(R.BrandRuleError, match="at least one"):
        R.validate_surface_order([])


def test_unknown_surface_rejected():
    with pytest.raises(R.BrandRuleError, match="unknown surface"):
        R.validate_surface_order([R.AZURE, "teal", R.AZURE])


@pytest.mark.parametrize(
    ("surface", "claim", "expected"),
    [
        (R.AZURE, False, (T.WHITE, T.AZURE)),
        (R.WHITE, False, (T.AZURE, T.WHITE)),
        (R.PHOTO, False, (T.CORAL, T.WHITE)),
        (R.AZURE, True, (T.CORAL, T.WHITE)),
        (R.WHITE, True, (T.CORAL, T.WHITE)),
    ],
)
def test_pill_colours(surface, claim, expected):
    assert R.pill_colours(surface, claim=claim) == expected


def test_white_surface_headline_is_two_tone():
    assert R.headline_colours(R.WHITE, 3) == [T.INK, T.AZURE, T.AZURE]


def test_dark_surface_headline_is_all_white():
    assert R.headline_colours(R.PHOTO, 2) == [T.WHITE, T.WHITE]


def test_footer_dot_is_the_coral_on_white_only():
    assert R.footer_dot(R.WHITE) == T.CORAL
    assert R.footer_dot(R.AZURE) == T.WHITE
    assert R.footer_dot(R.PHOTO) == T.WHITE


def test_photo_surfaces_carry_no_watermark():
    assert R.watermark(R.PHOTO) is None
    assert R.watermark(R.AZURE) == (T.WHITE, T.WATERMARK_ALPHA_DARK)
    assert R.watermark(R.WHITE) == (T.AZURE, T.WATERMARK_ALPHA_LIGHT)


def test_column_field_resolves_to_the_content_width():
    field = T.COLUMN_COUNT * T.COLUMN_WIDTH + (T.COLUMN_COUNT - 1) * T.GUTTER
    for geo in G.FORMATS.values():
        assert field == geo.content_width


def test_furniture_sits_on_the_baseline_unit():
    for geo in G.FORMATS.values():
        for value in (geo.margin, geo.header_y, geo.masthead_y, geo.footer_y):
            assert value % T.BASELINE_UNIT == 0


def test_story_furniture_stays_inside_the_platform_safe_zone():
    geo = G.STORY_GEOMETRY
    assert geo.header_y - 40 >= geo.safe_top
    assert geo.footer_y + 40 <= geo.safe_bottom
    assert geo.band_top >= geo.safe_top
    assert geo.band_bottom <= geo.safe_bottom


def test_story_band_is_taller_than_the_post_band():
    assert G.STORY_GEOMETRY.band_height > G.POST_GEOMETRY.band_height


def test_formats_have_distinct_filename_prefixes():
    prefixes = {geo.filename_prefix for geo in G.FORMATS.values()}
    assert len(prefixes) == len(G.FORMATS)


def test_unknown_format_is_rejected():
    with pytest.raises(ValueError, match="unknown format"):
        G.geometry_for("billboard")
