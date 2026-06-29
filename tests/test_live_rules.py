"""Unit tests for shared/live_rules.py — wrong-way, crowd, congestion."""

from __future__ import annotations

import time

import pytest

from shared.live_rules import LiveRuleConfig, LiveRuleEngine, TrackedObject


def _track(
    track_id: int,
    label: str,
    bbox: list[float],
    *,
    velocity=(0.0, 0.0),
    speed_px=0.0,
    dwell_sec=0.0,
    history: list[tuple[float, float, float]] | None = None,
) -> TrackedObject:
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    return TrackedObject(
        track_id=track_id,
        label=label,
        confidence=0.9,
        bbox=bbox,
        centroid=(cx, cy),
        speed_px=speed_px,
        velocity=velocity,
        dwell_sec=dwell_sec,
        history=history or [],
    )


def test_wrong_way_driving_triggers():
    cfg = LiveRuleConfig(
        crowd_min_persons=100,
        wrong_way_min_speed_px=1.0,
        wrong_way_dot_threshold=-0.5,
        lane_directions={"cam-1": (1.0, 0.0)},
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    tracks = [
        _track(1, "car", [10, 10, 50, 50], velocity=(-1.0, 0.0), speed_px=5.0),
    ]
    alerts = engine.evaluate("cam-1", tracks)
    assert len(alerts) == 1
    assert alerts[0].alert_type == "wrong_way_driving"
    assert alerts[0].severity == "high"


def test_crowd_gathering_triggers_after_duration():
    cfg = LiveRuleConfig(
        crowd_min_persons=3,
        crowd_duration_sec=0.1,
        congestion_min_vehicles=100,
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    persons = [
        _track(i, "person", [i * 10, 10, i * 10 + 20, 40]) for i in range(4)
    ]
    engine.evaluate("cam-2", persons)
    time.sleep(0.15)
    alerts = engine.evaluate("cam-2", persons)
    assert any(a.alert_type == "crowd_gathering" for a in alerts)


def test_traffic_congestion_triggers():
    cfg = LiveRuleConfig(
        crowd_min_persons=100,
        congestion_min_vehicles=3,
        congestion_max_speed_px=2.0,
        congestion_duration_sec=0.1,
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    vehicles = [
        _track(i, "car", [i * 30, 10, i * 30 + 25, 45], speed_px=0.5) for i in range(4)
    ]
    engine.evaluate("cam-3", vehicles)
    time.sleep(0.15)
    alerts = engine.evaluate("cam-3", vehicles)
    assert any(a.alert_type == "traffic_congestion" for a in alerts)


def test_alert_cooldown_suppresses_repeat():
    cfg = LiveRuleConfig(
        crowd_min_persons=2,
        crowd_duration_sec=0.0,
        congestion_min_vehicles=100,
        alert_cooldown_sec=60.0,
        lane_directions={"cam-4": (1.0, 0.0)},
        wrong_way_min_speed_px=1.0,
    )
    engine = LiveRuleEngine(cfg)
    tracks = [_track(1, "car", [0, 0, 40, 40], velocity=(-1.0, 0.0), speed_px=5.0)]
    first = engine.evaluate("cam-4", tracks)
    second = engine.evaluate("cam-4", tracks)
    assert len(first) >= 1
    assert len(second) == 0


def test_accident_detection_triggers():
    cfg = LiveRuleConfig(
        crowd_min_persons=100,
        congestion_min_vehicles=100,
        accident_min_overlap=0.1,
        accident_min_speed_px=5.0,
        accident_speed_drop_ratio=0.5,
        accident_persist_frames=2,
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    for speed in (15.0, 12.0):
        tracks = [
            _track(1, "car", [10, 10, 50, 50], velocity=(1.0, 0.0), speed_px=speed),
            _track(2, "car", [15, 10, 55, 50], velocity=(-1.0, 0.0), speed_px=speed),
        ]
        engine.evaluate("cam-a", tracks)
    tracks = [
        _track(1, "car", [20, 10, 60, 50], velocity=(0.0, 0.0), speed_px=1.0),
        _track(2, "car", [22, 10, 62, 50], velocity=(0.0, 0.0), speed_px=1.0),
    ]
    engine.evaluate("cam-a", tracks)
    alerts = engine.evaluate("cam-a", tracks)
    assert any(a.alert_type == "accident_detection" for a in alerts)


def test_loitering_triggers():
    cfg = LiveRuleConfig(
        crowd_min_persons=100,
        congestion_min_vehicles=100,
        loitering_seconds=0.1,
        loitering_max_speed_px=2.0,
        loitering_max_radius_px=30.0,
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    person = _track(1, "person", [100, 100, 130, 160], speed_px=0.5, dwell_sec=1.0)
    engine.evaluate("cam-l", [person])
    time.sleep(0.15)
    alerts = engine.evaluate("cam-l", [person])
    assert any(a.alert_type == "loitering" for a in alerts)


def test_suspicious_activity_triggers_on_erratic_motion():
    cfg = LiveRuleConfig(
        crowd_min_persons=100,
        congestion_min_vehicles=100,
        suspicious_history_min_points=4,
        suspicious_direction_changes=2,
        suspicious_min_path_ratio=2.0,
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    now = time.time()
    hist = [
        (100.0, 100.0, now - 0.3),
        (110.0, 100.0, now - 0.2),
        (100.0, 100.0, now - 0.1),
        (110.0, 100.0, now),
    ]
    person = _track(1, "person", [100, 100, 130, 160], speed_px=5.0, history=hist)
    alerts = engine.evaluate("cam-s", [person])
    assert any(a.alert_type == "suspicious_activity" for a in alerts)


def test_abandoned_object_triggers():
    cfg = LiveRuleConfig(
        crowd_min_persons=100,
        congestion_min_vehicles=100,
        abandoned_timeout_sec=0.1,
        abandoned_distance_px=80.0,
        abandoned_object_max_speed_px=2.0,
        alert_cooldown_sec=0.0,
    )
    engine = LiveRuleEngine(cfg)
    backpack = _track(10, "backpack", [200, 200, 240, 260], speed_px=0.0)
    person = _track(20, "person", [205, 205, 235, 255], speed_px=1.0)
    engine.evaluate("cam-o", [backpack, person])
    person_far = _track(20, "person", [400, 400, 430, 460], speed_px=5.0)
    engine.evaluate("cam-o", [backpack, person_far])
    time.sleep(0.15)
    alerts = engine.evaluate("cam-o", [backpack])
    assert any(a.alert_type == "abandoned_object" for a in alerts)
