# Use Cases — DigiMitra City

**Document:** 03 — Use Case Specification  
**Standard:** IEEE 830 / UML Use Case Model

---

## 1. Actors

| Actor | Type | Description |
|-------|------|-------------|
| **Operator** | Primary | Monitors live feeds, responds to alerts, searches recordings |
| **Investigator** | Primary | Reviews detections, runs semantic search, exports evidence |
| **Administrator** | Primary | Manages cameras, users, system configuration |
| **Viewer** | Secondary | Read-only access to dashboards and recordings |
| **Browser Webcam** | System | Provides live JPEG frames and MediaRecorder segments |
| **RTSP Camera** | System | CCTV source ingested by live-detection-agent |
| **AI Processor** | System | Offline YOLO + CLIP worker (`ai-processor`) |
| **Live Detection Agent** | System | Real-time YOLO + ByteTrack + rules (`live-detection-agent`) |
| **AWS Cognito** | External | Frontend identity provider |
| **MinIO** | External | S3-compatible object storage |
| **Milvus** | External | Vector similarity search engine |

---

## 2. Use Case Summary Table

| ID | Use Case | Actor(s) | Priority |
|----|----------|----------|----------|
| UC-01 | User Registration | Operator | High |
| UC-02 | User Login | Operator, Investigator, Admin, Viewer | High |
| UC-03 | Obtain API Token | Operator | High |
| UC-04 | Manage Cameras | Administrator | High |
| UC-05 | Continuous Webcam Recording | Operator, Browser Webcam | High |
| UC-06 | Upload Video File | Operator | Medium |
| UC-07 | View Recording History | Operator, Investigator | High |
| UC-08 | Playback Recording | Operator, Investigator | High |
| UC-09 | Offline AI Indexing | AI Processor | High |
| UC-10 | Semantic Video Search | Investigator | High |
| UC-11 | View Detections / Events | Operator, Investigator | High |
| UC-12 | Live Feed Monitoring | Operator | High |
| UC-13 | Receive Live Alert | Operator, Live Detection Agent | High |
| UC-14 | Push Browser Live Frames | Browser Webcam, Operator | Medium |
| UC-15 | Delete Recording | Administrator | Low |
| UC-16 | AI Assistant Query | Operator | Low |
| UC-17 | View Camera Map | Operator | Medium |
| UC-18 | Edge Video Ingest | Edge Agent | Low |

---

## 3. Detailed Use Cases

### UC-01: User Registration

| Field | Value |
|-------|-------|
| **Actors** | Operator (prospective user) |
| **Preconditions** | Cognito User Pool configured; `/register` accessible |
| **Postconditions** | User account created; email verification pending |

**Main Flow:**
1. User navigates to `/register`.
2. User enters full name, email, and password.
3. System calls `signUpWithEmail()` via AWS Amplify (`ui-police/lib/cognito.ts`).
4. Cognito sends verification code to email.
5. User redirected to `/verify`.

**Alternative Flow — A1: Email already registered**
- 3a. Cognito returns error; UI displays message.

**Exception Flow — E1: Missing Cognito env vars**
- 1a. `configureCognito()` throws; registration unavailable.

---

### UC-02: User Login

| Field | Value |
|-------|-------|
| **Actors** | Operator, Investigator, Administrator, Viewer |
| **Preconditions** | Account verified; Cognito configured |
| **Postconditions** | `dm_auth=1` cookie set; user redirected to dashboard |

**Main Flow:**
1. User navigates to `/login`.
2. User enters email and password.
3. `signInWithEmail()` authenticates via Cognito.
4. `auth-provider.tsx` sets `dm_auth=1` cookie.
5. `middleware.ts` allows access to protected routes.
6. User lands on dashboard (`/`).

**Alternative Flow — A1: Unverified account**
- 3a. Cognito returns `UserNotConfirmedException`; redirect to `/verify`.

**Exception Flow — E1: No session cookie**
- 6a. `middleware.ts` redirects unauthenticated requests to `/login`.

---

### UC-03: Obtain API Token

| Field | Value |
|-------|-------|
| **Actors** | Operator (via frontend) |
| **Preconditions** | User logged into dashboard; API reachable |
| **Postconditions** | JWT stored for surveillance API calls |

**Main Flow:**
1. Frontend calls `fetchSurveillanceAccessToken(username)` (`surveillance-api.ts`).
2. POST `/api/v1/token` with `application/x-www-form-urlencoded` body.
3. API validates credentials (or `ALLOW_ANY_LOGIN=true` dev bypass).
4. API returns `{ access_token, token_type: "bearer" }` (30-min expiry).
5. Token used in `Authorization: Bearer` header for subsequent API calls.

---

### UC-04: Manage Cameras

