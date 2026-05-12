from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from . import services, database, auth, schemas
from .ai_service import AIService
from .schemas import AIRequest
from .storage_service import MinIOStorageService

from shared.models import User, Event
from shared.models import Camera as CameraModel
from .schemas import Camera as CameraSchema, CameraCreate, CameraUpdate

app = FastAPI()
# Browsers cannot combine allow_origins=["*"] with allow_credentials=True; use * for dev tooling / OPTIONS preflight.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_service = AIService()
recording_storage = MinIOStorageService()

@app.on_event("startup")
def startup_event():
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

# --- Auth Endpoints ---
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

    return schemas.RecordingUploadResponse(
        object_key=object_key,
        camera_id=camera_id,
        recording_session_id=recording_session_id,
        bucket=recording_storage.bucket_name,
        segment_started_at=segment_started_at,
        size_bytes=len(raw),
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

