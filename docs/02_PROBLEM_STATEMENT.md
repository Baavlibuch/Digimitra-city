# Problem Statement — DigiMitra City

**Document:** 02 — Problem Statement  
**IEEE Reference:** Section I — Introduction / Problem Domain

---

## 1. Real-World Problem

Modern cities deploy thousands of CCTV cameras for public safety, traffic management, and crime prevention. Despite massive video infrastructure investment, **most footage is never analyzed in real time** and **retrospective investigation is manual and time-consuming**. Operators must scrub hours of video to find a specific vehicle, person, or incident.

DigiMitra City targets the **intelligence gap** in urban video surveillance: transforming passive recording into proactive, searchable, AI-assisted policing.

---

## 2. Current Challenges

| Challenge | Description |
|-----------|-------------|
| **Data volume** | A single 1080p camera generates ~1–2 TB/month; cities operate hundreds of cameras |
| **Manual review** | Investigators lack tools to search by natural language ("red SUV at night") |
| **Alert latency** | Traditional DVR systems record but do not detect crowd surges or wrong-way driving in real time |
| **Siloed systems** | Cameras, storage, analytics, and dispatch often use incompatible vendors |
| **Operator overload** | Monitoring walls of feeds exceeds human attention capacity |
| **Evidence chain** | Linking detections to playable video segments with timestamps is error-prone |

---

## 3. Why Existing Systems Fail

### 3.1 Traditional CCTV / DVR

- Record-only architecture with no semantic indexing
- No natural-language search over visual content
- Playback requires knowing approximate time and camera ID

### 3.2 Cloud VMS (Video Management Systems)

- Often proprietary, expensive per-camera licensing
- Limited AI model customization
- Vendor lock-in for storage and analytics

### 3.3 Generic AI Platforms

- Batch-oriented pipelines unsuitable for sub-second live alerts
- Lack integrated operator dashboard for policing workflows
- Poor separation between live inference and offline indexing causes resource contention

### 3.4 Academic / Research Prototypes

- Typically lack production concerns: auth, multi-tenancy, object storage, vector DB scaling
- Rarely support hybrid ingest (browser webcam + RTSP + file upload)

**DigiMitra City** addresses these gaps with a **decoupled dual-pipeline architecture** (live vs. offline) documented in `LIVE_SURVEILLANCE.md`.

---

## 4. Research Motivation

The project explores:

1. **Multimodal video retrieval** — CLIP-based semantic search over surveillance frames indexed in Milvus
2. **Real-time multi-object tracking** — ByteTrack + rule-based anomaly detection without GPU dependency
3. **Microservices for AI workloads** — Independent scaling of API, offline processor, and live agent
4. **Hybrid edge-cloud ingest** — Browser MediaRecorder, RTSP, and file upload unified under `recording_segments`

---

## 5. Expected Impact

| Domain | Impact |
|--------|--------|
| **Public safety** | Faster response to crowd gatherings and traffic incidents |
| **Law enforcement** | Reduced investigation time via semantic search |
| **Traffic management** | Automated congestion and wrong-way driving alerts |
| **Urban planning** | Aggregated detection data for mobility patterns (future) |
| **Open source** | Reusable reference architecture for smart-city AI |

---

## 6. Who Benefits

### Primary Users
- **Surveillance operators** — monitor live feeds, receive alerts
- **Police investigators** — search recordings, review detections, export evidence

### Secondary Users
- **System administrators** — manage cameras, users, deployment
- **City IT departments** — operate Docker/Kubernetes infrastructure
- **Researchers** — extend AI models and rule engines

### Indirect Beneficiaries
- **Citizens** — improved public safety response times
- **Traffic authorities** — congestion visibility

---

## 7. Business Value

| Value Driver | Mechanism |
|--------------|-----------|
| **Reduced OPEX** | Open-source stack (PostgreSQL, Milvus, MinIO, Redpanda) vs. proprietary VMS |
| **Faster investigations** | Semantic search reduces manual review hours |
| **Proactive policing** | Live alerts enable intervention before escalation |
| **Scalable deployment** | Containerized services deploy on-premises or cloud |
| **Evidence integrity** | Immutable object storage with presigned playback URLs |

---

## 8. Technical Value

| Capability | Implementation |
|------------|----------------|
| Semantic video search | CLIP ViT-B-32 → Milvus `recording_clip_frames` (512-dim, IP metric) |
| Object detection | YOLOv8n on COCO subset (person, vehicles, backpack) |
| Live tracking | ByteTrack via `supervision` library |
| Rule engine | `shared/live_rules.py` — configurable thresholds via env vars |
| Unified recording model | `recording_segments` table anchors DVR, file upload, and edge ingest |
| API-first design | FastAPI with OpenAPI at `/docs` |
| Real-time push | WebSocket hub (`live_alerts_hub.py`) decoupled from offline pipeline |

---

## 9. Scope Boundaries

**In scope:**
- Video ingest, storage, AI indexing, live alerts, operator dashboard

**Out of scope (current release):**
- Facial recognition / biometric identification
- Automatic license plate recognition (ALPR)
- Mobile citizen reporting app
- Integration with dispatch/911 systems
- Multi-tenant SaaS billing

---

## Related Documents

- [03_USE_CASES.md](./03_USE_CASES.md) — Actor interactions
- [04_SRS.md](./04_SRS.md) — Formal requirements
- [05_SOFTWARE_DESIGN_DOCUMENT.md](./05_SOFTWARE_DESIGN_DOCUMENT.md) — Design response to this problem
