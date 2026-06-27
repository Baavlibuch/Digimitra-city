# DigiMitra City — AI Surveillance Platform

**Version:** 0.1.0  
**Document:** 01 — Project README  
**Last Updated:** June 2026  
**Repository:** `Digimitra-city`

---

## Project Overview

**DigiMitra City** (branded **Digimitra — AI Surveillance**) is an AI-powered smart city surveillance and policing platform. It ingests video from browser webcams, RTSP CCTV cameras, and uploaded video files; stores recordings in object storage; runs offline AI analysis (YOLOv8 object detection + CLIP semantic embeddings); and provides real-time live surveillance with rule-based alerts (crowd gathering, traffic congestion, wrong-way driving).

The system is implemented as a **polyglot microservices monorepo**: five Python backend services (FastAPI workers), one Next.js 14 operator dashboard, and shared infrastructure orchestrated via Docker Compose.

> **Note on data stores:** This project uses **PostgreSQL** (relational metadata), **Milvus** (vector search), **MinIO** (object storage), and **Redpanda** (event streaming). It does **not** use MongoDB.

---

## Problem Statement

Urban surveillance systems generate vast volumes of video but lack intelligent search, real-time anomaly detection, and unified operator dashboards. DigiMitra City addresses the gap between passive CCTV recording and actionable AI-assisted policing. See [02_PROBLEM_STATEMENT.md](./02_PROBLEM_STATEMENT.md).

---

## Motivation

- Reduce operator response time through real-time alerts and semantic video search.
- Enable natural-language queries over recorded footage (e.g., "red car near intersection").
- Provide a modular, containerized architecture suitable for city-scale deployment.
- Decouple live inference from offline indexing for predictable performance.

---

## Objectives

| # | Objective | Status |
|---|-----------|--------|
| 1 | Continuous DVR recording from browser and CCTV sources | Implemented |
| 2 | Offline YOLO + CLIP indexing of recordings | Implemented |
| 3 | Natural-language semantic search over indexed frames | Implemented |
| 4 | Real-time live detection with ByteTrack + rule engine | Implemented |
| 5 | Operator dashboard with live feed wall, map, events, search | Implemented |
| 6 | Role-based API authentication (admin/investigator/viewer) | Implemented |
| 7 | AWS Cognito frontend identity (production) | Implemented |
| 8 | Containerized local/production deployment | Implemented |

---

## Features

### Recording & Storage
- Browser MediaRecorder segment upload (`POST /api/v1/recordings/upload`)
- User video file upload — MP4, MOV, AVI, WebM (`POST /api/v1/recordings/upload-file`)
- Presigned MinIO playback URLs with seek support
- Recording history with thumbnails and pagination

### AI & Search
- YOLOv8n object detection on stored segments (person, vehicle, backpack classes)
- CLIP ViT-B-32 embeddings (512-dim) indexed in Milvus for semantic search
- Natural-language query → `POST /api/v1/semantic-search`
- Detection timeline with bounding boxes and preview thumbnails

### Live Surveillance
- Real-time YOLO + ByteTrack at ~1 FPS per camera
- Rule-based alerts: crowd gathering, traffic congestion, wrong-way driving
- WebSocket push to dashboard (`/api/v1/live/alerts`)
- Browser JPEG frame ingest (separate from DVR recording)

### Operator Dashboard (`ui-police`)
- Sections: Dashboard, Live Feeds, Map, Semantic Search, Events & Alerts, Recordings, Settings
- AWS Cognito sign-up/sign-in with cookie-based route protection
- Leaflet map view of camera locations
- AI assistant panel (mock implementation — see limitations)

### Legacy / Edge Pipeline
- `edge-agent` chunks video files, runs XCLIP embeddings, publishes to Redpanda
- `stream-processor` consumes Kafka topics and persists to PostgreSQL

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Operator Browser (ui-police)                     │
│  Cognito Auth │ Dashboard │ Live Feed Wall │ Semantic Search │ Map      │
└───────┬─────────────────┬──────────────────────┬──────────────────────────┘
        │ REST + JWT      │ WebSocket          │ MediaRecorder / JPEG
        ▼                 ▼                    ▼
┌───────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐
│  api :8000    │  │ live-detection-  │  │ MinIO (surveillance-bucket) │
│  FastAPI      │◄─┤ agent :8765      │  │ PostgreSQL (eventsdb)       │
│               │  │ YOLO+ByteTrack   │  │ Milvus (recording_clip_frames)│
└───────┬───────┘  └──────────────────┘  └──────────────┬──────────────┘
        │                                                  │
        ▼                                                  ▼
