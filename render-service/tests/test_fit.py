from __future__ import annotations

import sys

import pytest
from fastapi.testclient import TestClient

from afrisinc_render.app import app
from afrisinc_render.brand import tokens as T
from afrisinc_render.brand.geometry import POST_GEOMETRY as POST_GEO
from afrisinc_render.fit import fit_headlines
from afrisinc_render.render import typography as ty
from afrisinc_render.schema import HeadlineFitRequest

TOO_WIDE = "WE BUILD WHAT WORKS"
FITS = "Not a template."


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def request_for(*headlines: list[str]) -> HeadlineFitRequest:
    return HeadlineFitRequest(slides=[{"headline": list(h)} for h in headlines])


def test_copy_that_fits_is_passed_with_the_size_it_will_be_drawn_at():
    result = fit_headlines(request_for(["Your process.", FITS]))

    assert result.fits is True
    assert result.measure == POST_GEO.content_width
    assert result.slides[0].headline_size in T.BRAND_HEADLINE_SIZES
    assert all(line.fits for line in result.slides[0].lines)


def test_an_overlong_line_reports_the_measured_overflow():
    result = fit_headlines(request_for([TOO_WIDE]))

    assert result.fits is False
    line = result.slides[0].lines[0]
    assert line.fits is False
    assert line.text == TOO_WIDE
    assert line.width > POST_GEO.content_width
    assert line.overflow == pytest.approx(line.width - POST_GEO.content_width, abs=0.1)


def test_the_offending_slide_is_identified_among_ones_that_pass():
    result = fit_headlines(request_for([FITS], [TOO_WIDE], [FITS]))

    assert [slide.fits for slide in result.slides] == [True, False, True]
    assert result.slides[1].index == 1


def test_character_count_is_not_what_decides():
    short_and_wide = fit_headlines(request_for([TOO_WIDE])).slides[0]
    long_and_narrow = fit_headlines(request_for(["A failed printer is an"])).slides[0]

    assert len(TOO_WIDE) < len("A failed printer is an")
    assert short_and_wide.fits is False
    assert long_and_narrow.fits is True


def test_copy_is_held_to_the_brand_floor_not_the_renderer_floor():
    only_fits_at_69 = next(
        line
        for line in ["Tell us what is broken.", "Shipped, not slideware."]
        if ty.headline_fit([line], POST_GEO.content_width, T.HEADLINE_SIZES).size
        == T.MIN_HEADLINE_SIZE
    )

    assert fit_headlines(request_for([only_fits_at_69])).fits is False


def test_the_brand_floor_is_reported_so_the_caller_can_name_it():
    assert fit_headlines(request_for([FITS])).min_headline_size == T.HEADLINE_BRAND_FLOOR


def test_a_story_is_measured_against_its_own_geometry():
    result = fit_headlines(HeadlineFitRequest(format="story", slides=[{"headline": [FITS]}]))

    assert result.measure == POST_GEO.content_width
    assert result.fits is True


def test_the_endpoint_answers_the_copy_stage(client: TestClient):
    response = client.post(
        "/fit/headlines",
        json={"format": "post", "slides": [{"headline": [FITS]}, {"headline": [TOO_WIDE]}]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["fits"] is False
    assert body["slides"][1]["lines"][0]["overflow"] > 0


def test_the_endpoint_rejects_a_headline_with_no_lines(client: TestClient):
    response = client.post("/fit/headlines", json={"slides": [{"headline": []}]})

    assert response.status_code == 422


OVERLONG_BODY = (
    "We map the whole of your existing operational workflow in careful detail before any code"
)
SHORT_BODY = "We map your workflow first."


def rows_of(*bodies: str) -> list[dict[str, str]]:
    titles = ["DISCOVERY", "BUILD", "HAND OVER"]
    return [{"title": title, "body": body} for title, body in zip(titles, bodies, strict=False)]


def test_a_row_body_past_its_measure_is_reported():
    result = fit_headlines(
        HeadlineFitRequest(
            slides=[
                {
                    "headline": [FITS],
                    "rows": rows_of(OVERLONG_BODY, SHORT_BODY, SHORT_BODY),
                }
            ]
        )
    )

    assert result.fits is False
    offending = [line for line in result.slides[0].lines if not line.fits]
    assert [line.role for line in offending] == ["row body"]
    assert offending[0].overflow > 0


def test_a_row_body_is_measured_against_the_row_measure_not_the_content_width():
    result = fit_headlines(
        HeadlineFitRequest(slides=[{"headline": [FITS], "rows": rows_of(*(OVERLONG_BODY,) * 3)}])
    )
    body = next(line for line in result.slides[0].lines if line.role == "row body")

    assert body.width - body.overflow == POST_GEO.content_width - T.ROW_PADDING_X * 2


def test_rows_that_hold_their_measure_pass():
    result = fit_headlines(
        HeadlineFitRequest(slides=[{"headline": [FITS], "rows": rows_of(*(SHORT_BODY,) * 3)}])
    )

    assert result.fits is True
    assert [line.role for line in result.slides[0].lines].count("row body") == 3


def test_the_audit_module_imports_on_its_own():
    import subprocess

    result = subprocess.run(
        [sys.executable, "-c", "import afrisinc_render.audit"],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_a_slide_without_rows_still_measures_its_headline():
    result = fit_headlines(request_for([TOO_WIDE]))

    assert [line.role for line in result.slides[0].lines] == ["headline line"]
    assert result.fits is False
