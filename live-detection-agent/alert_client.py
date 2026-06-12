"""Publish live alerts to the API internal endpoint (WebSocket broadcast hub)."""

from __future__ import annotations

import logging
from typing import Any, Dict

import requests

from config import API_BASE_URL, LIVE_ALERT_INTERNAL_SECRET

logger = logging.getLogger(__name__)


def _publish_live_message(payload: Dict[str, Any]) -> bool:
    url = f"{API_BASE_URL}/api/v1/internal/live-alerts/publish"
    try:
        res = requests.post(
            url,
            json=payload,
            headers={"X-Live-Alert-Secret": LIVE_ALERT_INTERNAL_SECRET},
            timeout=3,
        )
        if res.status_code >= 400:
            logger.warning("Live message publish failed %s: %s", res.status_code, res.text[:200])
            return False
        return True
    except requests.RequestException as exc:
        logger.warning("Live message publish error: %s", exc)
        return False


def publish_alert(alert: Dict[str, Any]) -> bool:
    return _publish_live_message(alert)


def publish_scene_status(payload: Dict[str, Any]) -> bool:
    return _publish_live_message(payload)
