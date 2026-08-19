"""Domain errors. Each maps to one HTTP status at the boundary in app.py."""

from __future__ import annotations


class RenderError(Exception):
    """Base for everything this service raises deliberately."""

    status_code = 500


class FontMissingError(RenderError):
    status_code = 503


class LogoMissingError(RenderError):
    status_code = 503


class PhotoUnavailableError(RenderError):
    status_code = 422


class LayoutOverflowError(RenderError):
    """Content cannot fit the band even at the smallest permitted headline size."""

    status_code = 422


class SpecInvalidError(RenderError):
    status_code = 422
