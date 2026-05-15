"""
PostgreSQL persistence for stream-processor Kafka consumers.
"""
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from shared.minio_config import minio_bucket_name
from shared.models import Base, Event, RecordingSegment
from shared.schema_compat import ensure_recording_schema

logger = logging.getLogger(__name__)

__all__ = ["RecordingStore"]


def _engine():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return create_engine(db_url, pool_pre_ping=True)


def _session_factory():
    return sessionmaker(autocommit=False, autoflush=False, bind=_engine())


def create_tables() -> None:
    engine = _engine()
    Base.metadata.create_all(bind=engine)
    ensure_recording_schema(engine)


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.utcfromtimestamp(value)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


class RecordingStore:
    """Persists Redpanda events and recording chunk metadata for offline AI scan."""

    def __init__(self) -> None:
        create_tables()
        self._SessionLocal = _session_factory()

    def verify_connection(self) -> None:
        with _engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Stream processor connected to PostgreSQL")

    def insert_event(self, message: Dict[str, Any]) -> None:
        session: Session = self._SessionLocal()
        try:
            event_id = message.get("event_id") or str(uuid.uuid4())
            camera_id = message.get("camera_id")
            if not camera_id:
                logger.warning("Skipping event without camera_id: %s", message)
                return
            ts = (
                _parse_dt(message.get("timestamp"))
                or _parse_dt(message.get("start_time"))
                or datetime.utcnow()
            )
            if ts and ts.tzinfo is not None:
                ts = ts.replace(tzinfo=None)

            row = Event(
                id=event_id,
                camera_id=camera_id,
                timestamp=ts,
                event_type=str(message.get("event_type", "unknown")),
                confidence=float(message.get("confidence", 0.0)),
                bounding_box=message.get("bounding_box"),
                thumbnail_path=message.get("thumbnail_path"),
                chunk_path=message.get("chunk_path"),
            )
            session.add(row)
            session.commit()
            logger.info("Recording event persisted: event_id=%s camera=%s", event_id, camera_id)
        except IntegrityError:
            session.rollback()
            logger.debug("Duplicate event id, skipping: %s", message.get("event_id"))
        except Exception:
            session.rollback()
            logger.exception("insert_event failed for message keys=%s", list(message.keys()))
        finally:
            session.close()

    def insert_recording_chunk(self, message: Dict[str, Any]) -> None:
        """Persist DVR segment from edge chunk pipeline (Kafka)."""
        session: Session = self._SessionLocal()
        try:
            object_key = message.get("minio_key")
            camera_id = message.get("camera_id")
            if not object_key or not camera_id:
                logger.warning("Skipping chunk without minio_key/camera_id: %s", message)
                return

            bucket = message.get("bucket") or minio_bucket_name()
            chunk_id = message.get("chunk_id") or str(uuid.uuid4())
            segment_id = str(uuid.uuid4())
            start = _parse_dt(message.get("start_time"))
            end = _parse_dt(message.get("end_time"))
            if not start:
                start = datetime.utcnow()
            if start.tzinfo is not None:
                start = start.replace(tzinfo=None)
            if end and end.tzinfo is not None:
                end = end.replace(tzinfo=None)

            duration = message.get("duration_seconds")
            if duration is None and start and end:
                duration = max(0.0, (end - start).total_seconds())
            if duration is not None:
                duration = float(duration)

            size_bytes = message.get("file_size_bytes")
            if size_bytes is not None:
                try:
                    size_bytes = int(size_bytes)
                except (TypeError, ValueError):
                    size_bytes = None

            ext = object_key.rsplit(".", 1)[-1].lower() if "." in object_key else "bin"
            mime = "video/mp4" if ext == "mp4" else "application/octet-stream"

            extra = {k: v for k, v in message.items() if k not in ("minio_key", "camera_id", "bucket")}

            row = RecordingSegment(
                id=segment_id,
                camera_id=camera_id,
                recording_session_id=str(chunk_id),
                bucket_name=bucket,
                object_key=object_key,
                start_time=start,
                end_time=end,
                duration_seconds=duration,
                file_type=mime,
                size_bytes=size_bytes,
                ingest_source="edge_agent_kafka",
                extra=extra,
            )
            session.add(row)
            session.commit()
            logger.info(
                "Recording chunk stored; AI scan queued: segment_id=%s camera=%s key=%s",
                segment_id,
                camera_id,
                object_key,
            )
        except IntegrityError:
            session.rollback()
            logger.debug("Duplicate recording object, skipping: %s", message.get("minio_key"))
        except Exception:
            session.rollback()
            logger.exception("insert_recording_chunk failed")
        finally:
            session.close()
