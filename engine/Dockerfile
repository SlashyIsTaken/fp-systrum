# Build from the repo root:  docker build -f engine/Dockerfile .
FROM python:3.12-slim

WORKDIR /app/engine

COPY engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY engine/ /app/engine/
COPY examples/ /app/examples/

ENV PYTHONPATH=/app/engine
ENV SYSTRUM_CONFIG=/app/examples/demo-shop/systrum.yml
ENV SYSTRUM_DB=/app/engine/data/systrum.sqlite

EXPOSE 8000
CMD ["uvicorn", "systrum.main:app", "--host", "0.0.0.0", "--port", "8000"]
