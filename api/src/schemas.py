from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal, List, Any, Dict
from datetime import datetime


class RecordingUploadResponse(BaseModel):
    recording_id: Optional[str] = None
    object_key: str
    camera_id: str
    recording_session_id: str
    bucket: str
    segment_started_at: str
    size_bytes: int


class RecordingSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    camera_id: str
    recording_session_id: str
    bucket_name: str
    object_key: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    file_type: str
    size_bytes: Optional[int] = None
    ingest_source: str
    created_at: datetime
    extra: Optional[Dict[str, Any]] = None
    preview_url: Optional[str] = None


class RecordingListResponse(BaseModel):
    items: List[RecordingSegmentOut]
    total: int
    limit: int
    offset: int


class RecordingPlaybackResponse(BaseModel):
    recording_id: str
    url: str
    bucket_name: str
    object_key: str
    expires_in_seconds: int


class RecordingDetectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recording_segment_id: str
    camera_id: str
    object_type: str
    confidence: float
    timestamp_offset_ms: int
    bounding_box: Dict[str, Any]
    created_at: datetime
    absolute_event_time: datetime
    preview_url: Optional[str] = None


class DetectionListResponse(BaseModel):
    items: List[RecordingDetectionOut]
    total: int
    limit: int
    offset: int


class DetectionPlaybackResponse(BaseModel):
    """Presigned segment URL plus fields for client seek (HTML video currentTime)."""

    detection_id: str
    recording_id: str
    timestamp_offset_ms: int
    absolute_event_time: datetime
    url: str
    bucket_name: str
    object_key: str
    expires_in_seconds: int

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# --- User Schemas ---
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: str

class User(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str

# --- Camera Schemas ---
class CameraBase(BaseModel):
    name: str
    location: Optional[str] = None
    type: str = "surveillance"
    source_type: Literal["webcam", "cctv", "upload"]
    room_name: str
    stream_status: Literal["offline", "connecting", "online", "error"] = "offline"
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class CameraCreate(CameraBase):
    rtsp_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[str] = None
    channel: Optional[str] = None

class Camera(CameraBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    stream_status: Optional[Literal["offline", "connecting", "online", "error"]] = None


# --- AI Schemas ---
class AIRequest(BaseModel):
    query: str


# --- Semantic visual search (CLIP + Milvus recording_clip_frames) ---
class SemanticSearchRequest(BaseModel):
    query: str
    top_k: int = 20
    camera_id: Optional[str] = None


class SemanticSearchHit(BaseModel):
    vector_id: Optional[str] = None
    recording_segment_id: str
    camera_id: str
    timestamp_offset_ms: int
    similarity: float
    model_version: Optional[str] = None
    thumbnail_url: Optional[str] = None
    match_detections: Optional[List[RecordingDetectionOut]] = None
    event_label: Optional[str] = None
    event_labels: Optional[List[str]] = None
    event_severity: Optional[str] = None


class SemanticSearchResponse(BaseModel):
    results: List[SemanticSearchHit]
    enabled: bool = True
    detail: Optional[str] = None


class SemanticSearchStatusResponse(BaseModel):
    """Backend-owned semantic search capability; clients must not infer this from Milvus env vars."""

    configured: bool = False
    index_ready: bool = False
    detail: Optional[str] = None
