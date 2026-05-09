FROM python:3.9-slim

WORKDIR /app

COPY ./shared /app/shared
COPY ./api/src /app/api/src
COPY ./api/requirements.txt /app/api/requirements.txt

RUN pip install --no-cache-dir -r /app/api/requirements.txt

CMD ["uvicorn", "api.src.main:app", "--host", "0.0.0.0", "--port", "8000"]