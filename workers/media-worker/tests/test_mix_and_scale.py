from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studio_media.audio.mix import build_filter
from studio_media.contracts import MixTrack, VariantSpec
from studio_media.video.compose import scale_filter


def track(kind: str, **overrides) -> MixTrack:
    payload = {"kind": kind, "storage_key": f"{kind}.wav"}
    payload.update(overrides)
    return MixTrack.model_validate(payload)


def test_bed_only_mix_never_creates_an_infinite_null_source():
    graph, _ = build_filter([track("music"), track("ambience")], -14.0)
    assert "anullsrc" not in graph
    assert "[bed]anull[premaster]" in graph


def test_mix_requires_at_least_one_track():
    import pytest

    with pytest.raises(ValueError, match="at least one track"):
        build_filter([], -14.0)


def test_speech_only_mix_has_no_bed():
    graph, label = build_filter([track("vo")], -14.0)
    assert label == "[premaster]"
    assert "[speech]anull[premaster]" in graph


def test_music_is_ducked_under_speech():
    graph, _ = build_filter([track("vo"), track("music", duck_under="vo")], -14.0)
    assert "sidechaincompress" in graph
    assert "[bed_ducked]" in graph


def test_ducking_pads_the_speech_key_to_the_full_programme():
    tracks = [track("vo"), track("music", duck_under="vo")]
    graph, _ = build_filter(tracks, -14.0, durations=[4.0, 18.0])
    assert "apad=whole_dur=18.0" in graph
    assert "[speech_key_raw]" in graph


def test_programme_length_spans_delayed_tracks():
    from studio_media.audio.mix import programme_length

    tracks = [track("vo", start_at=12.0), track("music")]
    assert programme_length(tracks, [3.0, 18.0]) == 18.0
    assert programme_length(tracks, [8.0, 10.0]) == 20.0


def test_music_without_duck_is_plain_mixed():
    graph, _ = build_filter([track("vo"), track("music")], -14.0)
    assert "sidechaincompress" not in graph
    assert "[speech][bed]amix" in graph


def test_fade_out_is_anchored_to_the_end_of_the_track():
    graph, _ = build_filter([track("music", fade_out_ms=2000)], -14.0, durations=[18.0])
    assert "afade=t=out:st=16.0:d=2.0" in graph


def test_fade_out_is_dropped_when_the_length_is_unknown():
    graph, _ = build_filter([track("music", fade_out_ms=2000)], -14.0)
    assert "afade=t=out" not in graph


def test_fade_out_respects_a_delayed_start():
    graph, _ = build_filter([track("sfx", start_at=4.0, fade_out_ms=1000)], -14.0, durations=[6.0])
    assert "afade=t=out:st=9.0:d=1.0" in graph


def test_delay_and_gain_are_applied():
    graph, _ = build_filter([track("sfx", start_at=2.5, gain_db=-6.0)], -14.0)
    assert "adelay=2500|2500" in graph
    assert "volume=-6.0dB" in graph


def test_scale_filter_matching_ratio_is_plain_scale():
    spec = VariantSpec(format="16:9", width=1920, height=1080, fps=30)
    assert scale_filter(spec, 1920, 1080) == "scale=1920:1080:flags=lanczos"


def test_scale_filter_crops_wide_source_for_vertical():
    spec = VariantSpec(format="9:16", width=1080, height=1920, fps=30)
    result = scale_filter(spec, 1920, 1080)
    assert result.startswith("crop=ih*")
    assert "scale=1080:1920" in result


def test_scale_filter_pads_when_safe_area_requested():
    spec = VariantSpec(format="9:16", width=1080, height=1920, fps=30, safe_area_padding=0.1)
    result = scale_filter(spec, 1920, 1080)
    assert "pad=1080:1920" in result