| Field | Value |
|-------|-------|
| **Actors** | Administrator |
| **Preconditions** | API token with admin role |
| **Postconditions** | Camera registry updated in PostgreSQL `cameras` table |

**Main Flow — Create:**
1. Admin submits camera form (name, location, source_type, RTSP URL, coordinates).
2. POST `/api/v1/cameras`.
3. API creates `Camera` row with `stream_status: connecting` → `online`.
4. Camera appears in dashboard and live-detection-agent registry.

**Main Flow — Update/Delete:**
- PATCH `/api/v1/cameras/{id}` — update name, location, stream_status
- DELETE `/api/v1/cameras/{id}` — remove camera
- GET `/api/v1/cameras` — list all cameras

---

### UC-05: Continuous Webcam Recording

| Field | Value |
|-------|-------|
| **Actors** | Operator, Browser Webcam |
| **Preconditions** | Webcam permission granted; API token available |
| **Postconditions** | Video segments in MinIO; `recording_segments` rows created |

**Main Flow:**
1. Operator opens Live Feed Wall; allows webcam access.
2. `use-webcam-recording.ts` starts MediaRecorder with timeslice (e.g., 30s).
3. On each segment blob, frontend calls `uploadRecordingBlob()`.
4. POST `/api/v1/recordings/upload` with multipart form (file, camera_id, session_id, timestamps).
5. API uploads to MinIO `video-chunks/{camera_id}/...`.
6. API registers `recording_segments` row with `ingest_source: browser_mediarecorder`.
7. `ai-processor` picks up unscanned segment asynchronously.

**Alternative Flow — A1: Storage unavailable**
- 5a. API returns 503; frontend logs error, retries on next segment.

---

### UC-06: Upload Video File

| Field | Value |
|-------|-------|
| **Actors** | Operator |
| **Preconditions** | Valid video file (MP4/MOV/AVI/WebM); under size limit |
| **Postconditions** | File stored; queued for AI processing |

**Main Flow:**
1. Operator selects file in `video-file-upload.tsx`.
2. POST `/api/v1/recordings/upload-file`.
3. API validates format and size (`video_file_upload.max_upload_bytes()`).
4. File uploaded to MinIO; segment registered with `ingest_source: file_upload`.
5. UI shows upload success; AI indexing begins when `ai-processor` claims segment.

**Exception Flow — E1: File too large**
- 3a. API returns 413 Request Entity Too Large.

---

### UC-07: View Recording History

| Field | Value |
|-------|-------|
| **Actors** | Operator, Investigator |
| **Preconditions** | Authenticated; recordings exist |
| **Postconditions** | Paginated list displayed with thumbnails |

**Main Flow:**
1. User navigates to Recordings section.
2. GET `/api/v1/recordings?limit=50&offset=0` (optional filters: camera_id, date range).
3. API attaches presigned preview URLs via `recording_thumbnail_service`.
4. UI renders `recordings-history.tsx` with thumbnails and metadata.

---

### UC-08: Playback Recording

| Field | Value |
|-------|-------|
| **Actors** | Operator, Investigator |
| **Preconditions** | Recording segment exists in MinIO |
| **Postconditions** | Video plays in browser player |

**Main Flow:**
1. User selects recording.
2. GET `/api/v1/recordings/{id}/playback?expiry_hours=1`.
3. API generates presigned MinIO URL.
4. `recording-playback-player.tsx` loads URL in HTML5 video element.

---

### UC-09: Offline AI Indexing

| Field | Value |
|-------|-------|
| **Actors** | AI Processor (system) |
| **Preconditions** | Unscanned `recording_segments` exist; MinIO + Milvus available |
| **Postconditions** | Detections in PostgreSQL; CLIP vectors in Milvus |

**Main Flow:**
1. `ai-processor/scheduler.py` polls for segments where `ai_scan_completed_at IS NULL`.
2. Downloads segment from MinIO.
3. Extracts frames at `AI_FRAME_INTERVAL_SEC` (default 3s).
4. Runs YOLOv8n detection per frame → `recording_detections` rows.
5. Runs CLIP embedding per N frames → Milvus `recording_clip_frames` insert.
6. Sets `ai_scan_completed_at` on segment.

**Exception Flow — E1: Processing failure**
- 6a. Error stored in `ai_scan_last_error`; segment marked complete to avoid infinite retry.

---

### UC-10: Semantic Video Search

| Field | Value |
|-------|-------|
| **Actors** | Investigator |
| **Preconditions** | Milvus index ready; segments indexed |
| **Postconditions** | Ranked search results with thumbnails and playback offsets |

