"""CPU-only eager loader for sentence-transformers CLIP models.

CLIP modules call ``transformers.CLIPModel.from_pretrained`` directly (they do not
receive ``model_kwargs`` from ``SentenceTransformer``). On some torch/transformers
stacks, lazy/meta initialization plus ``SentenceTransformer.to("cpu")`` can raise
"Cannot copy out of meta tensor". This helper forces eager float32 CPU weights.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import torch

logger = logging.getLogger(__name__)

_load_lock = threading.Lock()


def load_clip_sentence_transformer(model_name: str) -> Any:
    """Load a CLIP ``SentenceTransformer`` with fully materialized CPU weights."""
    with _load_lock:
        return _load_clip_sentence_transformer_unlocked(model_name)


def _load_clip_sentence_transformer_unlocked(model_name: str) -> Any:
    import transformers
    from sentence_transformers import SentenceTransformer

    if hasattr(torch, "set_default_device"):
        torch.set_default_device("cpu")

    orig_clip_from_pretrained = transformers.CLIPModel.from_pretrained

    @classmethod
    def _clip_from_pretrained(cls, pretrained_model_name_or_path, *args, **kwargs):
        kwargs.pop("device_map", None)
        kwargs["low_cpu_mem_usage"] = False
        kwargs.setdefault("dtype", torch.float32)
        return orig_clip_from_pretrained.__func__(cls, pretrained_model_name_or_path, *args, **kwargs)

    transformers.CLIPModel.from_pretrained = _clip_from_pretrained
    try:
        model = SentenceTransformer(
            model_name,
            device="cpu",
            model_kwargs={"low_cpu_mem_usage": False, "dtype": torch.float32},
        )
    finally:
        transformers.CLIPModel.from_pretrained = orig_clip_from_pretrained

    _reject_meta_parameters(model)
    return model


def _reject_meta_parameters(model: Any) -> None:
    for name, param in model.named_parameters():
        if getattr(param, "is_meta", False):
            raise RuntimeError(f"CLIP model parameter still on meta device after load: {name}")
