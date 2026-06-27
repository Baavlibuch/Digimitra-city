# UML Diagrams — DigiMitra City

**Document:** UML Model (Mermaid + PlantUML)  
**Notation:** Descriptive labels per DigiMitra domain model

---

## 1. Use Case Diagram

### Mermaid

```mermaid
flowchart LR
    subgraph Actors
        OP((Operator))
        INV((Investigator))
        ADM((Administrator))
        BW((Browser Webcam))
        LDA((Live Detection Agent))
    end

    subgraph DigiMitra System
        UC1[Register Account]
        UC2[Login]
        UC3[Monitor Live Feeds]
        UC4[Record Video]
        UC5[Semantic Search]
        UC6[View Detections]
        UC7[Manage Cameras]
        UC8[Receive Live Alert]
        UC9[Upload Video File]
    end

    OP --> UC1
    OP --> UC2
    OP --> UC3
    OP --> UC4
    OP --> UC8
    OP --> UC9
    INV --> UC2
    INV --> UC5
    INV --> UC6
    ADM --> UC7
    BW --> UC4
    LDA --> UC8
```

### PlantUML

```plantuml
@startuml DigiMitra_UseCase
left to right direction
actor Operator
actor Investigator
actor Administrator
actor "Browser Webcam" as BW
actor "Live Detection Agent" as LDA

rectangle "DigiMitra City" {
  usecase "Register Account" as UC1
  usecase "Login" as UC2
  usecase "Monitor Live Feeds" as UC3
  usecase "Record Video" as UC4
  usecase "Semantic Search" as UC5
  usecase "View Detections" as UC6
  usecase "Manage Cameras" as UC7
  usecase "Receive Live Alert" as UC8
  usecase "Upload Video File" as UC9
}

Operator --> UC1
Operator --> UC2
Operator --> UC3
Operator --> UC4
Operator --> UC8
Operator --> UC9
Investigator --> UC2
Investigator --> UC5
Investigator --> UC6
Administrator --> UC7
BW --> UC4
LDA --> UC8
@enduml
```

---

## 2. Class Diagram

### Mermaid

```mermaid
classDiagram
    class Camera {
        +String id
        +String name
        +String location
        +Float latitude
        +Float longitude
        +String source_type
        +String rtsp_url
        +String stream_status
        +DateTime created_at
    }

    class User {
        +String id
        +String username
        +String password
        +String role
    }

    class RecordingSegment {
        +String id
        +String camera_id
        +String recording_session_id
        +String bucket_name
        +String object_key
        +DateTime start_time
        +DateTime end_time
        +String ingest_source
        +DateTime ai_scan_completed_at
    }

    class RecordingDetection {
        +String id
        +String recording_segment_id
        +String camera_id
        +String object_type
        +Float confidence
        +Int timestamp_offset_ms
        +JSON bounding_box
    }

    class LiveAlert {
        +String alert_id
        +String camera_id
        +String alert_type
        +String severity
        +String message
        +List track_ids
        +List bboxes
    }

    class ClipFrameVector {
        +String id
        +String recording_segment_id
        +Int timestamp_offset_ms
        +FloatVector embedding
    }

    RecordingSegment "1" --> "*" RecordingDetection : contains
    Camera "1" --> "*" RecordingSegment : records
    RecordingSegment "1" --> "*" ClipFrameVector : indexed_as
```

### PlantUML

```plantuml
@startuml DigiMitra_Class
class Camera {
  +id: String
  +name: String
  +location: String
  +latitude: Float
  +longitude: Float
  +source_type: String
  +rtsp_url: String
  +stream_status: String
  +created_at: DateTime
}

class User {
  +id: String
  +username: String
  +password: String
  +role: String
}

class RecordingSegment {
  +id: String
  +camera_id: String
  +recording_session_id: String
  +bucket_name: String
  +object_key: String
  +start_time: DateTime
  +ingest_source: String
  +ai_scan_completed_at: DateTime
}

class RecordingDetection {
  +id: String
  +recording_segment_id: String
  +object_type: String
  +confidence: Float
  +timestamp_offset_ms: Int
  +bounding_box: JSON
}

class LiveAlert {
  +alert_id: String
  +camera_id: String
  +alert_type: String
  +severity: String
  +message: String
}

class ClipFrameVector {
  +id: String
  +recording_segment_id: String
  +embedding: FloatVector[512]
}

RecordingSegment "1" *-- "many" RecordingDetection
Camera "1" -- "many" RecordingSegment
RecordingSegment "1" -- "many" ClipFrameVector
@enduml
```

---

## 3. Sequence Diagram (Recording Upload)

### Mermaid

```mermaid
sequenceDiagram
    participant UI as ui-police
    participant API as FastAPI api
    participant MINIO as MinIO
    participant PG as PostgreSQL
    participant AIP as ai-processor

    UI->>API: POST /recordings/upload (JWT, blob)
    API->>MINIO: upload_video_chunk()
    MINIO-->>API: object_key
    API->>PG: INSERT recording_segments
    PG-->>API: recording_id
    API-->>UI: RecordingUploadResponse

    loop Poll queue
        AIP->>PG: SELECT unscanned segment
        AIP->>MINIO: download segment
        AIP->>AIP: YOLO + CLIP
        AIP->>PG: INSERT recording_detections
        AIP->>PG: UPDATE ai_scan_completed_at
    end
```

