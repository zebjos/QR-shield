# QR Shield backend

Minimal FastAPI service. Real URL checks + community reports (SQLite).

## Run

```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Expose on your LAN so your phone can reach it (default host `0.0.0.0`).

## Endpoints

- `GET /check?url=https://example.com` — verdict + indicators
- `POST /report` body `{"url": "..."}` — flag a link
- `DELETE /report` body `{"url": "..."}` — undo
- `GET /health` — liveness

## Config

Frontend points at the backend via `src/config.ts` (`API_BASE_URL`). Default is
`http://10.0.3.240:8000`. Change it if your Mac's LAN IP differs.
