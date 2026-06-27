# Sequence Diagrams — DigiMitra City

**Document:** Interaction Sequences for Key Flows  
**Format:** Mermaid + PlantUML

---

## 1. User Login

Frontend Cognito authentication with cookie-based route protection.

### Mermaid

```mermaid
sequenceDiagram
    actor User
    participant UI as ui-police
    participant MW as middleware.ts
    participant COG as AWS Cognito
    participant Auth as auth-provider.tsx

    User->>UI: Navigate to /login
    User->>UI: Enter email + password
    UI->>COG: signInWithEmail()
    COG-->>UI: Auth session
    UI->>Auth: Set dm_auth=1 cookie
    User->>UI: Navigate to /
    UI->>MW: Request /
    MW->>MW: Check dm_auth cookie
    MW-->>UI: Allow access
    UI-->>User: Render Dashboard
```

### PlantUML

```plantuml
@startuml UserLogin
actor User
participant "ui-police" as UI
participant "middleware.ts" as MW
participant "AWS Cognito" as COG

User -> UI : Enter credentials
UI -> COG : signInWithEmail()
COG --> UI : session
UI -> UI : Set dm_auth cookie
User -> UI : Navigate to /
UI -> MW : request /
MW --> UI : allow
@enduml
```

---

## 2. Authentication (API JWT)

Separate surveillance API token acquisition.

### Mermaid

```mermaid
sequenceDiagram
    participant UI as ui-police
    participant API as FastAPI api
    participant Auth as auth.py
    participant PG as PostgreSQL

    UI->>API: POST /api/v1/token (username, password)
    API->>Auth: allow_any_login()?
    alt Dev mode (ALLOW_ANY_LOGIN=true)
        Auth-->>API: Accept any username
    else Production
        API->>PG: Query User by username
        API->>Auth: verify_password()
    end
    Auth->>Auth: create_access_token(sub, role, exp=30min)
    API-->>UI: {access_token, token_type: bearer}
    UI->>UI: Store token for API calls
```

### PlantUML

```plantuml
@startuml APIAuthentication
participant "ui-police" as UI
participant "api" as API
participant "auth.py" as AUTH
database PostgreSQL as PG

UI -> API : POST /api/v1/token
API -> AUTH : validate credentials
AUTH -> PG : query user
AUTH -> AUTH : create_access_token()
API --> UI : JWT
@enduml
```

---

## 3. Video Upload (Browser Recording)

### Mermaid

```mermaid
sequenceDiagram
    actor Op as Operator
    participant UI as ui-police
    participant MR as use-webcam-recording
    participant API as FastAPI api
    participant Store as MinIOStorageService
    participant MINIO as MinIO
    participant Rec as recording_service
    participant PG as PostgreSQL

    Op->>UI: Allow webcam on Live Feed Wall
    UI->>MR: Start MediaRecorder (timeslice)
    loop Every segment window
        MR->>MR: ondataavailable(blob)
        MR->>UI: uploadRecordingBlob()
        UI->>API: POST /recordings/upload (JWT, multipart)
        API->>Store: upload_video_chunk()
        Store->>MINIO: PUT object
        MINIO-->>Store: object_key
        API->>Rec: register_segment()
        Rec->>PG: INSERT recording_segments
        PG-->>API: recording_id
        API-->>UI: RecordingUploadResponse
    end
```

### PlantUML

```plantuml
@startuml VideoUpload
actor Operator
participant "ui-police" as UI
participant "api" as API
database MinIO as MI
database PostgreSQL as PG

Operator -> UI : Start recording
loop each segment
  UI -> API : POST /recordings/upload
  API -> MI : PUT video chunk
  API -> PG : INSERT recording_segments
  API --> UI : recording_id
end
@enduml
```

---

## 4. Live Streaming (Frame Push + WebSocket)

### Mermaid

