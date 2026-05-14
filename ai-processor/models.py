"""Internal datatypes for the offline AI worker (not shared with FastAPI)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple


@dataclass
class FrameSample:
    offset_ms: int
    frame_shape: Tuple[int, int, int]  # h, w, c


@dataclass
class RawDetection:
    object_type: str
    confidence: float
    timestamp_offset_ms: int
    bounding_box: Dict[str, Any]
