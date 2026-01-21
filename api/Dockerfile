FROM python:3.9-slim

WORKDIR /app

# Copy requirements first
COPY ./api/requirements.txt /app/api/requirements.txt

# Install dependencies using pip
RUN pip install --no-cache-dir -r /app/api/requirements.txt

# Copy application code
COPY ./shared /app/shared
COPY ./api/src /app/api/src

WORKDIR /app

CMD ["uvicorn", "api.src.main:app", "--host", "0.0.0.0", "--port", "8000"]
