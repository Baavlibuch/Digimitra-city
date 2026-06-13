from datetime import datetime, timedelta, timezone

from api.src import video_file_upload as vfu


def test_generate_plausible_upload_start_time_is_in_the_past():
    now = datetime(2026, 6, 12, 12, 0, 0, tzinfo=timezone.utc)
    start = vfu.generate_plausible_upload_start_time(now=now)
    assert start < now
    assert start.tzinfo is not None
    assert (now - start) >= timedelta(hours=2)
    assert (now - start) <= timedelta(days=21)


def test_resolve_upload_segment_timing_uses_window_ms_when_probe_unavailable(monkeypatch):
    monkeypatch.setattr(vfu, "probe_video_duration_seconds", lambda _raw, _ext: None)
    fixed = datetime(2026, 5, 1, 8, 30, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(vfu, "generate_plausible_upload_start_time", lambda **_: fixed)

    start, end, duration, started_raw = vfu.resolve_upload_segment_timing(
        raw=b"fake",
        ext=".mp4",
        segment_window_ms=125_000,
    )

    assert start == fixed
    assert duration == 125.0
    assert end == fixed + timedelta(seconds=125.0)
    assert started_raw.endswith("Z")
