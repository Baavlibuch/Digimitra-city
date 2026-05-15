"""
Milvus helpers for recording-segment CLIP frame embeddings.

Collection: recording_clip_frames (dedicated; do not reuse legacy `events` / edge collections).
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

RECORDING_CLIP_COLLECTION = "recording_clip_frames"
RECORDING_CLIP_CONN_ALIAS = "recording_clip_frames_conn"
EMBEDDING_DIM = 512
# Milvus metric for FLOAT_VECTOR index + search (this Milvus build: L2 and IP only — never COSINE).
RECORDING_CLIP_INDEX_TYPE = "FLAT"
RECORDING_CLIP_METRIC_TYPE = "IP"
# Bumped when schema/index contract changes; missing marker ⇒ legacy collection ⇒ safe rebuild.
RECORDING_CLIP_SCHEMA_MARKER = "digimitra_semantic_v2_ip_flat_512"

_recording_clip_collection_dropped_hooks: List[Callable[[], None]] = []


def register_recording_clip_collection_dropped_hook(fn: Callable[[], None]) -> None:
    """Register a callback after ``recording_clip_frames`` is dropped (e.g. invalidate in-process collection cache)."""

    if fn not in _recording_clip_collection_dropped_hooks:
        _recording_clip_collection_dropped_hooks.append(fn)


def _notify_recording_clip_collection_dropped() -> None:
    for fn in _recording_clip_collection_dropped_hooks:
        try:
            fn()
        except Exception as e:
            logger.warning("recording_clip_frames drop hook failed: %s", e)


def milvus_host_port_from_env() -> Tuple[Optional[str], int]:
    """Read Milvus gRPC endpoint from env (same vars as api / ai-processor compose).

    Precedence (authoritative first):
    1. ``MILVUS_HOST`` (non-empty after strip) + ``MILVUS_PORT`` (default 19530). When set, this wins;
       empty/whitespace-only ``MILVUS_URI`` / ``MILVUS_ADDR`` / ``MILVUS_ENDPOINT`` never override it.
    2. ``MILVUS_URI`` / ``MILVUS_ADDR`` as ``host:port`` or ``grpc(s)://host:port`` / ``http(s)://host:port``
    3. Kubernetes-style ``MILVUS_SERVICE_HOST`` / ``MILVUS_SERVICE_PORT``
    4. ``MILVUS_ENDPOINT`` as ``host:port``
    """
    raw_host = os.environ.get("MILVUS_HOST")
    raw_port = os.environ.get("MILVUS_PORT")
    raw_uri = os.environ.get("MILVUS_URI")
    raw_addr = os.environ.get("MILVUS_ADDR")
    raw_endpoint = os.environ.get("MILVUS_ENDPOINT")
    raw_svc_host = os.environ.get("MILVUS_SERVICE_HOST")

    logger.debug(
        "milvus_host_port_from_env: raw MILVUS_HOST=%r MILVUS_PORT=%r MILVUS_URI=%r MILVUS_ADDR=%r "
        "MILVUS_ENDPOINT=%r MILVUS_SERVICE_HOST=%r",
        raw_host,
        raw_port,
        raw_uri,
        raw_addr,
        raw_endpoint,
        raw_svc_host,
    )

    # --- 1) Authoritative: explicit host + port (Compose / standard deploys) ---
    host_primary = (raw_host or "").strip()
    if host_primary:
        try:
            port = int(str(raw_port if raw_port is not None else "19530").strip())
        except ValueError:
            port = 19530
        if host_primary in ("localhost", "127.0.0.1") and os.path.isfile("/.dockerenv"):
            logger.warning(
                "Milvus host resolved to %s inside a container — use MILVUS_HOST=milvus (Compose service name), not loopback.",
                host_primary,
            )
        logger.debug(
            "milvus_host_port_from_env: resolved from MILVUS_HOST (authoritative) host=%r port=%s",
            host_primary,
            port,
        )
        logger.info(
            "milvus_host_port_from_env: authoritative MILVUS_HOST=%r MILVUS_PORT=%r -> host=%r port=%s",
            raw_host,
            raw_port,
            host_primary,
            port,
        )
        return host_primary, port

    # --- 2) URI / ADDR (only when MILVUS_HOST unset or whitespace-only) ---
    host: Optional[str] = None
    raw_port_out = raw_port if raw_port is not None else "19530"

    uri = ((raw_uri or raw_addr or "") or "").strip()
    if uri:
        try:
            if "://" in uri:
                from urllib.parse import urlparse

                parsed = urlparse(uri)
                if parsed.hostname:
                    host = parsed.hostname.strip()
                if parsed.port:
                    raw_port_out = str(parsed.port)
            elif ":" in uri:
                h, p = uri.rsplit(":", 1)
                p = p.strip()
                if p.isdigit():
                    host = (h or "").strip() or None
                    raw_port_out = p
                else:
                    host = uri.strip() or None
            else:
                host = uri.strip() or None
        except Exception:
            host = None

    # --- 3) Kubernetes service discovery ---
    if not host:
        svc_host = (raw_svc_host or "").strip() or None
        if svc_host:
            host = svc_host
            svc_port = (os.environ.get("MILVUS_SERVICE_PORT") or "").strip()
            if svc_port.isdigit():
                raw_port_out = svc_port

    # --- 4) MILVUS_ENDPOINT host:port ---
    if not host:
        endpoint = (raw_endpoint or "").strip()
        if endpoint and ":" in endpoint:
            try:
                h, p = endpoint.rsplit(":", 1)
                p = p.strip()
                if p.isdigit():
                    host = (h or "").strip() or None
                    raw_port_out = p
            except Exception:
                pass

    if host in ("localhost", "127.0.0.1") and os.path.isfile("/.dockerenv"):
        logger.warning(
            "Milvus host resolved to %s inside a container — use MILVUS_HOST=milvus (Compose service name), not loopback.",
            host,
        )
    try:
        port = int(str(raw_port_out).strip())
    except ValueError:
        port = 19530
    logger.debug("milvus_host_port_from_env: resolved (fallback chain) host=%r port=%s", host, port)
    return host, port


def milvus_sdk_http_uri(host: str, port: int) -> str:
    """URI for ``pymilvus.MilvusClient`` (HTTP/gRPC gateway). That client ignores ``host=``/``port=`` kwargs and defaults to localhost."""
    return f"http://{host.strip()}:{int(port)}"


def _disconnect_recording_clip_alias() -> None:
    _, _, _, _, connections, _ = _milvus_imports()
    try:
        if connections.has_connection(RECORDING_CLIP_CONN_ALIAS):
            connections.disconnect(RECORDING_CLIP_CONN_ALIAS)
    except Exception:
        pass


def _ping_recording_clip_connection() -> bool:
    """Cheap RPC to verify the named connection is alive."""
    _, _, _, _, connections, utility = _milvus_imports()
    if not connections.has_connection(RECORDING_CLIP_CONN_ALIAS):
        return False
    try:
        try:
            utility.list_collections(using=RECORDING_CLIP_CONN_ALIAS, timeout=10)
        except TypeError:
            utility.list_collections(using=RECORDING_CLIP_CONN_ALIAS)
        return True
    except Exception as e:
        logger.warning("Milvus ping failed (%s); will reconnect.", e)
        return False


def deterministic_clip_vector_id(recording_segment_id: str, timestamp_offset_ms: int) -> str:
    raw = f"{recording_segment_id}:{int(timestamp_offset_ms)}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _milvus_escape_str(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _entity_field(ent: Any, name: str) -> Any:
    if ent is None:
        return None
    if isinstance(ent, dict):
        return ent.get(name)
    v = getattr(ent, name, None)
    if v is not None:
        return v
    to_dict = getattr(ent, "to_dict", None)
    if callable(to_dict):
        return to_dict().get(name)
    return None


def _milvus_imports():
    from pymilvus import (
        Collection,
        CollectionSchema,
        DataType,
        FieldSchema,
        connections,
        utility,
    )

    return Collection, CollectionSchema, DataType, FieldSchema, connections, utility


def connect_recording_clip(
    host: Optional[str],
    port: Optional[int] = None,
    *,
    retries: Optional[int] = None,
    retry_sleep_sec: Optional[float] = None,
) -> bool:
    """
    Connect pymilvus gRPC using a dedicated alias (does not touch legacy `default` used elsewhere).

    Retries help when clients start before Milvus is listening (docker compose race).
    Configure with MILVUS_CONNECT_RETRIES (default 18) and MILVUS_CONNECT_RETRY_SEC (default 2.0).
    """
    if not host:
        return False
    if port is None:
        _, port = milvus_host_port_from_env()
    Collection, CollectionSchema, DataType, FieldSchema, connections, utility = _milvus_imports()

    max_attempts = retries
    if max_attempts is None:
        try:
            max_attempts = max(1, int(os.environ.get("MILVUS_CONNECT_RETRIES", "18")))
        except ValueError:
            max_attempts = 18
    sleep_s = retry_sleep_sec
    if sleep_s is None:
        try:
            sleep_s = float(os.environ.get("MILVUS_CONNECT_RETRY_SEC", "2.0"))
        except ValueError:
            sleep_s = 2.0

    if connections.has_connection(RECORDING_CLIP_CONN_ALIAS) and _ping_recording_clip_connection():
        return True
    if connections.has_connection(RECORDING_CLIP_CONN_ALIAS):
        _disconnect_recording_clip_alias()

    last_err: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        if attempt == 1:
            logger.info(
                "Milvus recording_clip: gRPC connection target host=%s port=%s (MilvusClient-style uri would be %s)",
                host,
                port,
                milvus_sdk_http_uri(host, port),
            )
        try:
            try:
                connections.connect(
                    alias=RECORDING_CLIP_CONN_ALIAS,
                    host=host,
                    port=port,
                    timeout=30,
                )
            except TypeError:
                connections.connect(
                    alias=RECORDING_CLIP_CONN_ALIAS,
                    host=host,
                    port=port,
                )
            if _ping_recording_clip_connection():
                if attempt > 1:
                    logger.info("Milvus connected for recording_clip after %s attempt(s).", attempt)
                return True
            _disconnect_recording_clip_alias()
        except Exception as e:
            last_err = e
            logger.warning(
                "Milvus connect attempt %s/%s failed for gRPC %s:%s (MilvusClient uri=%s): %s",
                attempt,
                max_attempts,
                host,
                port,
                milvus_sdk_http_uri(host, port),
                e,
            )
        if attempt < max_attempts:
            time.sleep(sleep_s)
    if last_err:
        logger.warning(
            "Milvus connect failed for recording_clip after %s attempts (gRPC %s:%s, MilvusClient uri=%s): %s",
            max_attempts,
            host,
            port,
            milvus_sdk_http_uri(host, port),
            last_err,
        )
    return False


def _schema_field_map(collection: Any) -> Dict[str, Any]:
    return {f.name: f for f in collection.schema.fields}


def _recording_clip_schema_compatible(collection: Any) -> bool:
    _, _, DataType, _, _, _ = _milvus_imports()
    fm = _schema_field_map(collection)
    required = (
        "id",
        "recording_segment_id",
        "camera_id",
        "timestamp_offset_ms",
        "model_version",
        "embedding",
    )
    if not all(k in fm for k in required):
        return False
    emb = fm["embedding"]
    if emb.dtype != DataType.FLOAT_VECTOR:
        return False
    try:
        dim = int(emb.params.get("dim", 0))
    except (TypeError, ValueError):
        return False
    return dim == EMBEDDING_DIM


def _normalize_index_params(params: Any) -> Dict[str, Any]:
    if params is None:
        return {}
    if isinstance(params, dict):
        base = dict(params)
    elif isinstance(params, str):
        import json

        try:
            out = json.loads(params)
            base = dict(out) if isinstance(out, dict) else {}
        except Exception:
            return {}
    else:
        to_dict = getattr(params, "to_dict", None)
        if callable(to_dict):
            try:
                out = to_dict()
                base = dict(out) if isinstance(out, dict) else {}
            except Exception:
                return {}
        else:
            return {}
    inner = base.get("params")
    if isinstance(inner, dict):
        if not base.get("metric_type") and isinstance(inner.get("metric_type"), str):
            base["metric_type"] = inner["metric_type"]
        if not base.get("index_type") and isinstance(inner.get("index_type"), str):
            base["index_type"] = inner["index_type"]
    return base


def _embedding_index_compatible(collection: Any) -> bool:
    try:
        for idx in collection.indexes:
            if getattr(idx, "field_name", None) != "embedding":
                continue
            params = _normalize_index_params(getattr(idx, "params", None))
            mt = str(params.get("metric_type", "")).strip().upper().replace(" ", "_")
            it = str(params.get("index_type", "")).strip().upper().replace(" ", "_")
            if mt == "COSINE":
                logger.warning("recording_clip_frames: legacy COSINE index detected; collection must be rebuilt for IP.")
            metric_ok = mt in ("IP", "INNER_PRODUCT")
            index_ok = it == RECORDING_CLIP_INDEX_TYPE
            ok = metric_ok and index_ok
            if not ok:
                logger.warning(
                    "recording_clip_frames embedding index mismatch: index_type=%s metric_type=%s (expected %s/IP)",
                    it or "?",
                    mt or "?",
                    RECORDING_CLIP_INDEX_TYPE,
                )
            return ok
    except Exception as e:
        logger.warning("Could not read recording_clip_frames indexes: %s", e)
        return False
    return False


def _recording_clip_schema_marker_present(collection: Any) -> bool:
    desc = (getattr(collection.schema, "description", None) or "").strip()
    return RECORDING_CLIP_SCHEMA_MARKER in desc


def recording_clip_collection_incompatible_reason(collection: Any) -> Optional[str]:
    """None if collection matches current semantic-search contract; else short reason for logs."""
    if not _recording_clip_schema_compatible(collection):
        return "schema fields or embedding dim mismatch"
    if not _recording_clip_schema_marker_present(collection):
        return "missing schema marker (legacy recording_clip_frames; will rebuild)"
    if not _embedding_index_compatible(collection):
        return "embedding index must be FLAT with metric IP (inner product)"
    return None


def recording_clip_collection_usable(collection: Any) -> bool:
    """True if schema, marker, and vector index match what semantic search expects."""
    return recording_clip_collection_incompatible_reason(collection) is None


def recording_clip_create_index_params() -> Dict[str, Any]:
    """
    Extra params for ``Collection.create_index`` on ``embedding``.

    Milvus 2.2.x supports L2 and IP only for this field type — use exactly FLAT + IP + empty params.
    """
    return {"index_type": "FLAT", "metric_type": "IP", "params": {}}


def recording_clip_search_param() -> Dict[str, Any]:
    """Search ``param`` dict; must match index metric (IP)."""
    return {"metric_type": "IP", "params": {}}


def _l2_normalize_embedding_list(vec: List[float]) -> List[float]:
    """Unit L2 norm; safe for already-normalized CLIP vectors (idempotent)."""
    if len(vec) != EMBEDDING_DIM:
        return vec
    s = 0.0
    for x in vec:
        xf = float(x)
        s += xf * xf
    if s <= 1e-20:
        return vec
    inv = s**-0.5
    return [float(x) * inv for x in vec]


def _ip_raw_score_to_display_similarity(raw: float) -> float:
    """L2-normalized CLIP vectors: IP in [-1, 1] matches cosine; map to [0, 1] for UI."""
    return max(0.0, min(1.0, (float(raw) + 1.0) * 0.5))


def ensure_recording_clip_collection(host: Optional[str], port: Optional[int] = None) -> Any:
    """
    Returns a loaded Collection, or None if Milvus unavailable / misconfigured.

    If ``recording_clip_frames`` exists but schema or vector index is incompatible
    (e.g. legacy index metric types), drops **only** that collection and recreates it.
    Other Milvus collections are untouched.
    """
    if not host:
        return None
    if port is None:
        _, port = milvus_host_port_from_env()
    Collection, CollectionSchema, DataType, FieldSchema, connections, utility = _milvus_imports()
    if not connect_recording_clip(host, port):
        return None
    try:
        if utility.has_collection(RECORDING_CLIP_COLLECTION, using=RECORDING_CLIP_CONN_ALIAS):
            col = Collection(RECORDING_CLIP_COLLECTION, using=RECORDING_CLIP_CONN_ALIAS)
            loaded = False
            try:
                col.load()
                loaded = True
            except Exception as e:
                logger.warning(
                    "recording_clip_frames: load failed (%s); will drop and recreate this collection only.",
                    e,
                )

            if loaded and recording_clip_collection_usable(col):
                logger.info(
                    "recording_clip_frames: semantic search collection ready (existing, %s/%s).",
                    RECORDING_CLIP_INDEX_TYPE,
                    RECORDING_CLIP_METRIC_TYPE,
                )
                return col

            if loaded:
                why = recording_clip_collection_incompatible_reason(col)
                logger.warning(
                    "recording_clip_frames: incompatible (%s); dropping collection %r only, then recreating.",
                    why or "unknown",
                    RECORDING_CLIP_COLLECTION,
                )
            try:
                col.release()
            except Exception:
                pass
            try:
                utility.drop_collection(RECORDING_CLIP_COLLECTION, using=RECORDING_CLIP_CONN_ALIAS)
                logger.info("recording_clip_frames: dropped collection (semantic index only; other Milvus data untouched).")
                _notify_recording_clip_collection_dropped()
            except Exception as e:
                logger.error("recording_clip_frames: drop failed: %s", e)
                return None

        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="recording_segment_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="camera_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="timestamp_offset_ms", dtype=DataType.INT64),
            FieldSchema(name="model_version", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        ]
        schema = CollectionSchema(
            fields,
            description=f"CLIP frame embeddings for recording segments | {RECORDING_CLIP_SCHEMA_MARKER}",
        )
        col = Collection(name=RECORDING_CLIP_COLLECTION, schema=schema, using=RECORDING_CLIP_CONN_ALIAS)
        logger.info(
            "recording_clip_frames: collection created successfully (dim=%s, fields=%s, marker=%s).",
            EMBEDDING_DIM,
            len(fields),
            RECORDING_CLIP_SCHEMA_MARKER,
        )
        index_params = recording_clip_create_index_params()
        logger.info("recording_clip_frames: calling Milvus create_index(embedding) with index_params=%s", index_params)
        col.create_index(field_name="embedding", index_params=index_params)
        logger.info(
            "recording_clip_frames: vector index created successfully (index_type=%s, metric_type=IP).",
            RECORDING_CLIP_INDEX_TYPE,
        )
        col.load()
        logger.info("recording_clip_frames: semantic search enabled (collection loaded, IP + normalized CLIP space).")
        return col
    except Exception:
        logger.exception(
            "ensure_recording_clip_collection failed (gRPC target host=%s port=%s; MilvusClient uri=%s)",
            host,
            port,
            milvus_sdk_http_uri(host, port),
        )
        return None


def validate_semantic_search_milvus_readiness(
    *,
    host: Optional[str] = None,
    port: Optional[int] = None,
    extra_bundle_retries: Optional[int] = None,
    extra_bundle_sleep_sec: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Startup health: log resolved targets and index/search params, retry ``ensure_recording_clip_collection``
    when Milvus is still booting. Never raises.
    """
    eh, ep = milvus_host_port_from_env()
    h = ((host if host is not None else eh) or "").strip() or None
    if not h:
        logger.info("Semantic search Milvus readiness: Milvus host not configured; semantic index disabled.")
        return False, "milvus_host_unset"
    p = int(ep if port is None else port)

    uri = milvus_sdk_http_uri(h, p)
    cidx = recording_clip_create_index_params()
    sp = recording_clip_search_param()
    logger.info(
        "Semantic search Milvus readiness: gRPC host=%s port=%s; MilvusClient uri=%s; create_index=%s; search_param=%s",
        h,
        p,
        uri,
        cidx,
        sp,
    )

    tries = extra_bundle_retries
    if tries is None:
        try:
            tries = max(1, int(os.environ.get("MILVUS_SEMANTIC_WARMUP_RETRIES", "3")))
        except ValueError:
            tries = 3
    sleep_s = extra_bundle_sleep_sec
    if sleep_s is None:
        try:
            sleep_s = float(os.environ.get("MILVUS_SEMANTIC_WARMUP_SLEEP_SEC", "2.0"))
        except ValueError:
            sleep_s = 2.0

    last: Optional[str] = None
    for attempt in range(1, tries + 1):
        col = ensure_recording_clip_collection(h, p)
        if col is not None:
            logger.info(
                "Semantic search Milvus readiness: OK (collection=%s, attempt %s/%s).",
                RECORDING_CLIP_COLLECTION,
                attempt,
                tries,
            )
            return True, None
        last = "ensure_recording_clip_collection_returned_none"
        if attempt < tries:
            logger.warning(
                "Semantic search Milvus readiness: attempt %s/%s did not yield a ready collection; retrying in %ss (gRPC %s:%s, uri=%s)",
                attempt,
                tries,
                sleep_s,
                h,
                p,
                uri,
            )
            time.sleep(sleep_s)

    logger.warning(
        "Semantic search Milvus readiness: failed after %s attempts (%s; gRPC %s:%s, uri=%s)",
        tries,
        last,
        h,
        p,
        uri,
    )
    return False, last


