FROM python:3.12-slim

# libzbar0 is the native lib pyzbar wraps for QR decoding.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libzbar0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py threat_intel.py trusted_sources.py ./

# SQLite file lives in /data (mounted volume), not next to the code.
ENV DB_PATH=/data/reports.sqlite3
RUN mkdir -p /data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
