# Deployment Guide

**Document:** 11 — Deployment & Operations  
**Project:** DigiMitra City

---

## 1. Deployment Overview

DigiMitra City deploys as a **Docker Compose stack** with 11 services. No Kubernetes manifests, Terraform, or CI/CD pipelines exist in the repository.

| Environment | Method | Config |
|-------------|--------|--------|
| Development | `docker compose up --build` | `docker-compose.yml` defaults |
| Frontend dev | `pnpm dev` (host) | `ui-police/.env.local` |
| Production | Docker Compose or K8s (manual) | Custom env vars, secrets |

---

## 2. AWS Integration

### 2.1 AWS Cognito (Frontend)

DigiMitra uses AWS Cognito for frontend user authentication only. The API maintains its own JWT system.

**Setup steps (assumption — not automated in repo):**

1. Create Cognito User Pool in AWS Console.
2. Create App Client (no secret for SPA).
3. Enable email verification.
4. Set frontend environment variables:

```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_AWS_REGION=ap-south-1
```

### 2.2 AWS S3 Migration (Recommended for Production)

MinIO is used in development. For AWS production:

| MinIO Config | AWS Equivalent |
|--------------|----------------|
| `MINIO_ENDPOINT` | S3 endpoint |
| `MINIO_ACCESS_KEY` | IAM access key |
| `MINIO_SECRET_KEY` | IAM secret key |
| `MINIO_BUCKET` | S3 bucket name |
| `MINIO_PUBLIC_URL` | CloudFront distribution URL |

> **Note:** `api/src/storage_service.py` uses the MinIO Python SDK. Migration to boto3 requires code changes.

### 2.3 AWS RDS (Recommended)

Replace Docker PostgreSQL with Amazon RDS:

```
DATABASE_URL=postgresql+psycopg2://user:pass@rds-endpoint:5432/eventsdb
```

---

## 3. Docker Deployment

### 3.1 Full Stack

```bash
docker compose up --build -d
```

### 3.2 Minimal Stack (Core Features)

```bash
docker compose up --build -d \
  postgres minio milvus etcd api ai-processor live-detection-agent
```

### 3.3 Service Dockerfiles

| Service | Dockerfile | Base Image |
|---------|------------|------------|
| api | `api/Dockerfile` | `python:3.9-slim` |
| ai-processor | `ai-processor/Dockerfile` | `python:3.9-slim` |
| live-detection-agent | `live-detection-agent/Dockerfile` | `python:3.9-slim` |
| edge-agent | `edge-agent/Dockerfile` | `python:3.9-slim` |
| stream-processor | `stream-processor/Dockerfile` | `python:3.9-slim` |

**API entrypoint:** `uvicorn api.src.main:app --host 0.0.0.0 --port 8000`

**Shared library:** `PYTHONPATH=/app` includes `./shared`

### 3.4 Volumes

| Volume | Purpose | Backup Priority |
|--------|---------|-----------------|
| `pg_data` | PostgreSQL data | **Critical** |
| `minio_data` | Video segments, previews | **Critical** |
| `milvus_data` | Vector index data | High (rebuildable from segments) |
| `hls_data` | HLS streaming output | Low |

---

## 4. Container Reference

| Container | Image | Ports | Health Check |
|-----------|-------|-------|--------------|
| `api` | Built | 8000 | `GET /docs` |
| `ai-processor` | Built | — | Logs: segment processing |
| `live-detection-agent` | Built | 8765 | Frame ingest HTTP |
| `postgres` | `postgres:15` | 5432 | `pg_isready` |
| `minio` | `minio/minio` | 9000, 9001 | Console login |
| `milvus` | `milvusdb/milvus:v2.2.13` | 19530 | gRPC connect |
| `etcd` | `quay.io/coreos/etcd:v3.5.7` | 2379 | — |
| `redpanda` | `redpandadata/redpanda` | 9092, 9644 | — |
| `redpanda-console` | `redpandadata/console` | 8080 | — |
| `edge-agent` | Built | — | — |
| `stream-processor` | Built | — | — |
| `nginx-hls` | `nginx:alpine` | 8088 | — |

---

## 5. MongoDB

**Not applicable.** This project uses PostgreSQL. See [08_DATABASE_DOCUMENTATION.md](./08_DATABASE_DOCUMENTATION.md).

