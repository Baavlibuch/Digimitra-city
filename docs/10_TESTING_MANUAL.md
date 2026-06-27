# Testing Manual

**Document:** 10 — Test Strategy & Procedures  
**Project:** DigiMitra City

---

## 1. Testing Strategy

DigiMitra City employs a **layered testing approach** with emphasis on unit tests for critical AI pipeline components and integration tests for pipeline isolation. No automated CI/CD pipeline exists in the repository; tests are run manually.

| Level | Scope | Tool | Coverage |
|-------|-------|------|----------|
| Unit | Individual functions/modules | pytest | Live rules, tracker, alerts hub |
| Integration | Pipeline isolation, API contracts | pytest | Cross-service boundaries |
| System | Full Docker stack | Manual | End-to-end flows |
| Acceptance | User scenarios | Manual | Use case validation |
| Performance | Inference FPS, search latency | Manual | Benchmarking |
| Security | Auth, secrets, CORS | Manual | Penetration checklist |

**Test location:** `tests/` (9 test modules + `conftest.py`)

---

## 2. Unit Testing

### 2.1 Setup

```bash
pip install -r tests/requirements.txt
pip install -r api/requirements.txt
pip install supervision numpy
```

### 2.2 Run All Tests

```bash
pytest tests/ -v
```

### 2.3 Test Modules

| File | Tests | Focus |
|------|-------|-------|
| `test_live_rules.py` | Crowd, congestion, wrong-way rules | `shared/live_rules.py` |
| `test_tracker.py` | ByteTrack velocity/speed | `live-detection-agent/tracker.py` |
| `test_live_alerts_hub.py` | WebSocket manager, internal publish | `api/src/live_alerts_hub.py` |
| `test_live_scene_status.py` | Scene status computation | Live pipeline state |
| `test_pipeline_isolation.py` | Live vs. recording path separation | Architecture invariant |
| `test_recording_event_labels.py` | Detection → label mapping | `shared/recording_event_labels.py` |
| `test_video_file_upload_timing.py` | Upload timing validation | `api/src/video_file_upload.py` |
| `test_py39_typing_compat.py` | Python 3.9 type compatibility | Cross-version support |

---

## 3. Integration Testing

### 3.1 Pipeline Isolation Test

Validates that live detection does not write to `recording_detections`:

```bash
pytest tests/test_pipeline_isolation.py -v
```

### 3.2 API Integration (Manual)

With Docker stack running:

```bash
# Health check
curl http://localhost:8000/docs

# Token
curl -X POST http://localhost:8000/api/v1/token \
  -d "username=admin&password=admin"

# Semantic search status
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/semantic-search/status
```

### 3.3 Live Alert Integration

```bash
curl -X POST http://localhost:8000/api/v1/internal/live-alerts/publish \
  -H "X-Live-Alert-Secret: live-internal-dev-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "live_alert",
    "camera_id": "1",
    "alert_type": "crowd_gathering",
    "severity": "high",
    "message": "Test crowd",
    "timestamp": "2026-06-27T12:00:00Z",
    "track_ids": [1],
    "bboxes": [[100, 100, 200, 200]]
  }'
```

Expected: `{"ok": true, "clients": N}`

---

## 4. System Testing

### 4.1 Prerequisites

```bash
docker compose up --build
cd ui-police && pnpm dev
```

Set `ui-police/.env.local`:
```
NEXT_PUBLIC_ENABLE_LIVE_WS=true
NEXT_PUBLIC_SURVEILLANCE_API_URL=http://localhost:8000
```

### 4.2 System Test Scenarios

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| ST-01 | Full recording pipeline | Webcam record → wait → search | Semantic results appear |
| ST-02 | File upload pipeline | Upload MP4 → wait → detections | Detections in Events |
| ST-03 | Live alert pipeline | Enable WS → trigger curl alert | Tile highlights |
| ST-04 | Playback | Click recording → play | Video plays with presigned URL |
| ST-05 | Detection playback | Click detection event | Video seeks to offset |
| ST-06 | Camera CRUD | POST/GET/PATCH/DELETE camera | DB reflects changes |
| ST-07 | Delete recording | DELETE recording | MinIO + Milvus + DB cleaned |

---

## 5. Acceptance Testing

Map acceptance tests to use cases in [03_USE_CASES.md](./03_USE_CASES.md):

| Use Case | Acceptance Criteria | Status |
|----------|---------------------|--------|
| UC-02 Login | User reaches dashboard after Cognito sign-in | Manual |
| UC-05 Recording | Segments appear in recordings list | Manual |
| UC-10 Semantic Search | Query returns ranked results with thumbnails | Manual |
| UC-12 Live Monitoring | Feed wall shows live tiles | Manual |
| UC-13 Live Alert | Alert overlay on correct tile within 1s | Manual |

---

## 6. Manual Testing Procedures

### 6.1 Live Surveillance (from LIVE_SURVEILLANCE.md)

1. `docker compose up --build api live-detection-agent postgres`
2. Set `NEXT_PUBLIC_ENABLE_LIVE_WS=true`
3. `cd ui-police && pnpm dev`
4. Open Live Feed Wall — confirm **Live AI Connected**
5. Allow webcam — frames push at 1 FPS
6. Trigger test alert via curl (see §3.3)
7. Verify tile highlights with bbox overlay
8. Confirm Events & Alerts still loads polled detections
9. Confirm REC badge during webcam recording

