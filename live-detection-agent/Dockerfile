FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    libgl1 \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libsm6 \
    && rm -rf /var/lib/apt/lists/*

COPY shared /app/shared
COPY live-detection-agent/requirements.txt /app/live-detection-agent/requirements.txt
COPY live-detection-agent /app/live-detection-agent

WORKDIR /app/live-detection-agent

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "ultralytics>=8.0.0,<9" --no-deps \
    && python -c "import cv2; import supervision; print('deps OK')"

ENV PYTHONPATH=/app:/app/live-detection-agent
ENV PYTHONUNBUFFERED=1

EXPOSE 8765

CMD ["python", "app.py"]
