# DigiMitra City — Documentation Index

**Project:** DigiMitra City (AI Surveillance Platform)  
**Documentation Version:** 1.0  
**Generated:** June 2026  
**Source:** Derived from actual codebase analysis

---

## Architecture Summary

DigiMitra City is an **AI-powered smart city surveillance platform** built as a polyglot microservices monorepo:

- **Frontend:** Next.js 14 operator dashboard (`ui-police`) with AWS Cognito auth
- **API:** FastAPI gateway (`api`) with REST + WebSocket
- **Offline AI:** YOLOv8n + CLIP ViT-B-32 worker (`ai-processor`)
- **Live AI:** YOLO + ByteTrack + rule engine (`live-detection-agent`)
- **Data:** PostgreSQL (metadata), MinIO (video), Milvus (vectors), Redpanda (events)
- **Deployment:** Docker Compose (11 services)

> **Note:** This project uses **PostgreSQL**, not MongoDB. AWS integration is limited to Cognito (frontend). No CI/CD pipelines exist in the repository.

---

## Core Documentation

| # | Document | Description |
|---|----------|-------------|
| 01 | [README](./01_README.md) | Project overview, installation, configuration, features |
| 02 | [Problem Statement](./02_PROBLEM_STATEMENT.md) | Real-world problem, motivation, business/technical value |
| 03 | [Use Cases](./03_USE_CASES.md) | Actors, use case table, detailed flows |
| 04 | [SRS](./04_SRS.md) | Software Requirements Specification (IEEE 830) |
| 05 | [Software Design Document](./05_SOFTWARE_DESIGN_DOCUMENT.md) | Subsystem design, AI module, security, deployment |
| 06 | [Architecture](./06_ARCHITECTURE.md) | High-level, component, deployment, cloud architecture |
| 07 | [API Documentation](./07_API_DOCUMENTATION.md) | Complete REST & WebSocket API reference |
| 08 | [Database Documentation](./08_DATABASE_DOCUMENTATION.md) | PostgreSQL, Milvus, MinIO, Redpanda schemas |
| 09 | [User Manual](./09_USER_MANUAL.md) | Operator guide, features, troubleshooting, FAQ |
| 10 | [Testing Manual](./10_TESTING_MANUAL.md) | Test strategy, test cases, security testing |
| 11 | [Deployment Guide](./11_DEPLOYMENT_GUIDE.md) | Docker, AWS, secrets, env vars, scaling, rollback |
| 12 | [Future Work](./12_FUTURE_WORK.md) | 92 categorized future improvements |

---

## Architecture & Design Views

| Document | Description |
|----------|-------------|
| [4+1 Architectural Views](./architecture-4plus1/README.md) | Logical, Development, Process, Physical, Scenarios views |
| [UML Diagrams](./uml/README.md) | Use Case, Class, Sequence, Component, Deployment, Package, Activity, State, Communication, Object diagrams |
| [Data Flow Diagrams](./data-flow/README.md) | DFD Level 0–2, pipeline flows, inference flows, database flows |
| [Sequence Diagrams](./sequences/README.md) | Login, auth, upload, streaming, inference, alerts, dashboard |

---

## Developer Resources

| Document | Description |
|----------|-------------|
| [Developer Guide](./developer/README.md) | Folder structure, coding standards, ADRs, dependencies, extension points |
| [LIVE_SURVEILLANCE.md](../LIVE_SURVEILLANCE.md) | Live pipeline implementation guide (repository root) |
| [STREAMING_SETUP.md](../STREAMING_SETUP.md) | Browser webcam setup guide (repository root) |

---

## Diagram Index

### UML ([uml/README.md](./uml/README.md))

| Diagram | Mermaid | PlantUML |
|---------|---------|----------|
| Use Case | ✅ | ✅ |
| Class | ✅ | ✅ |
| Sequence (Recording Upload) | ✅ | ✅ |
| Component | ✅ | ✅ |
| Deployment | ✅ | ✅ |
| Package | ✅ | ✅ |
| Activity (Semantic Search) | ✅ | ✅ |
| State (Recording Segment) | ✅ | ✅ |
| Communication (Live Alert) | ✅ | ✅ |
| Object (Live Alert Instance) | ✅ | ✅ |

### 4+1 Views ([architecture-4plus1/README.md](./architecture-4plus1/README.md))

