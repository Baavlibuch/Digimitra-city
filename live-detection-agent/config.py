"""Environment configuration for live-detection-agent."""

from __future__ import annotations

import os


def env_str(name: str, default: str) -> str:
    return os.environ.get(name, default).strip()


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


DATABASE_URL = env_str("DATABASE_URL", "postgresql+psycopg2://svc:svcpass@postgres:5432/eventsdb")
YOLO_MODEL = env_str("YOLO_MODEL", "yolov8n.pt")
YOLO_CONFIDENCE = env_float("YOLO_CONFIDENCE", 0.35)
YOLO_DEVICE = env_str("YOLO_DEVICE", "cpu")
YOLO_IMGSZ = env_int("YOLO_IMGSZ", 416)
FRAME_FPS = env_float("FRAME_FPS", 1.0)
API_BASE_URL = env_str("API_BASE_URL", "http://api:8000").rstrip("/")
LIVE_ALERT_INTERNAL_SECRET = env_str("LIVE_ALERT_INTERNAL_SECRET", "live-internal-dev-secret")
FRAME_INGEST_HOST = env_str("FRAME_INGEST_HOST", "0.0.0.0")
FRAME_INGEST_PORT = env_int("FRAME_INGEST_PORT", 8765)
CAMERA_POLL_SEC = env_float("CAMERA_POLL_SEC", 30.0)
VIDEO_FALLBACK_DIR = env_str("VIDEO_FALLBACK_DIR", "/data/videos")
