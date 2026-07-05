FROM python:3.9-slim

WORKDIR /app

COPY ./stream-processor/requirements.txt /app/stream-processor/requirements.txt

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --default-timeout=1000 -r /app/stream-processor/requirements.txt

COPY ./shared /app/shared
COPY ./stream-processor/src /app/stream-processor/src

WORKDIR /app/stream-processor

ENV PYTHONPATH=/app:/app/stream-processor/src
ENV PYTHONUNBUFFERED=1

CMD ["python", "src/main.py"]
