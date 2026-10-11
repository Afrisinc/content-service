from __future__ import annotations

from typing import get_args

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from afrisinc_render.app import app
from afrisinc_render.brand.geometry import FORMATS
from afrisinc_render.errors import LayoutOverflowError, SpecInvalidError
from afrisinc_render.render import post
from afrisinc_render.render.templates import registry
from afrisinc_render.schema import (
    Eyebrow,
    HeadlineFitRequest,
    HeadlineFitSlide,
    NewsTemplate,
    PostSpec,
    SlideSpec,
)

TEMPLATE_NAMES = [template.name for template in registry.catalog()]


def spec_for(template: str, **overrides) -> SlideSpec:
    fields = dict(
        surface="photo",
        photo="default-photo.jpg",
        template=template,
        eyebrow=Eyebrow(text="Football", kind="claim"),
        headline=["Algeria's wait", "goes on"],
        subs=["A late chance goes begging as the group stays wide open."],
        dateline="Source: Sample wire · 11 Oct 2026",
    )
    fields.update(overrides)
    return SlideSpec(**fields)


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_registry_matches_the_wire_contract():
    assert sorted(TEMPLATE_NAMES) == sorted(get_args(NewsTemplate))


def test_unknown_template_is_rejected_by_the_registry():
    with pytest.raises(SpecInvalidError):
        registry.get("news.missing")


def test_unknown_template_is_rejected_by_the_schema():
    with pytest.raises(ValidationError):
        spec_for("news.missing")


@pytest.mark.parametrize("name", TEMPLATE_NAMES)
def test_a_template_implies_the_editorial_layout(name):
    assert spec_for(name).layout == "news"


@pytest.mark.parametrize(
    "overrides",
    [{"dateline": None}, {"surface": "azure", "photo": None}, {"cta": {"text": "afrisinc.com"}}],
)
def test_templates_keep_the_editorial_contract(overrides):
    with pytest.raises(ValidationError):
        spec_for("news.split", **overrides)


@pytest.mark.parametrize("fmt", ["single", "story", "portrait"])
@pytest.mark.parametrize("name", TEMPLATE_NAMES)
def test_every_template_renders_clean_in_every_format(name, fmt):
    slug = f"tpl-{name.split('.')[1]}-{fmt}"
    result = post.render_post(PostSpec(slug=slug, format=fmt, slides=[spec_for(name)]))

    geo = FORMATS[fmt]
    assert (result.width, result.height) == geo.size
    assert result.passed
    assert result.findings == []


@pytest.mark.parametrize("name", TEMPLATE_NAMES)
def test_templates_are_visually_distinct_from_each_other(name):
    reference = post.render_post(
        PostSpec(slug="tpl-ref", format="single", slides=[spec_for("news.classic")])
    )
    result = post.render_post(PostSpec(slug="tpl-cmp", format="single", slides=[spec_for(name)]))

    assert result.slides[0].bytes > 0
    if name != "news.classic":
        assert result.slides[0].bytes != reference.slides[0].bytes


@pytest.mark.parametrize("name", TEMPLATE_NAMES)
def test_a_template_without_an_eyebrow_still_renders(name):
    result = post.render_post(
        PostSpec(slug="tpl-bare", format="single", slides=[spec_for(name, eyebrow=None)])
    )

    assert result.passed


@pytest.mark.parametrize("name", TEMPLATE_NAMES)
def test_oversized_copy_raises_instead_of_drawing_off_canvas(name):
    spec = spec_for(name, headline=["An impossibly long headline line that cannot fit", "x"])

    with pytest.raises(LayoutOverflowError):
        registry.get(name).layout(spec, FORMATS["single"])


def test_default_path_is_unchanged_without_a_template():
    spec = spec_for("news.classic")
    legacy = SlideSpec(**{**spec.model_dump(), "template": None, "layout": "news"})

    assert (
        post.render_post(PostSpec(slug="tpl-a", format="single", slides=[spec])).slides[0].bytes
        == post.render_post(PostSpec(slug="tpl-b", format="single", slides=[legacy]))
        .slides[0]
        .bytes
    )


class TestTemplatesEndpoint:
    def test_lists_every_template(self, client):
        body = client.get("/templates").json()

        assert [entry["name"] for entry in body] == TEMPLATE_NAMES
        assert all(entry["title"] and entry["description"] for entry in body)

    def test_render_accepts_a_template(self, client):
        payload = PostSpec(
            slug="tpl-api", format="single", slides=[spec_for("news.bulletin")]
        ).model_dump(mode="json")

        response = client.post("/render/post", json=payload)

        assert response.status_code == 200
        assert response.json()["passed"] is True

    def test_render_rejects_an_unknown_template(self, client):
        payload = PostSpec(
            slug="tpl-api", format="single", slides=[spec_for("news.split")]
        ).model_dump(mode="json")
        payload["slides"][0]["template"] = "news.missing"

        assert client.post("/render/post", json=payload).status_code == 422

    @pytest.mark.parametrize("name", TEMPLATE_NAMES)
    def test_fit_measures_against_the_template(self, client, name):
        request = HeadlineFitRequest(
            format="single",
            slides=[
                HeadlineFitSlide(
                    template=name,
                    headline=["Algeria's wait", "goes on"],
                    subs=["A short standfirst."],
                )
            ],
        )

        body = client.post("/fit/headlines", json=request.model_dump(mode="json")).json()

        assert body["fits"] is True
        assert body["slides"][0]["lines"][-1]["role"] == "stack height"

    def test_fit_flags_copy_that_overflows_a_template(self, client):
        request = HeadlineFitRequest(
            format="single",
            slides=[
                HeadlineFitSlide(
                    template="news.frame",
                    headline=["An impossibly long headline line that cannot fit", "x"],
                )
            ],
        )

        body = client.post("/fit/headlines", json=request.model_dump(mode="json")).json()

        assert body["fits"] is False


