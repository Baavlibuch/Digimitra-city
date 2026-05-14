"""CLIP text query → Milvus search over `recording_clip_frames` (CPU, lazy model load)."""

from __future__ import annotations

import logging
import os
from typing import Any, List, Optional, Tuple

from shared.recording_clip_milvus import (
    RECORDING_CLIP_COLLECTION,
    RECORDING_CLIP_INDEX_TYPE,
    RECORDING_CLIP_METRIC_TYPE,
    ensure_recording_clip_collection,
    milvus_host_port_from_env,
    recording_clip_collection_usable,
    search_recording_clip,
)

logger = logging.getLogger(__name__)

_text_model: Any = None
_text_model_name: Optional[str] = None
_collection_cache: Any = None


def invalidate_recording_clip_collection_cache() -> None:
    global _collection_cache
    _collection_cache = None


def warmup_recording_clip_milvus() -> None:
    """Best-effort: connect and ensure `recording_clip_frames` during API startup."""
    host, port = milvus_host_port_from_env()
    if not host:
        logger.info("MILVUS_HOST not set; semantic recording_clip Milvus warmup skipped.")
        return
    invalidate_recording_clip_collection_cache()
    col = get_recording_clip_collection_cached()
    if col:
        logger.info(
            "Semantic search: enabled (Milvus collection=%s, index=%s, metric=%s).",
            RECORDING_CLIP_COLLECTION,
            RECORDING_CLIP_INDEX_TYPE,
            RECORDING_CLIP_METRIC_TYPE,
        )
    else:
        logger.warning(
            "Milvus semantic index not available at %s:%s (will retry on first search).",
            host,
            port,
        )


def _get_text_model():
    global _text_model, _text_model_name
    name = os.environ.get("CLIP_MODEL_NAME", "sentence-transformers/clip-ViT-B-32").strip()
    if _text_model is None or _text_model_name != name:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading CLIP model for semantic search API: %s (CPU)", name)
        _text_model = SentenceTransformer(name, device="cpu")
        _text_model_name = name
    return _text_model


def get_recording_clip_collection_cached():
    global _collection_cache
    if _collection_cache is not None:
        try:
            if recording_clip_collection_usable(_collection_cache):
                return _collection_cache
        except Exception as e:
            logger.warning("cached recording_clip_frames collection invalid (%s); re-ensuring.", e)
        invalidate_recording_clip_collection_cache()
    host, port = milvus_host_port_from_env()
    if not host:
        return None
    _collection_cache = ensure_recording_clip_collection(host, port)
    return _collection_cache


_MSG_NOT_CONFIGURED = "Semantic search is not configured for this server."
_MSG_INDEX_UNAVAILABLE = (
    "Semantic search index is unreachable. Ensure Milvus is running and segments have been indexed."
)


def semantic_search_status() -> Tuple[bool, bool, Optional[str]]:
    """
    Returns (configured, index_ready, client_safe_detail).

    * configured: this API process has a Milvus endpoint configured.
    * index_ready: collection is loaded and searches can run.
    * detail: optional user-facing message when not fully ready.
    """
    host, port = milvus_host_port_from_env()
    if not host:
        logger.info("semantic search status: Milvus host not set in environment for this API process")
        return False, False, _MSG_NOT_CONFIGURED
    col = get_recording_clip_collection_cached()
    if col is None:
        logger.debug(
            "semantic search status: configured=true index_ready=false host=%s:%s (recording_clip_frames missing or not loadable).",
            host,
            port,
        )
        return True, False, _MSG_INDEX_UNAVAILABLE
    logger.debug(
        "semantic search status: configured=true index_ready=true host=%s:%s collection=%s.",
        host,
        port,
        RECORDING_CLIP_COLLECTION,
    )
    return True, True, None


def run_semantic_search(
    query: str,
    *,
    top_k: int = 20,
    camera_id: Optional[str] = None,
) -> Tuple[List[dict], bool, Optional[str]]:
    """
    Returns (hits, milvus_configured, error_message).
    milvus_configured False when Milvus is not configured for this process (no host in env).
    """
    host, _port = milvus_host_port_from_env()
    if not host:
        logger.info("semantic search declined: Milvus host not set in this API process")
        return [], False, _MSG_NOT_CONFIGURED

    col = get_recording_clip_collection_cached()
    if col is None:
        return [], True, _MSG_INDEX_UNAVAILABLE

    q = (query or "").strip()
    if not q:
        return [], True, "Query is empty."

    try:
        model = _get_text_model()
        qv = model.encode(
            [q],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
        vec = qv.astype("float32").tolist()
        cam = (camera_id or "").strip() or None
        hits = search_recording_clip(col, vec, top_k=top_k, camera_id=cam)
        return hits, True, None
    except Exception as e:
        logger.exception("semantic search failed")
        return [], True, str(e)[:500]
