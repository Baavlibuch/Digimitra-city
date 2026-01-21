# Run Instructions

This guide provides the correct steps to run the Digimitra-city project using our configured Docker environment.

## Prerequisites

- **Docker Desktop** installed and running.
- **NVIDIA GPU Drivers** (for `edge-agent` GPU support).
- **Git** (to clone/pull the repository).

## Configuration

The project uses `docker-compose.yml` which comes with pre-configured default environment variables. No manual `.env` file creation is strictly necessary for local development unless you wish to override specific secrets (e.g., `JWT_SECRET`, `MINIO_PASSWORD`).

## Running the Application

### 1. Build and Start Services

Run the following command in the root directory:

```bash
docker-compose up --build
```
*Add `-d` to run in detached mode (background).*

### 2. Verify Services

Wait for a few minutes for all services (especially Redpanda, Milvus, and Postgres) to initialize.

You can check the status of containers:
```bash
docker-compose ps
```

### 3. Accessing Interfaces

- **API Documentation (FastAPI):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **MinIO Console (Storage):** [http://localhost:9001](http://localhost:9001)
  - **User:** `minioadmin`
  - **Password:** `minioadmin`
- **Redpanda Console (Kafka UI):** [http://localhost:8080](http://localhost:8080)
- **Milvus (Vector DB):** Available at `localhost:19530`.

## Notes on Specific Services

### Edge Agent (GPU Support)
The `edge-agent` service is configured to use the host network and NVIDIA runtime:
```yaml
    network: host
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [ gpu ]
```
**Windows Users:** If you are running on Windows via WSL2, ensure you have the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) configured if you intend to use GPU acceleration. `network: host` may behave differently on Windows/Mac; if you encounter connectivity issues, ensure ports are correctly mapped (though `host` network bypasses port mapping).

### Data Persistence
All data is persisted in Docker volumes:
- `pg_data` (Postgres)
- `minio_data` (Object Storage)
- `milvus_data` (Vector Embeddings)
- `hls_data` (Video Stream Segments)

To reset the system completely, run:
```bash
docker-compose down -v
```

## Troubleshooting

- **Service failing to connect:** Ensure you gave the system enough time to start up. Redpanda and Milvus can take 1-2 minutes on the first run.
- **Port Conflicts:** Ensure ports `8000`, `8080`, `9000`, `9001`, `5432` are not occupied by other applications.
- **GPU Errors:** If you lack a GPU, you may need to modify `docker-compose.yml` to remove the `deploy` section under `edge-agent` and switch `device: cpu` in the code if applicable.
