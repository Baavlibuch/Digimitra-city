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
OBJECT_LABELS = frozenset({"backpack", "handbag", "suitcase"})


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
    # Accident detection
    accident_min_overlap: float = field(default_factory=lambda: _env_float("LIVE_ACCIDENT_MIN_OVERLAP", 0.12))
    accident_min_speed_px: float = field(default_factory=lambda: _env_float("LIVE_ACCIDENT_MIN_SPEED", 8.0))
    accident_speed_drop_ratio: float = field(default_factory=lambda: _env_float("LIVE_ACCIDENT_SPEED_DROP_RATIO", 0.45))
    accident_persist_frames: int = field(default_factory=lambda: _env_int("LIVE_ACCIDENT_PERSIST_FRAMES", 3))
    # Loitering
    loitering_seconds: float = field(default_factory=lambda: _env_float("LIVE_LOITERING_SECONDS", 45.0))
    loitering_max_speed_px: float = field(default_factory=lambda: _env_float("LIVE_LOITERING_MAX_SPEED_PX", 2.5))
    loitering_max_radius_px: float = field(default_factory=lambda: _env_float("LIVE_LOITERING_MAX_RADIUS_PX", 50.0))
    # Suspicious activity
    suspicious_history_min_points: int = field(default_factory=lambda: _env_int("LIVE_SUSPICIOUS_HISTORY", 6))
    suspicious_direction_changes: int = field(default_factory=lambda: _env_int("LIVE_SUSPICIOUS_DIRECTION_CHANGES", 3))
    suspicious_min_path_ratio: float = field(default_factory=lambda: _env_float("LIVE_SUSPICIOUS_MIN_PATH_RATIO", 2.8))
    suspicious_running_speed_px: float = field(default_factory=lambda: _env_float("LIVE_SUSPICIOUS_RUNNING_SPEED_PX", 22.0))
    restricted_regions: Dict[str, List[Tuple[float, float, float, float]]] = field(default_factory=dict)
    # Abandoned object
    abandoned_timeout_sec: float = field(default_factory=lambda: _env_float("LIVE_ABANDONED_TIMEOUT", 25.0))
    abandoned_distance_px: float = field(default_factory=lambda: _env_float("LIVE_ABANDONED_DISTANCE", 100.0))
    abandoned_object_max_speed_px: float = field(
        default_factory=lambda: _env_float("LIVE_ABANDONED_MAX_OBJECT_SPEED_PX", 2.0)
    )

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
        regions_raw = os.environ.get("LIVE_RESTRICTED_REGIONS_JSON", "").strip()
        if regions_raw:
            try:
                parsed = json.loads(regions_raw)
                if isinstance(parsed, dict):
                    for cam_id, boxes in parsed.items():
                        if not isinstance(boxes, list):
                            continue
                        parsed_boxes: List[Tuple[float, float, float, float]] = []
                        for box in boxes:
                            if isinstance(box, (list, tuple)) and len(box) >= 4:
                                parsed_boxes.append(
                                    (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
                                )
                        if parsed_boxes:
                            cfg.restricted_regions[str(cam_id)] = parsed_boxes
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
    history: List[Tuple[float, float, float]] = field(default_factory=list)


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


def _distance(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _bbox_iou(a: Sequence[float], b: Sequence[float]) -> float:
    ax1, ay1, ax2, ay2 = a[:4]
    bx1, by1, bx2, by2 = b[:4]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _pair_key(a: int, b: int) -> Tuple[int, int]:
    return (a, b) if a < b else (b, a)


def _direction_changes(hist: Sequence[Tuple[float, float, float]]) -> int:
    if len(hist) < 3:
        return 0
    changes = 0
    prev_unit: Optional[Tuple[float, float]] = None
    for i in range(1, len(hist)):
        dx = hist[i][0] - hist[i - 1][0]
        dy = hist[i][1] - hist[i - 1][1]
        dt = hist[i][2] - hist[i - 1][2]
        if dt <= 0:
            continue
        mag = math.hypot(dx, dy)
        if mag < 1.0:
            continue
        unit = (dx / mag, dy / mag)
        if prev_unit is not None and _dot(unit, prev_unit) < 0.0:
            changes += 1
        prev_unit = unit
    return changes


def _path_displacement_ratio(hist: Sequence[Tuple[float, float, float]]) -> float:
    if len(hist) < 2:
        return 0.0
    path = 0.0
    for i in range(1, len(hist)):
        path += math.hypot(hist[i][0] - hist[i - 1][0], hist[i][1] - hist[i - 1][1])
    disp = math.hypot(hist[-1][0] - hist[0][0], hist[-1][1] - hist[0][1])
    if disp < 1.0:
        return path
    return path / disp


def _centroid_in_regions(
    centroid: Tuple[float, float],
    regions: Sequence[Tuple[float, float, float, float]],
) -> bool:
    cx, cy = centroid
    for x1, y1, x2, y2 in regions:
        if x1 <= cx <= x2 and y1 <= cy <= y2:
            return True
    return False


class CameraRuleState:
    """Per-camera debounce and persistence timers."""

    def __init__(self) -> None:
        self.crowd_since: Optional[float] = None
        self.congestion_since: Optional[float] = None
        self.last_alert_at: Dict[str, float] = {}
        self.track_speed_history: Dict[int, List[float]] = {}
        self.accident_pair_frames: Dict[Tuple[int, int], int] = {}
        self.loitering_anchor: Dict[int, Tuple[float, float]] = {}
        self.loitering_since: Dict[int, float] = {}
        self.object_near_person: Dict[int, int] = {}
        self.object_person_departed_since: Dict[int, float] = {}

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
        self._update_track_metrics(state, tracks)
        alerts: List[LiveAlert] = []
        cooldown = self.config.alert_cooldown_sec

        checks = [
            ("accident_detection", self._check_accident(camera_id, tracks, state)),
            ("abandoned_object", self._check_abandoned_object(camera_id, tracks, state, now)),
            ("wrong_way_driving", self._check_wrong_way(camera_id, tracks)),
            ("crowd_gathering", self._check_crowd(camera_id, tracks, state, now)),
            ("traffic_congestion", self._check_congestion(camera_id, tracks, state, now)),
            ("suspicious_activity", self._check_suspicious_activity(camera_id, tracks)),
            ("loitering", self._check_loitering(camera_id, tracks, state, now)),
        ]

        for alert_type, candidate in checks:
            if candidate and state.can_fire(alert_type, now, cooldown):
                candidate.timestamp = ts
                alerts.append(candidate)

        return alerts

    def _update_track_metrics(self, state: CameraRuleState, tracks: List[TrackedObject]) -> None:
        active_ids = {t.track_id for t in tracks}
        for t in tracks:
            speeds = state.track_speed_history.setdefault(t.track_id, [])
            speeds.append(t.speed_px)
            if len(speeds) > 20:
                speeds.pop(0)
        for tid in list(state.track_speed_history.keys()):
            if tid not in active_ids:
                del state.track_speed_history[tid]

    def _check_accident(
        self,
        camera_id: str,
        tracks: List[TrackedObject],
        state: CameraRuleState,
    ) -> Optional[LiveAlert]:
        vehicles = [t for t in tracks if t.label in VEHICLE_LABELS]
        persons = [t for t in tracks if t.label == PERSON_LABEL]
        pairs: List[Tuple[TrackedObject, TrackedObject]] = []
        for i, a in enumerate(vehicles):
            for b in vehicles[i + 1 :]:
                pairs.append((a, b))
        for p in persons:
            for v in vehicles:
                pairs.append((p, v))

        active_pairs: set[Tuple[int, int]] = set()
        triggered: Optional[Tuple[TrackedObject, TrackedObject]] = None

        for a, b in pairs:
            key = _pair_key(a.track_id, b.track_id)
            if _bbox_iou(a.bbox, b.bbox) < self.config.accident_min_overlap:
                continue

            speeds_a = state.track_speed_history.get(a.track_id, [])
            speeds_b = state.track_speed_history.get(b.track_id, [])
            if len(speeds_a) < 2 or len(speeds_b) < 2:
                continue

            pre_a = max(speeds_a[:-1])
            pre_b = max(speeds_b[:-1])
            if max(pre_a, pre_b) < self.config.accident_min_speed_px:
                continue

            rel_x = b.centroid[0] - a.centroid[0]
            rel_y = b.centroid[1] - a.centroid[1]
            rel_mag = math.hypot(rel_x, rel_y)
            if rel_mag > 1e-3:
                rel_unit = (rel_x / rel_mag, rel_y / rel_mag)
                approach = (
                    _dot(a.velocity, rel_unit) > 0.2 or _dot((-rel_unit[0], -rel_unit[1]), b.velocity) > 0.2
                )
                if not approach and max(pre_a, pre_b) < self.config.accident_min_speed_px * 1.5:
                    continue

            if a.speed_px > pre_a * self.config.accident_speed_drop_ratio:
                continue
            if b.speed_px > pre_b * self.config.accident_speed_drop_ratio:
                continue

            active_pairs.add(key)
            state.accident_pair_frames[key] = state.accident_pair_frames.get(key, 0) + 1
            if state.accident_pair_frames[key] >= self.config.accident_persist_frames:
                triggered = (a, b)

        for key in list(state.accident_pair_frames.keys()):
            if key not in active_pairs:
                del state.accident_pair_frames[key]

        if triggered is None:
            return None

        a, b = triggered
        return LiveAlert(
            camera_id=camera_id,
            alert_type="accident_detection",
            severity="high",
            message="Possible accident detected.",
            track_ids=[a.track_id, b.track_id],
            bboxes=[a.bbox, b.bbox],
        )

    def _check_suspicious_activity(
        self,
        camera_id: str,
        tracks: List[TrackedObject],
    ) -> Optional[LiveAlert]:
        persons = [t for t in tracks if t.label == PERSON_LABEL]
        if not persons:
            return None

        person_speeds = sorted(t.speed_px for t in persons if t.speed_px > 0)
        median_speed = person_speeds[len(person_speeds) // 2] if person_speeds else 0.0
        regions = self.config.restricted_regions.get(camera_id, [])
        offenders: List[TrackedObject] = []

        for p in persons:
            hist = p.history
            if len(hist) < self.config.suspicious_history_min_points:
                continue

            direction_changes = _direction_changes(hist)
            path_ratio = _path_displacement_ratio(hist)
            running = (
                p.speed_px >= self.config.suspicious_running_speed_px
                and median_speed > 0
                and p.speed_px >= median_speed * 1.6
            )
            erratic = (
                direction_changes >= self.config.suspicious_direction_changes
                and path_ratio >= self.config.suspicious_min_path_ratio
            )
            restricted = bool(regions) and _centroid_in_regions(p.centroid, regions)

            if running or erratic or restricted:
                offenders.append(p)

        if not offenders:
            return None

        return LiveAlert(
            camera_id=camera_id,
            alert_type="suspicious_activity",
            severity="medium",
            message="Suspicious activity detected.",
            track_ids=[t.track_id for t in offenders],
            bboxes=[t.bbox for t in offenders],
        )

    def _check_loitering(
        self,
        camera_id: str,
        tracks: List[TrackedObject],
        state: CameraRuleState,
        now: float,
    ) -> Optional[LiveAlert]:
        persons = [t for t in tracks if t.label == PERSON_LABEL]
        offenders: List[TrackedObject] = []
        active_ids = {p.track_id for p in persons}

        for p in persons:
            if p.speed_px > self.config.loitering_max_speed_px:
                state.loitering_anchor.pop(p.track_id, None)
                state.loitering_since.pop(p.track_id, None)
                continue

            anchor = state.loitering_anchor.get(p.track_id)
            if anchor is None:
                state.loitering_anchor[p.track_id] = p.centroid
                state.loitering_since[p.track_id] = now
                continue

            if _distance(p.centroid, anchor) > self.config.loitering_max_radius_px:
                state.loitering_anchor[p.track_id] = p.centroid
                state.loitering_since[p.track_id] = now
                continue

            since = state.loitering_since.get(p.track_id, now)
            if now - since >= self.config.loitering_seconds and p.dwell_sec >= self.config.loitering_seconds:
                offenders.append(p)

        for tid in list(state.loitering_anchor.keys()):
            if tid not in active_ids:
                state.loitering_anchor.pop(tid, None)
                state.loitering_since.pop(tid, None)

        if not offenders:
            return None

        return LiveAlert(
            camera_id=camera_id,
            alert_type="loitering",
            severity="medium",
            message="Person loitering detected.",
            track_ids=[t.track_id for t in offenders],
            bboxes=[t.bbox for t in offenders],
        )

    def _check_abandoned_object(
        self,
        camera_id: str,
        tracks: List[TrackedObject],
        state: CameraRuleState,
        now: float,
    ) -> Optional[LiveAlert]:
        objects = [t for t in tracks if t.label in OBJECT_LABELS]
        persons = [t for t in tracks if t.label == PERSON_LABEL]
        if not objects:
            for oid in list(state.object_near_person.keys()):
                state.object_near_person.pop(oid, None)
                state.object_person_departed_since.pop(oid, None)
            return None

        active_object_ids = {o.track_id for o in objects}
        active_person_ids = {p.track_id for p in persons}
        triggered: Optional[TrackedObject] = None

        for obj in objects:
            if obj.speed_px > self.config.abandoned_object_max_speed_px:
                state.object_near_person.pop(obj.track_id, None)
                state.object_person_departed_since.pop(obj.track_id, None)
                continue

            nearest_person: Optional[TrackedObject] = None
            nearest_dist = float("inf")
            for person in persons:
                dist = _distance(obj.centroid, person.centroid)
                if dist < nearest_dist:
                    nearest_dist = dist
                    nearest_person = person

            if nearest_person is not None and nearest_dist <= self.config.abandoned_distance_px:
                state.object_near_person[obj.track_id] = nearest_person.track_id
                state.object_person_departed_since.pop(obj.track_id, None)
                continue

            linked_person_id = state.object_near_person.get(obj.track_id)
            if linked_person_id is None:
                continue

            person_still_near = False
            if linked_person_id in active_person_ids:
                linked = next((p for p in persons if p.track_id == linked_person_id), None)
                if linked and _distance(obj.centroid, linked.centroid) <= self.config.abandoned_distance_px:
                    person_still_near = True

            if person_still_near:
                state.object_person_departed_since.pop(obj.track_id, None)
                continue

            departed_since = state.object_person_departed_since.get(obj.track_id)
            if departed_since is None:
                state.object_person_departed_since[obj.track_id] = now
                continue

            if now - departed_since >= self.config.abandoned_timeout_sec:
                triggered = obj

        for oid in list(state.object_near_person.keys()):
            if oid not in active_object_ids:
                state.object_near_person.pop(oid, None)
                state.object_person_departed_since.pop(oid, None)

        if triggered is None:
            return None

        return LiveAlert(
            camera_id=camera_id,
            alert_type="abandoned_object",
            severity="high",
            message="Possible abandoned object detected.",
            track_ids=[triggered.track_id],
            bboxes=[triggered.bbox],
        )

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