### 6.2 Semantic Search

1. Upload or record a video segment
2. Monitor: `docker compose logs -f ai-processor`
3. Wait for `ai_scan_completed_at` to be set
4. Search with descriptive query
5. Verify results include thumbnails and playback

---

## 7. Performance Testing

### 7.1 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Live inference FPS | ≥ 1 per camera (CPU) | Agent logs, frame timestamps |
| Semantic search latency | < 3s for top_k=20 | API response time |
| Upload throughput | Network-bound | File size / upload duration |
| WebSocket alert latency | < 1s | curl publish → UI overlay |

### 7.2 Load Testing (Assumption)

No load test scripts exist. Recommended tools for future:
- **k6** or **Locust** for API load
- **Artillery** for WebSocket connections

---

## 8. Security Testing

### 8.1 Checklist

| Test | Procedure | Expected |
|------|-----------|----------|
| JWT required | Call `/recordings` without token | 401 |
| Invalid JWT | Call with expired/tampered token | 401 |
| Internal secret | POST publish without secret | 401 |
| WS auth | Connect WS without token | Close 4401 |
| ALLOW_ANY_LOGIN | Set `false`, test bad password | 401 |
| Presigned expiry | Use URL after expiry | Access denied |
| CORS | Cross-origin API call | CORS headers present |

### 8.2 Known Security Considerations

- `ALLOW_ANY_LOGIN=true` in default docker-compose (dev only)
- JWT secret `devsecret` in default compose
- CORS `allow_origins=["*"]`
- WebSocket JWT in query string (visible in logs)
- Camera CRUD lacks auth dependency

---

## 9. Test Cases

### TC-001: Crowd Gathering Rule

| Field | Value |
|-------|-------|
| **Precondition** | `LIVE_CROWD_MIN_PERSONS=8`, `LIVE_CROWD_DURATION_SEC=5` |
| **Input** | 10 person tracks sustained for 6 seconds |
| **Expected** | `crowd_gathering` alert with severity `high` |
| **Automated** | `test_live_rules.py` |

### TC-002: Traffic Congestion Rule

| Field | Value |
|-------|-------|
| **Precondition** | `LIVE_CONGESTION_MIN_VEHICLES=6`, max speed 3 px/s |
| **Input** | 7 slow vehicles for 9 seconds |
| **Expected** | `traffic_congestion` alert |
| **Automated** | `test_live_rules.py` |

### TC-003: Wrong-Way Driving

| Field | Value |
|-------|-------|
| **Precondition** | Lane direction `[1, 0]` for camera |
| **Input** | Vehicle moving left (negative x velocity) |
| **Expected** | `wrong_way_driving` alert |
| **Automated** | `test_live_rules.py` |

### TC-004: Alert Cooldown

| Field | Value |
|-------|-------|
| **Precondition** | `LIVE_ALERT_COOLDOWN_SEC=30` |
| **Input** | Two crowd alerts within 10 seconds |
| **Expected** | Only first alert emitted |
| **Automated** | `test_live_rules.py` |

### TC-005: Recording Upload

| Field | Value |
|-------|-------|
| **Input** | POST `/recordings/upload` with valid webm blob |
| **Expected** | 200, `recording_id` returned, MinIO object exists |
| **Automated** | Manual / future integration test |

### TC-006: File Upload Size Limit

| Field | Value |
|-------|-------|
| **Input** | File exceeding `max_upload_bytes()` |
| **Expected** | 413 Request Entity Too Large |
| **Automated** | `test_video_file_upload_timing.py` |

### TC-007: Semantic Search Dedup

| Field | Value |
|-------|-------|
| **Input** | Multiple Milvus hits from same segment |
| **Expected** | Single result per segment in response |
| **Automated** | Manual |

### TC-008: Pipeline Isolation

| Field | Value |
|-------|-------|
| **Input** | Live alert fired |
| **Expected** | No new `recording_detections` row created |
| **Automated** | `test_pipeline_isolation.py` |

### TC-009: WebSocket Broadcast

| Field | Value |
|-------|-------|
| **Input** | Internal publish with 2 connected clients |
| **Expected** | `clients: 2` in response |
| **Automated** | `test_live_alerts_hub.py` |

### TC-010: Event Label Generation

| Field | Value |
|-------|-------|
| **Input** | Detection with `object_type: car` |
| **Expected** | `event_label: "Vehicle detected"` |
| **Automated** | `test_recording_event_labels.py` |

---

## 10. Test Environment

| Component | Version | Notes |
|-----------|---------|-------|
| Python | 3.9+ | API Docker image uses 3.9 |
| pytest | Latest | `tests/requirements.txt` |
| Docker Compose | 3.8 | Full stack |
| Node.js | 18+ | Frontend dev server |

---

## Related Documents

- [04_SRS.md](./04_SRS.md) — Requirements under test
- [LIVE_SURVEILLANCE.md](../LIVE_SURVEILLANCE.md) — Live testing guide
- [11_DEPLOYMENT_GUIDE.md](./11_DEPLOYMENT_GUIDE.md) — Environment setup
