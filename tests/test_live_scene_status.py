"""Unit tests for shared/live_scene_status.py."""

from __future__ import annotations

from shared.live_rules import LiveAlert
from shared.live_scene_status import (
    SCENE_IDLE,
    SCENE_IDLE_MESSAGE,
    derive_scene_status,
    pick_primary_alert,
)


def _alert(alert_type: str, message: str) -> LiveAlert:
    return LiveAlert(
        camera_id="1",
        alert_type=alert_type,
        severity="high",
        message=message,
    )


def test_idle_when_no_alerts():
    result = derive_scene_status([])
    assert result.scene_status == SCENE_IDLE
    assert result.message == SCENE_IDLE_MESSAGE
    assert result.source_alert_type is None


def test_crowd_alert_message():
    crowd = _alert("crowd_gathering", "Crowd gathering: 8 people grouped for 5s.")
    result = derive_scene_status([crowd])
    assert result.scene_status == "crowd_gathering"
    assert result.message == crowd.message
    assert result.source_alert_type == "crowd_gathering"


def test_congestion_alert_message():
    congestion = _alert("traffic_congestion", "Traffic congestion: 6 vehicles.")
    result = derive_scene_status([congestion])
    assert result.scene_status == "traffic_congestion"
    assert result.message == congestion.message


def test_wrong_way_alert_message():
    wrong_way = _alert("wrong_way_driving", "Vehicle moving opposite to configured direction.")
    result = derive_scene_status([wrong_way])
    assert result.scene_status == "wrong_way_driving"
    assert result.message == wrong_way.message


def test_crowd_beats_wrong_way():
    crowd = _alert("crowd_gathering", "Crowd gathering.")
    wrong_way = _alert("wrong_way_driving", "Wrong way.")
    primary = pick_primary_alert([wrong_way, crowd])
    assert primary is not None
    assert primary.alert_type == "crowd_gathering"
    result = derive_scene_status([wrong_way, crowd])
    assert result.scene_status == "crowd_gathering"


def test_congestion_beats_wrong_way():
    congestion = _alert("traffic_congestion", "Congestion.")
    wrong_way = _alert("wrong_way_driving", "Wrong way.")
    result = derive_scene_status([wrong_way, congestion])
    assert result.scene_status == "traffic_congestion"


def test_to_ws_payload_shape():
    result = derive_scene_status([])
    payload = result.to_ws_payload("7")
    assert payload["type"] == "live_scene_status"
    assert payload["camera_id"] == "7"
    assert payload["scene_status"] == SCENE_IDLE
    assert payload["message"] == SCENE_IDLE_MESSAGE
    assert "timestamp" in payload