┌───────────────┐                              ┌─────────────────────────┐
│ ai-processor  │◄──── recording_segments ────►│ Redpanda (region-1-*)   │
│ YOLO + CLIP   │                              │ edge-agent / stream-proc│
└───────────────┘                              └─────────────────────────┘
```

Full architecture: [06_ARCHITECTURE.md](./06_ARCHITECTURE.md) | Diagrams: [uml/](./uml/) | 4+1 Views: [architecture-4plus1/](./architecture-4plus1/)

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14.2, React 18, TypeScript 5, Tailwind CSS 4, shadcn/ui, Leaflet |
| Frontend Auth | AWS Amplify v6, AWS Cognito |
| API | FastAPI, Uvicorn, SQLAlchemy, Pydantic |
| Auth (API) | python-jose (JWT HS256), passlib bcrypt |
| Relational DB | PostgreSQL 15 |
| Vector DB | Milvus 2.2.13 (+ etcd) |
| Object Storage | MinIO (S3-compatible) |
| Messaging | Redpanda (Kafka-compatible) |
| AI — Detection | Ultralytics YOLOv8n |
| AI — Embeddings | sentence-transformers CLIP ViT-B-32, Microsoft XCLIP (edge) |
| AI — Tracking | supervision ByteTrack |
| Containers | Docker, Docker Compose 3.8 |
| Testing | pytest (9 test modules) |

---

## Folder Structure

```
Digimitra-city/
├── api/                    # FastAPI REST + WebSocket API (port 8000)
│   └── src/                # main.py, auth, services, recording, detection, live_alerts_hub
├── ai-processor/           # Offline YOLO + CLIP worker (sequential queue)
├── live-detection-agent/   # Real-time YOLO + ByteTrack + live rules (port 8765)
├── edge-agent/             # Video chunker + XCLIP + Redpanda publisher
├── stream-processor/       # Redpanda consumer → PostgreSQL
├── shared/                 # SQLAlchemy models, Milvus helpers, live rules, MinIO config
├── ui-police/              # Next.js 14 operator dashboard
├── tests/                  # pytest unit/integration tests
├── scripts/                # Maintenance (orphan vector cleanup)
├── docs/                   # This documentation set
├── docker-compose.yml      # Full stack orchestration
├── LIVE_SURVEILLANCE.md    # Live pipeline implementation guide
└── STREAMING_SETUP.md      # Browser webcam setup guide
```

Developer details: [developer/README.md](./developer/README.md)

---

## Installation

### Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- Node.js 18+ and pnpm (for frontend development)
- Python 3.9+ (for local testing)
- 8 GB+ RAM recommended (Milvus + YOLO models)

### Clone Repository

```bash
git clone <repository-url>
cd Digimitra-city
```

### Backend (Docker)

```bash
docker compose up --build
```

This starts all 11 services: `redpanda`, `redpanda-console`, `minio`, `postgres`, `etcd`, `milvus`, `api`, `ai-processor`, `stream-processor`, `nginx-hls`, `edge-agent`, `live-detection-agent`.

### Frontend

```bash
cd ui-police
pnpm install
cp .env.local.example .env.local   # create manually — see Configuration
pnpm dev
```

Dashboard: `http://localhost:3000`

---

## Configuration

### API Defaults (docker-compose.yml)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+psycopg2://svc:svcpass@postgres:5432/eventsdb` | PostgreSQL connection |
| `JWT_SECRET` | `devsecret` | API JWT signing key |
| `ALLOW_ANY_LOGIN` | `true` | Dev mode: accept any username at `/token` |
| `MINIO_ENDPOINT` | `minio:9000` | Internal MinIO |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | Browser-accessible presign host |
| `MILVUS_HOST` | `milvus` | Milvus gRPC host |
| `LIVE_ALERT_INTERNAL_SECRET` | `live-internal-dev-secret` | Agent→API alert auth |
| `LIVE_AGENT_INGEST_URL` | `http://live-detection-agent:8765` | Frame proxy target |

### Frontend (`ui-police/.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SURVEILLANCE_API_URL` | FastAPI base URL (default `http://localhost:8000`) |
| `NEXT_PUBLIC_ENABLE_LIVE_WS` | `true` to enable live WebSocket alerts |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | AWS Cognito User Pool ID |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Cognito App Client ID |
| `NEXT_PUBLIC_AWS_REGION` | AWS region for Cognito |

> **Assumption:** No `.env.example` file exists in the repository. Create `.env.local` manually from the tables above and in [11_DEPLOYMENT_GUIDE.md](./11_DEPLOYMENT_GUIDE.md).

---

## Running Locally

1. `docker compose up --build api ai-processor live-detection-agent postgres minio milvus`
2. `cd ui-police && pnpm dev`
3. Configure Cognito env vars or use dev API token flow (`ALLOW_ANY_LOGIN=true`)
4. Open `http://localhost:3000/login`
5. API docs (Swagger): `http://localhost:8000/docs`
6. MinIO console: `http://localhost:9001` (minioadmin/minioadmin)
7. Redpanda console: `http://localhost:8080`

---

## Running Production

Production deployment is not fully automated in this repository (no CI/CD pipelines found). Recommended approach:

