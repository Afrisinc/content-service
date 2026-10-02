from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from afrisinc_render import audit
from afrisinc_render.app import app
from afrisinc_render.brand import tokens as T
from afrisinc_render.brand.geometry import POST_GEOMETRY as POST_GEO
from afrisinc_render.brand.geometry import STORY_GEOMETRY as STORY_GEO
from afrisinc_render.brand.geometry import news_geometry
from afrisinc_render.fit import fit_headlines
from afrisinc_render.render import furniture, marks, slide
from afrisinc_render.render import typography as ty
from afrisinc_render.schema import (
    Eyebrow,
    HeadlineFitRequest,
    HeadlineWrapRequest,
    SlideSpec,
)
from afrisinc_render.wrap import wrap_headline

DATELINE = "Source: TechCabal · 2 Oct 2026"
STANDFIRST = "Regulators agreed a shared licensing regime that lets licensed banks build on it."


def news_spec(**overrides) -> SlideSpec:
    fields = dict(
        surface="photo",
        photo="bench.png",
        layout="news",
        eyebrow=Eyebrow(text="Fintech", kind="claim"),
        headline=["Kenya opens M-Pesa API", "to regional banks"],
        subs=[STANDFIRST],
        dateline=DATELINE,
    )
    fields.update(overrides)
    return SlideSpec(**fields)


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


class TestNewsSlideContract:
    def test_a_complete_news_frame_is_valid(self):
        spec = news_spec()

        assert spec.layout == "news"
        assert spec.shows_site is False

    @pytest.mark.parametrize(
        "overrides",
        [
            {"surface": "azure", "photo": None},
            {"cta": {"text": "afrisinc.com"}},
            {"closing": "More to read."},
            {"coral_rule": True, "eyebrow": None},
            {"strike_line": 0, "eyebrow": None},
            {"subs": ["One.", "Two."]},
            {"dateline": None},
        ],
    )
    def test_anything_beyond_a_headline_and_standfirst_is_refused(self, overrides):
        with pytest.raises(ValidationError):
            news_spec(**overrides)

    def test_a_dateline_belongs_to_the_news_layout_only(self):
        with pytest.raises(ValidationError):
            SlideSpec(
                surface="azure", headline=["A headline"], dateline="Source: TechCabal · 2 Oct 2026"
            )

    def test_the_brand_layout_is_the_default_and_still_shows_the_site(self):
        spec = SlideSpec(surface="azure", headline=["A headline"])

        assert spec.layout == "brand"
        assert spec.shows_site is True


class TestNewsGeometry:
    def test_the_type_band_runs_down_to_the_dateline(self):
        news = news_geometry(POST_GEO)

        assert news.band_bottom == POST_GEO.footer_y - T.NEWS_BAND_CLEARANCE
        assert news.band_bottom > POST_GEO.band_bottom
        assert news.band_top == POST_GEO.band_top

    def test_the_original_geometry_is_untouched(self):
        before = POST_GEO.band_bottom

        news_geometry(POST_GEO)

        assert POST_GEO.band_bottom == before


