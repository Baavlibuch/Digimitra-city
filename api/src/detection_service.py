"""
Queries for recording-linked object detections (offline AI pipeline).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

from shared.models import RecordingDetection, RecordingSegment


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _base_detection_query(db: Session):
    return (
        db.query(RecordingDetection)
        .join(RecordingSegment, RecordingDetection.recording_segment_id == RecordingSegment.id)
    )


def _apply_filters(q, *, camera_id, object_type, recording_segment_id, event_after, event_before):
    if camera_id:
        q = q.filter(RecordingDetection.camera_id == camera_id)
    if object_type:
        q = q.filter(RecordingDetection.object_type == object_type)
    if recording_segment_id:
        q = q.filter(RecordingDetection.recording_segment_id == recording_segment_id)
    if event_after:
        ea = _naive_utc(event_after)
        q = q.filter(
            text(
                "recording_segments.start_time + "
                "(recording_detections.timestamp_offset_ms * interval '1 millisecond') >= :ea"
            ).bindparams(ea=ea)
        )
    if event_before:
        eb = _naive_utc(event_before)
        q = q.filter(
            text(
                "recording_segments.start_time + "
                "(recording_detections.timestamp_offset_ms * interval '1 millisecond') <= :eb"
            ).bindparams(eb=eb)
        )
    return q


def list_detections(
    db: Session,
    *,
    camera_id: Optional[str] = None,
    object_type: Optional[str] = None,
    recording_segment_id: Optional[str] = None,
    event_after: Optional[datetime] = None,
    event_before: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
) -> Tuple[List[RecordingDetection], int]:
    kw = dict(
        camera_id=camera_id,
        object_type=object_type,
        recording_segment_id=recording_segment_id,
        event_after=event_after,
        event_before=event_before,
    )
    count_q = _apply_filters(_base_detection_query(db), **kw)
    total = count_q.with_entities(func.count(RecordingDetection.id)).scalar() or 0

    list_q = _apply_filters(_base_detection_query(db), **kw)
    rows = (
        list_q.options(joinedload(RecordingDetection.segment))
        .order_by(RecordingDetection.created_at.desc())
        .offset(offset)
        .limit(min(limit, 200))
        .all()
    )
    return rows, int(total)


def get_detection_by_id(db: Session, detection_id: str) -> Optional[RecordingDetection]:
    return (
        db.query(RecordingDetection)
        .options(joinedload(RecordingDetection.segment))
        .filter(RecordingDetection.id == detection_id)
        .first()
    )
