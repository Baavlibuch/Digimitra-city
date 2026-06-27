# Data Flow Diagrams — DigiMitra City

**Document:** DFD & Pipeline Flow Documentation

---

## DFD Level 0 (Context Diagram)

The system as a single process interacting with external entities.

### Mermaid

```mermaid
flowchart LR
    OP[Operator]
    CAM[RTSP Cameras]
    COG[AWS Cognito]

    subgraph P0["0: DigiMitra City"]
        SYS[AI Surveillance Platform]
    end

    VID[Video Files]

    OP -->|credentials| COG
    OP -->|queries commands| SYS
    COG -->|session| OP
    CAM -->|RTSP streams| SYS
    OP -->|webcam JPEG segments| SYS
    VID -->|file upload| SYS
    SYS -->|alerts search playback| OP
```

### PlantUML

```plantuml
@startuml DFD_Level0
actor Operator
actor "RTSP Cameras" as CAM
actor "AWS Cognito" as COG
usecase "DigiMitra City\nAI Surveillance Platform" as SYS

Operator --> SYS : queries, commands
CAM --> SYS : RTSP streams
Operator --> SYS : webcam, uploads
SYS --> Operator : alerts, search, playback
Operator --> COG : credentials
COG --> Operator : session
@enduml
```

---

## DFD Level 1

Major sub-processes within DigiMitra City.

### Mermaid

```mermaid
flowchart TB
    OP[Operator]
    CAM[RTSP Cameras]

    subgraph DigiMitra
        P1[1.0 Video Ingest]
        P2[2.0 Object Storage]
        P3[3.0 Offline AI Indexing]
        P4[4.0 Live Detection]
        P5[5.0 Search & Retrieval]
        P6[6.0 Alert Distribution]
        P7[7.0 Dashboard Presentation]
    end

    D1[(D1: PostgreSQL)]
    D2[(D2: MinIO)]
    D3[(D3: Milvus)]

    OP -->|webcam file upload| P1
    CAM -->|RTSP| P4
    P1 -->|segments| P2
    P1 -->|metadata| D1
    P2 --> D2
    D1 -->|unscanned segments| P3
    D2 -->|video bytes| P3
    P3 -->|detections| D1
    P3 -->|embeddings| D3
    P4 -->|live alerts| P6
    D1 --> P5
    D3 --> P5
    D2 --> P5
    P5 --> P7
    P6 --> P7
    P7 --> OP
```

### PlantUML

```plantuml
@startuml DFD_Level1
actor Operator
database "D1 PostgreSQL" as PG
database "D2 MinIO" as MI
database "D3 Milvus" as MV

rectangle "1.0 Video Ingest" as P1
rectangle "2.0 Object Storage" as P2
rectangle "3.0 Offline AI" as P3
rectangle "4.0 Live Detection" as P4
rectangle "5.0 Search" as P5
rectangle "6.0 Alert Distribution" as P6
rectangle "7.0 Dashboard" as P7

Operator --> P1
P1 --> P2
P1 --> PG
P2 --> MI
PG --> P3
MI --> P3
P3 --> PG
P3 --> MV
P4 --> P6
PG --> P5
MV --> P5
P5 --> P7
P6 --> P7
P7 --> Operator
@enduml
```

---

## DFD Level 2 — Process 1.0 Video Ingest

### Mermaid

```mermaid
flowchart TB
    OP[Operator Browser]

    subgraph "1.0 Video Ingest"
        P11[1.1 Browser MediaRecorder Upload]
        P12[1.2 Video File Upload]
        P13[1.3 Edge Agent Chunking]
        P14[1.4 Segment Registration]
    end

    D1[(PostgreSQL)]
    D2[(MinIO)]

    OP -->|webm segments| P11
    OP -->|mp4 mov avi| P12
    P11 --> P14
    P12 --> P14
    P13 --> P14
    P14 --> D1
    P14 --> D2
```

