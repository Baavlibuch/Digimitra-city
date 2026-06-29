"""live-detection-agent entry: camera pipelines + frame ingest server."""

from __future__ import annotations

import logging
import os
import threading
import time

import uvicorn

from camera_registry import load_cameras
from config import CAMERA_POLL_SEC, FRAME_INGEST_HOST, FRAME_INGEST_PORT, VIDEO_FALLBACK_DIR
from ingest_server import ingest_app, set_pipeline_manager
from pipeline import PipelineManager, discover_video_fallback

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("live-detection-agent")


def _sync_cameras(manager: PipelineManager) -> None:
    cameras = load_cameras()
    if not cameras:
        logger.warning("No cameras in registry; waiting for browser frame ingest or DB cameras")
        return

    for cam in cameras:
        rtsp = cam.rtsp_url
        video_path = None
        browser_only = False

        if rtsp:
            logger.info("Camera %s (%s): RTSP source", cam.camera_id, cam.name)
        else:
            video_path = discover_video_fallback(cam.camera_id, VIDEO_FALLBACK_DIR)
            if video_path:
                logger.info("Camera %s (%s): video fallback %s", cam.camera_id, cam.name, video_path)
            else:
                browser_only = True
                logger.info("Camera %s (%s): browser JPEG ingest only", cam.camera_id, cam.name)

        manager.ensure_pipeline(
            cam.camera_id,
            rtsp_url=rtsp,
            video_path=video_path,
            browser_only=browser_only,
        )


def _camera_poll_loop(manager: PipelineManager) -> None:
    while True:
        try:
            _sync_cameras(manager)
        except Exception:
            logger.exception("Camera registry sync failed")
        time.sleep(CAMERA_POLL_SEC)


def _ensure_browser_pipelines(manager: PipelineManager) -> None:
    """Start pipelines for UI feed IDs passed via env (browser webcam frame push)."""
    raw = os.environ.get("LIVE_BROWSER_CAMERA_IDS", "").strip()
    if not raw:
        return
    for cam_id in raw.split(","):
        cam_id = cam_id.strip()
        if cam_id:
            manager.ensure_pipeline(cam_id, browser_only=True)
            logger.info("Browser-only pipeline for camera_id=%s", cam_id)


def main() -> None:
    manager = PipelineManager()

    try:
        _sync_cameras(manager)
    except Exception:
        logger.exception("Initial camera sync failed")

    _ensure_browser_pipelines(manager)
    set_pipeline_manager(manager)

    poll_thread = threading.Thread(target=_camera_poll_loop, args=(manager,), daemon=True)
    poll_thread.start()

    logger.info("Frame ingest server on %s:%s", FRAME_INGEST_HOST, FRAME_INGEST_PORT)
    uvicorn.run(ingest_app, host=FRAME_INGEST_HOST, port=FRAME_INGEST_PORT, log_level="info")


if __name__ == "__main__":
    main()
