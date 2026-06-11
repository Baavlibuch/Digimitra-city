"""
Rule engine for TRUE LIVE surveillance alerts (ByteTrack outputs).

Operates independently of recording_detections and the delayed ai-processor pipeline.
All thresholds are configurable via environment variables.
"""

from __future__ import annotations

import json
import math
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple


VEHICLE_LABELS = frozenset({"car", "truck", "bus", "motorcycle", "bicycle"})
PERSON_LABEL = "person"


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


@dataclass
class LiveRuleConfig:
    crowd_min_persons: int = field(default_factory=lambda: _env_int("LIVE_CROWD_MIN_PERSONS", 8))
    crowd_duration_sec: float = field(default_factory=lambda: _env_float("LIVE_CROWD_DURATION_SEC", 5.0))
    congestion_min_vehicles: int = field(default_factory=lambda: _env_int("LIVE_CONGESTION_MIN_VEHICLES", 6))
    congestion_max_speed_px: float = field(default_factory=lambda: _env_float("LIVE_CONGESTION_MAX_SPEED_PX", 3.0))
    congestion_duration_sec: float = field(default_factory=lambda: _env_float("LIVE_CONGESTION_DURATION_SEC", 8.0))
    wrong_way_min_speed_px: float = field(default_factory=lambda: _env_float("LIVE_WRONG_WAY_MIN_SPEED_PX", 2.0))
    wrong_way_dot_threshold: float = field(default_factory=lambda: _env_float("LIVE_WRONG_WAY_DOT_THRESHOLD", -0.5))
    alert_cooldown_sec: float = field(default_factory=lambda: _env_float("LIVE_ALERT_COOLDOWN_SEC", 30.0))
    lane_directions: Dict[str, Tuple[float, float]] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "LiveRuleConfig":
        cfg = cls()
        raw = os.environ.get("LIVE_LANE_DIRECTIONS_JSON", "").strip()
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    for cam_id, direction in parsed.items():
                        if isinstance(direction, (list, tuple)) and len(direction) >= 2:
                            dx, dy = float(direction[0]), float(direction[1])
                            norm = math.hypot(dx, dy)
                            if norm > 1e-6:
                                cfg.lane_directions[str(cam_id)] = (dx / norm, dy / norm)
            except json.JSONDecodeError:
                pass
        return cfg


@dataclass
class TrackedObject:
    track_id: int
    label: str
    confidence: float
    bbox: List[float]
    centroid: Tuple[float, float]
    speed_px: float
    velocity: Tuple[float, float]
    dwell_sec: float


@dataclass
class LiveAlert:
    type: str = "live_alert"
    camera_id: str = ""
    alert_type: str = ""
    severity: str = "medium"
    message: str = ""
    timestamp: str = ""
    track_ids: List[int] = field(default_factory=list)
    bboxes: List[List[float]] = field(default_factory=list)
    alert_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "camera_id": self.camera_id,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "timestamp": self.timestamp,
            "track_ids": self.track_ids,
            "bboxes": self.bboxes,
            "alert_id": self.alert_id,
        }


def _centroid(bbox: Sequence[float]) -> Tuple[float, float]:
    x1, y1, x2, y2 = bbox[:4]
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _dot(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]


class CameraRuleState:
    """Per-camera debounce and persistence timers."""

    def __init__(self) -> None:
        self.crowd_since: Optional[float] = None
        self.congestion_since: Optional[float] = None
        self.last_alert_at: Dict[str, float] = {}

    def can_fire(self, alert_type: str, now: float, cooldown_sec: float) -> bool:
        last = self.last_alert_at.get(alert_type, 0.0)
        if now - last < cooldown_sec:
            return False
        self.last_alert_at[alert_type] = now
        return True


