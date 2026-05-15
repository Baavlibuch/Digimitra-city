from __future__ import annotations

import logging
import os
import tempfile
from typing import Optional

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
