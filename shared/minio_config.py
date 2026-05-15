"""Single source of truth for the application MinIO object bucket."""
from __future__ import annotations

import os

DEFAULT_MINIO_BUCKET = "surveillance-bucket"


def minio_bucket_name() -> str:
    """Resolved bucket for recordings and chunk uploads (env: MINIO_BUCKET)."""
    return os.environ.get("MINIO_BUCKET", DEFAULT_MINIO_BUCKET).strip() or DEFAULT_MINIO_BUCKET
