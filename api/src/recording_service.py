"""
Recording segment persistence and queries (PostgreSQL).
Designed so future AI pipelines can attach rows referencing `RecordingSegment.id` and optional `extra` JSON.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shared.models import RecordingSegment


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def register_segment(
    db: Session,
    *,
    camera_id: str,
    recording_session_id: str,
    bucket_name: str,
    object_key: str,
    start_time: datetime,
    end_time: Optional[datetime],
    duration_seconds: Optional[float],
    file_type: str,
    size_bytes: Optional[int],
    ingest_source: str,
    extra: Optional[Dict[str, Any]] = None,
) -> Optional[RecordingSegment]:
    row = RecordingSegment(
        id=str(uuid.uuid4()),
        camera_id=camera_id,
        recording_session_id=recording_session_id,
        bucket_name=bucket_name,
        object_key=object_key,
        start_time=_naive_utc(start_time),
        end_time=_naive_utc(end_time) if end_time else None,
        duration_seconds=duration_seconds,
        file_type=file_type,
        size_bytes=size_bytes,
        ingest_source=ingest_source,
        extra=extra,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        return (
            db.query(RecordingSegment)
            .filter(
                RecordingSegment.bucket_name == bucket_name,
                RecordingSegment.object_key == object_key,
            )
            .first()
        )


def get_segment_by_id(db: Session, segment_id: str) -> Optional[RecordingSegment]:
    return db.query(RecordingSegment).filter(RecordingSegment.id == segment_id).first()


def list_segments(
    db: Session,
    *,
    camera_id: Optional[str] = None,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
    ingest_source: Optional[str] = None,
    recording_session_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[RecordingSegment]:
    q = db.query(RecordingSegment)
    if camera_id:
        q = q.filter(RecordingSegment.camera_id == camera_id)
    if recording_session_id:
        q = q.filter(RecordingSegment.recording_session_id == recording_session_id)
    if range_start:
        q = q.filter(RecordingSegment.start_time >= _naive_utc(range_start))
    if range_end:
        q = q.filter(RecordingSegment.start_time <= _naive_utc(range_end))
    if ingest_source:
        q = q.filter(RecordingSegment.ingest_source == ingest_source)
    q = q.order_by(RecordingSegment.start_time.desc())
    return q.offset(offset).limit(min(limit, 200)).all()


def count_segments(
    db: Session,
    *,
    camera_id: Optional[str] = None,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
    ingest_source: Optional[str] = None,
    recording_session_id: Optional[str] = None,
) -> int:
    q = db.query(RecordingSegment)
    if camera_id:
        q = q.filter(RecordingSegment.camera_id == camera_id)
    if recording_session_id:
        q = q.filter(RecordingSegment.recording_session_id == recording_session_id)
    if range_start:
        q = q.filter(RecordingSegment.start_time >= _naive_utc(range_start))
    if range_end:
        q = q.filter(RecordingSegment.start_time <= _naive_utc(range_end))
    if ingest_source:
        q = q.filter(RecordingSegment.ingest_source == ingest_source)
    return q.count()
