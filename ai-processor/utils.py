from __future__ import annotations

import logging
import os
import tempfile
from typing import Optional

from minio import Minio
from minio.error import S3Error

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


def download_object(client: Minio, bucket: str, object_key: str, suffix: str = ".bin") -> str:
    """Stream object to a temp file; caller must delete path after use."""
    fd, path = tempfile.mkstemp(prefix="seg_", suffix=suffix)
    os.close(fd)
    try:
        client.fget_object(bucket, object_key, path)
    except S3Error:
        os.unlink(path, missing_ok=True)
        raise
    return path