### PlantUML

```plantuml
@startuml DigiMitra_RecordingUpload
actor Operator
participant "ui-police" as UI
participant "FastAPI api" as API
database "MinIO" as MINIO
database "PostgreSQL" as PG
participant "ai-processor" as AIP

Operator -> UI: Allow webcam recording
UI -> API: POST /recordings/upload
API -> MINIO: upload_video_chunk()
API -> PG: register_segment()
API --> UI: recording_id

AIP -> PG: pick unscanned segment
AIP -> MINIO: download object
AIP -> AIP: YOLO + CLIP inference
AIP -> PG: store detections
@enduml
```

---

## 4. Component Diagram

### Mermaid

```mermaid
flowchart TB
    subgraph Presentation
        UI[ui-police Next.js]
    end

    subgraph Application
        API[api FastAPI]
        LDA[live-detection-agent]
        AIP[ai-processor]
        EA[edge-agent]
        SP[stream-processor]
    end

    subgraph Shared
        SH[shared library]
        LR[live_rules.py]
        MVH[recording_clip_milvus.py]
    end

    subgraph Infrastructure
        PG[(PostgreSQL)]
        MI[(MinIO)]
        MV[(Milvus)]
        RP[Redpanda]
    end

    UI --> API
    API --> SH
    API --> LDA
    AIP --> SH
    LDA --> SH
    LDA --> LR
    AIP --> MVH
    API --> PG
    API --> MI
    API --> MV
    AIP --> PG
    AIP --> MI
    AIP --> MV
    EA --> RP
    SP --> RP
    SP --> PG
```

### PlantUML

```plantuml
@startuml DigiMitra_Component
package "Presentation" {
  [ui-police Next.js] as UI
}
package "Application" {
  [api FastAPI] as API
  [live-detection-agent] as LDA
  [ai-processor] as AIP
  [edge-agent] as EA
  [stream-processor] as SP
}
package "Shared" {
  [shared/models.py] as SH
  [live_rules.py] as LR
}
package "Infrastructure" {
  database "PostgreSQL" as PG
  database "MinIO" as MI
  database "Milvus" as MV
  [Redpanda] as RP
}

UI --> API
API --> SH
API --> LDA
AIP --> SH
LDA --> LR
API --> PG
API --> MI
API --> MV
AIP --> PG
EA --> RP
SP --> RP
@enduml
```

---

## 5. Deployment Diagram

### Mermaid

```mermaid
flowchart TB
    subgraph DockerHost["Docker Host"]
        subgraph Network
            API_C[api :8000]
            LDA_C[live-detection-agent :8765]
            AIP_C[ai-processor]
            PG_C[postgres :5432]
            MI_C[minio :9000]
            MV_C[milvus :19530]
            ET_C[etcd :2379]
            RP_C[redpanda :9092]
        end
    end

    Browser["Operator Browser :3000"] --> API_C
    Browser --> MI_C
    RTSP["RTSP Cameras"] --> LDA_C
    API_C --> LDA_C
    API_C --> PG_C
    API_C --> MI_C
    API_C --> MV_C
    AIP_C --> PG_C
    AIP_C --> MI_C
    MV_C --> ET_C
```

### PlantUML

```plantuml
@startuml DigiMitra_Deployment
node "Docker Host" {
  node "api :8000" as API
  node "live-detection-agent :8765" as LDA
  node "ai-processor" as AIP
  database "postgres :5432" as PG
  database "minio :9000" as MI
  database "milvus :19530" as MV
  node "redpanda :9092" as RP
}

node "Operator Browser" as BR
node "RTSP Cameras" as CAM

BR --> API : REST/WS
BR --> MI : presigned URLs
CAM --> LDA : RTSP
API --> LDA
API --> PG
AIP --> PG
AIP --> MI
@enduml
```

---

## 6. Package Diagram

### Mermaid

```mermaid
flowchart TB
    subgraph ui-police
        APP[app/]
        COMP[components/]
        LIB[lib/]
        HOOKS[hooks/]
    end

    subgraph api
        MAIN[main.py]
        AUTH[auth.py]
        REC[recording_service.py]
        DET[detection_service.py]
        LIVE[live_alerts_hub.py]
        SEARCH[recording_clip_search.py]
    end

    subgraph shared
        MODELS[models.py]
        RULES[live_rules.py]
        MILVUS[recording_clip_milvus.py]
        MINIO_C[minio_config.py]
    end

    subgraph ai-processor
        SCHED[scheduler.py]
        DETECTOR[detector.py]
        CLIP[clip_embedder.py]
    end

    subgraph live-detection-agent
        PIPE[pipeline.py]
        TRACK[tracker.py]
        FRAME[frame_source.py]
    end

    APP --> LIB
    LIB --> MAIN
    MAIN --> AUTH
    MAIN --> REC
    MAIN --> LIVE
    REC --> MODELS
    SCHED --> MODELS
    SCHED --> MILVUS
    PIPE --> RULES
```

