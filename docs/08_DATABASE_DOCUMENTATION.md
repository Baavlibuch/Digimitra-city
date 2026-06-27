# Database Documentation

**Document:** 08 — Data Store Specification  
**Project:** DigiMitra City

> **Important:** This project does **not** use MongoDB. Persistence is implemented across **PostgreSQL** (relational), **Milvus** (vector), **MinIO** (object), and **Redpanda** (streaming). This document covers all data stores.

---

## 1. Overview

| Store | Engine | Purpose | Schema Location |
|-------|--------|---------|-----------------|
| Relational DB | PostgreSQL 15 | Metadata, users, segments, detections | `shared/models.py` |
| Vector DB | Milvus 2.2.13 | CLIP frame embeddings | `shared/recording_clip_milvus.py` |
| Object Storage | MinIO | Video segments, preview images | `api/src/storage_service.py` |
| Message Broker | Redpanda | Edge pipeline events | `stream-processor/` |
| Milvus Metadata | etcd 3.5.7 | Milvus internal state | Managed by Milvus |

**Connection string (default):**
```
postgresql+psycopg2://svc:svcpass@postgres:5432/eventsdb
```

---

## 2. PostgreSQL Collections (Tables)

### 2.1 `cameras`

Surveillance camera registry.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PK, UUID default | Camera identifier |
| `name` | VARCHAR | | Display name |
| `location` | VARCHAR | nullable | Human-readable location |
| `latitude` | FLOAT | nullable | GPS latitude |
| `longitude` | FLOAT | nullable | GPS longitude |
| `type` | VARCHAR | default `surveillance` | Camera type |
| `source_type` | VARCHAR | default `cctv` | `webcam`, `cctv`, `upload` |
| `room_name` | VARCHAR | NOT NULL, default `digimitra-default-room` | Grouping |
| `stream_status` | VARCHAR | default `offline` | `offline`, `connecting`, `online`, `error` |
| `rtsp_url` | VARCHAR | nullable | RTSP stream URL |
| `camera_username` | VARCHAR | nullable | RTSP auth username |
| `camera_password` | VARCHAR | nullable | RTSP auth password |
| `ip_address` | VARCHAR | nullable | Camera IP |
| `port` | VARCHAR | nullable | Camera port |
| `channel` | VARCHAR | nullable | Channel number |
| `created_at` | TIMESTAMP | default UTC now | Creation time |

**Indexes:** Primary key on `id`

---

### 2.2 `users`

API authentication users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PK, UUID | User ID |
| `username` | VARCHAR | UNIQUE, INDEX | Login username |
| `password` | VARCHAR | | bcrypt hash |
| `role` | VARCHAR | | `admin`, `investigator`, `viewer` |

**Seed data:** `admin/admin` created on API startup if absent.

---

### 2.3 `recording_segments`

DVR and upload video segments — central anchor for AI pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PK, UUID | Segment ID |
| `camera_id` | VARCHAR | NOT NULL, INDEX | Camera reference |
| `recording_session_id` | VARCHAR | NOT NULL, INDEX | Session grouping |
| `bucket_name` | VARCHAR | NOT NULL | MinIO bucket |
| `object_key` | VARCHAR | NOT NULL | MinIO object path |
| `start_time` | TIMESTAMP | NOT NULL, INDEX | Segment start |
| `end_time` | TIMESTAMP | nullable | Segment end |
| `duration_seconds` | FLOAT | nullable | Computed duration |
| `file_type` | VARCHAR | NOT NULL | MIME type |
| `size_bytes` | BIGINT | nullable | File size |
| `ingest_source` | VARCHAR | NOT NULL, INDEX | Origin identifier |
| `created_at` | TIMESTAMP | default UTC now | Ingest time |
| `extra` | JSON | nullable | Extensible metadata |
| `ai_scan_started_at` | TIMESTAMP | nullable | AI processing start |
| `ai_scan_completed_at` | TIMESTAMP | nullable | AI processing complete |
| `ai_scan_last_error` | TEXT | nullable | Last processing error |

**Unique constraint:** `(bucket_name, object_key)` — `uq_recording_segments_bucket_object`

