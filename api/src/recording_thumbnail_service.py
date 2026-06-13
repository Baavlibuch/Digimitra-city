"""Timestamp-accurate thumbnails for semantic search hits (cached in MinIO)."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from shared.models import RecordingSegment

from .recording_service import get_segment_by_id
from .storage_service import MinIOStorageService

logger = logging.getLogger(__name__)

_PRESIGN_HOURS = 24
_CACHE_TTL_SEC = int(_PRESIGN_HOURS * 3600 * 0.9)
_url_cache: Dict[Tuple[str, int], Tuple[str, float]] = {}
_list_preview_url_cache: Dict[str, Tuple[str, float]] = {}
_url_cache_lock = threading.Lock()
_ffmpeg_checked = False
_ffmpeg_path: Optional[str] = None
_RECORDING_PREVIEW_OFFSET_MS = 1000
_RECORDING_PREVIEW_REUSE_OFFSETS_MS = (0, _RECORDING_PREVIEW_OFFSET_MS)


def _recording_preview_key(segment_id: str) -> str:
    return f"recording-previews/{segment_id}.jpg"


def _semantic_thumb_key(segment_id: str, offset_ms: int) -> str:
    return f"semantic-thumbnails/{segment_id}/{int(offset_ms)}.jpg"


def _detection_preview_key(camera_id: str, segment_id: str, offset_ms: int) -> str:
    return f"detection-previews/{camera_id}/{segment_id}/{int(offset_ms)}.jpg"


def _cache_get(segment_id: str, offset_ms: int) -> Optional[str]:
    key = (segment_id, int(offset_ms))
    now = time.time()
    with _url_cache_lock:
        entry = _url_cache.get(key)
        if not entry:
            return None
        url, expires_at = entry
        if expires_at <= now:
            _url_cache.pop(key, None)
            return None
        return url


def _cache_put(segment_id: str, offset_ms: int, url: str) -> None:
    key = (segment_id, int(offset_ms))
    with _url_cache_lock:
        _url_cache[key] = (url, time.time() + _CACHE_TTL_SEC)


def _find_ffmpeg() -> Optional[str]:
    global _ffmpeg_checked, _ffmpeg_path
    if _ffmpeg_checked:
        return _ffmpeg_path
    _ffmpeg_checked = True
    _ffmpeg_path = shutil.which("ffmpeg")
    if not _ffmpeg_path:
        logger.warning("ffmpeg not found; semantic search thumbnails will use existing MinIO previews only")
    return _ffmpeg_path


def _object_exists(storage: MinIOStorageService, bucket: str, object_key: str) -> bool:
    if not storage.client:
        return False
    try:
        storage.client.stat_object(bucket_name=bucket, object_name=object_key)
        return True
    except Exception:
        return False


def _presign_existing(storage: MinIOStorageService, bucket: str, object_key: str) -> Optional[str]:
    return storage.get_presigned_url(object_key, expiry_hours=_PRESIGN_HOURS, bucket_name=bucket)


def _upload_jpeg(
    storage: MinIOStorageService,
    *,
    bucket: str,
    object_key: str,
    jpeg_bytes: bytes,
    metadata: Optional[dict] = None,
) -> bool:
    if not storage.client:
        return False
    try:
        import io

        storage.client.put_object(
            bucket_name=bucket,
            object_name=object_key,
            data=io.BytesIO(jpeg_bytes),
            length=len(jpeg_bytes),
            content_type="image/jpeg",
            metadata={k: str(v) for k, v in (metadata or {}).items()},
        )
        return True
    except Exception as exc:
        logger.warning("Thumbnail upload failed key=%s: %s", object_key, exc)
        return False


def _download_segment_video(storage: MinIOStorageService, segment: RecordingSegment) -> Optional[str]:
    if not storage.client:
        return None
    bucket = (segment.bucket_name or storage.bucket_name or "").strip()
    object_key = (segment.object_key or "").strip()
    if not bucket or not object_key:
        return None
    suffix = ".mp4"
    if "." in object_key:
        suffix = "." + object_key.rsplit(".", 1)[-1].lower()
    fd, path = tempfile.mkstemp(prefix="thumb_seg_", suffix=suffix)
    os.close(fd)
    try:
        storage.client.fget_object(bucket, object_key, path)
        return path
    except Exception as exc:
        logger.warning(
            "Could not download segment=%s bucket=%s key=%s: %s",
            segment.id,
            bucket,
            object_key,
            exc,
        )
        try:
            os.unlink(path)
        except OSError:
            pass
        return None


def _extract_frame_ffmpeg(video_path: str, offset_ms: int, out_path: str) -> bool:
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        return False
    timestamp_sec = max(0.0, int(offset_ms) / 1000.0)
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{timestamp_sec:.3f}",
        "-i",
        video_path,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-y",
        out_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
        if proc.returncode != 0:
            logger.warning(
                "ffmpeg thumbnail failed segment_video=%s offset_ms=%s stderr=%s",
                video_path,
                offset_ms,
                (proc.stderr or proc.stdout or "")[:300],
            )
            return False
        return os.path.isfile(out_path) and os.path.getsize(out_path) > 0
    except Exception as exc:
        logger.warning("ffmpeg thumbnail error offset_ms=%s: %s", offset_ms, exc)
        return False


def _resolve_cached_thumbnail(
    storage: MinIOStorageService,
    segment: RecordingSegment,
    offset_ms: int,
) -> Optional[str]:
    cached = _cache_get(segment.id, offset_ms)
    if cached:
        return cached

    bucket = (segment.bucket_name or storage.bucket_name or "").strip()
    if not bucket:
        return None

    semantic_key = _semantic_thumb_key(segment.id, offset_ms)
    if _object_exists(storage, bucket, semantic_key):
        url = _presign_existing(storage, bucket, semantic_key)
        if url:
            _cache_put(segment.id, offset_ms, url)
            return url

    camera_id = (segment.camera_id or "").strip()
    if camera_id:
        preview_key = _detection_preview_key(camera_id, segment.id, offset_ms)
        if _object_exists(storage, bucket, preview_key):
            url = _presign_existing(storage, bucket, preview_key)
            if url:
                _cache_put(segment.id, offset_ms, url)
                return url

    return None


def _generate_and_store_thumbnail(
    storage: MinIOStorageService,
    segment: RecordingSegment,
    offset_ms: int,
    video_path: str,
) -> Optional[str]:
    bucket = (segment.bucket_name or storage.bucket_name or "").strip()
    if not bucket:
        return None

    semantic_key = _semantic_thumb_key(segment.id, offset_ms)
    fd, out_path = tempfile.mkstemp(prefix="thumb_out_", suffix=".jpg")
    os.close(fd)
    try:
        if not _extract_frame_ffmpeg(video_path, offset_ms, out_path):
            return None
        with open(out_path, "rb") as f:
            jpeg_bytes = f.read()
        if not jpeg_bytes:
            return None
        if not _upload_jpeg(
            storage,
            bucket=bucket,
            object_key=semantic_key,
            jpeg_bytes=jpeg_bytes,
            metadata={
                "recording_segment_id": segment.id,
                "camera_id": segment.camera_id or "",
                "timestamp_offset_ms": offset_ms,
            },
        ):
            return None
        url = _presign_existing(storage, bucket, semantic_key)
        if url:
            _cache_put(segment.id, offset_ms, url)
        return url
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def resolve_thumbnail_url(
    storage: MinIOStorageService,
    segment: RecordingSegment,
    offset_ms: int,
    *,
    video_path: Optional[str] = None,
) -> Optional[str]:
    """Return a presigned thumbnail URL for the matched timestamp, generating and caching when needed."""
    url = _resolve_cached_thumbnail(storage, segment, offset_ms)
    if url:
        return url

    local_video = video_path
    owns_video = False
    if not local_video:
        local_video = _download_segment_video(storage, segment)
        owns_video = local_video is not None

    if not local_video:
        return None

    try:
        return _generate_and_store_thumbnail(storage, segment, offset_ms, local_video)
    finally:
        if owns_video and local_video:
            try:
                os.unlink(local_video)
            except OSError:
                pass


def attach_semantic_search_thumbnails(
    db: Session,
    storage: MinIOStorageService,
    hits: List[dict],
) -> None:
    """
    Mutates each hit dict with ``thumbnail_url`` when a preview can be resolved.
    Downloads each segment video at most once per batch.
    """
    if not hits:
        return

    segments: Dict[str, RecordingSegment] = {}
    pending_by_segment: Dict[str, List[dict]] = defaultdict(list)

    for hit in hits:
        segment_id = str(hit.get("recording_segment_id") or "").strip()
        if not segment_id:
            hit["thumbnail_url"] = None
            continue
        offset_ms = int(hit.get("timestamp_offset_ms") or 0)

        if segment_id not in segments:
            row = get_segment_by_id(db, segment_id)
            if row:
                segments[segment_id] = row

        segment = segments.get(segment_id)
        if not segment:
            hit["thumbnail_url"] = None
            continue

        cached_url = _resolve_cached_thumbnail(storage, segment, offset_ms)
        if cached_url:
            hit["thumbnail_url"] = cached_url
        else:
            pending_by_segment[segment_id].append(hit)

    for segment_id, segment_hits in pending_by_segment.items():
        segment = segments.get(segment_id)
        if not segment:
            for hit in segment_hits:
                hit["thumbnail_url"] = None
            continue

        video_path = _download_segment_video(storage, segment)
        if not video_path:
            for hit in segment_hits:
                hit["thumbnail_url"] = None
            continue

        try:
            for hit in segment_hits:
                offset_ms = int(hit.get("timestamp_offset_ms") or 0)
                hit["thumbnail_url"] = _generate_and_store_thumbnail(
                    storage,
                    segment,
                    offset_ms,
                    video_path,
                )
        finally:
            try:
                os.unlink(video_path)
            except OSError:
                pass


def _list_preview_cache_get(segment_id: str) -> Optional[str]:
    now = time.time()
    with _url_cache_lock:
        entry = _list_preview_url_cache.get(segment_id)
        if not entry:
            return None
        url, expires_at = entry
        if expires_at <= now:
            _list_preview_url_cache.pop(segment_id, None)
            return None
        return url


def _list_preview_cache_put(segment_id: str, url: str) -> None:
    with _url_cache_lock:
        _list_preview_url_cache[segment_id] = (url, time.time() + _CACHE_TTL_SEC)


def _resolve_recording_list_preview_cached(
    storage: MinIOStorageService,
    segment: RecordingSegment,
) -> Optional[str]:
    """Return a presigned preview URL when already stored or derivable without re-encoding."""
    cached = _list_preview_cache_get(segment.id)
    if cached:
        return cached

    bucket = (segment.bucket_name or storage.bucket_name or "").strip()
    if not bucket:
        return None

    preview_key = _recording_preview_key(segment.id)
    if _object_exists(storage, bucket, preview_key):
        url = _presign_existing(storage, bucket, preview_key)
        if url:
            _list_preview_cache_put(segment.id, url)
            return url

    camera_id = (segment.camera_id or "").strip()
    for offset_ms in _RECORDING_PREVIEW_REUSE_OFFSETS_MS:
        semantic_key = _semantic_thumb_key(segment.id, offset_ms)
        if _object_exists(storage, bucket, semantic_key):
            url = _presign_existing(storage, bucket, semantic_key)
            if url:
                _list_preview_cache_put(segment.id, url)
                return url
        if camera_id:
            detection_key = _detection_preview_key(camera_id, segment.id, offset_ms)
            if _object_exists(storage, bucket, detection_key):
                url = _presign_existing(storage, bucket, detection_key)
                if url:
                    _list_preview_cache_put(segment.id, url)
                    return url

    return None


def _generate_and_store_recording_preview(
    storage: MinIOStorageService,
    segment: RecordingSegment,
    video_path: str,
) -> Optional[str]:
    bucket = (segment.bucket_name or storage.bucket_name or "").strip()
    if not bucket:
        return None

    preview_key = _recording_preview_key(segment.id)
    fd, out_path = tempfile.mkstemp(prefix="rec_preview_out_", suffix=".jpg")
    os.close(fd)
    try:
        if not _extract_frame_ffmpeg(video_path, _RECORDING_PREVIEW_OFFSET_MS, out_path):
            return None
        with open(out_path, "rb") as f:
            jpeg_bytes = f.read()
        if not jpeg_bytes:
            return None
        if not _upload_jpeg(
            storage,
            bucket=bucket,
            object_key=preview_key,
            jpeg_bytes=jpeg_bytes,
            metadata={
                "recording_segment_id": segment.id,
                "camera_id": segment.camera_id or "",
                "timestamp_offset_ms": _RECORDING_PREVIEW_OFFSET_MS,
            },
        ):
            return None
        url = _presign_existing(storage, bucket, preview_key)
        if url:
            _list_preview_cache_put(segment.id, url)
        return url
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def attach_recording_list_previews(
    storage: MinIOStorageService,
    segments: List[RecordingSegment],
) -> Dict[str, Optional[str]]:
    """
    Resolve preview URLs for catalog rows. Generates at most one FFmpeg frame per segment
    and stores under ``recording-previews/{segment_id}.jpg`` when no reusable asset exists.
    """
    if not segments:
        return {}

    results: Dict[str, Optional[str]] = {}
    pending: List[RecordingSegment] = []

    for segment in segments:
        url = _resolve_recording_list_preview_cached(storage, segment)
        if url:
            results[segment.id] = url
        else:
            pending.append(segment)

    for segment in pending:
        video_path = _download_segment_video(storage, segment)
        if not video_path:
            results[segment.id] = None
            continue
        try:
            results[segment.id] = _generate_and_store_recording_preview(storage, segment, video_path)
        finally:
            try:
                os.unlink(video_path)
            except OSError:
                pass

    return results
