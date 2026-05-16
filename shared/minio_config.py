"""Single source of truth for MinIO bucket and URL configuration."""
from __future__ import annotations

import os
from urllib.parse import urlparse

DEFAULT_MINIO_BUCKET = "surveillance-bucket"
DEFAULT_MINIO_ENDPOINT = "localhost:9000"
DEFAULT_MINIO_REGION = "us-east-1"
# Browser-facing MinIO when MINIO_ENDPOINT is the Docker service name (minio:9000).
DEFAULT_DOCKER_PUBLIC_HOST = "localhost:9000"


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def minio_bucket_name() -> str:
    """Resolved bucket for recordings and chunk uploads (env: MINIO_BUCKET)."""
    return os.environ.get("MINIO_BUCKET", DEFAULT_MINIO_BUCKET).strip() or DEFAULT_MINIO_BUCKET


def minio_endpoint() -> str:
    """Host:port for in-cluster / SDK access (env: MINIO_ENDPOINT)."""
    return os.environ.get("MINIO_ENDPOINT", DEFAULT_MINIO_ENDPOINT).strip() or DEFAULT_MINIO_ENDPOINT


def minio_secure() -> bool:
    return _env_bool("MINIO_SECURE", False)


def minio_region() -> str:
    """S3 region for signing (fixed default avoids bucket-location RPC during presign)."""
    return os.environ.get("MINIO_REGION", DEFAULT_MINIO_REGION).strip() or DEFAULT_MINIO_REGION


def _endpoint_host(endpoint: str) -> str:
    return endpoint.split(":", 1)[0].strip().lower()


def _is_docker_internal_endpoint(endpoint: str) -> bool:
    """True when endpoint is only reachable inside the compose network."""
    return _endpoint_host(endpoint) == "minio"


def _docker_public_fallback_endpoint(internal_endpoint: str) -> str:
    override = os.environ.get("MINIO_PUBLIC_HOST", "").strip()
    if override:
        return override.split("://")[-1].rstrip("/")
    if ":" in internal_endpoint:
        port = internal_endpoint.rsplit(":", 1)[-1]
        return f"localhost:{port}"
    return DEFAULT_DOCKER_PUBLIC_HOST


def _parse_public_url(raw: str) -> tuple[str, bool]:
    """Return (host:port, secure) from MINIO_PUBLIC_URL or host-only value."""
    value = raw.strip()
    if not value:
        raise ValueError("empty public URL")
    if "://" not in value:
        value = f"http://{value}"
    parsed = urlparse(value)
    host = parsed.netloc or parsed.path.split("/")[0]
    if not host:
        raise ValueError(f"invalid MinIO public URL: {raw!r}")
    secure = parsed.scheme == "https"
    return host, secure


def minio_public_endpoint_and_secure() -> tuple[str, bool]:
    """
    Host:port and TLS flag for presigned URLs and other browser-facing links.

    Uses MINIO_PUBLIC_URL when set; otherwise derives from MINIO_ENDPOINT + MINIO_SECURE.
    """
    explicit = os.environ.get("MINIO_PUBLIC_URL", "").strip()
    if explicit:
        return _parse_public_url(explicit)
    endpoint = minio_endpoint()
    if _is_docker_internal_endpoint(endpoint):
        return _docker_public_fallback_endpoint(endpoint), False
    return endpoint, minio_secure()


def minio_public_base_url() -> str:
    """Full base URL (scheme + host[:port]) reachable from the browser."""
    explicit = os.environ.get("MINIO_PUBLIC_URL", "").strip()
    if explicit:
        if "://" not in explicit:
            explicit = f"http://{explicit}"
        return explicit.rstrip("/")
    endpoint = minio_endpoint()
    if _is_docker_internal_endpoint(endpoint):
        host_port = _docker_public_fallback_endpoint(endpoint)
        return f"http://{host_port}".rstrip("/")
    scheme = "https" if minio_secure() else "http"
    return f"{scheme}://{endpoint}".rstrip("/")


def minio_internal_base_url() -> str:
    """Full base URL used by the internal MinIO SDK client."""
    scheme = "https" if minio_secure() else "http"
    return f"{scheme}://{minio_endpoint()}".rstrip("/")
