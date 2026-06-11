"""Pytest path setup for monorepo packages."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "live-detection-agent"))

os.environ.setdefault("LIVE_ALERT_INTERNAL_SECRET", "live-internal-dev-secret")
os.environ.setdefault("JWT_SECRET", "devsecret")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://svc:svcpass@localhost:5432/eventsdb",
)
