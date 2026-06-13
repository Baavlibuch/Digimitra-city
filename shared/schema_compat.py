"""
Align existing databases with newer ORM columns (create_all never ALTERs tables).

Without this, SELECT/INSERT on recording_segments fails with 500; browsers often
misreport the failed response as a CORS error.
"""
from __future__ import annotations

import logging
from typing import Any, Set

logger = logging.getLogger(__name__)

_AI_COLUMNS = (
    ("ai_scan_started_at", "TIMESTAMP", "DATETIME"),
    ("ai_scan_completed_at", "TIMESTAMP", "DATETIME"),
    ("ai_scan_last_error", "TEXT", "TEXT"),
)

_DETECTION_PREVIEW_COLUMN = ("preview_object_key", "TEXT", "TEXT")


def _pg_existing_columns(conn: Any) -> Set[str]:
    from sqlalchemy import text

    rows = conn.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'recording_segments'
            """
        )
    ).fetchall()
    return {r[0] for r in rows}


def _sqlite_existing_columns(conn: Any) -> Set[str]:
    from sqlalchemy import text

    rows = conn.execute(text("PRAGMA table_info(recording_segments)")).fetchall()
    return {r[1] for r in rows}


def _pg_detection_columns(conn: Any) -> Set[str]:
    from sqlalchemy import text

    rows = conn.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'recording_detections'
            """
        )
    ).fetchall()
    return {r[0] for r in rows}


def _sqlite_detection_columns(conn: Any) -> Set[str]:
    from sqlalchemy import text

    rows = conn.execute(text("PRAGMA table_info(recording_detections)")).fetchall()
    return {r[1] for r in rows}


def _ensure_recording_detections_table(engine: Any) -> None:
    from sqlalchemy import inspect

    from shared.models import RecordingDetection

    insp = inspect(engine)
    if insp.has_table("recording_detections"):
        return
    try:
        RecordingDetection.__table__.create(engine, checkfirst=True)
        logger.info("Created missing table recording_detections")
    except Exception:
        logger.exception("Could not create recording_detections (may already exist)")


def ensure_postgresql_recording_segment_ai_columns(engine: Any) -> None:
    if getattr(engine.dialect, "name", None) != "postgresql":
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            if not conn.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name = 'recording_segments'"
                )
            ).scalar():
                logger.warning("recording_segments missing; skipping AI column migration")
                return
            have = _pg_existing_columns(conn)
            for col, pg_type, _ in _AI_COLUMNS:
                if col in have:
                    continue
                conn.execute(text(f"ALTER TABLE recording_segments ADD COLUMN {col} {pg_type}"))
                logger.info("Added column recording_segments.%s", col)
    except Exception:
        logger.exception("PostgreSQL AI column migration failed")


def ensure_sqlite_recording_segment_ai_columns(engine: Any) -> None:
    if getattr(engine.dialect, "name", None) != "sqlite":
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            rows = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='recording_segments'")
            ).fetchall()
            if not rows:
                logger.warning("recording_segments missing; skipping AI column migration")
                return
            have = _sqlite_existing_columns(conn)
            for col, _, sl_type in _AI_COLUMNS:
                if col in have:
                    continue
                conn.execute(text(f"ALTER TABLE recording_segments ADD COLUMN {col} {sl_type}"))
                logger.info("Added column recording_segments.%s (sqlite)", col)
    except Exception:
        logger.exception("SQLite AI column migration failed")


def ensure_postgresql_recording_detection_preview_column(engine: Any) -> None:
    if getattr(engine.dialect, "name", None) != "postgresql":
        return
    from sqlalchemy import text

    col, pg_type, _ = _DETECTION_PREVIEW_COLUMN
    try:
        with engine.begin() as conn:
            if not conn.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name = 'recording_detections'"
                )
            ).scalar():
                return
            have = _pg_detection_columns(conn)
            if col in have:
                return
            conn.execute(text(f"ALTER TABLE recording_detections ADD COLUMN {col} {pg_type}"))
            logger.info("Added column recording_detections.%s", col)
    except Exception:
        logger.exception("PostgreSQL detection preview column migration failed")


def ensure_sqlite_recording_detection_preview_column(engine: Any) -> None:
    if getattr(engine.dialect, "name", None) != "sqlite":
        return
    from sqlalchemy import text

    col, _, sl_type = _DETECTION_PREVIEW_COLUMN
    try:
        with engine.begin() as conn:
            rows = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='recording_detections'")
            ).fetchall()
            if not rows:
                return
            have = _sqlite_detection_columns(conn)
            if col in have:
                return
            conn.execute(text(f"ALTER TABLE recording_detections ADD COLUMN {col} {sl_type}"))
            logger.info("Added column recording_detections.%s (sqlite)", col)
    except Exception:
        logger.exception("SQLite detection preview column migration failed")


def ensure_recording_schema(engine: Any) -> None:
    """Call after Base.metadata.create_all()."""
    _ensure_recording_detections_table(engine)
    ensure_postgresql_recording_segment_ai_columns(engine)
    ensure_sqlite_recording_segment_ai_columns(engine)
    ensure_postgresql_recording_detection_preview_column(engine)
    ensure_sqlite_recording_detection_preview_column(engine)
