# Software Design Document (SDD)

**Document:** 05 — Software Design Document  
**Project:** DigiMitra City  
**Standard:** IEEE 1016-2009 (adapted)

---

## 1. Introduction

This document describes the software design of DigiMitra City, including subsystem decomposition, database schema, API modules, frontend architecture, AI pipelines, security model, and deployment topology.

---

## 2. Architecture Overview

DigiMitra City follows a **microservices architecture** with two intentionally decoupled video processing pipelines:

| Pipeline | Purpose | Services |
|----------|---------|----------|
| **Recording / Offline** | DVR, file upload, YOLO + CLIP indexing, semantic search | api, ai-processor, MinIO, Milvus, PostgreSQL |
| **Live Surveillance** | Real-time detection, tracking, rule alerts | api, live-detection-agent, WebSocket hub |

A third **legacy edge pipeline** (edge-agent → Redpanda → stream-processor) processes pre-recorded video samples with XCLIP embeddings.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                        │
│              ui-police (Next.js 14 App Router)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST / WS / MediaRecorder
┌────────────────────────────▼────────────────────────────────────┐
│                      Application Layer                           │
│  api (FastAPI) │ live-detection-agent │ ai-processor            │
│  edge-agent    │ stream-processor                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                       Data / Infrastructure                      │
│  PostgreSQL │ MinIO │ Milvus+etcd │ Redpanda │ nginx-hls        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Design

### 3.1 API Service (`api/`)

**Entry:** `api/src/main.py`  
**Framework:** FastAPI + Uvicorn  
**Port:** 8000

| Module | Responsibility |
|--------|----------------|
| `main.py` | Route definitions, startup (DB seed, Milvus warmup), CORS |
| `auth.py` | JWT creation/validation, bcrypt, role_checker |
| `database.py` | SQLAlchemy engine, SessionLocal, `create_tables()` |
| `schemas.py` | Pydantic request/response models |
| `recording_service.py` | Segment CRUD, semantic hit filtering/dedup |
| `detection_service.py` | Detection queries, semantic search attachment |
| `recording_clip_search.py` | CLIP text encode + Milvus search orchestration |
| `recording_thumbnail_service.py` | Preview URL generation |
| `storage_service.py` | MinIO upload, presign, delete |
| `video_file_upload.py` | File upload validation and constants |
| `live_alerts_hub.py` | WebSocket manager, frame proxy, internal publish |
| `ai_service.py` | Mock AI Q&A (placeholder) |
| `services.py` | Legacy event/vector search services |

**Startup sequence:**
1. Log MinIO configuration
2. `database.create_tables()` — SQLAlchemy metadata sync
3. Seed `admin/admin` user if absent
4. `recording_clip_search.warmup_recording_clip_milvus()`

### 3.2 AI Processor (`ai-processor/`)

**Entry:** `ai-processor/app.py` → `scheduler.run_forever()`  
**Pattern:** Sequential queue worker (poll → claim → process → commit)

| Module | Responsibility |
|--------|----------------|
| `scheduler.py` | Segment queue, orchestration, Milvus insert |
| `detector.py` | YOLOv8n inference (COCO class filter) |
| `clip_embedder.py` | CLIP ViT-B-32 image embeddings |
| `frame_extractor.py` | Spaced frame sampling from video bytes |
| `utils.py` | MinIO download/upload helpers |

**Processing flow per segment:**
1. Claim oldest unscanned `recording_segments` row
2. Download from MinIO
3. Sample frames every `AI_FRAME_INTERVAL_SEC` (default 3s)
4. YOLO per frame → `recording_detections`
5. CLIP every N frames → Milvus `recording_clip_frames`
6. Mark `ai_scan_completed_at`

### 3.3 Live Detection Agent (`live-detection-agent/`)

**Entry:** `live-detection-agent/app.py`  
**Port:** 8765 (frame ingest HTTP server)

| Module | Responsibility |
|--------|----------------|
| `pipeline.py` | Main loop: frame → detect → track → rules → alert |
| `detector.py` | YOLOv8n wrapper |
| `tracker.py` | ByteTrack via supervision; velocity/speed computation |
| `frame_source.py` | RTSP, JPEG queue, video file fallback sources |
| `camera_registry.py` | Load cameras from PostgreSQL |
| `ingest_server.py` | HTTP endpoint for JPEG frame ingest |
| `alert_client.py` | POST alerts to API internal publish endpoint |
| `config.py` | Environment-driven configuration |

### 3.4 Edge Agent (`edge-agent/`)

**Entry:** `edge-agent/src/main.py`  
**Purpose:** Batch-process video files from `video-samples/`

- Chunks video at `CHUNK_SECONDS` (default 10s)
- YOLOv8n detection per chunk
- XCLIP (`microsoft/xclip-base-patch32`) video embeddings
- Upload chunks to MinIO
- Insert vectors to Milvus legacy `events` collection
- Publish to Redpanda topics `region-1-events`, `region-1-chunks`

### 3.5 Stream Processor (`stream-processor/`)

