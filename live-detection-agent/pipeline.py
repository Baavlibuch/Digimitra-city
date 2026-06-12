"""Per-camera live detection pipeline: frame → YOLO → ByteTrack → rules → alert."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Dict, Optional

from alert_client import publish_alert, publish_scene_status
from detector import run_detection
from frame_source import (
    FRAME_REGISTRY,
    JpegFrameQueue,
    RtspFrameSource,
    VideoFileFrameSource,
)
from shared.live_rules import LiveRuleEngine
from shared.live_scene_status import derive_scene_status
from tracker import CameraTracker

logger = logging.getLogger(__name__)


class CameraPipeline:
    def __init__(
        self,
        camera_id: str,
        *,
        rtsp_url: Optional[str] = None,
        video_path: Optional[str] = None,
        jpeg_queue: Optional[JpegFrameQueue] = None,
        rule_engine: Optional[LiveRuleEngine] = None,
    ) -> None:
        self.camera_id = camera_id
        self._rtsp = RtspFrameSource(camera_id, rtsp_url) if rtsp_url else None
        self._video = VideoFileFrameSource(camera_id, video_path) if video_path else None
        self._jpeg = jpeg_queue
        self._tracker = CameraTracker()
        self._rules = rule_engine or LiveRuleEngine()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_scene_status: Optional[str] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name=f"live-{self.camera_id}", daemon=True)
        self._thread.start()
        logger.info("Pipeline started for camera %s", self.camera_id)

    def stop(self) -> None:
        self._stop.set()
        if self._rtsp:
            self._rtsp.close()
        if self._video:
            self._video.close()

    def _next_frame(self):
        if self._jpeg:
            frame = self._jpeg.get_latest()
            if frame is not None:
                return frame
        if self._rtsp:
            return self._rtsp.read_frame()
        if self._video:
            return self._video.read_frame()
        return None

    def _loop(self) -> None:
        while not self._stop.is_set():
            frame = self._next_frame()
            if frame is None:
                time.sleep(0.05)
                continue
            try:
                detections = run_detection(frame)
                h, w = frame.shape[:2]
                tracks = self._tracker.update(detections, (h, w))
                alerts = self._rules.evaluate(self.camera_id, tracks)
                for alert in alerts:
                    publish_alert(alert.to_dict())

                scene = derive_scene_status(alerts)
                if scene.scene_status != self._last_scene_status:
                    publish_scene_status(scene.to_ws_payload(self.camera_id))
                    self._last_scene_status = scene.scene_status
            except Exception:
                logger.exception("Pipeline error camera=%s", self.camera_id)
            time.sleep(0.02)


class PipelineManager:
    """Manages active camera pipelines; refreshes from registry."""

    def __init__(self) -> None:
        self._pipelines: Dict[str, CameraPipeline] = {}
        self._lock = threading.Lock()
        self._rules = LiveRuleEngine()

    def ensure_pipeline(
        self,
        camera_id: str,
        *,
        rtsp_url: Optional[str] = None,
        video_path: Optional[str] = None,
        browser_only: bool = False,
    ) -> CameraPipeline:
        with self._lock:
            if camera_id in self._pipelines:
                return self._pipelines[camera_id]

            pipe = CameraPipeline(
                camera_id,
                rtsp_url=rtsp_url if not browser_only else None,
                video_path=video_path if not browser_only else None,
                jpeg_queue=FRAME_REGISTRY.queue_for(camera_id),
                rule_engine=self._rules,
            )
            pipe.start()
            self._pipelines[camera_id] = pipe
            return pipe

    def stop_all(self) -> None:
        with self._lock:
            for p in self._pipelines.values():
                p.stop()
            self._pipelines.clear()


def discover_video_fallback(camera_id: str, video_dir: str) -> Optional[str]:
    if not os.path.isdir(video_dir):
        return None
    files = sorted(f for f in os.listdir(video_dir) if f.lower().endswith((".mp4", ".avi", ".mkv")))
    if not files:
        return None
    idx = hash(camera_id) % len(files)
    return os.path.join(video_dir, files[idx])