---

## 6. Secrets Management

### 6.1 Required Secrets

| Secret | Service | Default (DEV ONLY) |
|--------|---------|---------------------|
| `JWT_SECRET` | api | `devsecret` |
| `LIVE_ALERT_INTERNAL_SECRET` | api, live-detection-agent | `live-internal-dev-secret` |
| `POSTGRES_PASSWORD` | postgres | `svcpass` |
| `MINIO_ROOT_PASSWORD` | minio | `minioadmin` |
| Cognito credentials | ui-police | — |

### 6.2 Production Secret Practices

- Use Docker secrets or external vault (AWS Secrets Manager, HashiCorp Vault)
- Never commit `.env` files (listed in `.gitignore`)
- Rotate secrets on deployment
- Set `ALLOW_ANY_LOGIN=false`

---

## 7. Environment Variables

### 7.1 API Service

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+psycopg2://svc:svcpass@postgres:5432/eventsdb` | PostgreSQL DSN |
| `JWT_SECRET` | `devsecret` | JWT signing key |
| `ALLOW_ANY_LOGIN` | `true` | Dev auth bypass |
| `KAFKA_BOOTSTRAP` | `redpanda:9092` | Kafka bootstrap |
| `MINIO_ENDPOINT` | `minio:9000` | Internal MinIO |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | Browser presign host |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO credentials |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO credentials |
| `MINIO_BUCKET` | `surveillance-bucket` | Default bucket |
| `MILVUS_HOST` | `milvus` | Milvus gRPC host |
| `MILVUS_PORT` | `19530` | Milvus gRPC port |
| `MILVUS_CONNECT_RETRIES` | `18` | Connection retry count |
| `MILVUS_CONNECT_RETRY_SEC` | `2` | Retry interval (seconds) |
| `LIVE_ALERT_INTERNAL_SECRET` | `live-internal-dev-secret` | Internal auth |
| `LIVE_AGENT_INGEST_URL` | `http://live-detection-agent:8765` | Frame proxy |
| `PYTHONPATH` | `/app` | Python module path |

### 7.2 AI Processor

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIP_EMBEDDINGS_ENABLED` | `true` | Enable CLIP indexing |
| `CLIP_EMBED_EVERY_N_FRAMES` | `1` | CLIP every N sampled frames |
| `CLIP_MODEL_NAME` | `clip-ViT-B-32` | CLIP model |
| `AI_FRAME_INTERVAL_SEC` | `3` | Frame sampling interval |
| `AI_IDLE_POLL_SEC` | `10` | Queue poll interval |
| `AI_DELAY_AFTER_SEGMENT_SEC` | `2` | Delay before processing |
| `AI_PROCESSOR_PAUSED` | `false` | Pause processing |
| `YOLO_DEVICE` | `cpu` | Inference device |
| `YOLO_IMGSZ` | `416` | YOLO input size |
| `YOLO_WEIGHTS` | `yolov8n.pt` | Model weights path |

### 7.3 Live Detection Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `YOLO_MODEL` | `yolov8n.pt` | Model weights |
| `YOLO_CONFIDENCE` | `0.35` | Detection threshold |
| `YOLO_DEVICE` | `cpu` | Inference device |
| `YOLO_IMGSZ` | `416` | Input size |
| `FRAME_FPS` | `1` | Processing frame rate |
| `FRAME_INGEST_HOST` | `0.0.0.0` | Ingest server bind |
| `FRAME_INGEST_PORT` | `8765` | Ingest server port |
| `API_BASE_URL` | `http://api:8000` | Alert publish target |
| `LIVE_BROWSER_CAMERA_IDS` | `1,2,3,4,5,6,7,8,9` | Browser camera IDs |
| `VIDEO_FALLBACK_DIR` | `/data/videos` | Sample video directory |
| `LIVE_CROWD_MIN_PERSONS` | `8` | Crowd rule threshold |
| `LIVE_CROWD_DURATION_SEC` | `5` | Crowd persistence |
| `LIVE_CONGESTION_MIN_VEHICLES` | `6` | Congestion threshold |
| `LIVE_CONGESTION_MAX_SPEED_PX` | `3.0` | Slow speed limit |
| `LIVE_CONGESTION_DURATION_SEC` | `8` | Congestion persistence |
| `LIVE_WRONG_WAY_MIN_SPEED_PX` | `2.0` | Wrong-way min speed |
| `LIVE_WRONG_WAY_DOT_THRESHOLD` | `-0.5` | Direction dot product |
| `LIVE_LANE_DIRECTIONS_JSON` | `{}` | Per-camera lane vectors |
| `LIVE_ALERT_COOLDOWN_SEC` | `30` | Alert debounce |

