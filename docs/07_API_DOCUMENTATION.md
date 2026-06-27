# API Documentation

**Document:** 07 — REST & WebSocket API Reference  
**Base URL:** `http://localhost:8000` (development)  
**API Prefix:** `/api/v1`  
**OpenAPI:** `http://localhost:8000/docs`

---

## Authentication Overview

| Endpoint Type | Auth Method |
|---------------|-------------|
| Public | None (`POST /token`) |
| Protected REST | `Authorization: Bearer <JWT>` |
| WebSocket | `?token=<JWT>` query parameter |
| Internal | `X-Live-Alert-Secret: <secret>` header |

**Token acquisition:** `POST /api/v1/token` with `application/x-www-form-urlencoded` body (`username`, `password`).

**Dev mode:** When `ALLOW_ANY_LOGIN=true`, any username is accepted; role defaults to existing user role or `admin`.

---

## API Summary Table

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/v1/token` | None | Obtain JWT |
| POST | `/api/v1/users` | Admin JWT | Create user |
| POST | `/api/v1/cameras` | None* | Create camera |
| GET | `/api/v1/cameras` | None* | List cameras |
| PATCH | `/api/v1/cameras/{id}` | None* | Update camera |
| DELETE | `/api/v1/cameras/{id}` | None* | Delete camera |
| POST | `/api/v1/recordings/upload` | JWT | Browser segment upload |
| POST | `/api/v1/recordings/upload-file` | JWT | Video file upload |
| GET | `/api/v1/recordings` | JWT | List recordings |
| GET | `/api/v1/cameras/{id}/recordings` | JWT | Camera recordings |
| GET | `/api/v1/recordings/{id}` | JWT | Get recording |
| GET | `/api/v1/recordings/{id}/playback` | JWT | Presigned playback URL |
| DELETE | `/api/v1/recordings/{id}` | JWT | Delete recording |
| GET | `/api/v1/detections` | JWT | List detections |
| GET | `/api/v1/detections/{id}` | JWT | Get detection |
| GET | `/api/v1/detections/{id}/playback` | JWT | Detection seek playback |
| GET | `/api/v1/semantic-search/status` | JWT | Semantic search readiness |
| POST | `/api/v1/semantic-search` | JWT | Natural-language search |
| GET | `/api/v1/events` | JWT | Legacy events (limit 100) |
| POST | `/api/v1/search/semantic` | JWT | Legacy embedding search |
| POST | `/api/v1/search/text` | JWT | Placeholder text search |
| POST | `/api/v1/ai/ask` | JWT | AI assistant (mock) |
| WS | `/api/v1/live/alerts` | JWT query | Live alert stream |
| POST | `/api/v1/internal/live-alerts/publish` | Secret | Agent alert broadcast |
| POST | `/api/v1/live/frames/{camera_id}` | JWT | Browser JPEG frame proxy |

> *Camera CRUD endpoints currently have no auth dependency in `main.py`. **Assumption:** Auth should be added for production.

---

## Endpoints

### POST `/api/v1/token`

**Purpose:** OAuth2 password flow login; returns JWT access token.

**Authentication:** None

**Request:** `Content-Type: application/x-www-form-urlencoded`

| Field | Type | Required |
|-------|------|----------|
| username | string | Yes |
| password | string | Yes (ignored if `ALLOW_ANY_LOGIN=true`) |

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Errors:**
| Code | Detail |
|------|--------|
| 400 | Username required |
| 401 | Incorrect username or password |

---

### POST `/api/v1/users`

**Purpose:** Create a new user (admin only).

**Authentication:** Bearer JWT (role: `admin`)

**Request Body:**
```json
{
  "username": "investigator1",
  "password": "securepass",
  "role": "investigator"
}
```

**Response 201:**
```json
{
  "id": "uuid-string",
  "username": "investigator1",
  "role": "investigator"
}
```

**Errors:** 400 (username exists), 403 (insufficient privileges)

---

### POST `/api/v1/cameras`

**Purpose:** Register a new surveillance camera.

**Request Body:**
```json
{
  "name": "Main Street Cam 1",
  "location": "Main St & 5th Ave",
  "type": "surveillance",
  "source_type": "cctv",
  "room_name": "digimitra-default-room",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "rtsp_url": "rtsp://192.168.1.100:554/stream",
  "username": "admin",
  "password": "campass",
  "ip_address": "192.168.1.100",
  "port": "554",
  "channel": "1"
}
```

**Response 201:** Camera object with `id`, `stream_status: "online"`, `created_at`.

---

### GET `/api/v1/cameras`

**Purpose:** List all registered cameras.

**Response 200:** Array of Camera objects.

---

### PATCH `/api/v1/cameras/{camera_id}`

**Purpose:** Update camera fields.

**Request Body (partial):**
```json
{
  "name": "Updated Name",
  "location": "New Location",
  "stream_status": "offline"
}
```

---

### DELETE `/api/v1/cameras/{camera_id}`

**Purpose:** Remove camera from registry.

**Response:** 204 No Content  
**Errors:** 404 Camera not found

---

### POST `/api/v1/recordings/upload`

**Purpose:** Upload browser MediaRecorder video segment.

**Authentication:** Bearer JWT

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | binary | Yes | Video blob (webm/mp4) |
| camera_id | string | Yes | Camera identifier |
| recording_session_id | string | Yes | Session UUID |
| segment_started_at | string | Yes | ISO-8601 timestamp |
| mime_type | string | No | Default `video/webm` |
| camera_name | string | No | Display name |
| segment_index | int | No | Monotonic segment index |
| segment_window_ms | int | No | Timeslice duration |
| ingest_mode | string | No | Default `continuous_surveillance` |

**Response 200:**
```json
{
  "recording_id": "uuid",
  "object_key": "video-chunks/cam-1/2026-06-27T10:00:00.webm",
  "camera_id": "cam-1",
  "recording_session_id": "session-uuid",
  "bucket": "surveillance-bucket",
  "segment_started_at": "2026-06-27T10:00:00Z",
  "size_bytes": 1048576
}
```

**Errors:** 400 (empty body, bad timestamp), 503 (storage unavailable)

---

### POST `/api/v1/recordings/upload-file`

**Purpose:** Upload user-selected video file for retroactive analysis.

**Authentication:** Bearer JWT

**Request:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| file | binary | Yes |
| camera_id | string | Yes |
| camera_name | string | No |
| recording_session_id | string | No (auto-generated) |
| segment_started_at | string | No (defaults to now) |
| mime_type | string | No |

**Supported formats:** MP4, MOV, AVI, WebM

**Errors:** 400 (invalid format), 413 (file too large), 503 (storage unavailable)

---

### GET `/api/v1/recordings`

**Purpose:** Paginated recording segment list.

**Authentication:** Bearer JWT

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| camera_id | string | — | Filter by camera |
| start | datetime | — | Range start |
| end | datetime | — | Range end |
| ingest_source | string | — | e.g., `browser_mediarecorder` |
| recording_session_id | string | — | Filter by session |
| limit | int | 50 | 1–200 |
| offset | int | 0 | Pagination offset |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "camera_id": "cam-1",
      "recording_session_id": "session-uuid",
      "bucket_name": "surveillance-bucket",
      "object_key": "video-chunks/cam-1/...",
      "start_time": "2026-06-27T10:00:00",
      "end_time": "2026-06-27T10:00:30",
      "duration_seconds": 30.0,
      "file_type": "video/webm",
      "size_bytes": 1048576,
      "ingest_source": "browser_mediarecorder",
      "created_at": "2026-06-27T10:00:31",
      "extra": {},
      "preview_url": "http://localhost:9000/surveillance-bucket/...?X-Amz-..."
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

---

### GET `/api/v1/recordings/{recording_id}/playback`

**Purpose:** Generate presigned MinIO URL for video playback.

**Query:** `expiry_hours` (1–72, default 1)

**Response 200:**
```json
{
  "recording_id": "uuid",
  "url": "http://localhost:9000/surveillance-bucket/...",
  "bucket_name": "surveillance-bucket",
  "object_key": "video-chunks/...",
  "expires_in_seconds": 3600
}
```

---

### DELETE `/api/v1/recordings/{recording_id}`

**Purpose:** Delete recording from MinIO, Milvus, and PostgreSQL.

**Response:** 204 No Content

---

### GET `/api/v1/detections`

**Purpose:** List YOLO detection results.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| camera_id | string | Filter |
| object_type | string | e.g., `person`, `car` |
| recording_segment_id | string | Filter |
| event_after | datetime | Absolute time lower bound |
| event_before | datetime | Absolute time upper bound |
| limit | int | 1–200, default 50 |
| offset | int | Default 0 |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "recording_segment_id": "seg-uuid",
      "camera_id": "cam-1",
      "object_type": "car",
      "confidence": 0.87,
      "timestamp_offset_ms": 6000,
      "bounding_box": {"x1": 100, "y1": 200, "x2": 300, "y2": 400},
      "created_at": "2026-06-27T10:05:00",
      "absolute_event_time": "2026-06-27T10:00:06",
      "preview_url": "http://localhost:9000/..."
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

---

### GET `/api/v1/detections/{detection_id}/playback`

**Purpose:** Presigned segment URL with seek offset for detection playback.

**Response 200:**
```json
{
  "detection_id": "uuid",
  "recording_id": "seg-uuid",
  "timestamp_offset_ms": 6000,
  "absolute_event_time": "2026-06-27T10:00:06",
  "url": "http://localhost:9000/...",
  "bucket_name": "surveillance-bucket",
  "object_key": "video-chunks/...",
  "expires_in_seconds": 3600
}
```

---

### GET `/api/v1/semantic-search/status`

**Purpose:** Check if semantic search is configured and Milvus index is ready.

**Response 200:**
```json
{
  "configured": true,
  "index_ready": true,
  "detail": null
}
```

---

### POST `/api/v1/semantic-search`

**Purpose:** Natural-language video frame search using CLIP + Milvus.

**Request Body:**
```json
{
  "query": "red car near intersection",
  "top_k": 20,
  "camera_id": "cam-1"
}
```

**Response 200:**
```json
{
  "results": [
    {
      "vector_id": "hash-id",
      "recording_segment_id": "seg-uuid",
      "camera_id": "cam-1",
      "timestamp_offset_ms": 12000,
      "similarity": 0.34,
      "model_version": "clip-vit-b-32-st-v1",
      "thumbnail_url": "http://localhost:9000/...",
      "match_detections": [],
      "event_label": "Vehicle detected",
      "event_labels": ["Vehicle detected"],
      "event_severity": "low"
    }
  ],
  "enabled": true,
  "detail": null
}
```

**Response when indexing in progress:**
```json
{
  "results": [],
  "enabled": true,
  "detail": "AI indexing in progress..."
}
```

---

### GET `/api/v1/events`

**Purpose:** Legacy events from edge pipeline (limited to 100).

**Response 200:** Array of Event objects.

---

### POST `/api/v1/search/semantic`

**Purpose:** Legacy embedding-based search (requires pre-computed embedding vector).

**Request:**
```json
{
  "embedding": [0.1, 0.2, ...],
  "top_k": 10
}
```

---

### POST `/api/v1/search/text`

**Purpose:** Placeholder text search (not implemented).

**Response:**
```json
{
  "message": "Search results for 'query' are not yet implemented.",
  "results": []
}
```

---

### POST `/api/v1/ai/ask`

**Purpose:** AI assistant query (mock implementation).

**Request:**
```json
{
  "query": "Show me cars from yesterday"
}
```

**Response:**
```json
{
  "answer": "I found 2 events involving cars...",
  "data": [
    {"timestamp": "2024-05-15T14:30:10Z", "camera_id": "cam-002", "event_type": "vehicle_detected"}
  ]
}
```

---

## WebSocket API

### WS `/api/v1/live/alerts?token={jwt}`

**Purpose:** Real-time live alert stream.

**Authentication:** JWT in query string

**Server → Client messages:**

Connection established:
```json
{
  "type": "connection",
  "status": "connected",
  "message": "Live AI Connected"
}
```

Live alert:
```json
{
  "type": "live_alert",
  "camera_id": "1",
  "alert_type": "crowd_gathering",
  "severity": "high",
  "message": "Crowd of 10 persons detected",
  "timestamp": "2026-06-27T12:00:00Z",
  "track_ids": [1, 2, 3],
  "bboxes": [[100, 100, 200, 200]],
  "alert_id": "uuid"
}
```

**Close codes:** 4401 — missing/invalid token

---

### POST `/api/v1/internal/live-alerts/publish`

**Purpose:** Internal endpoint for live-detection-agent to broadcast alerts.

**Authentication:** `X-Live-Alert-Secret` header

**Request Body:** Live alert JSON (see WebSocket message format)

**Response 200:**
```json
{
  "ok": true,
  "clients": 3
}
```

---

### POST `/api/v1/live/frames/{camera_id}`

**Purpose:** Proxy browser JPEG frame to live-detection-agent.

**Authentication:** Bearer JWT

**Request:** Raw JPEG body (`Content-Type: image/jpeg`)

**Response 200:**
```json
{
  "ok": true,
  "camera_id": "1"
}
```

**Errors:** 400 (empty body), 503 (agent unavailable)

---

## Global Error Responses

| Code | Description |
|------|-------------|
| 400 | Bad Request — validation failure |
| 401 | Unauthorized — invalid/missing JWT or secret |
| 403 | Forbidden — insufficient role |
| 404 | Not Found |
| 413 | Payload Too Large — file upload size exceeded |
| 500 | Internal Server Error — database error (JSON body with `detail`, `message`) |
| 503 | Service Unavailable — MinIO, Milvus, or live agent down |

**Database error format:**
```json
{
  "detail": "Database error",
  "message": "connection refused..."
}
```

---

## Related Documents

- [04_SRS.md](./04_SRS.md) — Functional requirements
- [08_DATABASE_DOCUMENTATION.md](./08_DATABASE_DOCUMENTATION.md) — Data models
- [sequences/README.md](./sequences/README.md) — API interaction sequences
