"""
Isolated helpers for browser video file uploads (MP4, MOV, AVI, WebM).
Not used by the MediaRecorder / continuous surveillance upload path.
"""

from __future__ import annotations

import os
from typing import Optional, Tuple

ALLOWED_VIDEO_EXTENSIONS = frozenset({".mp4", ".mov", ".avi", ".webm"})

INGEST_SOURCE_FILE_UPLOAD = "browser_file_upload"
INGEST_MODE_FILE_UPLOAD = "file_upload"
METADATA_SOURCE_FILE_UPLOAD = "browser_file_upload"


def max_upload_bytes() -> int:
    raw = os.environ.get("VIDEO_FILE_UPLOAD_MAX_BYTES", str(2 * 1024 * 1024 * 1024))
    try:
        return max(1, int(raw))
    except ValueError:
        return 2 * 1024 * 1024 * 1024


def _ext_from_filename(filename: Optional[str]) -> Optional[str]:
    if not filename or "." not in filename:
        return None
    ext = "." + filename.rsplit(".", 1)[-1].lower()
    return ext if ext in ALLOWED_VIDEO_EXTENSIONS else None


def resolve_video_content_type(
    mime_type: Optional[str],
    filename: Optional[str],
) -> Tuple[str, str]:
    """
    Return (file_extension, content_type) for allowed video uploads.
    Raises ValueError when the file type is not supported.
    """
    mt = (mime_type or "").strip().lower()
    fn_ext = _ext_from_filename(filename)

    if "webm" in mt or fn_ext == ".webm":
        return ".webm", "video/webm"
    if "quicktime" in mt or fn_ext == ".mov":
        return ".mov", "video/quicktime"
    if "x-msvideo" in mt or "avi" in mt or fn_ext == ".avi":
        return ".avi", "video/x-msvideo"
    if "mp4" in mt or fn_ext == ".mp4":
        return ".mp4", "video/mp4"

    if fn_ext:
        if fn_ext == ".mov":
            return ".mov", "video/quicktime"
        if fn_ext == ".avi":
            return ".avi", "video/x-msvideo"
        if fn_ext == ".webm":
            return ".webm", "video/webm"
        if fn_ext == ".mp4":
            return ".mp4", "video/mp4"

    raise ValueError(
        "Unsupported video type. Allowed formats: MP4, MOV, AVI, WebM."
    )
