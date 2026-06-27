# Software Requirements Specification (SRS)

**Document:** 04 — SRS  
**Project:** DigiMitra City AI Surveillance Platform  
**Standard:** IEEE 830-1998 (adapted)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification defines the functional and non-functional requirements for DigiMitra City, an AI-powered surveillance platform comprising a Next.js operator dashboard, FastAPI backend, offline AI processor, live detection agent, and supporting data infrastructure.

### 1.2 Scope

The system provides:
- Video ingest (browser, RTSP, file upload, edge agent)
- Object storage and relational metadata management
- Offline YOLO detection and CLIP semantic indexing
- Real-time live surveillance with rule-based alerts
- Operator dashboard for monitoring, search, and playback

**Out of scope:** Facial recognition, ALPR, 911 dispatch integration, multi-tenant billing.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **Segment** | A contiguous video chunk stored in MinIO, tracked by `recording_segments` |
| **Detection** | A YOLO bounding-box result at a timestamp offset within a segment |
| **Semantic Search** | Natural-language query matched against CLIP embeddings in Milvus |
| **Live Alert** | Real-time rule-triggered notification via WebSocket |
| **Ingest Source** | Origin identifier: `browser_mediarecorder`, `file_upload`, `edge_agent` |
| **JWT** | JSON Web Token for API authentication (HS256, 30-min expiry) |

### 1.4 References

| Document | Location |
|----------|----------|
| Architecture | `docs/06_ARCHITECTURE.md` |
| API Spec | `docs/07_API_DOCUMENTATION.md` |
| Live Surveillance Guide | `LIVE_SURVEILLANCE.md` |
| Data Models | `shared/models.py` |

---

## 2. Overall Description

### 2.1 Product Perspective

DigiMitra City is a standalone system deployable via Docker Compose. It integrates with AWS Cognito for frontend identity and uses S3-compatible MinIO for storage. It is designed as a microservices monorepo with shared Python libraries.

### 2.2 Product Functions

1. User authentication (Cognito + API JWT)
2. Camera registry management
3. Continuous and on-demand video recording
4. Offline AI analysis (detection + embedding)
5. Semantic and detection-based search
6. Real-time live monitoring and alerts
7. Geographic camera map visualization

### 2.3 User Classes

| Class | Role (API) | Capabilities |
|-------|------------|--------------|
| Administrator | `admin` | Full access; user creation |
| Investigator | `investigator` | Search, playback, detections |
| Viewer | `viewer` | Read-only dashboard access |
| System Services | N/A | Internal publish/ingest endpoints |

### 2.4 Operating Environment

- **Server:** Linux containers (Docker); Python 3.9; Node.js 18+
- **Client:** Modern browsers (Chrome, Firefox, Edge) with WebRTC/MediaRecorder
- **Network:** Local development or cloud VPC; ports 3000, 8000, 8765, 5432, 9000, 19530

### 2.5 Design Constraints

- YOLOv8n on CPU limited to ~1 FPS per camera
- Milvus standalone mode (not distributed cluster in default compose)
- Dual auth systems (Cognito frontend, JWT API) not federated
- WebSocket JWT passed as query parameter

### 2.6 Assumptions

1. Operators have network access to API and WebSocket endpoints
2. MinIO presigned URLs are reachable from operator browsers (`MINIO_PUBLIC_URL`)
3. Cognito User Pool is pre-provisioned for production frontend auth
4. Camera IDs for browser live frames match `LIVE_BROWSER_CAMERA_IDS` env config
5. No `.env.example` exists; operators configure env vars manually

---

## 3. Functional Requirements

### 3.1 Authentication & Authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-01 | System SHALL authenticate frontend users via AWS Cognito | High |
| FR-AUTH-02 | System SHALL protect dashboard routes via `dm_auth` cookie middleware | High |
| FR-AUTH-03 | System SHALL issue JWT tokens via POST `/api/v1/token` | High |
| FR-AUTH-04 | System SHALL enforce role-based access for user creation (admin only) | Medium |
| FR-AUTH-05 | System SHALL support `ALLOW_ANY_LOGIN` dev mode for API tokens | Low |
| FR-AUTH-06 | System SHALL validate JWT on all protected `/api/v1/*` endpoints | High |
| FR-AUTH-07 | System SHALL authenticate WebSocket connections via JWT query param | High |
| FR-AUTH-08 | System SHALL authenticate internal live alert publish via `X-Live-Alert-Secret` | High |

