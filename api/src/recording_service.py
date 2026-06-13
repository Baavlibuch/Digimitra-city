"""
Recording segment persistence and queries (PostgreSQL).
Designed so future AI pipelines can attach rows referencing `RecordingSegment.id` and optional `extra` JSON.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shared.models import RecordingSegment

logger = logging.getLogger(__name__)


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


def count_segments_pending_ai_index(db: Session) -> int:
    """Segments registered in PostgreSQL but not yet finished by the AI worker (CLIP + YOLO)."""
    return (
        db.query(RecordingSegment)
        .filter(RecordingSegment.ai_scan_completed_at.is_(None))
        .count()
    )


def _semantic_hit_better_than(candidate: Dict[str, Any], incumbent: Dict[str, Any]) -> bool:
    """True when candidate should replace incumbent for the same recording segment."""
    cand_sim = float(candidate.get("similarity") or 0.0)
    inc_sim = float(incumbent.get("similarity") or 0.0)
    if cand_sim > inc_sim:
        return True
    if cand_sim < inc_sim:
        return False
    cand_off = int(candidate.get("timestamp_offset_ms") or 0)
    inc_off = int(incumbent.get("timestamp_offset_ms") or 0)
    return cand_off < inc_off


def dedupe_semantic_hits_by_segment(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Keep at most one Milvus hit per ``recording_segment_id``.

    Retains the highest-similarity frame; on a tie, the earliest ``timestamp_offset_ms``.
    Output order follows the original Milvus ranking (by the index of each retained hit).
    """
    if not hits:
        return []

    best_index_by_segment: Dict[str, int] = {}
    best_hit_by_segment: Dict[str, Dict[str, Any]] = {}

    for index, hit in enumerate(hits):
        segment_id = str(hit.get("recording_segment_id") or "").strip()
        if not segment_id:
            continue
        incumbent = best_hit_by_segment.get(segment_id)
        if incumbent is None or _semantic_hit_better_than(hit, incumbent):
            best_index_by_segment[segment_id] = index
            best_hit_by_segment[segment_id] = hit

    if not best_hit_by_segment:
        return []

    ordered_segment_ids = sorted(best_index_by_segment.keys(), key=lambda sid: best_index_by_segment[sid])
    deduped = [best_hit_by_segment[sid] for sid in ordered_segment_ids]
    if len(deduped) < len(hits):
        logger.info(
            "semantic search: deduped segment hits %s -> %s (one best match per recording_segment_id)",
            len(hits),
            len(deduped),
        )
    return deduped


def filter_valid_semantic_hits(db: Session, hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Drop Milvus hits whose recording_segment_id is missing or no longer in PostgreSQL.

    Preserves Milvus ranking order for surviving hits. Logs skipped stale/orphan ids.
    """
    if not hits:
        return []

    ordered_ids: List[str] = []
    seen: set[str] = set()
    for h in hits:
        rid = h.get("recording_segment_id")
        if not rid:
            continue
        sid = str(rid)
        if sid not in seen:
            seen.add(sid)
            ordered_ids.append(sid)

    if not ordered_ids:
        for h in hits:
            logger.info(
                "semantic search: skipping hit without recording_segment_id (vector_id=%r)",
                h.get("id"),
            )
        return []

    rows = (
        db.query(RecordingSegment.id, RecordingSegment.bucket_name, RecordingSegment.object_key)
        .filter(RecordingSegment.id.in_(ordered_ids))
        .all()
    )
    playable_ids = {
        str(row[0])
        for row in rows
        if row[0] and (row[1] or "").strip() and (row[2] or "").strip()
    }
    missing_ids = set(ordered_ids) - {str(row[0]) for row in rows if row[0]}
    incomplete_ids = {str(row[0]) for row in rows if row[0]} - playable_ids

    out: List[Dict[str, Any]] = []
    for h in hits:
        rid = h.get("recording_segment_id")
        if not rid:
            logger.info(
                "semantic search: skipping hit without recording_segment_id (vector_id=%r)",
                h.get("id"),
            )
            continue
        sid = str(rid)
        if sid in missing_ids:
            logger.info(
                "semantic search: skipping stale orphan segment_id=%r (not in recording_segments)",
                sid,
            )
            continue
        if sid in incomplete_ids:
            logger.info(
                "semantic search: skipping segment_id=%r (recording row missing storage reference)",
                sid,
            )
            continue
        out.append(h)
    return out


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
