"""Photo storage for issues and audit responses.

Local disk (UPLOAD_DIR) by default -- fine for local dev, but most hosts wipe it on every
redeploy. Set SUPABASE_URL + SUPABASE_SERVICE_KEY to upload to Supabase Storage instead, so
photos survive redeploys once this is actually deployed.
"""
import os
import urllib.error
import urllib.request
import uuid

from fastapi import HTTPException, UploadFile

from app.core.config import settings

ALLOWED_PHOTOS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _validate(f: UploadFile) -> str:
    if f.content_type not in ALLOWED_PHOTOS:
        raise HTTPException(400, "Photo must be a JPG, PNG or WebP image")
    return ALLOWED_PHOTOS[f.content_type]


def _save_local(f: UploadFile, ext: str) -> str:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(settings.UPLOAD_DIR, name), "wb") as out:
        out.write(f.file.read())
    return f"/uploads/{name}"


def _save_supabase(f: UploadFile, ext: str) -> str:
    name = f"{uuid.uuid4().hex}{ext}"
    data = f.file.read()
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{name}"
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Content-Type": f.content_type,
            "x-upsert": "false",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise HTTPException(502, f"Photo upload to storage failed: {e.code} {body}") from e
    except urllib.error.URLError as e:
        raise HTTPException(502, f"Photo storage is unreachable: {e.reason}") from e
    except ValueError as e:
        raise HTTPException(500, f"Photo storage settings look wrong ({e}). Check SUPABASE_URL and SUPABASE_SERVICE_KEY on the API service.") from e
    except OSError as e:
        raise HTTPException(502, f"Photo upload to storage was interrupted ({type(e).__name__}). Try again.") from e
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/{name}"


def save_photo(f: UploadFile) -> str:
    """Saves an uploaded photo and returns the URL to store on the record."""
    ext = _validate(f)
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        return _save_supabase(f, ext)
    return _save_local(f, ext)
