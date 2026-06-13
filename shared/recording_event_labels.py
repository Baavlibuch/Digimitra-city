"""
Derive recording incident banner labels from YOLO detections at a frame.

Mirrors ui-police/lib/detection-overlay-utils.ts (eventBannerLabel) and
events-alerts severity mapping so semantic search API responses match playback UI.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

VEHICLE_OBJECT_TYPES = frozenset({"car", "truck", "bus", "motorcycle", "bicycle"})


def is_idle_scene_message(message: Optional[str]) -> bool:
    if not message:
        return False
    normalized = message.lower().replace("'", "").replace("'", "")
    return "everything" in normalized and "idle" in normalized


def _parse_bbox(raw: Any) -> Optional[Dict[str, float]]:
    if not isinstance(raw, dict):
        return None
    try:
        if all(k in raw for k in ("x1", "y1", "x2", "y2")):
            return {
                "x1": float(raw["x1"]),
                "y1": float(raw["y1"]),
                "x2": float(raw["x2"]),
                "y2": float(raw["y2"]),
            }
        if all(k in raw for k in ("x", "y", "width", "height")):
            x, y = float(raw["x"]), float(raw["y"])
            w, h = float(raw["width"]), float(raw["height"])
            return {"x1": x, "y1": y, "x2": x + w, "y2": y + h}
    except (TypeError, ValueError):
        return None
    return None


def _boxes_colliding(a: Dict[str, float], b: Dict[str, float]) -> bool:
    return not (
        a["x2"] < b["x1"]
        or b["x2"] < a["x1"]
        or a["y2"] < b["y1"]
        or b["y2"] < a["y1"]
    )


def _has_same_frame_vehicle_collision(vehicles: Sequence[Dict[str, Any]]) -> bool:
    by_frame: Dict[int, List[Dict[str, float]]] = {}
    for v in vehicles:
        off = int(v.get("timestamp_offset_ms") or 0)
        bbox = _parse_bbox(v.get("bounding_box"))
        if bbox is None:
            continue
        by_frame.setdefault(off, []).append(bbox)
    for boxes in by_frame.values():
        for i, a in enumerate(boxes):
            for b in boxes[i + 1 :]:
                if _boxes_colliding(a, b):
                    return True
    return False


def _has_same_frame_person_vehicle_collision(
    persons: Sequence[Dict[str, Any]],
    vehicles: Sequence[Dict[str, Any]],
) -> bool:
    by_frame: Dict[int, Tuple[List[Dict[str, float]], List[Dict[str, float]]]] = {}
    for p in persons:
        off = int(p.get("timestamp_offset_ms") or 0)
        bbox = _parse_bbox(p.get("bounding_box"))
        if bbox is None:
            continue
        entry = by_frame.setdefault(off, ([], []))
        entry[0].append(bbox)
    for v in vehicles:
        off = int(v.get("timestamp_offset_ms") or 0)
        bbox = _parse_bbox(v.get("bounding_box"))
        if bbox is None:
            continue
        entry = by_frame.setdefault(off, ([], []))
        entry[1].append(bbox)
    for person_boxes, vehicle_boxes in by_frame.values():
        if not person_boxes or not vehicle_boxes:
            continue
        for person_box in person_boxes:
            for vehicle_box in vehicle_boxes:
                if _boxes_colliding(person_box, vehicle_box):
                    return True
    return False


def event_banner_label(detections: Sequence[Dict[str, Any]]) -> Optional[str]:
    if not detections:
        return None
    persons = [d for d in detections if d.get("object_type") == "person"]
    vehicles = [d for d in detections if d.get("object_type") in VEHICLE_OBJECT_TYPES]
    backpacks = [d for d in detections if d.get("object_type") == "backpack"]

    if len(persons) >= 10:
        return "Crowd Formation"

    if len(vehicles) >= 100:
        return "Traffic Congestion"
    if _has_same_frame_vehicle_collision(vehicles) or _has_same_frame_person_vehicle_collision(
        persons, vehicles
    ):
        return "Accident Alert"

    if len(vehicles) >= 2:
        return "Vehicle Cluster Detected"
    if len(vehicles) == 1 and len(persons) == 0:
        return "High Vehicle Activity"

    if len(persons) >= 1 and len(backpacks) >= 1:
        return "Security Alert"
    if len(persons) >= 2:
        min_conf = min(float(p.get("confidence") or 0) for p in persons)
        if min_conf >= 0.75:
            return "Possible Altercation"
        return "High Human Activity"

    top = max(detections, key=lambda d: float(d.get("confidence") or 0))
    obj_type = str(top.get("object_type") or "")
    conf = float(top.get("confidence") or 0)
    if obj_type == "person" and conf >= 0.85:
        return "Suspicious Activity"
    if obj_type in ("car", "truck", "bus"):
        return f"{obj_type.capitalize()} Detected"
    if obj_type:
        return f"{obj_type.capitalize()} Detected"
    return None


def severity_from_label(label: str) -> Optional[str]:
    if label == "Accident Alert":
        return "critical"
    if label in ("Possible Altercation", "Suspicious Activity", "Security Alert"):
        return "high"
    if label in (
        "Crowd Formation",
        "Traffic Congestion",
        "High Human Activity",
        "Vehicle Cluster Detected",
    ):
        return "medium"
    return "medium"


def event_labels_for_frame_detections(
    detections: Sequence[Dict[str, Any]],
) -> Tuple[Optional[str], List[str], Optional[str]]:
    """
    Returns (primary_label, all_unique_labels, severity) for one frame group.
    Filters idle labels; dedupes identical banner text.
    """
    label = event_banner_label(detections)
    if not label or is_idle_scene_message(label):
        return None, [], None
    return label, [label], severity_from_label(label)
