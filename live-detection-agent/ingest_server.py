"""HTTP server for browser JPEG frame ingestion (separate from MediaRecorder)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from config import LIVE_ALERT_INTERNAL_SECRET
from frame_source import FRAME_REGISTRY

if TYPE_CHECKING:
    from pipeline import PipelineManager

logger = logging.getLogger(__name__)

ingest_app = FastAPI(title="Live Frame Ingest")

_pipeline_manager: Optional["PipelineManager"] = None


def set_pipeline_manager(manager: "PipelineManager") -> None:
    """Register the shared pipeline manager (called from app.main)."""
    global _pipeline_manager
    _pipeline_manager = manager


def _check_secret(secret: Optional[str]) -> None:
    if not secret or secret != LIVE_ALERT_INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@ingest_app.post("/ingest/frame/{camera_id}")
async def ingest_frame(
    camera_id: str,
    request: Request,
    x_live_alert_secret: Optional[str] = Header(default=None, alias="X-Live-Alert-Secret"),
):
    _check_secret(x_live_alert_secret)
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty frame body")
    if _pipeline_manager is not None:
        _pipeline_manager.ensure_pipeline(camera_id, browser_only=True)

    ok = FRAME_REGISTRY.push_jpeg(camera_id, body)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid JPEG")
    return JSONResponse({"ok": True, "camera_id": camera_id})


@ingest_app.get("/health")
def health():
    return {"status": "ok", "service": "live-detection-agent-ingest"}
