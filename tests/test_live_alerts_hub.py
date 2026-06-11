"""WebSocket live alert delivery tests."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.src import auth
from api.src.live_alerts_hub import router as live_alerts_router


@pytest.fixture
def app():
    test_app = FastAPI()
    test_app.include_router(live_alerts_router)
    return test_app


@pytest.fixture
def client(app):
    return TestClient(app)


def _make_token() -> str:
    return auth.create_access_token(data={"sub": "test-operator", "role": "admin"})


def test_internal_publish_requires_secret(client):
    res = client.post(
        "/api/v1/internal/live-alerts/publish",
        json={"type": "live_alert", "camera_id": "1", "message": "test"},
    )
    assert res.status_code == 401


def test_internal_publish_broadcasts(client):
    token = _make_token()
    alert = {
        "type": "live_alert",
        "camera_id": "1",
        "alert_type": "crowd_gathering",
        "severity": "high",
        "message": "Crowd detected",
        "timestamp": "2026-06-10T12:00:00Z",
        "track_ids": [1],
        "bboxes": [[10, 10, 50, 50]],
    }
    res = client.post(
        "/api/v1/internal/live-alerts/publish",
        json=alert,
        headers={"X-Live-Alert-Secret": "live-internal-dev-secret"},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_websocket_rejects_missing_token(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/live/alerts"):
            pass


def test_websocket_accepts_valid_token(client):
    token = _make_token()
    with client.websocket_connect(f"/api/v1/live/alerts?token={token}") as ws:
        msg = ws.receive_json()
        assert msg.get("status") == "connected"


def test_websocket_receives_published_alert(client):
    token = _make_token()
    with client.websocket_connect(f"/api/v1/live/alerts?token={token}") as ws:
        _ = ws.receive_json()
        client.post(
            "/api/v1/internal/live-alerts/publish",
            json={
                "type": "live_alert",
                "camera_id": "7",
                "alert_type": "wrong_way_driving",
                "severity": "high",
                "message": "Wrong way",
                "timestamp": "2026-06-10T12:00:00Z",
                "track_ids": [3],
                "bboxes": [[1, 2, 3, 4]],
            },
            headers={"X-Live-Alert-Secret": "live-internal-dev-secret"},
        )
        data = ws.receive_json()
        assert data.get("alert_type") == "wrong_way_driving"