1. Deploy Docker Compose stack or migrate to Kubernetes.
2. Set `ALLOW_ANY_LOGIN=false`, rotate `JWT_SECRET` and `LIVE_ALERT_INTERNAL_SECRET`.
3. Use WSS for WebSocket (`wss://`) with short-lived JWT tokens.
4. Configure AWS Cognito for frontend authentication.
5. Use GPU instances for `ai-processor` and `live-detection-agent` for higher FPS.
6. Replace MinIO with AWS S3 (code uses S3-compatible API — adaptation required).

See [11_DEPLOYMENT_GUIDE.md](./11_DEPLOYMENT_GUIDE.md).

---

## Environment Variables

Complete reference: [11_DEPLOYMENT_GUIDE.md](./11_DEPLOYMENT_GUIDE.md#environment-variables) and [07_API_DOCUMENTATION.md](./07_API_DOCUMENTATION.md).

---

## Deployment

| Component | Method | Port |
|-----------|--------|------|
| API | Docker (`api/Dockerfile`) | 8000 |
| Live Agent | Docker (`live-detection-agent/Dockerfile`) | 8765 |
| AI Processor | Docker (`ai-processor/Dockerfile`) | — |
| Frontend | Vercel or `next start` | 3000 |
| PostgreSQL | Docker (`postgres:15`) | 5432 |
| Milvus | Docker (`milvusdb/milvus:v2.2.13`) | 19530 |
| MinIO | Docker (`minio/minio`) | 9000/9001 |

---

## Screenshots

> Placeholder — add screenshots after deployment.

| Screen | Description | Path |
|--------|-------------|------|
| Login | Cognito sign-in page | `docs/assets/screenshots/login.png` |
| Dashboard | Main operator overview | `docs/assets/screenshots/dashboard.png` |
| Live Feed Wall | Multi-camera live tiles with alerts | `docs/assets/screenshots/live-feeds.png` |
| Semantic Search | Natural-language video search results | `docs/assets/screenshots/semantic-search.png` |
| Events & Alerts | Detection timeline with playback | `docs/assets/screenshots/events.png` |
| Map View | Camera locations on Leaflet map | `docs/assets/screenshots/map.png` |
| Recordings | DVR history with thumbnails | `docs/assets/screenshots/recordings.png` |

---

## Architecture Overview

| Document | Description |
|----------|-------------|
| [06_ARCHITECTURE.md](./06_ARCHITECTURE.md) | High-level and deployment architecture |
| [05_SOFTWARE_DESIGN_DOCUMENT.md](./05_SOFTWARE_DESIGN_DOCUMENT.md) | Subsystem and module design |
| [architecture-4plus1/](./architecture-4plus1/) | Kruchten 4+1 architectural views |
| [uml/](./uml/) | UML diagrams (Mermaid + PlantUML) |
| [data-flow/](./data-flow/) | Data flow diagrams (DFD Level 0–2) |
| [sequences/](./sequences/) | Sequence diagrams for key flows |

---

## Known Limitations

1. **Dual authentication:** Frontend uses AWS Cognito; API uses separate JWT (`/api/v1/token`). These are not federated.
2. **AI assistant is mocked:** `POST /api/v1/ai/ask` returns hardcoded responses (`api/src/ai_service.py`).
3. **Legacy text search:** `POST /api/v1/search/text` is a placeholder.
4. **CPU inference:** YOLO runs on CPU by default (~1 FPS per camera).
5. **No CI/CD:** No GitHub Actions or pipeline configs found in repository.
6. **No IaC:** No Terraform/CloudFormation; Docker Compose only.
7. **RTSP preview:** Browsers cannot preview RTSP directly; requires server-side ingest.
8. **WebSocket JWT in query string:** Security consideration for production (use WSS + short TTL).
9. **Duplicate app trees:** `ui-police/app/` (active) and `ui-police/src/app/` (legacy) coexist.
10. **Wrong-way detection:** Requires per-camera `LIVE_LANE_DIRECTIONS_JSON` configuration.

---

## Contributors

| Role | Contribution |
|------|--------------|
| Development Team | Core platform implementation |
| *Add names* | *Add roles* |

> **Assumption:** Contributor list not defined in repository metadata. Update with actual team members.

---

## License

No `LICENSE` file found in the repository root.

> **Assumption:** License terms are undefined in source. Add a `LICENSE` file before open-source distribution.

---

## Acknowledgements

- [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics) — object detection
- [sentence-transformers](https://www.sbert.net/) — CLIP embeddings
- [supervision](https://github.com/roboflow/supervision) — ByteTrack tracking
- [Milvus](https://milvus.io/) — vector similarity search
- [FastAPI](https://fastapi.tiangolo.com/) — API framework
- [Next.js](https://nextjs.org/) — frontend framework
- [shadcn/ui](https://ui.shadcn.com/) — UI components
- AWS Cognito — identity management

---

## Related Documentation

- [Documentation Index](./INDEX.md)
- [API Reference](./07_API_DOCUMENTATION.md)
- [User Manual](./09_USER_MANUAL.md)
- [Deployment Guide](./11_DEPLOYMENT_GUIDE.md)
