FROM python:3.9-slim

WORKDIR /app

COPY ./shared /app/shared
COPY ./stream-processor/src /app/stream-processor/src
COPY ./stream-processor/requirements.txt /app/stream-processor/requirements.txt

RUN pip install --no-cache-dir -r /app/stream-processor/requirements.txt

WORKDIR /app/stream-processor

ENV PYTHONPATH=/app:/app/stream-processor/src

CMD ["python", "src/main.py"]
