from __future__ import annotations

import pytest

from afrisinc_render.brand import tokens as T
from afrisinc_render.brand.geometry import POST_GEOMETRY
from afrisinc_render.render import typography as ty


def test_all_required_weights_are_present():
    ty.verify_fonts()


@pytest.mark.parametrize(
    ("size", "expected_sign"),
    [(135, -1), (108, -1), (86, -1), (55, -1), (35, -1), (24, 0)],
)
def test_display_type_gets_negative_tracking(size, expected_sign):
    value = ty.tracking(size)
    if expected_sign < 0:
        assert value < 0
    else:
        assert value == 0


def test_small_caps_get_positive_tracking():
    assert ty.tracking(22, caps=True) > 0
    assert ty.tracking(18, caps=True) > 0


def test_tracking_tightens_as_size_grows():
    ratios = [abs(ty.tracking(size)) / size for size in (44, 72, 100, 135)]
    assert ratios == sorted(ratios)


@pytest.mark.parametrize("char", list("AVWYT"))
def test_diagonal_openers_hang_furthest(char):
    assert ty.hang(char, 100) == pytest.approx(-3.5)


@pytest.mark.parametrize("char", list("OCGSe"))
def test_round_openers_hang_slightly(char):
    assert ty.hang(char, 100) == pytest.approx(-1.5)


@pytest.mark.parametrize("char", list("HINME1"))
def test_straight_stems_do_not_hang(char):
    assert ty.hang(char, 100) == 0.0


def test_quotes_hang_hardest():
    assert ty.hang('"', 100) == pytest.approx(-30.0)


def test_headline_size_comes_off_the_scale():
    size = ty.headline_size(["Your process.", "Not a template."], POST_GEOMETRY.content_width)
    assert size in T.HEADLINE_SIZES


def test_long_headline_drops_to_a_smaller_step():
    short = ty.headline_size(["Save this."], POST_GEOMETRY.content_width)
    long = ty.headline_size(
        ["Tell us the workflow and we will scope it"], POST_GEOMETRY.content_width
    )
    assert long < short


def test_headline_never_goes_below_the_floor():
    assert ty.headline_size(["x" * 200], POST_GEOMETRY.content_width) >= T.MIN_HEADLINE_SIZE


def test_leading_tightens_past_two_lines():
    assert ty.headline_leading(100, 2) > ty.headline_leading(100, 3)


def test_text_width_accounts_for_tracking():
    fnt = ty.font(ty.BOLD, 100)
    assert ty.text_width("AAA", fnt, 10) > ty.text_width("AAA", fnt, 0)


def test_empty_string_measures_zero():
    assert ty.text_width("", ty.font(ty.BOLD, 100), 5) == 0.0


def test_rag_flags_an_orphan_preposition():
    problems = ty.rag_violations(["We build software for", "your team."])
    assert any("ends on 'for'" in problem for problem in problems)


def test_rag_flags_a_stub_last_line():
    problems = ty.rag_violations(["A considerably longer opening line here", "no"])
    assert any("25%" in problem for problem in problems)


def test_clean_rag_has_no_findings():
    assert ty.rag_violations(["Your process.", "Not a template."]) == []


def test_cap_and_x_height_are_ordered():
    fnt = ty.font(ty.BOLD, 100)
    assert ty.x_height(fnt) < ty.cap_height(fnt)
