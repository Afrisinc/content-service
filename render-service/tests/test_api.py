from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from afrisinc_render.app import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_health_reports_ready(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_render_returns_an_audited_result(client: TestClient, carousel):
    response = client.post("/render/post", json=carousel.model_dump(mode="json"))
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == carousel.slug
    assert len(body["slides"]) == 4
    assert body["passed"] is True
    assert (body["format"], body["width"], body["height"]) == ("post", 1080, 1080)


def test_formats_are_discoverable(client: TestClient):
    body = client.get("/formats").json()
    assert body["post"]["width"] == 1080 and body["post"]["height"] == 1080
    assert body["story"]["width"] == 1080 and body["story"]["height"] == 1920
    assert body["story"]["safe_top"] == 250


def test_a_story_renders_through_the_api(client: TestClient, carousel):
    payload = carousel.model_dump(mode="json")
    payload["slug"] = "api-story"
    payload["format"] = "story"
    payload["slides"] = payload["slides"][:2]
    response = client.post("/render/post", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert (body["format"], body["height"]) == ("story", 1920)
    assert body["slides"][0]["filename"] == "story-01.png"


def test_a_rendered_story_frame_is_downloadable(client: TestClient, carousel):
    payload = carousel.model_dump(mode="json")
    payload["slug"] = "api-story-download"
    payload["format"] = "story"
    payload["slides"] = payload["slides"][:1]
    client.post("/render/post", json=payload)
    response = client.get("/render/api-story-download/story-01.png")
    assert response.status_code == 200


def test_rendered_slide_is_downloadable(client: TestClient, carousel):
    client.post("/render/post", json=carousel.model_dump(mode="json"))
    response = client.get(f"/render/{carousel.slug}/slide-01.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_path_traversal_on_download_is_rejected(client: TestClient, carousel):
    response = client.get(f"/render/{carousel.slug}/..%2F..%2Fetc%2Fpasswd")
    assert response.status_code in (400, 404)


def test_invalid_surface_order_is_a_422(client: TestClient, carousel):
    payload = carousel.model_dump(mode="json")
    payload["slides"][1]["surface"] = "azure"
    payload["slides"][1]["photo"] = None
    response = client.post("/render/post", json=payload)
    assert response.status_code == 422


def test_missing_photo_reference_is_a_422(client: TestClient, carousel):
    payload = carousel.model_dump(mode="json")
    payload["slug"] = "missing-photo"
    payload["slides"][1]["photo"] = "not-here.png"
    response = client.post("/render/post", json=payload)
    assert response.status_code == 422
