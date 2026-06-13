"""
Sequential offline scan: one recording segment at a time, bounded frame rate.
"""

from __future__ import annotations

import logging
import math
import os
import time
import uuid
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from shared.models import Base, RecordingDetection, RecordingSegment
from shared.schema_compat import ensure_recording_schema

from detector import run_detection
from frame_extractor import iter_spaced_frames
from shared.minio_config import minio_bucket_name
from utils import download_object, env_bool, get_minio_client, upload_detection_preview

from shared.recording_clip_milvus import (
    delete_vectors_for_segment,
    deterministic_clip_vector_id,
    ensure_recording_clip_collection,
    insert_frame_embeddings,
    milvus_host_port_from_env,
)

logger = logging.getLogger(__name__)

_CLIP_MODEL_VERSION = "clip-vit-b-32-st-v1"


def _suffix_for_key(object_key: str) -> str:
    if "." in object_key:
        return "." + object_key.rsplit(".", 1)[-1].lower()
    return ".bin"


def _configure_thread_env() -> None:
    # Softer CPU contention on shared laptops
    os.environ.setdefault("OMP_NUM_THREADS", os.environ.get("OMP_NUM_THREADS", "1"))
    os.environ.setdefault("MKL_NUM_THREADS", os.environ.get("MKL_NUM_THREADS", "1"))


