FROM python:3.9-slim



# Install uv (Removed)
# ENV UV_HTTP_TIMEOUT=1000
# ENV UV_CONCURRENT_DOWNLOADS=1
# ENV UV_CONCURRENT_INSTALLS=1

WORKDIR /app

# 1. System Dependencies (Rarely change) - Cached first
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 2. Python Dependencies (Change strictly with requirements.txt)
COPY ./edge-agent/requirements.txt /app/edge-agent/requirements.txt
RUN pip install --default-timeout=1000 --no-cache-dir -r /app/edge-agent/requirements.txt

# 3. Application Code (Changes frequently)
COPY ./shared /app/shared
COPY ./edge-agent/src /app/edge-agent/src

WORKDIR /app/edge-agent

CMD ["python", "src/main.py"]