class LiveRuleEngine:
    def __init__(self, config: Optional[LiveRuleConfig] = None) -> None:
        self.config = config or LiveRuleConfig.from_env()
        self._camera_state: Dict[str, CameraRuleState] = {}

    def _state(self, camera_id: str) -> CameraRuleState:
        if camera_id not in self._camera_state:
            self._camera_state[camera_id] = CameraRuleState()
        return self._camera_state[camera_id]

    def evaluate(self, camera_id: str, tracks: List[TrackedObject]) -> List[LiveAlert]:
        now = time.time()
        ts = datetime.now(timezone.utc).isoformat()
        state = self._state(camera_id)
        alerts: List[LiveAlert] = []

        wrong_way = self._check_wrong_way(camera_id, tracks)
        if wrong_way and state.can_fire("wrong_way_driving", now, self.config.alert_cooldown_sec):
            wrong_way.timestamp = ts
            alerts.append(wrong_way)

        crowd = self._check_crowd(camera_id, tracks, state, now)
        if crowd and state.can_fire("crowd_gathering", now, self.config.alert_cooldown_sec):
            crowd.timestamp = ts
            alerts.append(crowd)

        congestion = self._check_congestion(camera_id, tracks, state, now)
        if congestion and state.can_fire("traffic_congestion", now, self.config.alert_cooldown_sec):
            congestion.timestamp = ts
            alerts.append(congestion)

        return alerts

    def _check_wrong_way(self, camera_id: str, tracks: List[TrackedObject]) -> Optional[LiveAlert]:
        lane = self.config.lane_directions.get(camera_id)
        if not lane:
            return None

        offenders: List[TrackedObject] = []
        for t in tracks:
            if t.label not in VEHICLE_LABELS:
                continue
            if t.speed_px < self.config.wrong_way_min_speed_px:
                continue
            if _dot(t.velocity, lane) < self.config.wrong_way_dot_threshold:
                offenders.append(t)

        if not offenders:
            return None

        return LiveAlert(
            camera_id=camera_id,
            alert_type="wrong_way_driving",
            severity="high",
            message="Vehicle moving opposite to configured direction.",
            track_ids=[t.track_id for t in offenders],
            bboxes=[t.bbox for t in offenders],
        )

    def _check_crowd(
        self,
        camera_id: str,
        tracks: List[TrackedObject],
        state: CameraRuleState,
        now: float,
    ) -> Optional[LiveAlert]:
        persons = [t for t in tracks if t.label == PERSON_LABEL]
        if len(persons) >= self.config.crowd_min_persons:
            if state.crowd_since is None:
                state.crowd_since = now
            elif now - state.crowd_since >= self.config.crowd_duration_sec:
                return LiveAlert(
                    camera_id=camera_id,
                    alert_type="crowd_gathering",
                    severity="high",
                    message=f"Crowd gathering: {len(persons)} people grouped for {self.config.crowd_duration_sec:.0f}s.",
                    track_ids=[t.track_id for t in persons],
                    bboxes=[t.bbox for t in persons],
                )
        else:
            state.crowd_since = None
        return None

    def _check_congestion(
        self,
        camera_id: str,
        tracks: List[TrackedObject],
        state: CameraRuleState,
        now: float,
    ) -> Optional[LiveAlert]:
        vehicles = [t for t in tracks if t.label in VEHICLE_LABELS]
        if len(vehicles) < self.config.congestion_min_vehicles:
            state.congestion_since = None
            return None

        speeds = [t.speed_px for t in vehicles]
        avg_speed = sum(speeds) / len(speeds) if speeds else 0.0
        if avg_speed > self.config.congestion_max_speed_px:
            state.congestion_since = None
            return None

        if state.congestion_since is None:
            state.congestion_since = now
            return None

        if now - state.congestion_since < self.config.congestion_duration_sec:
            return None

        return LiveAlert(
            camera_id=camera_id,
            alert_type="traffic_congestion",
            severity="medium",
            message=(
                f"Traffic congestion: {len(vehicles)} vehicles, "
                f"avg speed {avg_speed:.1f}px/s (threshold {self.config.congestion_max_speed_px:.1f})."
            ),
            track_ids=[t.track_id for t in vehicles],
            bboxes=[t.bbox for t in vehicles],
        )
