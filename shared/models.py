from sqlalchemy import Column, String, Float, DateTime, ForeignKey, JSON, BigInteger, UniqueConstraint
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.ext.declarative import declarative_base
import uuid
from datetime import datetime

Base = declarative_base()

class Camera(Base):
    __tablename__ = 'cameras'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String)
    location = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    type = Column(String, default="surveillance")
    source_type = Column(String, default="cctv")
    room_name = Column(String, nullable=False, default="digimitra-default-room")
    stream_status = Column(String, default="offline")
    rtsp_url = Column(String, nullable=True)
    camera_username = Column(String, nullable=True)
    camera_password = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    port = Column(String, nullable=True)
    channel = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Event(Base):
    __tablename__ = 'events'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    camera_id = Column(String, ForeignKey('cameras.id'))
    timestamp = Column(DateTime)
    event_type = Column(String)
    confidence = Column(Float)
    bounding_box = Column(JSON)
    thumbnail_path = Column(String)
    chunk_path = Column(String)
    camera = relationship("Camera")

class User(Base):
    __tablename__ = 'users'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True)
    password = Column(String)
    role = Column(String) # e.g., 'admin', 'investigator', 'viewer'


class RecordingSegment(Base):
    """
    DVR / continuous recording segment stored in object storage.
    Stable `id` is the anchor for future AI detection rows, semantic index entries, and timeline UI.
    """
    __tablename__ = "recording_segments"
    __table_args__ = (
        UniqueConstraint("bucket_name", "object_key", name="uq_recording_segments_bucket_object"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    camera_id = Column(String, nullable=False, index=True)
    recording_session_id = Column(String, nullable=False, index=True)
    bucket_name = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    file_type = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=True)
    ingest_source = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Future: detector labels, embedding ids, scene boundaries — keep JSON for loose coupling to Milvus / workers.
    extra = Column(JSON, nullable=True)