def _session_factory():
    url = os.environ["DATABASE_URL"]
    engine = create_engine(url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    ensure_recording_schema(engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _pick_next_segment(db: Session) -> Optional[RecordingSegment]:
    return (
        db.query(RecordingSegment)
        .filter(RecordingSegment.ai_scan_completed_at.is_(None))
        .order_by(RecordingSegment.start_time.asc())
        .first()
    )


def _clip_milvus_enabled() -> bool:
    return env_bool("CLIP_EMBEDDINGS_ENABLED", True) and bool(milvus_host_port_from_env()[0])


def process_next_segment(SessionLocal: sessionmaker) -> bool:
    """
    Returns True if a segment was claimed (even on failure — error stored on row),
    False if queue empty.
    """
    _configure_thread_env()
    client = get_minio_client()
    if not client:
        logger.error("MinIO unavailable; sleeping")
        time.sleep(float(os.environ.get("AI_ERROR_BACKOFF_SEC", "30")))
        return False

    db: Session = SessionLocal()
    try:
        seg = _pick_next_segment(db)
        if not seg:
            return False

        seg.ai_scan_started_at = datetime.utcnow()
        seg.ai_scan_last_error = None
        db.commit()

        tmp_path: Optional[str] = None
        detection_count = 0
        try:
            suf = _suffix_for_key(seg.object_key)
            logger.info(
                "AI scan segment=%s bucket=%s (configured=%s) object_key=%s",
                seg.id,
                seg.bucket_name,
                minio_bucket_name(),
                seg.object_key,
            )
            tmp_path = download_object(client, seg.bucket_name, seg.object_key, suffix=suf)

            interval = float(os.environ.get("AI_FRAME_INTERVAL_SEC", "3"))
            conf = float(os.environ.get("AI_YOLO_CONF", "0.35"))

            db.query(RecordingDetection).filter(RecordingDetection.recording_segment_id == seg.id).delete(
                synchronize_session=False
            )

            logger.info("YOLO processing started segment=%s", seg.id)

            clip_rows = []
            clip_collection = None
            clip_stride = max(1, int(os.environ.get("CLIP_EMBED_EVERY_N_FRAMES", "1")))
            clip_milvus_enabled = _clip_milvus_enabled()
            logger.info(
                "CLIP indexing: segment=%s enabled=%s stride=%s",
                seg.id,
                clip_milvus_enabled,
                clip_stride,
            )
            if clip_milvus_enabled:
                try:
                    host, port = milvus_host_port_from_env()
                    clip_collection = ensure_recording_clip_collection(host, port) if host else None
                    if clip_collection:
                        entities_before = getattr(clip_collection, "num_entities", None)
                        delete_vectors_for_segment(clip_collection, seg.id)
                        logger.info(
                            "CLIP Milvus ready segment=%s host=%s port=%s collection_entities_before=%s",
                            seg.id,
                            host,
                            port,
                            entities_before,
                        )
                    else:
                        logger.warning(
                            "CLIP Milvus collection unavailable segment=%s host=%s port=%s",
                            seg.id,
                            host,
                            port,
                        )
                except Exception as e:
                    logger.warning("CLIP/Milvus init failed (YOLO-only for this segment): %s", e)
                    clip_collection = None

            frames_sampled = 0
            preview_keys: Dict[int, Optional[str]] = {}
            for frame_idx, (frame, off_ms) in enumerate(iter_spaced_frames(tmp_path, interval)):
                frames_sampled += 1
                detections = run_detection(frame, offset_ms=off_ms, conf_threshold=conf)
                preview_key: Optional[str] = None
                if detections:
                    if off_ms not in preview_keys:
                        preview_keys[off_ms] = upload_detection_preview(
                            client,
                            seg.bucket_name,
                            seg.id,
                            seg.camera_id,
                            off_ms,
                            frame,
                        )
                    preview_key = preview_keys.get(off_ms)
                for d in detections:
                    db.add(
                        RecordingDetection(
                            id=str(uuid.uuid4()),
                            recording_segment_id=seg.id,
                            camera_id=seg.camera_id,
                            object_type=d.object_type,
                            confidence=d.confidence,
                            timestamp_offset_ms=d.timestamp_offset_ms,
                            bounding_box=d.bounding_box,
                            preview_object_key=preview_key,
                        )
                    )
                    detection_count += 1
                if clip_collection and frame_idx % clip_stride == 0:
                    try:
                        from clip_embedder import encode_image_bgr

                        vec = encode_image_bgr(frame)
                        if not vec:
                            logger.warning(
                                "CLIP embed empty segment=%s offset_ms=%s frame_idx=%s",
                                seg.id,
                                off_ms,
                                frame_idx,
                            )
                            continue
                        dim = len(vec)
                        norm = math.sqrt(sum(float(x) * float(x) for x in vec))
                        if frame_idx == 0 or len(clip_rows) == 0:
                            logger.info(
                                "CLIP embed ok segment=%s offset_ms=%s dim=%s L2_norm=%.4f",
                                seg.id,
                                off_ms,
                                dim,
                                norm,
                            )
                        clip_rows.append(
                            {
                                "id": deterministic_clip_vector_id(seg.id, off_ms),
                                "recording_segment_id": seg.id,
                                "camera_id": seg.camera_id,
                                "timestamp_offset_ms": off_ms,
                                "model_version": _CLIP_MODEL_VERSION,
                                "embedding": vec,
                            }
                        )
                    except Exception as e:
                        logger.warning("CLIP embed failed offset_ms=%s: %s", off_ms, e)

            logger.info(
                "CLIP indexing summary segment=%s frames_sampled=%s clip_vectors=%s milvus_collection=%s",
                seg.id,
                frames_sampled,
                len(clip_rows),
                clip_collection is not None,
            )
            if clip_collection and clip_rows:
                try:
                    entities_before_insert = getattr(clip_collection, "num_entities", None)
                    if not insert_frame_embeddings(clip_collection, clip_rows):
                        logger.warning("Milvus insert had failures for segment=%s", seg.id)
                    else:
                        logger.info(
                            "Milvus insert ok segment=%s rows=%s collection_entities_before=%s collection_entities_after=%s",
                            seg.id,
                            len(clip_rows),
                            entities_before_insert,
                            getattr(clip_collection, "num_entities", None),
                        )
                except Exception as e:
                    logger.warning("Milvus insert failed (detections still saved): %s", e)
            elif clip_milvus_enabled and not clip_rows:
                logger.warning(
                    "CLIP indexing produced zero vectors segment=%s frames_sampled=%s collection=%s",
                    seg.id,
                    frames_sampled,
                    clip_collection is not None,
                )

            seg.ai_scan_completed_at = datetime.utcnow()
            seg.ai_scan_last_error = None
            db.commit()
            logger.info(
                "AI scan completed segment=%s detections_inserted=%s clip_vectors=%s",
                seg.id,
                detection_count,
                len(clip_rows),
            )
            return True
        except Exception as e:
            logger.exception("AI scan failed segment=%s", seg.id)
            db.rollback()
            seg = db.query(RecordingSegment).filter(RecordingSegment.id == seg.id).one()
            seg.ai_scan_last_error = str(e)[:2000]
            db.commit()
            return True
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
    finally:
        db.close()


def run_forever() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    SessionLocal = _session_factory()
    idle = float(os.environ.get("AI_IDLE_POLL_SEC", "8"))
    delay = float(os.environ.get("AI_DELAY_AFTER_SEGMENT_SEC", "2"))

    logger.info(
        "AI processor started (sequential queue). idle_poll=%ss minio_bucket=%s",
        idle,
        minio_bucket_name(),
    )

    while True:
        if env_bool("AI_PROCESSOR_PAUSED", False):
            time.sleep(max(idle, 5.0))
            continue
        worked = process_next_segment(SessionLocal)
        if not worked:
            time.sleep(idle)
        else:
            time.sleep(delay)
