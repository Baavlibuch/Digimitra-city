"""Derive per-camera live scene status from rule-engine alerts (no side effects)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.live_rules import LiveAlert

SCENE_IDLE = "everything_idle"
SCENE_IDLE_MESSAGE = "Everything Idle"

ALERT_PRIORITY = (
    "accident_detection",
    "abandoned_object",
    "crowd_gathering",
    "wrong_way_driving",
    "suspicious_activity",
    "loitering",
    "traffic_congestion",
)


@dataclass
class SceneStatusResult:
    scene_status: str
    message: str
    source_alert_type: Optional[str] = None
    severity: Optional[str] = None

    def to_ws_payload(self, camera_id: str) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "type": "live_scene_status",
            "camera_id": camera_id,
            "scene_status": self.scene_status,
            "message": self.message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if self.source_alert_type:
            payload["source_alert_type"] = self.source_alert_type
        if self.severity:
            payload["severity"] = self.severity
        return payload


def pick_primary_alert(alerts: List[LiveAlert]) -> Optional[LiveAlert]:
    by_type = {a.alert_type: a for a in alerts}
    for alert_type in ALERT_PRIORITY:
        if alert_type in by_type:
            return by_type[alert_type]
    return None


def derive_scene_status(alerts: List[LiveAlert]) -> SceneStatusResult:
    primary = pick_primary_alert(alerts)
    if primary is None:
        return SceneStatusResult(scene_status=SCENE_IDLE, message=SCENE_IDLE_MESSAGE)
    return SceneStatusResult(
        scene_status=primary.alert_type,
        message=primary.message,
        source_alert_type=primary.alert_type,
        severity=primary.severity,
    )