class TestNewsRendering:
    def test_a_news_frame_renders_at_the_canvas_size_and_passes_its_audit(self):
        spec = news_spec()
        frame = slide.render(spec, POST_GEO)

        findings = audit.audit_slide(0, spec, frame.image, POST_GEO, frame.bounds, frame.contrast)

        assert frame.image.size == POST_GEO.size
        assert [f for f in findings if f.severity == "error"] == []

    def test_the_headline_sets_on_the_news_scale(self):
        frame = slide.render(news_spec(), POST_GEO)

        assert frame.headline_size in T.NEWS_HEADLINE_SIZES

    def test_the_marketing_furniture_is_not_drawn(self, monkeypatch):
        def refuse(*_args, **_kwargs):
            raise AssertionError("marketing furniture drawn on a news frame")

        monkeypatch.setattr(furniture, "contact_rail", refuse)
        monkeypatch.setattr(furniture, "footer", refuse)
        monkeypatch.setattr(marks, "registration_marks", refuse)
        monkeypatch.setattr(marks, "watermark", refuse)
        monkeypatch.setattr(marks, "masthead", refuse)

        slide.render(news_spec(), POST_GEO)

    def test_a_news_frame_carries_a_news_badge_in_the_header_corner(self):
        frame = slide.render(news_spec(), POST_GEO)
        left, top, right, bottom = furniture.news_badge_rect(news_geometry(POST_GEO))
        pixels = np.asarray(frame.image.convert("RGB"))
        centre_y = int((top + bottom) / 2)

        inside = pixels[int(top) + 4 : int(bottom) - 4, int(left) + 4 : int(right) - 4]
        white = (inside.min(axis=2) > 235).mean()
        coral = (np.abs(inside.astype(int) - np.array(T.CORAL)).sum(axis=2) < 60).sum()

        assert white > 0.45
        assert coral > 80
        assert right == POST_GEO.right_edge
        assert abs(centre_y - POST_GEO.header_y) <= 1

    def test_the_badge_sits_clear_of_the_logo_and_inside_the_margins(self):
        left, top, right, _ = furniture.news_badge_rect(news_geometry(POST_GEO))
        wordmark_end = POST_GEO.margin + furniture.LOGO_MARK_SIZE + furniture.LOGO_TEXT_GAP + 260

        assert left > wordmark_end
        assert right <= POST_GEO.right_edge
        assert top >= 0

    def test_the_badge_is_drawn_for_a_news_frame_only(self, monkeypatch, azure_slide):
        drawn: list[int] = []
        real = furniture.news_badge
        monkeypatch.setattr(
            furniture, "news_badge", lambda *args, **kw: (drawn.append(1), real(*args, **kw))
        )

        slide.render(azure_slide, POST_GEO)
        assert drawn == []

        slide.render(news_spec(), POST_GEO)
        assert drawn == [1]

    def test_the_dateline_is_drawn_for_a_news_frame_only(self, monkeypatch):
        drawn: list[str] = []
        real = furniture.dateline
        monkeypatch.setattr(
            furniture, "dateline", lambda *args, **kw: (drawn.append(args[2]), real(*args, **kw))
        )

        slide.render(news_spec(), POST_GEO)

        assert drawn == [DATELINE]

    def test_the_stack_stays_inside_the_news_band(self):
        geo = news_geometry(POST_GEO)
        stack, _ = slide.fit_stack(news_spec(), geo)
        top = stack.top_for(slide.resolve_anchor(news_spec(), geo), geo)

        assert top >= geo.band_top
        assert top + stack.height(geo) <= geo.band_bottom

    def test_a_story_format_news_frame_also_renders(self):
        frame = slide.render(news_spec(), STORY_GEO)

        assert frame.image.size == STORY_GEO.size

    def test_the_longest_news_headline_still_fits_without_leaving_the_frame(self):
        lines = wrap_headline(
            HeadlineWrapRequest(
                text="Nigeria's central bank, Kenya's regulators and South Africa's treasury "
                "agree a joint framework for cross-border mobile money settlement",
                format="single",
            )
        ).lines
        spec = news_spec(headline=lines)
        frame = slide.render(spec, POST_GEO)

        findings = audit.audit_slide(0, spec, frame.image, POST_GEO, frame.bounds, frame.contrast)

        assert [f for f in findings if f.severity == "error"] == []


class TestNewsAudit:
    def test_news_frames_are_audited_at_the_header_and_dateline_not_the_contact_rail(self):
        names = [name for name, _top, _bottom in audit.text_bands(POST_GEO, "news")]

        assert names == ["header", "dateline"]

    def test_brand_frames_keep_their_original_bands(self):
        names = [name for name, _top, _bottom in audit.text_bands(POST_GEO)]

        assert names == ["header", "contact_rail", "footer"]

    def test_a_headline_below_the_news_floor_is_flagged(self):
        spec = news_spec()
        frame = slide.render(spec, POST_GEO)

        findings = audit.audit_slide(
            0, spec, frame.image, POST_GEO, frame.bounds, frame.contrast, headline_size=44
        )

        assert any(f.rule == "headline_size" for f in findings)

    def test_a_headline_at_the_news_floor_is_not_flagged(self):
        spec = news_spec()
        frame = slide.render(spec, POST_GEO)

        findings = audit.audit_slide(
            0,
            spec,
            frame.image,
            POST_GEO,
            frame.bounds,
            frame.contrast,
            headline_size=T.NEWS_HEADLINE_FLOOR,
        )

        assert not any(f.rule == "headline_size" for f in findings)


