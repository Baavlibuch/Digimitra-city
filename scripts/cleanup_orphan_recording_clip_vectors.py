#!/usr/bin/env python3
"""
One-time development cleanup: remove stale CLIP vectors in ``recording_clip_frames``
whose ``recording_segment_id`` no longer exists in PostgreSQL ``recording_segments``.

Uses the existing PK-safe path (``delete_vectors_for_segment``) — no collection wipe.

Required env (same as API / ai-processor):
  DATABASE_URL
  MILVUS_HOST (+ optional MILVUS_PORT)

Usage (from repo root):
  python scripts/cleanup_orphan_recording_clip_vectors.py
  python scripts/cleanup_orphan_recording_clip_vectors.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Any, Set

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from shared.models import RecordingSegment
from shared.recording_clip_milvus import (
    RECORDING_CLIP_COLLECTION,
    delete_vectors_for_segment,
    ensure_recording_clip_collection,
    milvus_host_port_from_env,
)

logger = logging.getLogger("cleanup_orphan_recording_clip_vectors")


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


def collect_distinct_milvus_segment_ids(collection: Any) -> Set[str]:
    """Scan Milvus rows (paginated query) and return distinct recording_segment_id values."""
    seen: Set[str] = set()
    batch = 16384
    offset = 0
    expr = 'id != ""'
    while True:
        try:
            rows = collection.query(
                expr=expr,
                output_fields=["recording_segment_id"],
                limit=batch,
                offset=offset,
            )
        except TypeError:
            if offset > 0:
                break
            rows = collection.query(
                expr=expr,
                output_fields=["recording_segment_id"],
                limit=batch,
            )
        if not rows:
            break
        for row in rows:
            rsid = _entity_field(row, "recording_segment_id")
            if rsid:
                seen.add(str(rsid))
        if len(rows) < batch:
            break
        offset += len(rows)
    return seen


def load_postgres_segment_ids() -> Set[str]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    engine = create_engine(url, pool_pre_ping=True)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    try:
        rows = db.query(RecordingSegment.id).all()
        return {str(r[0]) for r in rows if r[0]}
    finally:
        db.close()


def run(*, dry_run: bool) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    valid_segment_ids = load_postgres_segment_ids()
    logger.info("PostgreSQL recording_segments count=%s", len(valid_segment_ids))

    host, port = milvus_host_port_from_env()
    if not host:
        raise RuntimeError("MILVUS_HOST (or MILVUS_URI) is required for Milvus cleanup")
    collection = ensure_recording_clip_collection(host, port)
    if collection is None:
        raise RuntimeError(f"Could not open Milvus collection {RECORDING_CLIP_COLLECTION!r}")

    entities_before = getattr(collection, "num_entities", None)
    milvus_segment_ids = collect_distinct_milvus_segment_ids(collection)
    orphan_segment_ids = sorted(milvus_segment_ids - valid_segment_ids)

    logger.info(
        "Milvus distinct recording_segment_id count=%s orphan_segment_ids=%s entities_before=%s",
        len(milvus_segment_ids),
        len(orphan_segment_ids),
        entities_before,
    )
    if orphan_segment_ids:
        logger.info("orphan segment ids: %s", orphan_segment_ids)
    else:
        logger.info("No orphan segments found; nothing to delete.")
        return 0

    if dry_run:
        logger.info("--dry-run: would delete vectors for %s orphan segment(s); no Milvus writes.", len(orphan_segment_ids))
        return 0

    total_pk_deleted = 0
    for seg_id in orphan_segment_ids:
        pk_deleted = delete_vectors_for_segment(collection, seg_id)
        total_pk_deleted += pk_deleted
        logger.info(
            "orphan cleanup segment=%s pk_deleted=%s (running total_pk_deleted=%s)",
            seg_id,
            pk_deleted,
            total_pk_deleted,
        )

    entities_after = getattr(collection, "num_entities", None)
    logger.info(
        "orphan cleanup complete: orphan_segments=%s total_pk_deleted=%s entities_before=%s entities_after=%s",
        len(orphan_segment_ids),
        total_pk_deleted,
        entities_before,
        entities_after,
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List orphan segment ids only; do not delete from Milvus",
    )
    args = parser.parse_args()
    try:
        raise SystemExit(run(dry_run=args.dry_run))
    except Exception as e:
        logger.exception("orphan cleanup failed: %s", e)
        raise SystemExit(1) from e


if __name__ == "__main__":
    main()
