FROM python:3.9-slim

WORKDIR /app

# Copy requirements first
COPY ./stream-processor/requirements.txt /app/stream-processor/requirements.txt

# Install dependencies using pip
RUN pip install --default-timeout=1000 --no-cache-dir -r /app/stream-processor/requirements.txt

# Copy application code
COPY ./shared /app/shared
COPY ./stream-processor/src /app/stream-processor/src

WORKDIR /app/stream-processor

CMD ["python", "src/main.py"]