| View | Mermaid | PlantUML |
|------|---------|----------|
| Logical | ✅ | ✅ |
| Development | ✅ | ✅ |
| Process | ✅ | ✅ |
| Physical | ✅ | ✅ |
| Scenarios (+1) | ✅ | — |

### Data Flow ([data-flow/README.md](./data-flow/README.md))

| Diagram | Mermaid | PlantUML |
|---------|---------|----------|
| DFD Level 0 | ✅ | ✅ |
| DFD Level 1 | ✅ | ✅ |
| DFD Level 2 (Ingest) | ✅ | ✅ |
| DFD Level 2 (Offline AI) | ✅ | — |
| DFD Level 2 (Live Detection) | ✅ | — |
| Pipeline Flow (Recording) | ✅ | — |
| Streaming Flow (Live) | ✅ | — |
| Inference Flow (Offline) | ✅ | — |
| Database Flow | ✅ | — |

### Sequences ([sequences/README.md](./sequences/README.md))

| Flow | Mermaid | PlantUML |
|------|---------|----------|
| User Login | ✅ | ✅ |
| API Authentication | ✅ | ✅ |
| Video Upload | ✅ | ✅ |
| Live Streaming | ✅ | ✅ |
| AI Inference (Offline) | ✅ | ✅ |
| Alert Generation | ✅ | — |
| Notification (WebSocket) | ✅ | — |
| Database Storage | ✅ | — |
| Dashboard Rendering | ✅ | ✅ |

---

## Cross-Reference Map

```
01_README ──────────► 06_ARCHITECTURE, 11_DEPLOYMENT
02_PROBLEM ─────────► 03_USE_CASES, 04_SRS
03_USE_CASES ───────► 04_SRS, 09_USER_MANUAL, sequences/
04_SRS ─────────────► 05_SDD, 07_API, 10_TESTING
05_SDD ─────────────► 06_ARCHITECTURE, 08_DATABASE, developer/
06_ARCHITECTURE ────► architecture-4plus1/, data-flow/, uml/
07_API ─────────────► 08_DATABASE, sequences/
08_DATABASE ────────► data-flow/
09_USER_MANUAL ─────► 03_USE_CASES, 11_DEPLOYMENT
10_TESTING ─────────► 04_SRS, LIVE_SURVEILLANCE.md
11_DEPLOYMENT ──────► 01_README, 06_ARCHITECTURE
12_FUTURE_WORK ─────► 05_SDD
developer/ ─────────► 05_SDD, 06_ARCHITECTURE, 07_API
```

---

## Key Source Files Reference

| Area | Primary Files |
|------|---------------|
| API Routes | `api/src/main.py`, `api/src/live_alerts_hub.py` |
| Auth | `api/src/auth.py`, `ui-police/lib/cognito.ts`, `ui-police/middleware.ts` |
| Data Models | `shared/models.py` |
| Vector DB | `shared/recording_clip_milvus.py` |
| Live Rules | `shared/live_rules.py` |
| Offline AI | `ai-processor/scheduler.py` |
| Live AI | `live-detection-agent/pipeline.py` |
| Frontend API | `ui-police/lib/surveillance-api.ts` |
| Dashboard | `ui-police/components/dashboard.tsx` |
| Orchestration | `docker-compose.yml` |
| Tests | `tests/` (9 modules) |

---

## Assumptions & Corrections

| Item | Status |
|------|--------|
| MongoDB | **Not used** — PostgreSQL is the relational store |
| AWS Infrastructure | **Cognito only** — no S3/EC2/Lambda IaC in repo |
| CI/CD | **Not found** — manual testing only |
| License | **Not defined** — no LICENSE file in repo |
| Contributors | **Not defined** — no AUTHORS file in repo |
| AI Assistant | **Mock only** — `api/src/ai_service.py` |
| `.env.example` | **Not found** — manual env configuration required |
| Camera CRUD auth | **Not enforced** — endpoints lack JWT dependency |
| Production deployment | **Docker Compose only** — K8s/Terraform not in repo |

---

## Quick Start

```bash
# Full stack
docker compose up --build

# Frontend
cd ui-police && pnpm install && pnpm dev

# Tests
pytest tests/ -v

# API docs
open http://localhost:8000/docs
```

---

*This documentation set was generated from analysis of the DigiMitra City source code. All technical claims are grounded in repository files unless explicitly marked as assumptions.*
