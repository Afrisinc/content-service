"""Resolving a remote photo reference, and refusing to be used as a proxy."""

from __future__ import annotations

import dataclasses

import pytest

from afrisinc_render.errors import PhotoUnavailableError
from afrisinc_render.render import photo_source


class FakeResponse:
    def __init__(self, *, status_code=200, headers=None, chunks=(b"binary",)):
        self.status_code = status_code
        self.headers = headers if headers is not None else {"content-type": "image/jpeg"}
        self._chunks = chunks

    def iter_bytes(self, _size):
        yield from self._chunks

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _settings(monkeypatch, **overrides):
    """Settings is a frozen dataclass, so swap the object rather than its fields."""
    monkeypatch.setattr(
        photo_source, "settings", dataclasses.replace(photo_source.settings, **overrides)
    )


@pytest.fixture(autouse=True)
def photo_dir(tmp_path, monkeypatch):
    _settings(monkeypatch, photo_dir=tmp_path)
    monkeypatch.setattr(photo_source, "_assert_public_host", lambda host: None)
    return tmp_path


def _stream(monkeypatch, response):
    monkeypatch.setattr(photo_source.httpx, "stream", lambda *a, **k: response)


class TestIsRemote:
    @pytest.mark.parametrize(
        "reference,expected",
        [
            ("https://cdn.example/a.jpg", True),
            ("http://cdn.example/a.jpg", True),
            ("HTTPS://CDN.EXAMPLE/a.jpg", True),
            ("business-image-01", False),
            ("nested/photo.png", False),
            ("file:///etc/passwd", False),
            ("", False),
        ],
    )
    def test_only_http_references_are_remote(self, reference, expected):
        assert photo_source.is_remote(reference) is expected


class TestFetch:
    def test_downloads_and_caches_the_photograph(self, monkeypatch, photo_dir):
        _stream(monkeypatch, FakeResponse(chunks=(b"abc", b"def")))

        path = photo_source.fetch("https://cdn.example/a.jpg")

        assert path.read_bytes() == b"abcdef"
        assert photo_dir in path.parents

    def test_a_second_call_does_not_download_again(self, monkeypatch):
        _stream(monkeypatch, FakeResponse())
        first = photo_source.fetch("https://cdn.example/a.jpg")

        def explode(*_a, **_k):
            raise AssertionError("should have been served from cache")

        monkeypatch.setattr(photo_source.httpx, "stream", explode)

        assert photo_source.fetch("https://cdn.example/a.jpg") == first

    def test_two_urls_do_not_collide(self, monkeypatch):
        _stream(monkeypatch, FakeResponse())
        first = photo_source.fetch("https://cdn.example/a.jpg")
        second = photo_source.fetch("https://cdn.example/b.jpg")

        assert first != second

    def test_rejects_a_non_image_content_type(self, monkeypatch):
        _stream(monkeypatch, FakeResponse(headers={"content-type": "text/html"}))

        with pytest.raises(PhotoUnavailableError, match="not an image"):
            photo_source.fetch("https://cdn.example/a.jpg")

    def test_accepts_a_content_type_with_parameters(self, monkeypatch):
        _stream(monkeypatch, FakeResponse(headers={"content-type": "image/png; charset=binary"}))

        assert photo_source.fetch("https://cdn.example/a.png").is_file()

    def test_rejects_a_bad_status(self, monkeypatch):
        _stream(monkeypatch, FakeResponse(status_code=404))

        with pytest.raises(PhotoUnavailableError, match="could not be fetched"):
            photo_source.fetch("https://cdn.example/a.jpg")

    def test_stops_a_photograph_that_runs_past_the_size_limit(self, monkeypatch, photo_dir):
        _settings(monkeypatch, photo_dir=photo_dir, max_photo_bytes=4)
        _stream(monkeypatch, FakeResponse(chunks=(b"12", b"34", b"56")))

        with pytest.raises(PhotoUnavailableError, match="exceeds the size limit"):
            photo_source.fetch("https://cdn.example/a.jpg")

    def test_leaves_no_partial_file_behind_when_it_fails(self, monkeypatch, photo_dir):
        _settings(monkeypatch, photo_dir=photo_dir, max_photo_bytes=4)
        _stream(monkeypatch, FakeResponse(chunks=(b"12", b"34", b"56")))

        with pytest.raises(PhotoUnavailableError):
            photo_source.fetch("https://cdn.example/a.jpg")

        assert list(photo_dir.rglob("*.part")) == []

    def test_rejects_an_empty_body(self, monkeypatch):
        _stream(monkeypatch, FakeResponse(chunks=()))

        with pytest.raises(PhotoUnavailableError, match="empty"):
            photo_source.fetch("https://cdn.example/a.jpg")

    def test_rejects_a_reference_that_is_not_a_url(self, monkeypatch):
        _stream(monkeypatch, FakeResponse())

        with pytest.raises(PhotoUnavailableError, match="not a usable url"):
            photo_source.fetch("https://")


class TestHostGuard:
    """The reference comes from another service's database, so it is not trusted."""

    @pytest.fixture(autouse=True)
    def restore_guard(self, monkeypatch, tmp_path):
        # Undo the autouse stub so the real guard runs, then re-point photo_dir.
        monkeypatch.undo()
        _settings(monkeypatch, photo_dir=tmp_path)

    @pytest.mark.parametrize(
        "address",
        ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.1"],
    )
    def test_refuses_an_address_inside_the_network(self, monkeypatch, address):
        monkeypatch.setattr(
            photo_source.socket,
            "getaddrinfo",
            lambda *_a, **_k: [(2, 1, 6, "", (address, 443))],
        )

        with pytest.raises(PhotoUnavailableError, match="not a public address"):
            photo_source.fetch(f"https://internal.example/{address}.jpg")

    def test_refuses_a_host_that_does_not_resolve(self, monkeypatch):
        import socket as socket_module

        def explode(*_a, **_k):
            raise socket_module.gaierror("nope")

        monkeypatch.setattr(photo_source.socket, "getaddrinfo", explode)

        with pytest.raises(PhotoUnavailableError, match="cannot be resolved"):
            photo_source.fetch("https://nowhere.example/a.jpg")
