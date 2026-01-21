from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List

from . import services, database, auth, schemas
# Import the new AI Service and schema
from .ai_service import AIService
from .schemas import AIRequest

from shared.models import User, Event
# Import the new Camera model and schema
from shared.models import Camera as CameraModel
from .schemas import Camera as CameraSchema, CameraCreate

app = FastAPI()

# Instantiate the AI Service
ai_service = AIService()

@app.on_event("startup")
def startup_event():
    database.create_tables()
    db = next(database.get_db())
    service_instance = services.SurveillanceServices(db)
    service_instance.initialize_services()
    # Create a default admin user if one doesn't exist
    if not db.query(User).filter(User.username == "admin").first():
        hashed_password = auth.get_password_hash("admin")
        admin_user = User(username="admin", password=hashed_password, role="admin")
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
    db.close()

# --- Auth Endpoints ---
@app.post("/api/v1/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
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

# --- Camera Endpoints ---
@app.post("/api/v1/cameras", response_model=CameraSchema, status_code=status.HTTP_201_CREATED)
def create_camera(
    camera: CameraCreate,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.role_checker(["admin"]))
):
    db_camera = CameraModel(**camera.dict())
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    return db_camera

@app.put("/api/v1/cameras/{camera_id}", response_model=CameraSchema)
def update_camera(
    camera_id: str,
    camera: CameraCreate, # Re-using the create schema for updates
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.role_checker(["admin"]))
):
    db_camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    for var, value in vars(camera).items():
        setattr(db_camera, var, value) if value else None
    db.commit()
    db.refresh(db_camera)
    return db_camera

@app.get("/api/v1/cameras", response_model=List[CameraSchema])
def get_cameras(
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    return db.query(CameraModel).all()

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


# --- Live Feed ---
@app.get("/api/v1/cameras/{camera_id}/live.m3u8")
def get_live_feed(
    camera_id: str,
    services: services.SurveillanceServices = Depends(services.get_surveillance_services),
    current_user: User = Depends(auth.get_current_active_user)
):
    live_feed_url = services.get_camera_live_feed_url(camera_id)
    if not live_feed_url:
        raise HTTPException(status_code=404, detail="Camera not found or live feed not available")
    return {"url": live_feed_url}
