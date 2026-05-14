"""Sparse frame sampling from a local video file (OpenCV, low RAM)."""

from __future__ import annotations

import logging
from typing import Any, Iterator, Tuple

import cv2

logger = logging.getLogger(__name__)


def iter_spaced_frames(video_path: str, interval_sec: float) -> Iterator[Tuple[Any, int]]:
    """
    Decode sequentially; emit one frame every ~`interval_sec` seconds (by frame index / FPS).
    Short browser segments: acceptable CPU; avoids keyframe seek inaccuracies.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.warning("OpenCV could not open: %s", video_path)
        return

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 1.0:
        fps = 25.0

    step = max(1, int(round(interval_sec * fps)))
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok or frame is None:
            break
        if i % step == 0:
            yield frame, int((i / fps) * 1000.0)
        i += 1
    cap.release()
