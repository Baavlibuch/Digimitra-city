"""HTTP server for browser JPEG frame ingestion (separate from MediaRecorder)."""

from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from config import LIVE_ALERT_INTERNAL_SECRET
from frame_source import FRAME_REGISTRY

ingest_app = FastAPI(title="Live Frame Ingest")


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
    ok = FRAME_REGISTRY.push_jpeg(camera_id, body)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid JPEG")
    return JSONResponse({"ok": True, "camera_id": camera_id})


@ingest_app.get("/health")
def health():
    return {"status": "ok", "service": "live-detection-agent-ingest"}
