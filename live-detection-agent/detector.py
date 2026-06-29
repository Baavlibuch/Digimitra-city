"""YOLOv8n live detection — independent copy; does not modify ai-processor."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from config import YOLO_CONFIDENCE, YOLO_DEVICE, YOLO_IMGSZ, YOLO_MODEL

logger = logging.getLogger(__name__)

_ALLOWED_COCO_IDS = {0, 1, 2, 3, 5, 7, 24, 26, 28}
_LABEL_MAP = {
    "person": "person",
    "bicycle": "bicycle",
    "car": "car",
    "motorcycle": "motorcycle",
    "bus": "bus",
    "truck": "truck",
    "backpack": "backpack",
    "handbag": "handbag",
    "suitcase": "suitcase",
}

_model = None


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO

        weights = os.environ.get("YOLO_MODEL", YOLO_MODEL)
        _model = YOLO(weights)
        try:
            _model.fuse()
        except Exception:
            pass
        logger.info("YOLO model loaded: %s device=%s", weights, YOLO_DEVICE)
    return _model


def run_detection(frame_bgr: Any, conf_threshold: Optional[float] = None) -> List[Dict[str, Any]]:
    """Return raw detections: {bbox, label, confidence}."""
    model = _get_model()
    conf = conf_threshold if conf_threshold is not None else YOLO_CONFIDENCE
    results = model.predict(
        source=frame_bgr,
        verbose=False,
        conf=conf,
        imgsz=YOLO_IMGSZ,
        device=YOLO_DEVICE,
    )
    out: List[Dict[str, Any]] = []
    if not results:
        return out
    r0 = results[0]
    if r0.boxes is None or len(r0.boxes) == 0:
        return out

    xyxy = r0.boxes.xyxy.cpu().tolist()
    confs = r0.boxes.conf.cpu().tolist()
    cls_ids = r0.boxes.cls.int().cpu().tolist()
    names = r0.names
    name_map = names if isinstance(names, dict) else {i: str(v) for i, v in enumerate(names)}

    for box, cf, cid in zip(xyxy, confs, cls_ids):
        if int(cid) not in _ALLOWED_COCO_IDS:
            continue
        raw_name = name_map.get(int(cid), str(int(cid)))
        label = _LABEL_MAP.get(raw_name, raw_name)
        x1, y1, x2, y2 = [float(x) for x in box]
        out.append(
            {
                "bbox": [x1, y1, x2, y2],
                "label": label,
                "confidence": float(cf),
            }
        )
    return out