### 7.4 Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SURVEILLANCE_API_URL` | API base URL |
| `NEXT_PUBLIC_API_BASE_URL` | Alternative API URL |
| `NEXT_PUBLIC_ENABLE_LIVE_WS` | Enable live WebSocket |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito pool |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Cognito client |
| `NEXT_PUBLIC_AWS_REGION` | AWS region |

### 7.5 Edge Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `VIDEO_DIR` | `/data/videos` | Input video directory |
| `CHUNK_SECONDS` | `10` | Chunk duration |
| `REDPANDA_BOOTSTRAP` | `redpanda:9092` | Kafka bootstrap |
| `HLS_OUT_DIR` | `/hls` | HLS output directory |

---

## 8. CI/CD

**Status:** Not implemented.

**Recommended pipeline (assumption):**

```yaml
# Suggested GitHub Actions workflow
jobs:
  test:
    - pip install -r tests/requirements.txt
    - pip install -r api/requirements.txt
    - pytest tests/ -v
  build:
    - docker compose build
  deploy:
    - docker compose push (or K8s apply)
```

---

## 9. Monitoring

### 9.1 Log Access

```bash
docker compose logs -f api
docker compose logs -f ai-processor
docker compose logs -f live-detection-agent
```

### 9.2 Health Endpoints

| Service | Check |
|---------|-------|
| API | `http://localhost:8000/docs` |
| MinIO | `http://localhost:9001` |
| Redpanda Console | `http://localhost:8080` |
| Milvus | gRPC port 19530 connectivity |
| Semantic Search | `GET /api/v1/semantic-search/status` |

### 9.3 Recommended Monitoring (Future)

- Prometheus metrics exporter for FastAPI
- Grafana dashboards for inference FPS, queue depth
- Alertmanager for service health
- MinIO/PG backup monitoring

---

## 10. Scaling

| Component | Scale Strategy |
|-----------|----------------|
| **api** | Horizontal replicas behind load balancer; sticky sessions for WS |
| **ai-processor** | Multiple workers with queue partitioning by camera_id |
| **live-detection-agent** | One instance per GPU node; camera assignment |
| **postgres** | RDS with read replicas |
| **milvus** | Milvus cluster mode |
| **minio** | Distributed MinIO or migrate to S3 |

---

## 11. Rollback

### 11.1 Live Surveillance Rollback (from LIVE_SURVEILLANCE.md)

1. Set `NEXT_PUBLIC_ENABLE_LIVE_WS=false` — UI reverts to prior behavior
2. `docker compose stop live-detection-agent` — live pipeline stops; recording continues
3. Remove `live_alerts_router` include from `main.py` for full revert
4. `git revert` the live surveillance commit

### 11.2 Full Stack Rollback

```bash
docker compose down
git checkout <previous-tag>
docker compose up --build -d
```

### 11.3 Database Rollback

> **Warning:** No migration framework. Rollback requires manual SQL or volume restore from backup.

```bash
# Restore PostgreSQL from backup volume
docker compose stop postgres
# Restore pg_data volume from snapshot
docker compose start postgres
```

---

## 12. Frontend Production Deployment

### 12.1 Vercel (Supported Dependency)

`@vercel/analytics` is included in `package.json`.

```bash
cd ui-police
pnpm build
# Deploy to Vercel with environment variables configured
```

### 12.2 Self-Hosted

```bash
cd ui-police
pnpm build
pnpm start  # Port 3000
```

Place behind reverse proxy (nginx) with HTTPS.

---

## Related Documents

- [01_README.md](./01_README.md)
- [06_ARCHITECTURE.md](./06_ARCHITECTURE.md)
- [08_DATABASE_DOCUMENTATION.md](./08_DATABASE_DOCUMENTATION.md)
- [10_TESTING_MANUAL.md](./10_TESTING_MANUAL.md)