```mermaid
sequenceDiagram
    participant UI as ui-police
    participant WS as use-live-alert-websocket
    participant FP as use-live-frame-pusher
    participant API as FastAPI api
    participant LDA as live-detection-agent
    participant Hub as LiveAlertConnectionManager

    UI->>WS: Connect WS /live/alerts?token=jwt
    Hub-->>WS: {type: connection, status: connected}

    par Frame push loop (~1 FPS)
        FP->>FP: Capture canvas JPEG
        FP->>API: POST /live/frames/{camera_id}
        API->>LDA: POST /ingest/frame/{camera_id}
        LDA->>LDA: Queue frame for pipeline
    and Pipeline loop
        LDA->>LDA: YOLO + ByteTrack
        LDA->>LDA: live_rules.evaluate()
        alt Alert triggered
            LDA->>API: POST /internal/live-alerts/publish
            API->>Hub: broadcast(alert)
            Hub->>WS: {type: live_alert, ...}
            WS->>UI: Update tile overlay
        end
    end
```

### PlantUML

```plantuml
@startuml LiveStreaming
participant "ui-police" as UI
participant "api" as API
participant "live-detection-agent" as LDA

UI -> API : WS connect /live/alerts
loop 1 FPS
  UI -> API : POST /live/frames
  API -> LDA : proxy JPEG
  LDA -> LDA : YOLO+ByteTrack+Rules
  LDA -> API : POST publish alert
  API -> UI : WS live_alert
end
@enduml
```

---

## 5. AI Inference (Offline)

### Mermaid

```mermaid
sequenceDiagram
    participant Sched as scheduler.py
    participant PG as PostgreSQL
    participant MINIO as MinIO
    participant YOLO as detector.py
    participant CLIP as clip_embedder.py
    participant MV as Milvus

    loop run_forever
        Sched->>PG: SELECT unscanned segment ORDER BY start_time
        alt Segment found
            Sched->>PG: SET ai_scan_started_at
            Sched->>MINIO: Download object
            MINIO-->>Sched: video bytes
            loop Each sampled frame (3s interval)
                Sched->>YOLO: run_detection(frame)
                YOLO-->>Sched: detections[]
                Sched->>PG: INSERT recording_detections
                Sched->>CLIP: embed_frame(frame)
                CLIP-->>Sched: 512-dim vector
                Sched->>MV: insert_frame_embeddings()
            end
            Sched->>PG: SET ai_scan_completed_at
        else Queue empty
            Sched->>Sched: sleep(AI_IDLE_POLL_SEC)
        end
    end
```

### PlantUML

```plantuml
@startuml AIInference
participant scheduler as SCHED
database PostgreSQL as PG
database MinIO as MI
participant detector as YOLO
participant clip_embedder as CLIP
database Milvus as MV

SCHED -> PG : pick unscanned segment
SCHED -> MI : download video
loop each frame
  SCHED -> YOLO : detect
  SCHED -> PG : store detection
  SCHED -> CLIP : embed
  SCHED -> MV : insert vector
end
SCHED -> PG : mark complete
@enduml
```

---

## 6. Alert Generation

### Mermaid

```mermaid
sequenceDiagram
    participant LDA as live-detection-agent
    participant Track as tracker.py
    participant Rules as live_rules.py
    participant Alert as alert_client.py
    participant API as api live_alerts_hub
    participant Hub as ConnectionManager
    participant UI as ui-police

    LDA->>Track: update(detections, frame)
    Track-->>LDA: TrackedObject[]
    LDA->>Rules: evaluate(camera_id, tracks, config)
    
    alt Crowd: persons >= min for duration
        Rules-->>LDA: LiveAlert(crowd_gathering)
    else Congestion: slow vehicles >= min
        Rules-->>LDA: LiveAlert(traffic_congestion)
    else Wrong-way: velocity dot < threshold
        Rules-->>LDA: LiveAlert(wrong_way_driving)
  else No alert / cooldown active
        Rules-->>LDA: None
    end

    opt Alert emitted
        LDA->>Alert: publish(alert_dict)
        Alert->>API: POST /internal/live-alerts/publish
        Note over API: X-Live-Alert-Secret header
        API->>Hub: broadcast(alert)
        Hub->>UI: WebSocket send_json
    end
```

