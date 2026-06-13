"""Tests for recording incident banner label derivation."""

from shared.recording_event_labels import (
    event_banner_label,
    event_labels_for_frame_detections,
    is_idle_scene_message,
)


def test_event_banner_crowd_formation():
    dets = [{"object_type": "person", "confidence": 0.9, "timestamp_offset_ms": 0, "bounding_box": {}}] * 10
    assert event_banner_label(dets) == "Crowd Formation"


def test_event_banner_accident_alert():
    dets = [
        {
            "object_type": "person",
            "confidence": 0.9,
            "timestamp_offset_ms": 1000,
            "bounding_box": {"x1": 0, "y1": 0, "x2": 10, "y2": 10},
        },
        {
            "object_type": "car",
            "confidence": 0.85,
            "timestamp_offset_ms": 1000,
            "bounding_box": {"x1": 5, "y1": 5, "x2": 20, "y2": 20},
        },
    ]
    assert event_banner_label(dets) == "Accident Alert"


def test_event_labels_filters_idle():
    label, labels, severity = event_labels_for_frame_detections([])
    assert label is None
    assert labels == []
    assert severity is None
    assert is_idle_scene_message("Everything Idle")


def test_possible_altercation():
    dets = [
        {"object_type": "person", "confidence": 0.8, "timestamp_offset_ms": 0, "bounding_box": {}},
        {"object_type": "person", "confidence": 0.76, "timestamp_offset_ms": 0, "bounding_box": {}},
    ]
    label, labels, severity = event_labels_for_frame_detections(dets)
    assert label == "Possible Altercation"
    assert labels == ["Possible Altercation"]
    assert severity == "high"
