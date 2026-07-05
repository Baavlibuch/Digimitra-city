FROM python:3.9-slim

WORKDIR /app/ai-processor

# opencv-python-headless wheels still link libxcb / libGL (no GUI apps; no GTK/Qt).
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

COPY ai-processor/requirements.txt /app/ai-processor/requirements.txt

# Ultralytics metadata requires opencv-python; that would pull GUI OpenCV. Use headless + --no-deps.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --default-timeout=1000 -r /app/ai-processor/requirements.txt \
    && pip install --no-cache-dir --default-timeout=1000 "ultralytics>=8.0.0,<9" --no-deps

COPY shared /app/shared
COPY ai-processor /app/ai-processor

RUN if pip freeze | grep -qE '^opencv-python=='; then echo "ERROR: GUI opencv-python must not be installed"; exit 1; fi \
    && python -c "import cv2; print('cv2 OK', cv2.__version__)"

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

CMD ["python", "app.py"]
