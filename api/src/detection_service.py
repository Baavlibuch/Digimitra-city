"""
Queries for recording-linked object detections (offline AI pipeline).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple

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


def _default_semantic_match_tolerance_ms() -> int:
    import os

    try:
        interval_sec = float(os.environ.get("AI_FRAME_INTERVAL_SEC", "3"))
    except ValueError:
        interval_sec = 3.0
    return max(500, int(interval_sec * 1000 / 2))


def _nearest_frame_offset(
    target_ms: int,
    available_offsets: Sequence[int],
    tolerance_ms: int,
) -> Optional[int]:
    if not available_offsets:
        return None
    exact = [o for o in available_offsets if o == target_ms]
    if exact:
        return exact[0]
    best: Optional[int] = None
    best_delta = tolerance_ms + 1
    for off in available_offsets:
        delta = abs(off - target_ms)
        if delta <= tolerance_ms and delta < best_delta:
            best = off
            best_delta = delta
    return best


def fetch_detections_for_semantic_hits(
    db: Session,
    hits: List[dict],
    *,
    tolerance_ms: Optional[int] = None,
) -> Dict[tuple[str, int], List[RecordingDetection]]:
    """
    Map each semantic hit (segment_id, timestamp_offset_ms) to YOLO detections
    at the same sampled frame (exact offset first, then nearest within tolerance).
    """
    if not hits:
        return {}

    tol = tolerance_ms if tolerance_ms is not None else _default_semantic_match_tolerance_ms()
    segment_ids: List[str] = []
    seen_segments: set[str] = set()
    for hit in hits:
        sid = str(hit.get("recording_segment_id") or "").strip()
        if sid and sid not in seen_segments:
            seen_segments.add(sid)
            segment_ids.append(sid)
    if not segment_ids:
        return {}

    rows = (
        db.query(RecordingDetection)
        .options(joinedload(RecordingDetection.segment))
        .filter(RecordingDetection.recording_segment_id.in_(segment_ids))
        .all()
    )
    offsets_by_segment: Dict[str, set[int]] = {}
    rows_by_segment_offset: Dict[tuple[str, int], List[RecordingDetection]] = {}
    for row in rows:
        sid = str(row.recording_segment_id)
        off = int(row.timestamp_offset_ms)
        offsets_by_segment.setdefault(sid, set()).add(off)
        rows_by_segment_offset.setdefault((sid, off), []).append(row)

    out: Dict[tuple[str, int], List[RecordingDetection]] = {}
    for hit in hits:
        sid = str(hit.get("recording_segment_id") or "").strip()
        if not sid:
            continue
        target_ms = int(hit.get("timestamp_offset_ms") or 0)
        key = (sid, target_ms)
        if key in out:
            continue
        available = sorted(offsets_by_segment.get(sid, set()))
        matched_off = _nearest_frame_offset(target_ms, available, tol)
        if matched_off is None:
            out[key] = []
        else:
            out[key] = rows_by_segment_offset.get((sid, matched_off), [])
    return out


def attach_semantic_search_detections(
    db: Session,
    hits: List[dict],
    *,
    tolerance_ms: Optional[int] = None,
) -> None:
    """Mutates each hit dict with ``match_detections`` (list of ORM rows)."""
    if not hits:
        return
    lookup = fetch_detections_for_semantic_hits(db, hits, tolerance_ms=tolerance_ms)
    for hit in hits:
        sid = str(hit.get("recording_segment_id") or "").strip()
        off = int(hit.get("timestamp_offset_ms") or 0)
        hit["match_detections"] = lookup.get((sid, off), [])
