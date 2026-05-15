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

COPY ./shared /app/shared
COPY ./edge-agent/src /app/edge-agent/src
COPY ./edge-agent/requirements.txt /app/edge-agent/requirements.txt

RUN pip install --no-cache-dir -r /app/edge-agent/requirements.txt

WORKDIR /app/edge-agent

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

CMD ["python", "src/main.py"]