RICH = ["news.breaking", "news.broadsheet"]


def rich_spec(template: str, **overrides) -> SlideSpec:
    fields = dict(
        lead="Breaking News" if template == "news.breaking" else "Algeria",
        subs=["A late chance goes begging as **Algeria** drop points in the group."],
        dateline="10 May 2026",
    )
    if template == "news.broadsheet":
        fields.update(
            section="Football & Sport\nNorth Africa",
            subs=[
                "**Algeria** is left waiting after a late chance went begging.",
                "With qualification undecided the **squad** needs a result.",
            ],
            closing="Africa,\nstay tuned...\nthe finale is coming.",
        )
    fields.update(overrides)
    return spec_for(template, **fields)


@pytest.mark.parametrize("name", RICH)
def test_rich_templates_render_clean_with_all_their_fields(name):
    result = post.render_post(
        PostSpec(slug=f"tpl-rich-{name.split('.')[1]}", format="portrait", slides=[rich_spec(name)])
    )

    assert (result.width, result.height) == (1080, 1350)
    assert result.passed
    assert result.findings == []


@pytest.mark.parametrize("name", RICH)
def test_rich_templates_render_without_optional_fields(name):
    spec = spec_for(name, subs=[], eyebrow=None)

    result = post.render_post(PostSpec(slug="tpl-rich-bare", format="portrait", slides=[spec]))

    assert result.passed


@pytest.mark.parametrize("name", RICH)
def test_rich_templates_refuse_a_headline_line_wider_than_their_measure(name):
    spec = rich_spec(name, headline=["An impossibly long headline line that cannot fit", "x"])

    with pytest.raises(LayoutOverflowError):
        registry.get(name).layout(spec, FORMATS["portrait"])


def test_broadsheet_refuses_copy_that_overflows_the_column():
    spec = rich_spec("news.broadsheet", subs=["word " * 120, "word " * 120])

    with pytest.raises(LayoutOverflowError):
        registry.get("news.broadsheet").layout(spec, FORMATS["portrait"])


@pytest.mark.parametrize("name", [n for n in TEMPLATE_NAMES if n not in RICH])
def test_lead_and_section_belong_to_the_rich_templates(name):
    with pytest.raises(ValidationError):
        spec_for(name, lead="Algeria")
    with pytest.raises(ValidationError):
        spec_for(name, section="Football")


def test_a_closing_line_belongs_to_the_broadsheet_only():
    assert rich_spec("news.broadsheet").closing
    with pytest.raises(ValidationError):
        rich_spec("news.breaking", closing="the fire is coming")
    with pytest.raises(ValidationError):
        spec_for("news.split", closing="the fire is coming")


def test_only_the_broadsheet_takes_two_paragraphs():
    two = ["One paragraph.", "Another paragraph."]

    assert rich_spec("news.broadsheet", subs=two).subs == two
    with pytest.raises(ValidationError):
        rich_spec("news.breaking", subs=two)


class TestBoldMarkup:
    def test_double_asterisks_mark_bold_words(self):
        from afrisinc_render.render.templates.rich import parse_runs

        assert parse_runs("a **b c** d") == [("a", False), ("b", True), ("c", True), ("d", False)]

    def test_wrapping_keeps_every_word_and_respects_the_width(self):
        from afrisinc_render.render.templates.rich import line_width, parse_runs, wrap_runs

        segments = parse_runs("one two **three four** five six seven eight nine ten")
        lines = wrap_runs(segments, 28, 300)

        assert [word for line in lines for word, _ in line] == [word for word, _ in segments]
        assert all(line_width(line, 28) <= 300 for line in lines)

    def test_wrap_plain_honours_explicit_breaks(self):
        from afrisinc_render.render.templates.rich import wrap_plain
        from afrisinc_render.render.typography import SERIF, display_font

        lines = wrap_plain("Africa,\nstay tuned", display_font(SERIF, 60, 700), 900)

        assert lines == ["Africa,", "stay tuned"]


class TestPortraitFormat:
    def test_is_listed_with_its_canvas(self, client):
        formats = client.get("/formats").json()

        assert (formats["portrait"]["width"], formats["portrait"]["height"]) == (1080, 1350)

    @pytest.mark.parametrize("name", RICH)
    def test_fit_measures_the_rich_templates(self, client, name):
        request = HeadlineFitRequest(
            format="portrait",
            slides=[
                HeadlineFitSlide(
                    template=name,
                    lead="Algeria" if name == "news.broadsheet" else None,
                    headline=["ALGERIA'S WAIT", "GOES ON"]
                    if name == "news.broadsheet"
                    else ["ALGERIA'S WAIT GOES ON"],
                    subs=["A short standfirst."],
                )
            ],
        )

        body = client.post("/fit/headlines", json=request.model_dump(mode="json")).json()

        assert body["fits"] is True
        assert body["slides"][0]["lines"][0]["role"] == "stack height"

    def test_fit_flags_a_headline_wider_than_the_broadsheet_column(self, client):
        request = HeadlineFitRequest(
            format="portrait",
            slides=[
                HeadlineFitSlide(
                    template="news.broadsheet",
                    headline=["An impossibly long headline line that cannot fit"],
                )
            ],
        )

        body = client.post("/fit/headlines", json=request.model_dump(mode="json")).json()

        assert body["fits"] is False