**Entry:** `stream-processor/src/main.py`  
**Purpose:** Consume Redpanda topics and persist to PostgreSQL via `recording_store.py`

### 3.6 Shared Library (`shared/`)

| Module | Responsibility |
|--------|----------------|
| `models.py` | SQLAlchemy ORM: Camera, Event, User, RecordingSegment, RecordingDetection |
| `recording_clip_milvus.py` | Milvus collection management, insert, search, purge |
| `live_rules.py` | Crowd, congestion, wrong-way rule engine |
| `recording_event_labels.py` | Derive human-readable labels from detections |
| `minio_config.py` | MinIO endpoint resolution |
| `schema_compat.py` | Recording schema migration helpers |
| `clip_sentence_transformer.py` | Shared CLIP model loader |

### 3.7 Frontend (`ui-police/`)

**Framework:** Next.js 14 App Router, TypeScript, Tailwind CSS 4

| Area | Key Files |
|------|-----------|
| Routes | `app/page.tsx`, `app/login/`, `app/register/`, `app/recordings/` |
| Auth | `middleware.ts`, `components/auth-provider.tsx`, `lib/cognito.ts` |
| API Client | `lib/surveillance-api.ts` |
| Live | `lib/use-live-alert-websocket.ts`, `lib/use-live-frame-pusher.ts`, `lib/live-ws-config.ts` |
| Recording | `lib/use-webcam-recording.ts`, `components/video-file-upload.tsx` |
| Dashboard | `components/dashboard.tsx` (section router) |
| UI Primitives | `components/ui/*` (shadcn/ui) |

> **Note:** A secondary legacy app tree exists at `ui-police/src/app/`. The active application uses `ui-police/app/`.

---

## 4. Database Design

> **Correction:** This project uses **PostgreSQL**, not MongoDB. See [08_DATABASE_DOCUMENTATION.md](./08_DATABASE_DOCUMENTATION.md).

### 4.1 Entity-Relationship Summary

```
cameras ──< events (legacy)
users (standalone)
recording_segments ──< recording_detections (CASCADE DELETE)
recording_segments ──> Milvus recording_clip_frames (by recording_segment_id)
```

### 4.2 Key Tables

| Table | Primary Key | Notable Columns |
|-------|-------------|-----------------|
| `cameras` | `id` (UUID string) | name, lat/long, rtsp_url, source_type, stream_status |
| `users` | `id` | username (unique), password (bcrypt), role |
| `recording_segments` | `id` | camera_id, object_key, start_time, ingest_source, ai_scan_* |
| `recording_detections` | `id` | segment FK, object_type, confidence, timestamp_offset_ms, bounding_box |
| `events` | `id` | Legacy edge pipeline events |

### 4.3 Milvus Collection: `recording_clip_frames`

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR | Deterministic hash ID |
| `recording_segment_id` | VARCHAR | FK to PostgreSQL |
| `camera_id` | VARCHAR | Camera reference |
| `timestamp_offset_ms` | INT64 | Frame offset in segment |
| `model_version` | VARCHAR | e.g., `clip-vit-b-32-st-v1` |
| `embedding` | FLOAT_VECTOR(512) | L2-normalized CLIP vector |

**Index:** FLAT, metric IP (inner product)

### 4.4 MinIO Object Layout

```
surveillance-bucket/
├── video-chunks/{camera_id}/{timestamp}_{session}_{index}.webm
└── detection-previews/{segment_id}/{detection_id}.jpg
```

---

## 5. Backend Design

### 5.1 Authentication Flow

1. **Frontend:** Cognito sign-in → `dm_auth=1` cookie
2. **API:** Separate JWT via `/api/v1/token` → `Authorization: Bearer`
3. **WebSocket:** JWT in `?token=` query parameter
4. **Internal:** `X-Live-Alert-Secret` header for agent→API publish

### 5.2 Recording Upload Design

Two upload paths converge on `recording_service.register_segment()`:

| Path | Endpoint | ingest_source |
|------|----------|---------------|
| Browser DVR | `/recordings/upload` | `browser_mediarecorder` |
| File upload | `/recordings/upload-file` | `file_upload` |

Both use `MinIOStorageService.upload_video_chunk()` with metadata sidecar.

### 5.3 Semantic Search Design

`recording_clip_search.run_semantic_search()`:
1. Load CLIP text encoder (sentence-transformers)
2. Encode query → 512-dim vector
3. Milvus search with IP metric, over-fetch for filtering
4. PostgreSQL validity filter (segment must exist)
5. Dedupe by segment ID
6. Attach thumbnails and co-occurring detections
7. Compute event labels via `recording_event_labels.py`

---

## 6. Frontend Design

### 6.1 Section-Based Dashboard

`dashboard.tsx` reads `?section=` query parameter:

| Section | Component |
|---------|-----------|
| `dashboard` | Overview widgets |
| `feeds` | `live-feed-wall.tsx` |
| `map` | `map-view.tsx` |
| `search` | `text-search.tsx` |
| `events` | `events-alerts.tsx` |
| `recordings` | `recordings-history.tsx` |
| `settings` | `settings.tsx` |

