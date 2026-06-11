"""ByteTrack via supervision — per-camera tracker state."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import supervision as sv

from shared.live_rules import TrackedObject, _centroid


class CameraTracker:
    """Maintains ByteTrack + track history for one camera."""

    def __init__(self) -> None:
        self._tracker = sv.ByteTrack()
        self._history: Dict[int, List[Tuple[float, float, float]]] = {}
        self._first_seen: Dict[int, float] = {}

    def update(self, detections: List[Dict[str, Any]], frame_shape: Tuple[int, int]) -> List[TrackedObject]:
        if not detections:
            self._tracker.update_with_detections(sv.Detections.empty())
            return []

        xyxy = np.array([d["bbox"] for d in detections], dtype=np.float32)
        confidences = np.array([d["confidence"] for d in detections], dtype=np.float32)
        class_ids = np.array([self._label_to_id(d["label"]) for d in detections], dtype=int)

        sv_det = sv.Detections(xyxy=xyxy, confidence=confidences, class_id=class_ids)
        tracked = self._tracker.update_with_detections(sv_det)

        now = time.time()
        out: List[TrackedObject] = []
        if tracked.tracker_id is None:
            return out

        det_labels = [d["label"] for d in detections]
        det_confs = [d["confidence"] for d in detections]

        for i, track_id in enumerate(tracked.tracker_id):
            if track_id is None:
                continue
            tid = int(track_id)
            bbox = tracked.xyxy[i].tolist()
            match_idx = self._match_detection_index(bbox, [d["bbox"] for d in detections])
            label = det_labels[match_idx] if match_idx is not None else "unknown"
            conf = (
                float(tracked.confidence[i])
                if tracked.confidence is not None
                else (det_confs[match_idx] if match_idx is not None else 0.0)
            )
            cx, cy = _centroid(bbox)

            if tid not in self._first_seen:
                self._first_seen[tid] = now
            hist = self._history.setdefault(tid, [])
            hist.append((cx, cy, now))
            if len(hist) > 30:
                hist.pop(0)

            velocity, speed = self._velocity(hist)
            dwell = now - self._first_seen.get(tid, now)

            out.append(
                TrackedObject(
                    track_id=tid,
                    label=label,
                    confidence=conf,
                    bbox=bbox,
                    centroid=(cx, cy),
                    speed_px=speed,
                    velocity=velocity,
                    dwell_sec=dwell,
                )
            )

        return out

    @staticmethod
    def _match_detection_index(bbox: List[float], det_bboxes: List[List[float]]) -> Optional[int]:
        if not det_bboxes:
            return None
        best_i = 0
        best_iou = -1.0
        for j, db in enumerate(det_bboxes):
            iou = CameraTracker._iou(bbox, db)
            if iou > best_iou:
                best_iou = iou
                best_i = j
        return best_i if best_iou > 0.1 else None

    @staticmethod
    def _iou(a: List[float], b: List[float]) -> float:
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

    @staticmethod
    def _label_to_id(label: str) -> int:
        mapping = {
            "person": 0,
            "bicycle": 1,
            "car": 2,
            "motorcycle": 3,
            "bus": 5,
            "truck": 7,
        }
        return mapping.get(label, 0)

    @staticmethod
    def _velocity(hist: List[Tuple[float, float, float]]) -> Tuple[Tuple[float, float], float]:
        if len(hist) < 2:
            return (0.0, 0.0), 0.0
        x0, y0, t0 = hist[-2]
        x1, y1, t1 = hist[-1]
        dt = max(t1 - t0, 1e-6)
        vx = (x1 - x0) / dt
        vy = (y1 - y0) / dt
        speed = float(np.hypot(vx, vy))
        if speed < 1e-6:
            return (0.0, 0.0), 0.0
        return (vx / speed, vy / speed), speed
