"""YOLOv8n — CPU-friendly defaults, filtered COCO classes."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

from models import RawDetection

logger = logging.getLogger(__name__)

# COCO ids we persist (subset of user targets)
_ALLOWED_COCO_IDS = {0, 1, 2, 3, 5, 7, 24}
# Normalize labels for search UX
_LABEL_MAP = {
    "person": "person",
    "bicycle": "bicycle",
    "car": "car",
    "motorcycle": "motorcycle",
    "bus": "bus",
    "truck": "truck",
    "backpack": "backpack",
}

_model = None


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO

        weights = os.environ.get("YOLO_WEIGHTS", "yolov8n.pt")
        _model = YOLO(weights)
        # Keep CPU inference predictable for laptops
        try:
            _model.fuse()
        except Exception:
            pass
    return _model


def run_detection(
    frame_bgr: Any,
    *,
    offset_ms: int,
    conf_threshold: float = 0.35,
) -> List[RawDetection]:
    model = _get_model()
    h, w = frame_bgr.shape[:2]
    results = model.predict(
        source=frame_bgr,
        verbose=False,
        conf=conf_threshold,
        imgsz=int(os.environ.get("YOLO_IMGSZ", "416")),
        device=os.environ.get("YOLO_DEVICE", "cpu"),
    )
    out: List[RawDetection] = []
    if not results:
        return out
    r0 = results[0]
    if r0.boxes is None or len(r0.boxes) == 0:
        return out

    xyxy = r0.boxes.xyxy.cpu().tolist()
    confs = r0.boxes.conf.cpu().tolist()
    cls_ids = r0.boxes.cls.int().cpu().tolist()
    names = r0.names
    if isinstance(names, dict):
        name_map = names
    else:
        name_map = {i: str(v) for i, v in enumerate(names)}

    for box, cf, cid in zip(xyxy, confs, cls_ids):
        if int(cid) not in _ALLOWED_COCO_IDS:
            continue
        raw_name = name_map.get(int(cid), str(int(cid)))
        label = _LABEL_MAP.get(raw_name, raw_name)
        x1, y1, x2, y2 = [float(x) for x in box]
        bbox = {
            "xyxy": [x1, y1, x2, y2],
            "frame_shape": [int(h), int(w)],
        }
        out.append(
            RawDetection(
                object_type=label,
                confidence=float(cf),
                timestamp_offset_ms=offset_ms,
                bounding_box=bbox,
            )
        )
    return out