### 3.2 Camera Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CAM-01 | System SHALL support CRUD operations on cameras | High |
| FR-CAM-02 | System SHALL store camera geolocation (latitude, longitude) | Medium |
| FR-CAM-03 | System SHALL support source types: webcam, cctv, upload | High |
| FR-CAM-04 | System SHALL store RTSP URL and credentials for CCTV cameras | High |
| FR-CAM-05 | System SHALL track stream_status: offline, connecting, online, error | Medium |

### 3.3 Recording & Storage

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-REC-01 | System SHALL accept browser MediaRecorder segment uploads | High |
| FR-REC-02 | System SHALL accept user video file uploads (MP4, MOV, AVI, WebM) | High |
| FR-REC-03 | System SHALL store video in MinIO under `video-chunks/{camera_id}/` | High |
| FR-REC-04 | System SHALL register segments in PostgreSQL with unique (bucket, object_key) | High |
| FR-REC-05 | System SHALL generate presigned playback URLs with configurable expiry | High |
| FR-REC-06 | System SHALL support paginated recording list with filters | High |
| FR-REC-07 | System SHALL attach preview thumbnails to recording list items | Medium |
| FR-REC-08 | System SHALL delete recordings from MinIO, Milvus, and PostgreSQL | Medium |
| FR-REC-09 | System SHALL enforce maximum upload file size for file uploads | Medium |

### 3.4 Offline AI Processing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AI-01 | System SHALL process recording segments sequentially (one at a time) | High |
| FR-AI-02 | System SHALL run YOLOv8n detection on sampled frames | High |
| FR-AI-03 | System SHALL detect COCO classes: person, bicycle, car, motorcycle, bus, truck, backpack | High |
| FR-AI-04 | System SHALL store detections with timestamp_offset_ms and bounding_box JSON | High |
| FR-AI-05 | System SHALL generate CLIP ViT-B-32 embeddings (512-dim) when enabled | High |
| FR-AI-06 | System SHALL index embeddings in Milvus collection `recording_clip_frames` | High |
| FR-AI-07 | System SHALL track AI scan status on segment (started_at, completed_at, last_error) | High |
| FR-AI-08 | System SHALL upload detection preview thumbnails to MinIO | Medium |

### 3.5 Search & Retrieval

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SRCH-01 | System SHALL support natural-language semantic search via CLIP + Milvus | High |
| FR-SRCH-02 | System SHALL return top_k results (1–50) with similarity scores | High |
| FR-SRCH-03 | System SHALL filter stale Milvus hits against PostgreSQL validity | High |
| FR-SRCH-04 | System SHALL deduplicate semantic hits by recording segment | Medium |
| FR-SRCH-05 | System SHALL attach matched detections and event labels to search hits | Medium |
| FR-SRCH-06 | System SHALL expose semantic search readiness status endpoint | Medium |
| FR-SRCH-07 | System SHALL support detection list with filters (camera, object_type, date) | High |
| FR-SRCH-08 | System SHALL provide detection playback with seek offset | High |

### 3.6 Live Surveillance

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LIVE-01 | System SHALL ingest live frames from RTSP, browser JPEG, and video fallback | High |
| FR-LIVE-02 | System SHALL run YOLO + ByteTrack at configurable FPS (default 1) | High |
| FR-LIVE-03 | System SHALL evaluate crowd gathering rule (min persons, duration) | High |
| FR-LIVE-04 | System SHALL evaluate traffic congestion rule (min vehicles, max speed) | High |
| FR-LIVE-05 | System SHALL evaluate wrong-way driving rule (velocity vs lane direction) | Medium |
| FR-LIVE-06 | System SHALL debounce alerts with per-rule cooldown | High |
| FR-LIVE-07 | System SHALL broadcast live alerts via WebSocket | High |
| FR-LIVE-08 | System SHALL proxy browser JPEG frames to live-detection-agent | High |
| FR-LIVE-09 | Live pipeline SHALL NOT modify recording upload or offline detection paths | High |

### 3.7 Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-UI-01 | Dashboard SHALL provide sections: dashboard, feeds, map, search, events, recordings, settings | High |
| FR-UI-02 | Dashboard SHALL display live feed wall with alert overlays | High |
| FR-UI-03 | Dashboard SHALL render camera locations on Leaflet map | Medium |
| FR-UI-04 | Dashboard SHALL support section navigation via `?section=` query param | Medium |
| FR-UI-05 | Dashboard SHALL show AI indexing pending state in search results | Medium |

