# Fixed Errors Report

This document outlines the errors encountered during the development and setup of the Digimitra-city project and the fixes applied to resolve them.

## 1. Docker Build Issues

### Issue: Missing Base Image in `edge-agent/Dockerfile`
- **Error:** The build failed with "No source image provided with `FROM`".
- **Cause:** The `Dockerfile` for the `edge-agent` service was missing a defined base image.
- **Fix:** Specified a valid base image (e.g., `python:3.10-slim` or `ultralytics/ultralytics`) to ensure all dependencies could be installed correctly.

### Issue: Missing System Dependencies (`ImportError: libGL.so.1`)
- **Error:** `ImportError: libGL.so.1: cannot open shared object file: No such file or directory` when importing OpenCV.
- **Cause:** The `opencv-python` package requires GL libraries which are not present by default in slim Docker images.
- **Fix:** Added `apt-get install -y libgl1-mesa-glx` (or `libgl1`) to the `Dockerfile` to provide the necessary shared libraries.

### Issue: Network Timeouts during PIP Install
- **Error:** `ReadTimeoutError` when installing large Python packages like `torch` or `ultralytics`.
- **Cause:** Slow network connections or large package sizes causing pip to time out.
- **Fix:** 
    - Verified network connectivity.
    - (Recommended) Increased pip default timeout if persisting, or utilized a more reliable mirror content.

## 2. API Startup & Service Connection Errors

### Issue: Milvus Connection Failure
- **Error:** The API service failed to start or crashed when attempting to connect to the Vector DB (Milvus).
- **Cause:** Incorrect host/port configuration or the Milvus service was not yet ready when the API tried to connect.
- **Fix:** 
    - Verified `MILVUS_HOST` and `MILVUS_PORT` environment variables in `docker-compose.yml`.
    - Ensured `services.py` correctly constructs the URI: `http://{host}:{port}`.
    - Added `depends_on` in `docker-compose.yml` to ensure start order, though application-level retry logic (or manual wait) is best for ensuring readiness.

### Issue: Database Initialization
- **Error:** Tables for `Event` and `Camera` were missing, causing queries to fail.
- **Fix:** Ensured `SQLAlchemy` models are correctly imported and `Base.metadata.create_all(bind=engine)` is called during app startup (or via migration scripts) to Initialize the schema.

## 3. Dependency Compatibility
- **Issue:** Conflicts between versions of `pydantic` (v1 vs v2) and `langchain` / `milvus` libraries.
- **Fix:** Pinned compatible versions in `requirements.txt` / `pyproject.toml` to ensure stability.