**Main Flow:**
1. User enters natural-language query in Search section.
2. GET `/api/v1/semantic-search/status` (optional readiness check).
3. POST `/api/v1/semantic-search` with `{ query, top_k, camera_id? }`.
4. API encodes query with CLIP text encoder.
5. Milvus inner-product search over `recording_clip_frames`.
6. Results filtered/deduped against PostgreSQL validity.
7. Thumbnails and matched detections attached.
8. UI displays results with seek-to-offset playback.

**Alternative Flow — A1: Indexing in progress**
- 7a. Response includes `detail: "AI indexing in progress..."`.

---

### UC-11: View Detections / Events

| Field | Value |
|-------|-------|
| **Actors** | Operator, Investigator |
| **Preconditions** | AI processing completed for segments |
| **Postconditions** | Detection list with bounding boxes and preview images |

**Main Flow:**
1. User opens Events & Alerts section.
2. GET `/api/v1/detections?limit=50` (filters: camera_id, object_type, date range).
3. API returns detections with `absolute_event_time` and presigned preview URLs.
4. User clicks detection → GET `/api/v1/detections/{id}/playback` for seek playback.

---

### UC-12: Live Feed Monitoring

| Field | Value |
|-------|-------|
| **Actors** | Operator |
| **Preconditions** | `NEXT_PUBLIC_ENABLE_LIVE_WS=true`; live-detection-agent running |
| **Postconditions** | Live tiles display with optional bbox overlays |

**Main Flow:**
1. User opens Live Feed Wall (`live-feed-wall.tsx`).
2. WebSocket connects to `/api/v1/live/alerts?token={jwt}`.
3. Browser pushes JPEG frames at ~1 FPS via POST `/api/v1/live/frames/{camera_id}`.
4. Live agent runs YOLO + ByteTrack; scene status updated.
5. Tiles render with live bbox overlay when detections present.

---

### UC-13: Receive Live Alert

| Field | Value |
|-------|-------|
| **Actors** | Operator, Live Detection Agent |
| **Preconditions** | WebSocket connected; rule threshold exceeded |
| **Postconditions** | Alert displayed on affected camera tile |

**Main Flow:**
1. Live agent evaluates `shared/live_rules.py` (crowd/congestion/wrong-way).
2. Agent POST `/api/v1/internal/live-alerts/publish` with `X-Live-Alert-Secret`.
3. `LiveAlertConnectionManager.broadcast()` sends JSON to all WS clients.
4. `use-live-alert-websocket.ts` receives `live_alert` message.
5. Affected tile highlights with severity color and bbox overlay.

**Exception Flow — E1: Cooldown active**
- 1a. Rule engine suppresses duplicate alert within `LIVE_ALERT_COOLDOWN_SEC`.

---

### UC-14: Push Browser Live Frames

| Field | Value |
|-------|-------|
| **Actors** | Browser Webcam |
| **Preconditions** | Webcam active; JWT valid; camera_id in `LIVE_BROWSER_CAMERA_IDS` |
| **Postconditions** | Frame ingested by live-detection-agent |

**Main Flow:**
1. `use-live-frame-pusher.ts` captures canvas JPEG at configured FPS.
2. POST `/api/v1/live/frames/{camera_id}` with raw JPEG body.
3. API proxies to `live-detection-agent:8765/ingest/frame/{camera_id}`.
4. Agent queues frame for YOLO inference.

> **Note:** This path is **separate** from MediaRecorder DVR upload (UC-05).

---

### UC-15: Delete Recording

| Field | Value |
|-------|-------|
| **Actors** | Administrator |
| **Preconditions** | Recording exists |
| **Postconditions** | MinIO object deleted; Milvus vectors purged; DB row removed |

**Main Flow:**
1. DELETE `/api/v1/recordings/{id}`.
2. API deletes MinIO object.
3. `recording_clip_search.purge_segment_clip_vectors()` removes Milvus vectors.
4. PostgreSQL row deleted (cascade deletes detections).

---

### UC-16: AI Assistant Query

| Field | Value |
|-------|-------|
| **Actors** | Operator |
| **Preconditions** | Authenticated |
| **Postconditions** | Text response displayed |

**Main Flow:**
1. User submits question in AI Agent panel.
2. POST `/api/v1/ai/ask` with `{ query }`.
3. `AIService.answer_question()` returns mock response.

> **Limitation:** Current implementation is mocked (`api/src/ai_service.py`). Not a production LLM integration.

---

## 4. Use Case Diagram

See [uml/README.md](./uml/README.md#use-case-diagram) for Mermaid and PlantUML renderings.

---

## Related Documents

- [04_SRS.md](./04_SRS.md) — Requirements derived from these use cases
- [09_USER_MANUAL.md](./09_USER_MANUAL.md) — Operator procedures
- [sequences/README.md](./sequences/README.md) — Interaction sequences