### PlantUML

```plantuml
@startuml DFD_Level2_Ingest
rectangle "1.1 MediaRecorder Upload" as P11
rectangle "1.2 File Upload" as P12
rectangle "1.3 Edge Chunking" as P13
rectangle "1.4 Segment Registration" as P14
database PostgreSQL as PG
database MinIO as MI

P11 --> P14
P12 --> P14
P13 --> P14
P14 --> PG
P14 --> MI
@enduml
```

---

## DFD Level 2 — Process 3.0 Offline AI Indexing

### Mermaid

```mermaid
flowchart TB
    subgraph "3.0 Offline AI Indexing"
        P31[3.1 Queue Poll]
        P32[3.2 Frame Extraction]
        P33[3.3 YOLO Detection]
        P34[3.4 CLIP Embedding]
        P35[3.5 Result Persistence]
    end

    D1[(PostgreSQL)]
    D2[(MinIO)]
    D3[(Milvus)]

    D1 -->|unscanned segment| P31
    D2 -->|video bytes| P32
    P31 --> P32
    P32 --> P33
    P32 --> P34
    P33 --> P35
    P34 --> P35
    P35 --> D1
    P35 --> D3
```

---

## DFD Level 2 — Process 4.0 Live Detection

### Mermaid

```mermaid
flowchart TB
    subgraph "4.0 Live Detection"
        P41[4.1 Frame Ingest]
        P42[4.2 YOLO Inference]
        P43[4.3 ByteTrack]
        P44[4.4 Rule Evaluation]
        P45[4.5 Alert Publish]
    end

    BW[Browser JPEG]
    RTSP[RTSP Camera]

    BW --> P41
    RTSP --> P41
    P41 --> P42 --> P43 --> P44
    P44 -->|threshold met| P45
```

---

## Pipeline Flow — Recording Path

```
┌─────────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────────┐
│  Browser    │───►│   api    │───►│   MinIO     │    │  PostgreSQL  │
│ MediaRecorder│    │  upload  │    │ video-chunks│    │recording_segs│
└─────────────┘    └──────────┘    └──────┬──────┘    └──────┬───────┘
                                          │                   │
                                          ▼                   ▼
                                   ┌──────────────┐    ┌──────────────┐
                                   │ ai-processor │◄───│  poll queue  │
                                   │ YOLO + CLIP  │    └──────────────┘
                                   └──────┬───────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                   ┌────────────┐  ┌────────────┐  ┌────────────┐
                   │ detections │  │  Milvus    │  │  previews  │
                   │ PostgreSQL │  │  vectors   │  │   MinIO    │
                   └────────────┘  └────────────┘  └────────────┘
```

### Mermaid

```mermaid
flowchart LR
    MR[MediaRecorder] --> API[api upload]
    API --> MINIO[MinIO]
    API --> PG[PostgreSQL segments]
    PG --> AIP[ai-processor poll]
    MINIO --> AIP
    AIP --> DET[recording_detections]
    AIP --> MV[Milvus vectors]
    AIP --> PREV[preview images]
```

---

## Streaming Flow — Live Path

```
┌──────────┐    ┌──────────┐    ┌─────────────────────┐    ┌──────────┐
│ Browser  │───►│   api    │───►│ live-detection-agent│───►│live_rules│
│ JPEG 1fps│    │  proxy   │    │ YOLO + ByteTrack    │    └────┬─────┘
└──────────┘    └──────────┘    └─────────────────────┘         │
     ▲                                                          ▼
     │                                                    ┌──────────┐
     │         ┌──────────┐    ┌──────────┐               │  alert   │
     └─────────│ui-police  │◄───│   api    │◄──────────────│ publish  │
               │ Live Wall │ WS │ broadcast│               └──────────┘
               └──────────┘    └──────────┘
```

### Mermaid