class TestWrapHeadline:
    def wrap(self, text: str, format: str = "single"):
        return wrap_headline(HeadlineWrapRequest(text=text, format=format))

    def test_a_short_headline_sets_large_on_few_lines(self):
        result = self.wrap("Kenya opens M-Pesa API")

        assert result.size == T.NEWS_HEADLINE_SIZES[0]
        assert result.truncated is False
        assert len(result.lines) <= 3

    def test_every_line_holds_the_measure_at_the_size_it_reports(self):
        geo = news_geometry(POST_GEO)
        result = self.wrap("Kenya opens M-Pesa API to regional banks as mobile money goes formal")

        assert all(ty.fits(line, ty.BOLD, result.size, geo.content_width) for line in result.lines)

    def test_a_long_headline_uses_a_smaller_size_rather_than_more_than_four_lines(self):
        result = self.wrap(
            "Dangote Refinery IPO could give Nigerian startup founders a public benchmark "
            "for late stage exits and investor returns"
        )

        assert len(result.lines) <= T.MAX_HEADLINE_LINES
        assert result.size < T.NEWS_HEADLINE_SIZES[0]

    def test_the_words_come_back_in_order_and_complete(self):
        text = "Kenya opens M-Pesa API to regional banks"

        assert " ".join(self.wrap(text).lines) == text

    def test_extra_whitespace_is_collapsed(self):
        assert " ".join(self.wrap("  Kenya   opens\nM-Pesa  API ").lines) == "Kenya opens M-Pesa API"

    def test_the_lines_are_balanced_not_left_with_a_stub_last_line(self):
        result = self.wrap("Kenya opens M-Pesa API to regional banks")

        longest = max(len(line) for line in result.lines)
        assert len(result.lines[-1]) / longest >= 0.4 or len(result.lines) == 1

    def test_a_headline_that_cannot_fit_is_cut_and_says_so(self):
        result = self.wrap("word " * 79)

        assert result.truncated is True
        assert result.size == T.NEWS_HEADLINE_FLOOR
        assert len(result.lines) <= T.MAX_HEADLINE_LINES
        assert result.lines[-1].endswith("…")

    def test_a_single_word_wider_than_the_measure_is_cut_to_fit(self):
        geo = news_geometry(POST_GEO)
        result = self.wrap("A" * 80)

        assert result.truncated is True
        assert all(
            ty.fits(line, ty.BOLD, T.NEWS_HEADLINE_FLOOR, geo.content_width)
            for line in result.lines
        )

    def test_the_result_renders_without_complaint(self):
        spec = news_spec(headline=self.wrap("Kenya opens M-Pesa API to regional banks").lines)

        assert slide.render(spec, POST_GEO).image.size == POST_GEO.size


class TestWrapEndpoint:
    def test_it_returns_the_lines_and_size(self, client):
        response = client.post(
            "/layout/headline", json={"text": "Kenya opens M-Pesa API", "format": "single"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["lines"]
        assert body["size"] in T.NEWS_HEADLINE_SIZES
        assert body["truncated"] is False

    def test_it_rejects_text_that_is_too_short(self, client):
        assert client.post("/layout/headline", json={"text": "x"}).status_code == 422

    def test_it_rejects_an_unknown_format(self, client):
        response = client.post("/layout/headline", json={"text": "A headline", "format": "banner"})

        assert response.status_code == 422


class TestNewsFit:
    def test_news_slides_are_checked_on_the_news_scale(self):
        request = HeadlineFitRequest(
            format="single",
            slides=[
                {
                    "layout": "news",
                    "headline": ["Kenya opens M-Pesa API", "to regional banks"],
                    "eyebrow": {"text": "Fintech", "kind": "claim"},
                    "subs": [STANDFIRST],
                }
            ],
        )

        result = fit_headlines(request)

        assert result.min_headline_size == T.NEWS_HEADLINE_FLOOR
        assert result.fits is True
        assert result.slides[0].headline_size in T.NEWS_HEADLINE_SIZES

    def test_brand_slides_keep_the_brand_floor(self):
        result = fit_headlines(HeadlineFitRequest(slides=[{"headline": ["Your process."]}]))

        assert result.min_headline_size == T.HEADLINE_BRAND_FLOOR
