"""
Regression: recording pipeline modules remain importable and unchanged in contract.
Does NOT start services — verifies additive live path did not break existing modules.
"""

from __future__ import annotations

import importlib
import inspect


def test_recording_upload_endpoint_still_exists():
    from api.src import main

    routes = [getattr(r, "path", None) for r in main.app.routes]
    assert "/api/v1/recordings/upload" in routes


def test_detections_api_still_exists():
    from api.src import main

    paths = [getattr(r, "path", "") for r in main.app.routes]
    assert any(p.startswith("/api/v1/detections") for p in paths)


def test_ai_processor_scheduler_unchanged_entry():
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "ai-processor"))
    scheduler = importlib.import_module("scheduler")
    assert hasattr(scheduler, "_pick_next_segment")


def test_use_webcam_recording_exports_unchanged():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    path = root / "ui-police/lib/use-webcam-recording.ts"
    with open(path, encoding="utf-8") as f:
        src = f.read()
    assert "uploadRecordingBlob" in src
    assert "DEFAULT_ROLLING_SEGMENT_MS" in src
    assert "MediaRecorder" in src


def test_live_rules_separate_from_detection_service():
    from api.src import detection_service
    from shared import live_rules

    assert not hasattr(detection_service, "LiveRuleEngine")
    assert hasattr(live_rules, "LiveRuleEngine")