**Ingest source values:**
| Value | Origin |
|-------|--------|
| `browser_mediarecorder` | Live Feed Wall MediaRecorder |
| `file_upload` | User video file upload |
| Edge-derived | stream-processor (if configured) |

**Relationships:**
- One-to-many → `recording_detections` (CASCADE DELETE)

---

### 2.4 `recording_detections`

YOLO object detection results from offline AI processing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PK, UUID | Detection ID |
| `recording_segment_id` | VARCHAR | FK → recording_segments.id, CASCADE, INDEX | Parent segment |
| `camera_id` | VARCHAR | NOT NULL, INDEX | Camera reference |
| `object_type` | VARCHAR | NOT NULL, INDEX | COCO label name |
| `confidence` | FLOAT | NOT NULL | Detection confidence 0–1 |
| `timestamp_offset_ms` | INTEGER | NOT NULL | Offset from segment start (ms) |
| `bounding_box` | JSON | NOT NULL | `{x1, y1, x2, y2}` or similar |
| `preview_object_key` | VARCHAR | nullable | MinIO preview image key |
| `created_at` | TIMESTAMP | default UTC now | Insert time |

**Object types (from YOLO COCO filter):** `person`, `bicycle`, `car`, `motorcycle`, `bus`, `truck`, `backpack`

---

### 2.5 `events` (Legacy)

Edge pipeline events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PK, UUID | Event ID |
| `camera_id` | VARCHAR | FK → cameras.id | Camera reference |
| `timestamp` | TIMESTAMP | | Event time |
| `event_type` | VARCHAR | | Event classification |
| `confidence` | FLOAT | | Detection confidence |
| `bounding_box` | JSON | | Bounding box coordinates |
| `thumbnail_path` | VARCHAR | | Thumbnail storage path |
| `chunk_path` | VARCHAR | | Video chunk path |

---

## 3. Entity Relationships

```mermaid
erDiagram
    cameras ||--o{ events : has
    recording_segments ||--o{ recording_detections : contains
    cameras {
        string id PK
        string name
        float latitude
        float longitude
        string rtsp_url
        string source_type
    }
    users {
        string id PK
        string username UK
        string password
        string role
    }
    recording_segments {
        string id PK
        string camera_id
        string object_key
        datetime start_time
        string ingest_source
        datetime ai_scan_completed_at
    }
    recording_detections {
        string id PK
        string recording_segment_id FK
        string object_type
        float confidence
        int timestamp_offset_ms
        json bounding_box
    }
    events {
        string id PK
        string camera_id FK
        string event_type
        float confidence
    }
```

---

## 4. Milvus Schema

### 4.1 Collection: `recording_clip_frames`

**Purpose:** CLIP ViT-B-32 frame embeddings for semantic search.

| Field | Data Type | Description |
|-------|-----------|-------------|
| `id` | VARCHAR (PK) | Deterministic hash from segment + offset |
| `recording_segment_id` | VARCHAR | PostgreSQL segment FK |
| `camera_id` | VARCHAR | Camera reference |
| `timestamp_offset_ms` | INT64 | Frame offset in segment |
| `model_version` | VARCHAR | e.g., `clip-vit-b-32-st-v1` |
| `embedding` | FLOAT_VECTOR(512) | L2-normalized CLIP vector |

**Index configuration:**
| Property | Value |
|----------|-------|
| Index type | FLAT |
| Metric | IP (Inner Product) |
| Schema marker | `digimitra_semantic_v2_ip_flat_512` |

**Legacy collection:** `events` (used by edge-agent XCLIP pipeline)

### 4.2 Milvus Operations

| Operation | Module | Function |
|-----------|--------|----------|
| Create collection | `recording_clip_milvus.py` | `ensure_recording_clip_collection()` |
| Insert embeddings | `recording_clip_milvus.py` | `insert_frame_embeddings()` |
| Search | `recording_clip_search.py` | `run_semantic_search()` |
| Purge on delete | `recording_clip_search.py` | `purge_segment_clip_vectors()` |
| Orphan cleanup | `scripts/cleanup_orphan_recording_clip_vectors.py` | Maintenance script |

---

## 5. MinIO Storage

### 5.1 Bucket

