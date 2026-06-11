"""ByteTrack wrapper stability tests."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "live-detection-agent"))

from tracker import CameraTracker  # noqa: E402


def test_bytetrack_assigns_stable_ids():
    tracker = CameraTracker()
    det = [{"bbox": [100.0, 100.0, 200.0, 200.0], "label": "person", "confidence": 0.9}]
    first = tracker.update(det, (480, 640))
    assert len(first) == 1
    tid = first[0].track_id

    det2 = [{"bbox": [102.0, 102.0, 202.0, 202.0], "label": "person", "confidence": 0.88}]
    second = tracker.update(det2, (480, 640))
    assert len(second) == 1
    assert second[0].track_id == tid


def test_velocity_computed_from_history():
    tracker = CameraTracker()
    for x in (100, 110, 120):
        tracker.update(
            [{"bbox": [float(x), 50.0, float(x + 40), 90.0], "label": "car", "confidence": 0.85}],
            (480, 640),
        )
    tracks = tracker.update(
        [{"bbox": [130.0, 50.0, 170.0, 90.0], "label": "car", "confidence": 0.85}],
        (480, 640),
    )
    assert tracks[0].speed_px > 0
