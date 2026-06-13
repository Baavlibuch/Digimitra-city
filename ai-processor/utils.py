from __future__ import annotations

import io
import logging
import os
import tempfile
from typing import Any, Optional

import cv2
from minio import Minio
from minio.error import S3Error

from shared.minio_config import minio_bucket_name

logger = logging.getLogger(__name__)


def env_bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def get_minio_client() -> Optional[Minio]:
    endpoint = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
    access = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
    secret = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
    try:
        client = Minio(endpoint, access_key=access, secret_key=secret, secure=env_bool("MINIO_SECURE", False))
        return client
    except Exception as e:
        logger.error("MinIO client init failed: %s", e)
        return None


def _safe_unlink(path: str) -> None:
    if os.path.exists(path):
        os.unlink(path)


def download_object(
    client: Minio,
    bucket: str,
    object_key: str,
    suffix: str = ".bin",
    *,
    _allow_bucket_fallback: bool = True,
) -> str:
    """Stream object to a temp file; caller must delete path after use."""
    resolved_bucket = bucket or minio_bucket_name()
    logger.info("MinIO download: bucket=%s object_key=%s", resolved_bucket, object_key)
    fd, path = tempfile.mkstemp(prefix="seg_", suffix=suffix)
    os.close(fd)
    try:
        client.fget_object(resolved_bucket, object_key, path)
        logger.info("MinIO download OK: bucket=%s object_key=%s", resolved_bucket, object_key)
        return path
    except S3Error as err:
        _safe_unlink(path)
        configured = minio_bucket_name()
        if (
            _allow_bucket_fallback
            and resolved_bucket != configured
            and getattr(err, "code", "") in ("NoSuchBucket", "NoSuchKey")
        ):
            logger.warning(
                "MinIO download failed bucket=%s (%s); retrying bucket=%s",
                resolved_bucket,
                err,
                configured,
            )
            return download_object(
                client,
                configured,
                object_key,
                suffix=suffix,
                _allow_bucket_fallback=False,
            )
        raise


def upload_detection_preview(
    client: Minio,
    bucket: str,
    segment_id: str,
    camera_id: str,
    offset_ms: int,
    frame_bgr: Any,
) -> Optional[str]:
    """Encode a detection frame as JPEG and upload to MinIO; returns object key."""
    resolved_bucket = bucket or minio_bucket_name()
    object_key = f"detection-previews/{camera_id}/{segment_id}/{offset_ms}.jpg"
    try:
        ok, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok:
            logger.warning("JPEG encode failed segment=%s offset_ms=%s", segment_id, offset_ms)
            return None
        data = buf.tobytes()
        client.put_object(
            bucket_name=resolved_bucket,
            object_name=object_key,
            data=io.BytesIO(data),
            length=len(data),
            content_type="image/jpeg",
            metadata={
                "camera_id": camera_id,
                "recording_segment_id": segment_id,
                "timestamp_offset_ms": str(offset_ms),
            },
        )
        logger.debug("Uploaded detection preview: bucket=%s key=%s", resolved_bucket, object_key)
        return object_key
    except S3Error as err:
        logger.warning(
            "Preview upload failed segment=%s offset_ms=%s bucket=%s: %s",
            segment_id,
            offset_ms,
            resolved_bucket,
            err,
        )
        return None
    except Exception as exc:
        logger.warning(
            "Preview upload failed segment=%s offset_ms=%s: %s",
            segment_id,
            offset_ms,
            exc,
        )
        return None