def delete_vectors_for_segment(collection: Any, recording_segment_id: str) -> None:
    expr = f'recording_segment_id == "{_milvus_escape_str(recording_segment_id)}"'
    try:
        collection.delete(expr)
        collection.flush()
    except Exception as e:
        logger.warning("Milvus delete for segment failed: %s", e)


def insert_frame_embeddings(collection: Any, rows: List[Dict[str, Any]]) -> bool:
    if not rows:
        return True
    ids: List[str] = []
    seg_ids: List[str] = []
    cam_ids: List[str] = []
    offsets: List[int] = []
    versions: List[str] = []
    vectors: List[List[float]] = []
    for r in rows:
        ids.append(r["id"])
        seg_ids.append(r["recording_segment_id"])
        cam_ids.append(r["camera_id"])
        offsets.append(int(r["timestamp_offset_ms"]))
        versions.append(str(r.get("model_version", ""))[:64])
        vectors.append(_l2_normalize_embedding_list(list(r["embedding"])))
    try:
        collection.insert([ids, seg_ids, cam_ids, offsets, versions, vectors])
        collection.flush()
        return True
    except Exception as e:
        logger.error("Milvus insert_frame_embeddings failed: %s", e)
        return False


def search_recording_clip(
    collection: Any,
    query_embedding: List[float],
    *,
    top_k: int = 20,
    camera_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if len(query_embedding) != EMBEDDING_DIM:
        return []
    qv = _l2_normalize_embedding_list(query_embedding)
    expr = f'camera_id == "{_milvus_escape_str(camera_id)}"' if camera_id else None
    search_params = recording_clip_search_param()
    out: List[Dict[str, Any]] = []
    try:
        results = collection.search(
            data=[qv],
            anns_field="embedding",
            param=search_params,
            limit=int(top_k),
            expr=expr,
            output_fields=["recording_segment_id", "camera_id", "timestamp_offset_ms", "model_version"],
        )
        for hits in results:
            for hit in hits:
                ent = hit.entity
                rsid = _entity_field(ent, "recording_segment_id")
                cam = _entity_field(ent, "camera_id")
                off = _entity_field(ent, "timestamp_offset_ms")
                mv = _entity_field(ent, "model_version")
                raw = float(hit.distance)
                similarity = _ip_raw_score_to_display_similarity(raw)
                out.append(
                    {
                        "id": hit.id,
                        "recording_segment_id": rsid,
                        "camera_id": cam,
                        "timestamp_offset_ms": int(off or 0),
                        "model_version": mv,
                        "similarity": similarity,
                    }
                )
        return out
    except Exception:
        logger.exception("Milvus search_recording_clip failed")
        return []