### 6.2 Live Feed Architecture

When `NEXT_PUBLIC_ENABLE_LIVE_WS=true`:
- WebSocket: `use-live-alert-websocket.ts`
- Frame push: `use-live-frame-pusher.ts` (JPEG, ~1 FPS)
- Overlay: `live-bbox-overlay.tsx`
- Recording (parallel): `use-webcam-recording.ts` (MediaRecorder)

These paths are **intentionally independent** per `LIVE_SURVEILLANCE.md`.

---

## 7. AI Module Design

### 7.1 Detection Model

- **Model:** YOLOv8n (`yolov8n.pt`)
- **Classes:** person(0), bicycle(1), car(2), motorcycle(3), bus(5), truck(7), backpack(24)
- **Config:** `YOLO_DEVICE=cpu`, `YOLO_IMGSZ=416`, `YOLO_CONFIDENCE=0.35` (live)

### 7.2 Embedding Models

| Model | Use Case | Dimensions |
|-------|----------|------------|
| CLIP ViT-B-32 | Offline semantic search | 512 |
| XCLIP base-patch32 | Edge agent video chunks | Model-dependent |

### 7.3 Tracking (Live Only)

- **Algorithm:** ByteTrack via `supervision` library
- **Outputs:** track_id, label, bbox, centroid, speed_px, velocity, dwell_sec
- **Consumed by:** `shared/live_rules.py`

### 7.4 Rule Engine

| Rule | Trigger Condition |
|------|-------------------|
| `crowd_gathering` | ≥ N persons for ≥ duration_sec |
| `traffic_congestion` | ≥ N slow vehicles for ≥ duration_sec |
| `wrong_way_driving` | Vehicle velocity dot-product < threshold vs lane direction |

All thresholds configurable via environment variables (see `LIVE_SURVEILLANCE.md`).

---

## 8. Streaming Pipeline Design

### 8.1 Live Pipeline

```
Frame Source → YOLO → ByteTrack → live_rules → alert_client → API publish → WebSocket → UI
```

### 8.2 Offline Pipeline

```
Upload → MinIO → recording_segments → ai-processor → detections + Milvus → search API → UI
```

### 8.3 Edge Pipeline (Legacy)

```
video-samples → edge-agent → Redpanda → stream-processor → PostgreSQL events
                          → MinIO + Milvus (parallel)
```

---

## 9. Security Design

| Layer | Mechanism |
|-------|-----------|
| Frontend routes | Cookie middleware (`dm_auth`) |
| Frontend identity | AWS Cognito (Amplify) |
| API auth | JWT HS256, 30-min expiry |
| Password storage | bcrypt via passlib |
| Role enforcement | `role_checker(["admin"])` dependency |
| Internal endpoints | Shared secret header |
| Object access | Presigned URLs with expiry |
| CORS | Permissive in dev (`*`); restrict in production |

---

## 10. Deployment Design

**Orchestration:** Docker Compose 3.8 (`docker-compose.yml`)

| Service | Image/Build | Dependencies |
|---------|-------------|--------------|
| api | `./api/Dockerfile` | postgres, milvus, minio, redpanda |
| ai-processor | `./ai-processor/Dockerfile` | postgres, minio, milvus |
| live-detection-agent | `./live-detection-agent/Dockerfile` | postgres, api |
| edge-agent | `./edge-agent/Dockerfile` | redpanda, minio, milvus |
| stream-processor | `./stream-processor/Dockerfile` | postgres, redpanda |
| Infrastructure | Official images | — |

**Volumes:** `minio_data`, `pg_data`, `milvus_data`, `hls_data`

**Hot reload:** `./shared`, `./api/src`, `./ai-processor` bind-mounted

---

## 11. Scalability Considerations

| Component | Current | Scale Path |
|-----------|---------|------------|
| API | Single instance | Horizontal behind load balancer |
| ai-processor | Sequential single worker | Partition queue by camera/region |
| live-detection-agent | Per-deployment instance | One agent per GPU node |
| Milvus | Standalone | Milvus cluster mode |
| MinIO | Single node | MinIO distributed or AWS S3 |
| PostgreSQL | Single instance | Read replicas, connection pooling |

---

## 12. Future Improvements

See [12_FUTURE_WORK.md](./12_FUTURE_WORK.md) for 40+ categorized improvements.

**Design-level priorities:**
1. Federate Cognito and API JWT (OIDC)
2. Replace mock AI assistant with RAG over detections
3. GPU inference path for live multi-camera
4. Kubernetes Helm charts
5. CI/CD pipeline with automated pytest

---

## Related Documents

- [06_ARCHITECTURE.md](./06_ARCHITECTURE.md)
- [08_DATABASE_DOCUMENTATION.md](./08_DATABASE_DOCUMENTATION.md)
- [uml/README.md](./uml/README.md)
- [architecture-4plus1/README.md](./architecture-4plus1/README.md)
