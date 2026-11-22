from __future__ import annotations

import json
import re
from pathlib import Path

from ..config import CONFIG
from ..contracts import MixTrack
from ..shell import duration_of, probe, run_ffmpeg

LOUDNORM_JSON = re.compile(r"\{[^{}]*\"input_i\"[^{}]*\}", re.DOTALL)


def build_filter(
    tracks: list[MixTrack], target_lufs: float, durations: list[float] | None = None
) -> tuple[str, str]:
    speech_labels: list[str] = []
    bed_labels: list[str] = []
    chains: list[str] = []

    for index, track in enumerate(tracks):
        label = f"a{index}"
        parts = [f"[{index}:a]aresample={CONFIG.sample_rate}", "aformat=channel_layouts=stereo"]
        if track.start_at > 0:
            delay = int(track.start_at * 1000)
            parts.append(f"adelay={delay}|{delay}")
        if track.gain_db:
            parts.append(f"volume={track.gain_db}dB")
        if track.fade_in_ms:
            parts.append(f"afade=t=in:st={track.start_at}:d={track.fade_in_ms / 1000}")
        if track.fade_out_ms:
            # afade defaults st to 0, which would fade the track out at its start
            # instead of its end, so a fade-out is only emitted once the length is known.
            length = durations[index] if durations and index < len(durations) else None
            if length:
                span = track.fade_out_ms / 1000
                start = max(track.start_at, track.start_at + length - span)
                parts.append(f"afade=t=out:st={round(start, 3)}:d={span}")
        chains.append(f"{','.join(parts)}[{label}]")

        if track.kind in {"vo", "dialogue"}:
            speech_labels.append(label)
        else:
            bed_labels.append(label)

    if speech_labels:
        joined = "".join(f"[{label}]" for label in speech_labels)
        chains.append(f"{joined}amix=inputs={len(speech_labels)}:normalize=0:dropout_transition=0[speech]")

    if bed_labels:
        joined = "".join(f"[{label}]" for label in bed_labels)
        chains.append(f"{joined}amix=inputs={len(bed_labels)}:normalize=0:dropout_transition=0[bed]")

    if speech_labels and bed_labels:
        ducked = any(track.duck_under for track in tracks if track.kind not in {"vo", "dialogue"})
        if ducked:
            # sidechaincompress ends when its key input ends, so an unpadded speech
            # bus would cut the music off at the last spoken word.
            total = programme_length(tracks, durations)
            chains.append("[speech]asplit=2[speech_out][speech_key_raw]")
            chains.append(f"[speech_key_raw]apad=whole_dur={total}[speech_key]")
            chains.append(
                "[bed][speech_key]sidechaincompress=threshold=0.06:ratio=8:attack=20:release=400[bed_ducked]"
            )
            chains.append("[speech_out][bed_ducked]amix=inputs=2:normalize=0[premaster]")
        else:
            chains.append("[speech][bed]amix=inputs=2:normalize=0[premaster]")
    elif speech_labels:
        chains.append("[speech]anull[premaster]")
    elif bed_labels:
        chains.append("[bed]anull[premaster]")
    else:
        raise ValueError("a mix needs at least one track")

    return ";".join(chains), "[premaster]"


def programme_length(tracks: list[MixTrack], durations: list[float] | None) -> float:
    if not durations:
        return max((track.start_at for track in tracks), default=0.0) + 60.0
    ends = [
        track.start_at + (durations[index] if index < len(durations) else 0.0)
        for index, track in enumerate(tracks)
    ]
    return round(max(ends, default=0.0), 3)


def track_durations(inputs: list[Path]) -> list[float]:
    return [duration_of(probe(path)) for path in inputs]


def measure_loudness(inputs: list[Path], tracks: list[MixTrack], target_lufs: float, true_peak: float) -> dict:
    graph, out_label = build_filter(tracks, target_lufs, track_durations(inputs))
    args: list[str] = []
    for path in inputs:
        args.extend(["-i", str(path)])
    args.extend(
        [
            "-filter_complex",
            f"{graph};{out_label}loudnorm=I={target_lufs}:TP={true_peak}:LRA=11:print_format=json[out]",
            "-map",
            "[out]",
            "-f",
            "null",
            "-",
        ]
    )
    stderr = run_ffmpeg(args)
    matches = LOUDNORM_JSON.findall(stderr)
    if not matches:
        return {}
    return json.loads(matches[-1])


def render_master(
    inputs: list[Path],
    tracks: list[MixTrack],
    output: Path,
    target_lufs: float,
    true_peak: float,
) -> dict:
    measured = measure_loudness(inputs, tracks, target_lufs, true_peak)
    graph, out_label = build_filter(tracks, target_lufs, track_durations(inputs))

    loudnorm = f"loudnorm=I={target_lufs}:TP={true_peak}:LRA=11"
    if measured:
        loudnorm += (
            f":measured_I={measured['input_i']}"
            f":measured_TP={measured['input_tp']}"
            f":measured_LRA={measured['input_lra']}"
            f":measured_thresh={measured['input_thresh']}"
            f":offset={measured.get('target_offset', 0)}"
            ":linear=true"
        )

    args: list[str] = []
    for path in inputs:
        args.extend(["-i", str(path)])
    output.parent.mkdir(parents=True, exist_ok=True)
    args.extend(
        [
            "-filter_complex",
            f"{graph};{out_label}{loudnorm}[out]",
            "-map",
            "[out]",
            "-c:a",
            "pcm_s24le",
            "-ar",
            str(CONFIG.sample_rate),
            str(output),
        ]
    )
    run_ffmpeg(args)
    return measured
