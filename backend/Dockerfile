FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# app code + Alembic migrations (run_migrations() on startup needs alembic.ini and alembic/)
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
# Local fallback only; in production photos go to Supabase Storage (SUPABASE_URL set).
ENV UPLOAD_DIR=/data/uploads
EXPOSE 8000
# Railway injects PORT. HOST defaults to "::" (IPv6 + IPv4) so Railway private networking
# (api.railway.internal) can reach it; docker-compose sets HOST=0.0.0.0.
CMD ["sh", "-c", "exec uvicorn app.main:app --host ${HOST:-::} --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
