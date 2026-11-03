# Vijay 5S Console

## Run locally (no Docker)
```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# quickest start: use SQLite
export DATABASE_URL=sqlite:///./dev.db UPLOAD_DIR=./uploads
uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd frontend && npm install && npm run dev      # http://localhost:5173
```
Sign in: `EMP1001` / `admin123` (any other seeded user: `vijay123`). Seed data loads on first start.
API docs: http://localhost:8000/api/docs

## Run everything with Docker
```bash
docker compose up --build      # http://localhost:8080
```

## Deploy to the cloud
Build two images (`backend/Dockerfile`, `frontend/Dockerfile`) and run them behind one domain.
- Database: managed PostgreSQL (Azure Database for PostgreSQL / AWS RDS / Cloud SQL). Set `DATABASE_URL`.
- Redis: managed Redis; set `REDIS_URL` so several API replicas share live events.
- Photos: mount a persistent volume at `UPLOAD_DIR`, or move to S3 / Azure Blob (see `_save_photo` in routes/issues.py).
- Set: `JWT_SECRET` (long random), `CORS_ORIGINS`, `SEED_ON_START=false` after first boot, and change the seeded passwords.
- The load balancer must allow WebSocket upgrades on `/ws` (nginx.conf shows how).
