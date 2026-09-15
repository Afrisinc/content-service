from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studio_media.contracts import SegmentTiming, WordTiming
from studio_media.video.subtitles import build_cues, to_ass, to_srt, to_vtt, wrap


def words(pairs: list[tuple[str, float, float]]) -> list[WordTiming]:
    return [WordTiming(word=word, start=start, end=end) for word, start, end in pairs]


def test_wrap_respects_max_chars():
    lines = wrap("the quick brown fox jumps over the lazy dog", 20, 2)
    assert all(len(line) <= 20 for line in lines[:-1])
    assert len(lines) <= 2


def test_wrap_merges_overflow_into_last_line():
    lines = wrap("one two three four five six seven eight nine ten", 10, 2)
    assert len(lines) == 2


def test_build_cues_uses_word_timings():
    segment = SegmentTiming(
        text="hello there friend",
        start=0.0,
        end=1.5,
        words=words([("hello", 0.0, 0.4), ("there", 0.4, 0.9), ("friend", 0.9, 1.5)]),
    )
    cues = build_cues([segment], max_chars=40, max_lines=2)
    assert len(cues) == 1
    assert cues[0]["start"] == 0.0
    assert cues[0]["end"] == 1.5


def test_build_cues_splits_long_segments():
    long_words = words([(f"word{index}", index * 0.3, index * 0.3 + 0.3) for index in range(40)])
    segment = SegmentTiming(text=" ".join(w.word for w in long_words), start=0.0, end=12.0, words=long_words)
    cues = build_cues([segment], max_chars=20, max_lines=2)
    assert len(cues) > 1
    assert cues[0]["end"] <= cues[1]["start"] + 0.001


def test_build_cues_falls_back_to_segment_when_no_words():
    segment = SegmentTiming(text="no timings here", start=2.0, end=4.0, words=[])
    cues = build_cues([segment])
    assert cues == [{"start": 2.0, "end": 4.0, "lines": ["no timings here"]}]


def test_srt_format_is_well_formed():
    cues = [{"start": 0.0, "end": 1.25, "lines": ["hello"]}]
    output = to_srt(cues)
    assert output.startswith("1\n00:00:00,000 --> 00:00:01,250\nhello")


def test_vtt_has_header_and_dot_separator():
    output = to_vtt([{"start": 61.5, "end": 62.0, "lines": ["late"]}])
    assert output.startswith("WEBVTT")
    assert "00:01:01.500 --> 00:01:02.000" in output


def test_ass_contains_style_and_dialogue():
    output = to_ass([{"start": 0.0, "end": 1.0, "lines": ["a", "b"]}])
    assert "[V4+ Styles]" in output
    assert "Dialogue: 0,0:00:00.00,0:00:01.00,Burn,,0,0,0,,a\\Nb" in output
