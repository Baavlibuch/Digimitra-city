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
    recording_clip_create_index_params,
    recording_clip_search_param,
    search_recording_clip,
    validate_semantic_search_milvus_readiness,
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
    logger.info(
        "Semantic search warmup: resolved Milvus host=%s port=%s; create_index params=%s; search params=%s",
        host,
        port,
        recording_clip_create_index_params(),
        recording_clip_search_param(),
    )
    invalidate_recording_clip_collection_cache()
    ok, detail = validate_semantic_search_milvus_readiness()
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
            "Milvus semantic index not available at %s:%s (readiness_ok=%s detail=%s; will retry on first search).",
            host,
            port,
            ok,
            detail,
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

    * configured: a Milvus gRPC endpoint can be resolved for this process (env / service discovery).
    * index_ready: ``recording_clip_frames`` matches the semantic-search contract and is loadable.
    * detail: optional user-facing message when not fully ready.

    Uses the same readiness probe as API startup warmup (``validate_semantic_search_milvus_readiness``)
    when the in-process collection cache is cold or stale, so HTTP status matches runtime init.
    """
    host, port = milvus_host_port_from_env()
    logger.info(
        "semantic_search_status runtime: resolved_host=%r resolved_port=%r raw_env_host=%r raw_env_port=%r",
        host,
        port,
        os.getenv("MILVUS_HOST"),
        os.getenv("MILVUS_PORT"),
    )
    if not host:
        logger.warning(
            "semantic_search_status: configured=false index_ready=false reason=no_milvus_endpoint "
            "(set MILVUS_HOST, MILVUS_URI/MILVUS_ADDR, MILVUS_SERVICE_HOST, or MILVUS_ENDPOINT)",
        )
        return False, False, _MSG_NOT_CONFIGURED

    col = get_recording_clip_collection_cached()
    if col is not None and recording_clip_collection_usable(col):
        logger.info(
            "semantic_search_status: configured=true index_ready=true (cache hit) collection=%s",
            RECORDING_CLIP_COLLECTION,
        )
        return True, True, None

    readiness_ok, readiness_detail = validate_semantic_search_milvus_readiness(host=host, port=port)
    logger.info(
        "semantic_search_status: validate_semantic_search_milvus_readiness ok=%s detail=%r",
        readiness_ok,
        readiness_detail,
    )

    col = get_recording_clip_collection_cached()
    usable = col is not None and recording_clip_collection_usable(col)
    logger.info(
        "semantic_search_status: post-readiness get_recording_clip_collection_cached is_none=%s usable=%s",
        col is None,
        usable,
    )

    if not usable and readiness_ok:
        logger.warning(
            "semantic_search_status: readiness_ok but API cache not usable; invalidating recording_clip cache once",
        )
        invalidate_recording_clip_collection_cache()
        col = get_recording_clip_collection_cached()
        usable = col is not None and recording_clip_collection_usable(col)
        logger.info(
            "semantic_search_status: after cache invalidation is_none=%s usable=%s",
            col is None,
            usable,
        )

    if usable:
        logger.info(
            "semantic_search_status: configured=true index_ready=true collection=%s",
            RECORDING_CLIP_COLLECTION,
        )
        return True, True, None

    logger.warning(
        "semantic_search_status: configured=true index_ready=false readiness_ok=%s readiness_detail=%r "
        "collection_is_none=%s",
        readiness_ok,
        readiness_detail,
        col is None,
    )
    return True, False, _MSG_INDEX_UNAVAILABLE


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