### PlantUML

```plantuml
@startuml DigiMitra_Package
package "ui-police" {
  package "app" {}
  package "components" {}
  package "lib" {}
}
package "api.src" {
  package "main" {}
  package "auth" {}
  package "recording_service" {}
  package "live_alerts_hub" {}
}
package "shared" {
  package "models" {}
  package "live_rules" {}
  package "recording_clip_milvus" {}
}
package "ai-processor" {
  package "scheduler" {}
  package "detector" {}
}
package "live-detection-agent" {
  package "pipeline" {}
  package "tracker" {}
}
@enduml
```

---

## 7. Activity Diagram (Semantic Search)

### Mermaid

```mermaid
flowchart TD
    A[Operator enters query] --> B{JWT valid?}
    B -->|No| C[Return 401]
    B -->|Yes| D[CLIP encode query text]
    D --> E{Milvus ready?}
    E -->|No| F[Return enabled=false]
    E -->|Yes| G[Milvus IP search over-fetch]
    G --> H[PostgreSQL validity filter]
    H --> I[Dedupe by segment]
    I --> J[Attach thumbnails + detections]
    J --> K{Results empty?}
    K -->|Yes| L{Pending AI segments?}
    L -->|Yes| M[detail: indexing in progress]
    L -->|No| N[Return empty results]
    K -->|No| O[Return ranked hits]
```

### PlantUML

```plantuml
@startuml DigiMitra_SemanticSearch
start
:Operator enters natural-language query;
if (JWT valid?) then (yes)
  :CLIP encode query;
  if (Milvus index ready?) then (yes)
    :Milvus ANN search;
    :PostgreSQL validity filter;
    :Dedupe by segment;
    :Attach thumbnails;
    :Return results;
  else (no)
    :Return disabled status;
  endif
else (no)
  :Return 401;
endif
stop
@enduml
```

---

## 8. State Diagram (Recording Segment)

### Mermaid

```mermaid
stateDiagram-v2
    [*] --> Uploaded: POST /recordings/upload
    Uploaded --> Queued: registered in PostgreSQL
    Queued --> Processing: ai-processor claims
    Processing --> Indexed: ai_scan_completed_at set
    Processing --> Failed: ai_scan_last_error set
    Failed --> [*]
    Indexed --> Deleted: DELETE /recordings/{id}
    Deleted --> [*]
```

### PlantUML

```plantuml
@startuml DigiMitra_SegmentState
[*] --> Uploaded
Uploaded --> Queued : register_segment()
Queued --> Processing : ai-processor claims
Processing --> Indexed : YOLO+CLIP complete
Processing --> Failed : error stored
Indexed --> Deleted : DELETE API
Failed --> [*]
Deleted --> [*]
@enduml
```

---

## 9. Communication Diagram (Live Alert)

### Mermaid

```mermaid
flowchart LR
    BW[Browser JPEG] -->|1: POST frame| API[api]
    API -->|2: proxy| LDA[live-detection-agent]
    LDA -->|3: YOLO+ByteTrack| LDA
    LDA -->|4: evaluate rules| LR[live_rules]
    LR -->|5: LiveAlert| LDA
    LDA -->|6: POST publish| API
    API -->|7: WS broadcast| UI[ui-police]
```

### PlantUML

```plantuml
@startuml DigiMitra_Communication
object "Browser" as BW
object "api" as API
object "live-detection-agent" as LDA
object "live_rules" as LR
object "ui-police" as UI

BW -> API : 1. POST /live/frames
API -> LDA : 2. proxy JPEG
LDA -> LDA : 3. YOLO+ByteTrack
LDA -> LR : 4. evaluate rules
LR -> LDA : 5. LiveAlert
LDA -> API : 6. POST publish
API -> UI : 7. WebSocket broadcast
@enduml
```

---

## 10. Object Diagram (Live Alert Instance)

### Mermaid

```mermaid
classDiagram
    object alert_001 {
        alert_id = "a1b2c3"
        camera_id = "1"
        alert_type = "crowd_gathering"
        severity = "high"
        message = "Crowd of 10 persons"
        track_ids = [1,2,3]
    }

    object camera_001 {
        id = "1"
        name = "Main Gate Cam"
        stream_status = "online"
    }

    alert_001 --> camera_001 : targets
```

### PlantUML

```plantuml
@startuml DigiMitra_Object
object "alert_001 : LiveAlert" as A {
  alert_id = a1b2c3
  camera_id = 1
  alert_type = crowd_gathering
  severity = high
}
object "camera_001 : Camera" as C {
  id = 1
  name = Main Gate Cam
}
A --> C : targets
@enduml
```

---

## Related Documents

- [sequences/README.md](../sequences/README.md)
- [architecture-4plus1/README.md](../architecture-4plus1/README.md)
- [06_ARCHITECTURE.md](../06_ARCHITECTURE.md)