---

## 7. Notification (WebSocket Broadcast)

### Mermaid

```mermaid
sequenceDiagram
    participant LDA as live-detection-agent
    participant API as api
    participant Hub as LiveAlertConnectionManager
    participant WS1 as Client 1 (ui-police)
    participant WS2 as Client 2 (ui-police)

    LDA->>API: POST /internal/live-alerts/publish
    Note right of LDA: X-Live-Alert-Secret
    API->>API: _check_internal_secret()
    API->>Hub: broadcast(alert_json)
    
    Hub->>WS1: send_json(live_alert)
    Hub->>WS2: send_json(live_alert)
    Hub-->>API: sent count = 2
    API-->>LDA: {ok: true, clients: 2}

    WS1->>WS1: use-live-alert-websocket handler
    WS1->>WS1: Highlight tile + bbox overlay
```

---

## 8. Database Storage

### Mermaid

```mermaid
sequenceDiagram
    participant API as api
    participant Rec as recording_service
    participant PG as PostgreSQL
    participant MINIO as MinIO
    participant AIP as ai-processor
    participant Det as detector
    participant MV as Milvus

    Note over API,PG: Upload Phase
    API->>MINIO: PUT video-chunks/{camera_id}/...
    API->>Rec: register_segment()
    Rec->>PG: INSERT recording_segments

    Note over AIP,MV: Indexing Phase
    AIP->>PG: SELECT WHERE ai_scan_completed_at IS NULL
    AIP->>PG: UPDATE ai_scan_started_at
    AIP->>MINIO: GET object
  AIP->>PG: INSERT recording_detections (batch)
    AIP->>MV: INSERT recording_clip_frames
    AIP->>PG: UPDATE ai_scan_completed_at
```

---

## 9. Dashboard Rendering

### Mermaid

```mermaid
sequenceDiagram
    actor User
    participant UI as ui-police
    participant Dash as dashboard.tsx
    participant API as surveillance-api.ts
    participant BE as FastAPI api

    User->>UI: Navigate to /?section=events
    UI->>Dash: Render section=events
    Dash->>Dash: Mount events-alerts.tsx
    Dash->>API: fetchSurveillanceAccessToken()
    API->>BE: POST /api/v1/token
    BE-->>API: JWT
    Dash->>API: listDetections(token, filters)
    API->>BE: GET /api/v1/detections?limit=50
    BE-->>API: DetectionListResponse
    API-->>Dash: DetectionDto[]
    Dash-->>User: Render detection timeline

    User->>Dash: Click detection
    Dash->>API: getDetectionPlayback(id)
    API->>BE: GET /detections/{id}/playback
    BE-->>API: presigned URL + offset
    Dash-->>User: Play video at timestamp_offset_ms
```

### PlantUML

```plantuml
@startuml DashboardRendering
actor User
participant "dashboard.tsx" as DASH
participant "surveillance-api.ts" as API
participant "FastAPI" as BE

User -> DASH : select Events section
DASH -> API : fetchToken()
API -> BE : POST /token
DASH -> API : listDetections()
API -> BE : GET /detections
BE --> DASH : detection list
DASH --> User : render timeline
User -> DASH : click detection
DASH -> API : getPlayback()
API -> BE : GET /detections/id/playback
DASH --> User : play at offset
@enduml
```

---

## Related Documents

- [03_USE_CASES.md](../03_USE_CASES.md)
- [uml/README.md](../uml/README.md)
- [data-flow/README.md](../data-flow/README.md)
- [07_API_DOCUMENTATION.md](../07_API_DOCUMENTATION.md)
