from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class RecordingUploadResponse(BaseModel):
    object_key: str
    camera_id: str
    recording_session_id: str
    bucket: str
    segment_started_at: str
    size_bytes: int

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
