"""Lazy CPU CLIP image encoder (same ViT-B-32 space as API text search)."""

from __future__ import annotations

import logging
import os
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

_model = None
_model_name: Optional[str] = None


def _get_model():
    global _model, _model_name
    name = os.environ.get("CLIP_MODEL_NAME", "sentence-transformers/clip-ViT-B-32").strip()
    if _model is None or _model_name != name:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading CLIP model %s (CPU)", name)
        _model = SentenceTransformer(name, device="cpu")
        _model_name = name
    return _model


def encode_image_bgr(frame_bgr: Any) -> List[float]:
    """BGR uint8 OpenCV frame → L2-normalized 512-dim embedding (list)."""
    import cv2
    from PIL import Image

    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    model = _get_model()
    emb = model.encode(
        [pil],
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return emb[0].astype("float32").tolist()