### 3.8 Legacy / Edge Pipeline

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-EDGE-01 | Edge agent SHALL chunk video files and publish to Redpanda topics | Low |
| FR-EDGE-02 | Stream processor SHALL consume events and persist to PostgreSQL | Low |
| FR-EDGE-03 | Edge agent SHALL generate XCLIP embeddings for chunks | Low |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-01 | API REST response time (non-AI) | < 500 ms p95 |
| NFR-PERF-02 | Semantic search response time | < 3 s for top_k=20 |
| NFR-PERF-03 | Live frame processing rate | ≥ 1 FPS per camera (CPU) |
| NFR-PERF-04 | WebSocket alert delivery | < 1 s from rule trigger |
| NFR-PERF-05 | Recording upload throughput | Limited by network; no artificial throttle |

### 4.2 Scalability

| ID | Requirement |
|----|-------------|
| NFR-SCALE-01 | Services SHALL be independently deployable as Docker containers |
| NFR-SCALE-02 | ai-processor SHALL process segments sequentially; horizontal scale requires queue partitioning (future) |
| NFR-SCALE-03 | live-detection-agent SHALL support multiple camera sources via registry |
| NFR-SCALE-04 | API SHALL support connection pooling via SQLAlchemy |

### 4.3 Reliability

| ID | Requirement |
|----|-------------|
| NFR-REL-01 | AI processor SHALL store errors in `ai_scan_last_error` and continue queue |
| NFR-REL-02 | API SHALL return JSON 500 on database errors (not raw stack traces) |
| NFR-REL-03 | Milvus connection SHALL retry with configurable backoff |
| NFR-REL-04 | WebSocket manager SHALL prune dead connections on broadcast failure |

### 4.4 Availability

| ID | Requirement |
|----|-------------|
| NFR-AVAIL-01 | Recording upload SHALL succeed when ai-processor is offline |
| NFR-AVAIL-02 | Live alerts SHALL operate independently of ai-processor |
| NFR-AVAIL-03 | Semantic search SHALL degrade gracefully when Milvus unavailable |

### 4.5 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC-01 | Passwords SHALL be hashed with bcrypt |
| NFR-SEC-02 | JWT SHALL use HS256 with configurable secret |
| NFR-SEC-03 | Internal live alert endpoint SHALL require shared secret header |
| NFR-SEC-04 | CORS SHALL be configured (currently `allow_origins=["*"]` for dev) |
| NFR-SEC-05 | Presigned URLs SHALL expire within 1–72 hours |
| NFR-SEC-06 | Production SHALL disable `ALLOW_ANY_LOGIN` |

### 4.6 Maintainability

| ID | Requirement |
|----|-------------|
| NFR-MAINT-01 | Shared models SHALL reside in `shared/models.py` |
| NFR-MAINT-02 | Live rules SHALL be configurable via environment variables |
| NFR-MAINT-03 | API SHALL expose OpenAPI documentation at `/docs` |
| NFR-MAINT-04 | Codebase SHALL include pytest tests for critical modules |

### 4.7 Usability

| ID | Requirement |
|----|-------------|
| NFR-USE-01 | Dashboard SHALL use responsive shadcn/ui components |
| NFR-USE-02 | Search results SHALL include thumbnails and one-click playback |
| NFR-USE-03 | Live feed SHALL indicate WebSocket connection status |

### 4.8 Portability

| ID | Requirement |
|----|-------------|
| NFR-PORT-01 | Full stack SHALL run via `docker compose up` on Linux/macOS/Windows |
| NFR-PORT-02 | Frontend SHALL build with `next build` for static/SSR deployment |

---

## 5. External Interface Requirements

### 5.1 User Interfaces
- Web dashboard at `/` with section-based navigation
- Login/register/verify pages
- HTML5 video playback with seek support

### 5.2 Hardware Interfaces
- Webcam (browser MediaRecorder and canvas capture)
- RTSP IP cameras (server-side OpenCV ingest)

### 5.3 Software Interfaces
- AWS Cognito (Amplify Auth SDK v6)
- MinIO S3 API
- Milvus gRPC API
- Redpanda Kafka protocol

### 5.4 Communication Interfaces
- HTTPS REST (port 8000)
- WebSocket (port 8000, path `/api/v1/live/alerts`)
- JPEG frame POST (proxied to port 8765)

---

## 6. Constraints

1. Python 3.9 for API Docker image compatibility
2. Milvus 2.2.13 standalone (etcd dependency)
3. No MongoDB — PostgreSQL is the sole relational store
4. No automated CI/CD in repository
5. AI assistant endpoint is mock-only

---

## Related Documents

- [05_SOFTWARE_DESIGN_DOCUMENT.md](./05_SOFTWARE_DESIGN_DOCUMENT.md)
- [07_API_DOCUMENTATION.md](./07_API_DOCUMENTATION.md)
- [10_TESTING_MANUAL.md](./10_TESTING_MANUAL.md)
