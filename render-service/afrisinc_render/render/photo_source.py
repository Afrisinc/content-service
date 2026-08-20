"""Resolving a photo reference to a file on disk.

A reference is either a filename inside ``photo_dir`` or an ``http(s)`` URL. The
URL form exists because the photograph library lives in another service: what it
holds is a URL, not a file this service can see.

A downloaded photograph is cached under ``photo_dir`` so a re-render, or a second
slide using the same image, costs nothing.
"""

from __future__ import annotations

import hashlib
import ipaddress
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx

from ..config import settings
from ..errors import PhotoUnavailableError

_CACHE_DIRNAME = "_remote"
_CHUNK_BYTES = 64 * 1024
_ALLOWED_SCHEMES = {"http", "https"}
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def is_remote(reference: str) -> bool:
    return reference.split("://", 1)[0].lower() in _ALLOWED_SCHEMES if "://" in reference else False


def _cache_path(url: str) -> Path:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return settings.photo_dir / _CACHE_DIRNAME / digest


def _assert_public_host(host: str) -> None:
    """Refuse anything that resolves inside the network this service sits on.

    The reference travels from another service's database, so it is not trusted
    input. Without this check a stored URL could read the cloud metadata endpoint
    or any internal address the renderer can reach.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise PhotoUnavailableError(f"photo host cannot be resolved: {host}") from exc

    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
        ):
            raise PhotoUnavailableError(f"photo host is not a public address: {host}")


def _download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(".part")
    written = 0

    try:
        with httpx.stream(
            "GET",
            url,
            timeout=settings.request_timeout_seconds,
            follow_redirects=True,
        ) as response:
            if response.status_code != 200:
                raise PhotoUnavailableError(
                    f"photo could not be fetched ({response.status_code}): {url}"
                )

            content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
            if content_type and content_type not in _ALLOWED_CONTENT_TYPES:
                raise PhotoUnavailableError(f"photo is not an image ({content_type}): {url}")

            with partial.open("wb") as handle:
                for chunk in response.iter_bytes(_CHUNK_BYTES):
                    written += len(chunk)
                    # Enforced while streaming — a content-length header is not
                    # something a remote host can be trusted to tell the truth about.
                    if written > settings.max_photo_bytes:
                        raise PhotoUnavailableError(f"photo exceeds the size limit: {url}")
                    handle.write(chunk)
    except httpx.HTTPError as exc:
        partial.unlink(missing_ok=True)
        raise PhotoUnavailableError(f"photo could not be fetched: {url}") from exc
    except PhotoUnavailableError:
        partial.unlink(missing_ok=True)
        raise

    if written == 0:
        partial.unlink(missing_ok=True)
        raise PhotoUnavailableError(f"photo is empty: {url}")

    partial.replace(destination)


def fetch(url: str) -> Path:
    """The cached file for a remote reference, downloading it the first time."""
    parsed = urlparse(url)
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES or not parsed.hostname:
        raise PhotoUnavailableError(f"photo reference is not a usable url: {url}")

    cached = _cache_path(url)
    if cached.is_file() and cached.stat().st_size > 0:
        return cached

    _assert_public_host(parsed.hostname)
    _download(url, cached)
    return cached
