"""Load RTSP cameras from PostgreSQL registry."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from shared.models import Camera

logger = logging.getLogger(__name__)


@dataclass
class CameraSource:
    camera_id: str
    name: str
    rtsp_url: Optional[str]
    source_type: str


def _build_rtsp_url(cam: Camera) -> Optional[str]:
    if cam.rtsp_url and cam.rtsp_url.strip():
        return cam.rtsp_url.strip()
    if cam.ip_address and cam.port:
        user = cam.camera_username or ""
        pwd = cam.camera_password or ""
        auth = f"{user}:{pwd}@" if user else ""
        channel = cam.channel or "1"
        return f"rtsp://{auth}{cam.ip_address}:{cam.port}/stream{channel}"
    return None


def load_cameras(database_url: Optional[str] = None) -> List[CameraSource]:
    url = database_url or os.environ.get(
        "DATABASE_URL", "postgresql+psycopg2://svc:svcpass@postgres:5432/eventsdb"
    )
    engine = create_engine(url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        rows = db.query(Camera).all()
        sources: List[CameraSource] = []
        for cam in rows:
            rtsp = _build_rtsp_url(cam)
            sources.append(
                CameraSource(
                    camera_id=cam.id,
                    name=cam.name or cam.id,
                    rtsp_url=rtsp,
                    source_type=cam.source_type or "cctv",
                )
            )
        return sources
    finally:
        db.close()
