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
    id: str
    role: str

    class Config:
        orm_mode = True

# --- Camera Schemas ---
class CameraBase(BaseModel):
    name: str
    location: Optional[str] = None
    type: str = "surveillance"
    source_type: Literal["webcam", "cctv"]
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
    id: str
    created_at: datetime

    class Config:
        orm_mode = True


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    stream_status: Optional[Literal["offline", "connecting", "online", "error"]] = None


# --- AI Schemas ---
class AIRequest(BaseModel):
    query: str
