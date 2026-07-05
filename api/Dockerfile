FROM python:3.9-slim

WORKDIR /app

COPY ./api/requirements.txt /app/api/requirements.txt

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --default-timeout=1000 -r /app/api/requirements.txt

COPY ./shared /app/shared
COPY ./api/src /app/api/src

CMD ["uvicorn", "api.src.main:app", "--host", "0.0.0.0", "--port", "8000"]