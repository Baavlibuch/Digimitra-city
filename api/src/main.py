from datetime import datetime, timedelta
import logging
import uuid
from typing import List, Optional

import inspect

from fastapi import FastAPI, Depends, File, Form, HTTPException, Query, UploadFile, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session
from starlette.requests import Request

from . import (
    services,
    database,
    auth,
    schemas,
    recording_service,
    detection_service,
    recording_clip_search,
    recording_thumbnail_service,
    video_file_upload,
)
from shared.recording_clip_milvus import register_recording_clip_collection_dropped_hook
from shared.recording_event_labels import event_labels_for_frame_detections

register_recording_clip_collection_dropped_hook(recording_clip_search.invalidate_recording_clip_collection_cache)

from .ai_service import AIService
from .live_alerts_hub import router as live_alerts_router
from .schemas import AIRequest
from .storage_service import MinIOStorageService
from shared.minio_config import minio_endpoint, minio_public_base_url, minio_public_endpoint_and_secure

from shared.models import User, Event, RecordingDetection
from shared.models import Camera as CameraModel
from .schemas import Camera as CameraSchema, CameraCreate, CameraUpdate

app = FastAPI()
app.include_router(live_alerts_router)
# Browsers cannot combine allow_origins=["*"] with allow_credentials=True; use * for dev tooling / OPTIONS preflight.
_cors_params = dict(
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
if "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters:
    # Chrome PNA preflight (Access-Control-Request-Private-Network); without True, OPTIONS → 400 → "CORS" errors.
    _cors_params["allow_private_network"] = True
app.add_middleware(CORSMiddleware, **_cors_params)

logger = logging.getLogger(__name__)


async def _database_error_response(request: Request, exc: Exception) -> JSONResponse:
    """Return JSON 500 so the browser gets a normal response body (CORS headers apply)."""
    logger.exception("Database error %s %s", request.method, request.url.path)
    msg = getattr(exc, "orig", None) or str(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Database error", "message": str(msg)[:800]},
    )


app.add_exception_handler(ProgrammingError, _database_error_response)
app.add_exception_handler(OperationalError, _database_error_response)

ai_service = AIService()
recording_storage = MinIOStorageService()

@app.on_event("startup")
def startup_event():
    public_ep, _ = minio_public_endpoint_and_secure()
    logger.info(
        "MinIO: internal=%s public_base=%s presign_host=%s",
        minio_endpoint(),
        minio_public_base_url(),
        public_ep,
    )
    database.create_tables()
    db = database.SessionLocal()
    try:
        service_instance = services.SurveillanceServices(db)
        service_instance.initialize_services()
        if not db.query(User).filter(User.username == "admin").first():
            hashed_password = auth.get_password_hash("admin")
            admin_user = User(username="admin", password=hashed_password, role="admin")
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
    finally:
        db.close()
    try:
        recording_clip_search.warmup_recording_clip_milvus()
    except Exception:
        logger.exception("Milvus semantic warmup failed with an unexpected error")


@app.post("/api/v1/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    if auth.allow_any_login():
        username = (form_data.username or "").strip()
        if not username:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username required")
        user = db.query(User).filter(User.username == username).first()
        role = user.role if user else "admin"
        access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = auth.create_access_token(
            data={"sub": username, "role": role}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}

    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/v1/users", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.role_checker(["admin"]))
):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    db_user = User(username=user.username, password=hashed_password, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/v1/cameras", response_model=CameraSchema, status_code=status.HTTP_201_CREATED)
def create_camera(camera: CameraCreate, db: Session = Depends(database.get_db)):
    db_camera = CameraModel(
        name=camera.name,
        location=camera.location,
        latitude=camera.latitude,
        longitude=camera.longitude,
        type=camera.type,
        source_type=camera.source_type,
        room_name=camera.room_name,
        stream_status="connecting",
        rtsp_url=camera.rtsp_url,
        camera_username=camera.username,
        camera_password=camera.password,
        ip_address=camera.ip_address,
        port=camera.port,
        channel=camera.channel,
        created_at=datetime.utcnow(),
    )
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    db_camera.stream_status = "online"
    db.commit()
    db.refresh(db_camera)
    return db_camera

@app.patch("/api/v1/cameras/{camera_id}", response_model=CameraSchema)
def update_camera(camera_id: str, camera: CameraUpdate, db: Session = Depends(database.get_db)):
    db_camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    for field, value in camera.dict(exclude_none=True).items():
        setattr(db_camera, field, value)
    db.commit()
    db.refresh(db_camera)
    return db_camera

@app.get("/api/v1/cameras", response_model=List[CameraSchema])
def get_cameras(db: Session = Depends(database.get_db)):
    return db.query(CameraModel).all()

@app.delete("/api/v1/cameras/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(camera_id: str, db: Session = Depends(database.get_db)):
    db_camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    db.delete(db_camera)
    db.commit()


@app.post("/api/v1/recordings/upload", response_model=schemas.RecordingUploadResponse)
async def upload_browser_recording(
    file: UploadFile = File(...),
    camera_id: str = Form(...),
    recording_session_id: str = Form(...),
    segment_started_at: str = Form(...),
    mime_type: str = Form("video/webm"),
    camera_name: Optional[str] = Form(None),
    segment_index: Optional[int] = Form(None),
    segment_window_ms: Optional[int] = Form(None),
    ingest_mode: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Accepts a segment produced by the browser MediaRecorder API and stores it via MinIOStorageService
    (same path family as edge-agent chunks: video-chunks/{camera_id}/...).
    """
    if not recording_storage.client:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Object storage unavailable")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload body")

    try:
        ts = datetime.fromisoformat(segment_started_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="segment_started_at must be ISO-8601")

    mt = (mime_type or "video/webm").lower()
    if "webm" in mt:
        ext, content_type = ".webm", "video/webm"
    elif "mp4" in mt:
        ext, content_type = ".mp4", "video/mp4"
    else:
        ext, content_type = ".bin", mime_type or "application/octet-stream"

    meta = {
        "recording_session_id": recording_session_id,
        "segment_started_at": segment_started_at,
        "camera_name": camera_name or "",
        "uploaded_by": current_user.username,
        "original_filename": file.filename or "",
        "source": "browser_mediarecorder",
        "segment_index": segment_index if segment_index is not None else "",
        "segment_window_ms": segment_window_ms if segment_window_ms is not None else "",
        "ingest_mode": ingest_mode or "continuous_surveillance",
    }

    object_key = recording_storage.upload_video_chunk(
        camera_id=camera_id,
        chunk_data=raw,
        timestamp=ts,
        metadata=meta,
        file_extension=ext,
        content_type=content_type,
        segment_index=segment_index,
        recording_session_id=recording_session_id,
    )
    if not object_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Upload to storage failed")

    end_ts: Optional[datetime] = None
    duration_sec: Optional[float] = None
    if segment_window_ms is not None and segment_window_ms > 0:
        end_ts = ts + timedelta(milliseconds=segment_window_ms)
        duration_sec = segment_window_ms / 1000.0

    extra: dict = {
        "segment_index": segment_index,
        "segment_window_ms": segment_window_ms,
        "ingest_mode": ingest_mode or "continuous_surveillance",
        "camera_name": camera_name,
        "original_filename": file.filename or "",
    }

    db_row = recording_service.register_segment(
        db,
        camera_id=camera_id,
        recording_session_id=recording_session_id,
        bucket_name=recording_storage.bucket_name,
        object_key=object_key,
        start_time=ts,
        end_time=end_ts,
        duration_seconds=duration_sec,
        file_type=content_type,
        size_bytes=len(raw),
        ingest_source="browser_mediarecorder",
        extra=extra,
    )

    return schemas.RecordingUploadResponse(
        recording_id=db_row.id if db_row else None,
        object_key=object_key,
        camera_id=camera_id,
        recording_session_id=recording_session_id,
        bucket=recording_storage.bucket_name,
        segment_started_at=segment_started_at,
        size_bytes=len(raw),
    )


@app.post("/api/v1/recordings/upload-file", response_model=schemas.RecordingUploadResponse)
async def upload_video_file(
    file: UploadFile = File(...),
    camera_id: str = Form(...),
    camera_name: Optional[str] = Form(None),
    recording_session_id: Optional[str] = Form(None),
    segment_started_at: Optional[str] = Form(None),
    mime_type: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """
    Isolated upload path for user-selected video files (MP4, MOV, AVI, WebM).
    Registers the same recording_segments row shape as other ingest paths so ai-processor picks it up.
    """
    if not recording_storage.client:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Object storage unavailable")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload body")

    max_bytes = video_file_upload.max_upload_bytes()
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size ({max_bytes} bytes)",
        )

    try:
        ext, content_type = video_file_upload.resolve_video_content_type(mime_type, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    session_id = (recording_session_id or "").strip() or str(uuid.uuid4())
    started_raw = (segment_started_at or "").strip() or datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    try:
        ts = datetime.fromisoformat(started_raw.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="segment_started_at must be ISO-8601")

    original_filename = file.filename or f"upload{ext}"
    meta = {
        "recording_session_id": session_id,
        "segment_started_at": started_raw,
        "camera_name": camera_name or "",
        "uploaded_by": current_user.username,
        "original_filename": original_filename,
        "source": video_file_upload.METADATA_SOURCE_FILE_UPLOAD,
        "segment_index": "0",
        "segment_window_ms": "",
        "ingest_mode": video_file_upload.INGEST_MODE_FILE_UPLOAD,
    }

    object_key = recording_storage.upload_video_chunk(
        camera_id=camera_id,
        chunk_data=raw,
        timestamp=ts,
        metadata=meta,
        file_extension=ext,
        content_type=content_type,
        segment_index=0,
        recording_session_id=session_id,
    )
    if not object_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Upload to storage failed")

    extra: dict = {
        "segment_index": 0,
        "ingest_mode": video_file_upload.INGEST_MODE_FILE_UPLOAD,
        "camera_name": camera_name,
        "original_filename": original_filename,
    }

    db_row = recording_service.register_segment(
        db,
        camera_id=camera_id,
        recording_session_id=session_id,
        bucket_name=recording_storage.bucket_name,
        object_key=object_key,
        start_time=ts,
        end_time=None,
        duration_seconds=None,
        file_type=content_type,
        size_bytes=len(raw),
        ingest_source=video_file_upload.INGEST_SOURCE_FILE_UPLOAD,
        extra=extra,
    )

    return schemas.RecordingUploadResponse(
        recording_id=db_row.id if db_row else None,
        object_key=object_key,
        camera_id=camera_id,
        recording_session_id=session_id,
        bucket=recording_storage.bucket_name,
        segment_started_at=started_raw,
        size_bytes=len(raw),
    )


def _recording_list_response(
    items: List,
    *,
    total: int,
    limit: int,
    offset: int,
) -> schemas.RecordingListResponse:
    preview_urls = recording_thumbnail_service.attach_recording_list_previews(recording_storage, items)
    out_items: List[schemas.RecordingSegmentOut] = []
    for row in items:
        out_items.append(
            schemas.RecordingSegmentOut.model_validate(row).model_copy(
                update={"preview_url": preview_urls.get(row.id)},
            )
        )
    return schemas.RecordingListResponse(items=out_items, total=total, limit=limit, offset=offset)


@app.get("/api/v1/recordings", response_model=schemas.RecordingListResponse)
def list_recordings(
    camera_id: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    ingest_source: Optional[str] = None,
    recording_session_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    items = recording_service.list_segments(
        db,
        camera_id=camera_id,
        range_start=start,
        range_end=end,
        ingest_source=ingest_source,
        recording_session_id=recording_session_id,
        limit=limit,
        offset=offset,
    )
    total = recording_service.count_segments(
        db,
        camera_id=camera_id,
        range_start=start,
        range_end=end,
        ingest_source=ingest_source,
        recording_session_id=recording_session_id,
    )
    return _recording_list_response(
        items,
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/api/v1/cameras/{camera_id}/recordings", response_model=schemas.RecordingListResponse)
def list_recordings_for_camera(
    camera_id: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    ingest_source: Optional[str] = None,
    recording_session_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    items = recording_service.list_segments(
        db,
        camera_id=camera_id,
        range_start=start,
        range_end=end,
        ingest_source=ingest_source,
        recording_session_id=recording_session_id,
        limit=limit,
        offset=offset,
    )
    total = recording_service.count_segments(
        db,
        camera_id=camera_id,
        range_start=start,
        range_end=end,
        ingest_source=ingest_source,
        recording_session_id=recording_session_id,
    )
    return _recording_list_response(
        items,
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/api/v1/recordings/{recording_id}", response_model=schemas.RecordingSegmentOut)
def get_recording(
    recording_id: str,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    row = recording_service.get_segment_by_id(db, recording_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return row


@app.get("/api/v1/semantic-search/status", response_model=schemas.SemanticSearchStatusResponse)
def get_semantic_search_status(
    current_user: User = Depends(auth.get_current_active_user),
):
    """Whether semantic search can run in this API process; requires same JWT as other /api/v1 routes."""
    configured, index_ready, detail = recording_clip_search.semantic_search_status()
    logger.info(
        "GET /api/v1/semantic-search/status: configured=%s index_ready=%s detail=%r (user=%s)",
        configured,
        index_ready,
        detail,
        getattr(current_user, "username", None),
    )
    if not configured or not index_ready:
        logger.info(
            "GET /api/v1/semantic-search/status: partial/disabled — see recording_clip_search.semantic_search_status logs "
            "for host resolution, validate_semantic_search_milvus_readiness, and collection cache",
        )
    return schemas.SemanticSearchStatusResponse(
        configured=configured,
        index_ready=index_ready,
        detail=detail,
    )


@app.post("/api/v1/semantic-search", response_model=schemas.SemanticSearchResponse)
def semantic_search_recording_frames(
    body: schemas.SemanticSearchRequest,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    top_k = max(1, min(50, int(body.top_k)))
    # Over-fetch so stale-row filtering and per-segment dedup still yield up to top_k unique segments.
    fetch_k = min(max(top_k * 10, top_k), 250)
    hits, enabled, err = recording_clip_search.run_semantic_search(
        body.query,
        top_k=fetch_k,
        camera_id=body.camera_id,
    )
    if not enabled:
        return schemas.SemanticSearchResponse(
            results=[],
            enabled=False,
            detail=err,
        )
    if err:
        return schemas.SemanticSearchResponse(results=[], enabled=True, detail=err)
    raw_hit_count = len(hits)
    hits = recording_service.filter_valid_semantic_hits(db, hits)
    hits = recording_service.dedupe_semantic_hits_by_segment(hits)[:top_k]
    if raw_hit_count and not hits:
        logger.info(
            "semantic search: %s Milvus hit(s) removed by PostgreSQL validity filter and/or segment dedup",
            raw_hit_count,
        )
    recording_thumbnail_service.attach_semantic_search_thumbnails(db, recording_storage, hits)
    detection_service.attach_semantic_search_detections(db, hits)

    items: List[schemas.SemanticSearchHit] = []
    for h in hits:
        rid = h.get("recording_segment_id")
        if not rid:
            continue
        match_rows = h.get("match_detections") or []
        match_schemas = [_detection_to_schema(row) for row in match_rows]
        det_payloads = [
            {
                "object_type": row.object_type,
                "confidence": row.confidence,
                "timestamp_offset_ms": row.timestamp_offset_ms,
                "bounding_box": row.bounding_box,
            }
            for row in match_rows
        ]
        event_label, event_labels, event_severity = event_labels_for_frame_detections(det_payloads)
        items.append(
            schemas.SemanticSearchHit(
                vector_id=h.get("id"),
                recording_segment_id=str(rid),
                camera_id=str(h.get("camera_id") or ""),
                timestamp_offset_ms=int(h.get("timestamp_offset_ms") or 0),
                similarity=float(h.get("similarity") or 0.0),
                model_version=h.get("model_version"),
                thumbnail_url=h.get("thumbnail_url"),
                match_detections=match_schemas or None,
                event_label=event_label,
                event_labels=event_labels or None,
                event_severity=event_severity,
            )
        )
    detail: Optional[str] = None
    if not items:
        pending = recording_service.count_segments_pending_ai_index(db)
        if pending > 0:
            detail = "AI indexing in progress..."
        logger.info(
            "semantic search: no playable results query=%r pending_ai_segments=%s",
            (body.query or "")[:120],
            pending,
        )
    return schemas.SemanticSearchResponse(results=items, enabled=True, detail=detail)


@app.get("/api/v1/recordings/{recording_id}/playback", response_model=schemas.RecordingPlaybackResponse)
def get_recording_playback_url(
    recording_id: str,
    expiry_hours: int = Query(1, ge=1, le=72),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    row = recording_service.get_segment_by_id(db, recording_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    url = recording_storage.get_presigned_url(
        row.object_key,
        expiry_hours=expiry_hours,
        bucket_name=row.bucket_name,
    )
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not generate playback URL for object storage",
        )
    return schemas.RecordingPlaybackResponse(
        recording_id=row.id,
        url=url,
        bucket_name=row.bucket_name,
        object_key=row.object_key,
        expires_in_seconds=int(expiry_hours * 3600),
    )


@app.delete("/api/v1/recordings/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(
    recording_id: str,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    row = recording_service.get_segment_by_id(db, recording_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    if not recording_storage.delete_object(row.object_key, bucket_name=row.bucket_name):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not delete object from storage",
        )
    recording_clip_search.purge_segment_clip_vectors(row.id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _absolute_event_time(segment_start: datetime, offset_ms: int) -> datetime:
    return segment_start + timedelta(milliseconds=offset_ms)


def _detection_to_schema(row: RecordingDetection) -> schemas.RecordingDetectionOut:
    seg = row.segment
    if seg is None:
        raise HTTPException(status_code=500, detail="Detection row missing segment join")
    preview_url: Optional[str] = None
    if row.preview_object_key:
        preview_url = recording_storage.get_presigned_url(
            row.preview_object_key,
            bucket_name=seg.bucket_name,
        )
    return schemas.RecordingDetectionOut(
        id=row.id,
        recording_segment_id=row.recording_segment_id,
        camera_id=row.camera_id,
        object_type=row.object_type,
        confidence=row.confidence,
        timestamp_offset_ms=row.timestamp_offset_ms,
        bounding_box=row.bounding_box,
        created_at=row.created_at,
        absolute_event_time=_absolute_event_time(seg.start_time, row.timestamp_offset_ms),
        preview_url=preview_url,
    )


@app.get("/api/v1/detections", response_model=schemas.DetectionListResponse)
def list_detections(
    camera_id: Optional[str] = None,
    object_type: Optional[str] = None,
    recording_segment_id: Optional[str] = None,
    event_after: Optional[datetime] = None,
    event_before: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    rows, total = detection_service.list_detections(
        db,
        camera_id=camera_id,
        object_type=object_type,
        recording_segment_id=recording_segment_id,
        event_after=event_after,
        event_before=event_before,
        limit=limit,
        offset=offset,
    )
    return schemas.DetectionListResponse(
        items=[_detection_to_schema(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/api/v1/detections/{detection_id}", response_model=schemas.RecordingDetectionOut)
def get_detection(
    detection_id: str,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    row = detection_service.get_detection_by_id(db, detection_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")
    return _detection_to_schema(row)


@app.get("/api/v1/detections/{detection_id}/playback", response_model=schemas.DetectionPlaybackResponse)
def get_detection_playback(
    detection_id: str,
    expiry_hours: int = Query(1, ge=1, le=72),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    row = detection_service.get_detection_by_id(db, detection_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")
    seg = row.segment
    if not seg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording segment missing")
    url = recording_storage.get_presigned_url(
        seg.object_key,
        expiry_hours=expiry_hours,
        bucket_name=seg.bucket_name,
    )
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not generate playback URL for object storage",
        )
    abs_t = _absolute_event_time(seg.start_time, row.timestamp_offset_ms)
    return schemas.DetectionPlaybackResponse(
        detection_id=row.id,
        recording_id=seg.id,
        timestamp_offset_ms=row.timestamp_offset_ms,
        absolute_event_time=abs_t,
        url=url,
        bucket_name=seg.bucket_name,
        object_key=seg.object_key,
        expires_in_seconds=int(expiry_hours * 3600),
    )


# --- Event & Search Endpoints ---
@app.get("/api/v1/events")
def get_events(
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    return db.query(Event).limit(100).all()

@app.post("/api/v1/search/semantic")
def search_semantic(
    request: dict,
    services: services.SurveillanceServices = Depends(services.get_surveillance_services),
    current_user: User = Depends(auth.get_current_active_user)
):
    query_embedding = request.get("embedding")
    top_k = request.get("top_k", 10)
    if not query_embedding:
        raise HTTPException(status_code=400, detail="Embedding is required")
    return services.search_events_by_similarity(query_embedding, top_k)

@app.post("/api/v1/search/text")
def search_text(
    request: dict, # Expects {"query": "some text"}
    current_user: User = Depends(auth.get_current_active_user)
):
    # Placeholder for converting text to embedding and searching
    # This will be implemented fully later
    query = request.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="Query text is required")
    return {"message": f"Search results for '{query}' are not yet implemented.", "results": []}

# --- AI Endpoints ---
@app.post("/api/v1/ai/ask")
def ask_ai(
    request: AIRequest,
    current_user: User = Depends(auth.get_current_active_user)
):
    return ai_service.answer_question(request)

