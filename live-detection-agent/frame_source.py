"""Frame acquisition: RTSP via OpenCV, browser JPEG queue, video file fallback."""

from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

from config import FRAME_FPS, VIDEO_FALLBACK_DIR

logger = logging.getLogger(__name__)


class JpegFrameQueue:
    """Thread-safe latest-frame buffer for browser-ingested JPEGs."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest: Optional[np.ndarray] = None
        self._updated_at: float = 0.0

    def push_jpeg(self, jpeg_bytes: bytes) -> bool:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return False
        with self._lock:
            self._latest = frame
            self._updated_at = time.time()
        return True

    def get_latest(self, max_age_sec: float = 5.0) -> Optional[np.ndarray]:
        with self._lock:
            if self._latest is None:
                return None
            if time.time() - self._updated_at > max_age_sec:
                return None
            return self._latest.copy()


class RtspFrameSource:
    """OpenCV RTSP capture with FPS throttling."""

    def __init__(self, camera_id: str, rtsp_url: str) -> None:
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self._cap: Optional[cv2.VideoCapture] = None
        self._interval = 1.0 / max(FRAME_FPS, 0.1)
        self._last_emit = 0.0

    def _ensure_cap(self) -> bool:
        if self._cap is not None and self._cap.isOpened():
            return True
        if self._cap is not None:
            self._cap.release()
        self._cap = cv2.VideoCapture(self.rtsp_url)
        if not self._cap.isOpened():
            logger.warning("[%s] Cannot open RTSP: %s", self.camera_id, self.rtsp_url)
            return False
        return True

    def read_frame(self) -> Optional[np.ndarray]:
        if not self._ensure_cap():
            return None
        now = time.time()
        if now - self._last_emit < self._interval:
            return None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            self._cap.release()
            self._cap = None
            return None
        self._last_emit = now
        return frame

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None


class VideoFileFrameSource:
    """Loop video file at FRAME_FPS (dev / fallback when no RTSP)."""

    def __init__(self, camera_id: str, video_path: str) -> None:
        self.camera_id = camera_id
        self.video_path = video_path
        self._cap: Optional[cv2.VideoCapture] = None
        self._interval = 1.0 / max(FRAME_FPS, 0.1)
        self._last_emit = 0.0

    def _ensure_cap(self) -> bool:
        if self._cap is not None and self._cap.isOpened():
            return True
        self._cap = cv2.VideoCapture(self.video_path)
        return self._cap.isOpened()

    def read_frame(self) -> Optional[np.ndarray]:
        if not self._ensure_cap():
            return None
        now = time.time()
        if now - self._last_emit < self._interval:
            return None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._cap.read()
            if not ok:
                return None
        self._last_emit = now
        return frame

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None


class FrameSourceRegistry:
    """Maps camera_id → JPEG queue for browser frames."""

    def __init__(self) -> None:
        self._jpeg_queues: Dict[str, JpegFrameQueue] = {}
        self._lock = threading.Lock()

    def queue_for(self, camera_id: str) -> JpegFrameQueue:
        with self._lock:
            if camera_id not in self._jpeg_queues:
                self._jpeg_queues[camera_id] = JpegFrameQueue()
            return self._jpeg_queues[camera_id]

    def push_jpeg(self, camera_id: str, jpeg_bytes: bytes) -> bool:
        return self.queue_for(camera_id).push_jpeg(jpeg_bytes)


# Global registry used by ingest HTTP server and camera workers
FRAME_REGISTRY = FrameSourceRegistry()