```mermaid
flowchart LR
    JPEG[Browser JPEG] --> API[api proxy]
    RTSP[RTSP] --> LDA[live-detection-agent]
    API --> LDA
    LDA --> RULES[live_rules]
    RULES --> PUB[alert publish]
    PUB --> API
    API -->|WebSocket| UI[ui-police Live Wall]
```

---

## Inference Flow — Offline (ai-processor)

| Step | Component | Input | Output |
|------|-----------|-------|--------|
| 1 | `scheduler._pick_next_segment()` | PostgreSQL query | `RecordingSegment` row |
| 2 | `utils.download_object()` | MinIO object_key | Raw video bytes |
| 3 | `frame_extractor.iter_spaced_frames()` | Video bytes | Sampled frames (every 3s) |
| 4 | `detector.run_detection()` | Frame image | Bounding boxes + labels |
| 5 | `clip_embedder.embed_frame()` | Frame image | 512-dim vector |
| 6 | PostgreSQL insert | Detection dict | `recording_detections` row |
| 7 | `insert_frame_embeddings()` | Vector + metadata | Milvus row |
| 8 | Segment update | — | `ai_scan_completed_at` set |

### Mermaid

```mermaid
flowchart TD
    A[Poll unscanned segment] --> B[Download from MinIO]
    B --> C[Extract spaced frames]
    C --> D[YOLOv8n per frame]
    C --> E[CLIP per N frames]
    D --> F[INSERT recording_detections]
    E --> G[INSERT Milvus vectors]
    F --> H[Mark segment complete]
    G --> H
```

---

## Inference Flow — Live (live-detection-agent)

| Step | Component | Input | Output |
|------|-----------|-------|--------|
| 1 | `frame_source` | RTSP/JPEG/video file | BGR frame |
| 2 | `detector.detect()` | Frame | Raw YOLO detections |
| 3 | `tracker.update()` | Detections | `TrackedObject` list |
| 4 | `live_rules.evaluate()` | Tracked objects | `LiveAlert` or None |
| 5 | `alert_client.publish()` | LiveAlert dict | HTTP POST to api |

---

## Database Flow

### Write Path

```
Upload API ──► recording_segments (INSERT)
            ──► MinIO (PUT object)

ai-processor ──► recording_detections (INSERT batch)
             ──► recording_clip_frames (Milvus INSERT)
             ──► recording_segments (UPDATE ai_scan_*)

live-detection-agent ──► cameras (READ only)
                     ──► (no detection writes — pipeline isolation)
```

### Read Path

```
GET /recordings ──► recording_segments (SELECT paginated)
                 ──► MinIO (presign preview)

POST /semantic-search ──► Milvus (ANN search)
                       ──► recording_segments (validity filter)
                       ──► recording_detections (attach matches)

GET /detections ──► recording_detections JOIN recording_segments
```

### Delete Path

```
DELETE /recordings/{id} ──► MinIO (DELETE object)
                        ──► Milvus (purge vectors)
                        ──► recording_segments (DELETE, CASCADE detections)
```

### Mermaid

```mermaid
flowchart TB
    subgraph Writes
        W1[Upload] --> PG1[recording_segments]
        W1 --> MI1[MinIO objects]
        W2[ai-processor] --> PG2[recording_detections]
        W2 --> MV1[Milvus vectors]
    end

    subgraph Reads
        R1[Search API] --> MV2[Milvus ANN]
        R1 --> PG3[PostgreSQL filter]
        R2[Playback API] --> MI2[MinIO presign]
    end

    subgraph Deletes
        D1[DELETE recording] --> PG4[CASCADE]
        D1 --> MI3[object delete]
        D1 --> MV3[vector purge]
    end
```

---

## Related Documents

- [06_ARCHITECTURE.md](../06_ARCHITECTURE.md)
- [08_DATABASE_DOCUMENTATION.md](../08_DATABASE_DOCUMENTATION.md)
- [sequences/README.md](../sequences/README.md)
