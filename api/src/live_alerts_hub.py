"""
WebSocket hub for TRUE LIVE alerts — separate from recording_detections / Events API.

Why this file exists (additive):
- Broadcasts live_alert messages to dashboard clients in real time.
- Receives alerts from live-detection-agent via internal HTTP (no coupling to ai-processor).

Depends on: auth.py (JWT), main.py (router include only).
Does NOT modify: recording upload, detection_service, ai-processor.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional, Set

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt

from . import auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["live-alerts"])

INTERNAL_SECRET = os.environ.get("LIVE_ALERT_INTERNAL_SECRET", "live-internal-dev-secret")
LIVE_AGENT_INGEST_URL = os.environ.get("LIVE_AGENT_INGEST_URL", "http://live-detection-agent:8765").rstrip("/")


class LiveAlertConnectionManager:
    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> int:
        dead: List[WebSocket] = []
        sent = 0
        async with self._lock:
            targets = list(self._connections)
        for ws in targets:
            try:
                await ws.send_json(message)
                sent += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)
        return sent


manager = LiveAlertConnectionManager()


def _validate_ws_token(token: str) -> str:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if not username:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def _check_internal_secret(secret: Optional[str]) -> None:
    if not secret or secret != INTERNAL_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


@router.websocket("/api/v1/live/alerts")
async def live_alerts_websocket(
    websocket: WebSocket,
    token: str = Query(default="", description="Surveillance JWT"),
):
    if not token:
        await websocket.close(code=4401)
        return
    try:
        jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    except JWTError:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connection", "status": "connected", "message": "Live AI Connected"})
        while True:
            # Keepalive: client may send ping text
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


@router.post("/api/v1/internal/live-alerts/publish")
async def publish_live_alert(
    alert: Dict[str, Any],
    x_live_alert_secret: Optional[str] = Header(default=None, alias="X-Live-Alert-Secret"),
):
    """Internal: live-detection-agent → WebSocket clients."""
    _check_internal_secret(x_live_alert_secret)
    if alert.get("type") != "live_alert":
        alert = {**alert, "type": "live_alert"}
    sent = await manager.broadcast(alert)
    return {"ok": True, "clients": sent}


@router.post("/api/v1/live/frames/{camera_id}")
async def proxy_live_frame(
    camera_id: str,
    request: Request,
    current_user=Depends(auth.get_current_active_user),
):
    """
    Browser JPEG frame push (JWT). Proxied to live-detection-agent.
    Does NOT interact with MediaRecorder or recording_segments.
    """
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty frame body")

    url = f"{LIVE_AGENT_INGEST_URL}/ingest/frame/{camera_id}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                url,
                content=body,
                headers={
                    "Content-Type": "image/jpeg",
                    "X-Live-Alert-Secret": INTERNAL_SECRET,
                },
            )
        if res.status_code >= 400:
            raise HTTPException(status_code=res.status_code, detail=res.text[:200])
    except httpx.RequestError as exc:
        logger.warning("Frame proxy to live agent failed: %s", exc)
        raise HTTPException(status_code=503, detail="Live detection agent unavailable")

    return {"ok": True, "camera_id": camera_id}