**Default bucket:** `surveillance-bucket` (env: `MINIO_BUCKET`)

### 5.2 Object Key Patterns

| Pattern | Content |
|---------|---------|
| `video-chunks/{camera_id}/{timestamp}_{session}_{index}.webm` | DVR/upload segments |
| `detection-previews/{segment_id}/{detection_id}.jpg` | YOLO preview crops |

### 5.3 Access Pattern

- **Write:** API upload, ai-processor preview upload, edge-agent chunk upload
- **Read:** Presigned URLs via `MinIOStorageService.get_presigned_url()`
- **Delete:** Recording deletion cascades to MinIO object removal

**Public URL:** `MINIO_PUBLIC_URL` (default `http://localhost:9000`) — used for browser-accessible presigned URLs.

---

## 6. Redpanda Topics

| Topic | Producer | Consumer | Content |
|-------|----------|----------|---------|
| `region-1-events` | edge-agent | stream-processor | Detection events |
| `region-1-chunks` | edge-agent | stream-processor | Chunk metadata |

**Bootstrap:** `redpanda:9092` (internal), `localhost:19092` (external)

---

## 7. Data Flow

### 7.1 Recording Ingest Flow

```
Upload API → MinIO (object) + PostgreSQL (recording_segments row)
           → ai-processor polls unscanned segments
           → YOLO → recording_detections (PostgreSQL)
           → CLIP → recording_clip_frames (Milvus)
```

### 7.2 Search Flow

```
Semantic query → CLIP text encode → Milvus ANN search
              → PostgreSQL validity filter
              → Attach detections + thumbnails
              → Response to client
```

### 7.3 Deletion Flow

```
DELETE /recordings/{id}
  → MinIO delete object
  → Milvus purge vectors for segment
  → PostgreSQL delete segment (CASCADE detections)
```

---

## 8. Storage Strategy

| Data Type | Store | Rationale |
|-----------|-------|-----------|
| Structured metadata | PostgreSQL | ACID, joins, pagination |
| Video blobs | MinIO | Scalable object storage, presigned access |
| Vector embeddings | Milvus | Optimized ANN search |
| Preview images | MinIO | Co-located with video, presigned delivery |
| Live alerts | None (ephemeral) | Real-time only; not persisted |
| Edge events | PostgreSQL + Redpanda | Durable event log + queryable state |

---

## 9. Retention Policy

> **Assumption:** No automated retention/TTL is implemented in code.

| Store | Current Behavior | Recommended Production |
|-------|------------------|------------------------|
| MinIO | Indefinite until manual delete | Lifecycle policy (e.g., 90-day expiry) |
| PostgreSQL | Indefinite | Partition by date; archive old segments |
| Milvus | Vectors persist until segment delete | Sync with segment retention |
| Redpanda | Default topic retention | Configure `retention.ms` |

**Maintenance script:** `scripts/cleanup_orphan_recording_clip_vectors.py` — removes Milvus vectors without matching PostgreSQL segments.

---

## 10. Indexes Summary

### PostgreSQL

| Table | Index | Columns |
|-------|-------|---------|
| `users` | UNIQUE | `username` |
| `recording_segments` | INDEX | `camera_id`, `recording_session_id`, `start_time`, `ingest_source` |
| `recording_segments` | UNIQUE | `(bucket_name, object_key)` |
| `recording_detections` | INDEX | `recording_segment_id`, `camera_id`, `object_type` |

### Milvus

| Collection | Index | Type | Metric |
|------------|-------|------|--------|
| `recording_clip_frames` | embedding | FLAT | IP |

---

## 11. Schema Migration

**Mechanism:** SQLAlchemy `Base.metadata.create_all()` on startup + `shared/schema_compat.py` (`ensure_recording_schema`) for additive column migrations.

> **Assumption:** No Alembic migration framework is configured. Schema changes rely on startup hooks.

---

## Related Documents

- [05_SOFTWARE_DESIGN_DOCUMENT.md](./05_SOFTWARE_DESIGN_DOCUMENT.md)
- [07_API_DOCUMENTATION.md](./07_API_DOCUMENTATION.md)
- [data-flow/README.md](./data-flow/README.md)
