from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studio_media.audio.tts import KOKORO_LANGUAGES, resolve_language


def test_short_code_is_expanded_to_an_espeak_locale():
    assert resolve_language("en", "af_heart") == "en-us"


def test_a_full_locale_passes_through():
    assert resolve_language("en-gb", "bf_emma") == "en-gb"


def test_underscore_form_is_normalised():
    assert resolve_language("en_GB", "bf_emma") == "en-gb"


def test_british_voice_drives_the_locale_when_the_code_is_unknown():
    assert resolve_language("", "bm_george") == "en-gb"
    assert resolve_language(None, "bf_alice") == "en-gb"


def test_american_voice_is_the_default():
    assert resolve_language("", "af_heart") == "en-us"
    assert resolve_language("klingon", "af_heart") == "en-us"


@pytest.mark.parametrize(
    "voice,expected",
    [("ff_siwis", "fr-fr"), ("jf_alpha", "ja"), ("zf_xiaobei", "cmn"), ("pf_dora", "pt-br"), ("if_sara", "it")],
)
def test_voice_prefix_maps_to_its_language(voice, expected):
    assert resolve_language("", voice) == expected


def test_aliases_resolve_into_supported_languages():
    for alias in ("zh", "jp", "pt", "uk"):
        assert resolve_language(alias, "af_heart") in KOKORO_LANGUAGES


def test_every_resolution_is_a_language_kokoro_accepts():
    for language in ("en", "en-gb", "fr", "", "nonsense"):
        assert resolve_language(language, "af_heart") in KOKORO_LANGUAGES
