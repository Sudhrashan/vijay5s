"""Photo storage: local disk by default, Supabase Storage when configured (always mocked here)."""
import io
import os

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

import app.services.storage as storage


def _upload(content_type: str, data: bytes = b"fake-image-bytes", name: str = "p.jpg") -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name, headers=Headers({"content-type": content_type}))


def _use_settings(monkeypatch, **overrides):
    monkeypatch.setattr(storage, "settings", storage.settings.model_copy(update=overrides))


def test_settings_never_point_at_real_services():
    from app.core.config import settings
    for s in (settings, storage.settings):
        assert s.SUPABASE_URL is None and s.SUPABASE_SERVICE_KEY is None
        assert s.DATABASE_URL.startswith("sqlite")


def test_local_save_writes_under_upload_dir(monkeypatch, tmp_path):
    _use_settings(monkeypatch, UPLOAD_DIR=str(tmp_path), SUPABASE_URL=None, SUPABASE_SERVICE_KEY=None)
    url = storage.save_photo(_upload("image/png", b"png-bytes"))
    assert url.startswith("/uploads/") and url.endswith(".png")
    saved = tmp_path / url.removeprefix("/uploads/")
    assert saved.read_bytes() == b"png-bytes"
    assert os.listdir(tmp_path) == [saved.name]


def test_invalid_content_type_is_rejected(monkeypatch, tmp_path):
    _use_settings(monkeypatch, UPLOAD_DIR=str(tmp_path))
    with pytest.raises(HTTPException) as exc:
        storage.save_photo(_upload("image/gif"))
    assert exc.value.status_code == 400
    assert os.listdir(tmp_path) == []


def test_supabase_upload_builds_correct_request(monkeypatch, tmp_path):
    base, key, bucket = "https://example-ref.supabase.co", "fake-service-key", "pilot-bucket"
    _use_settings(monkeypatch, UPLOAD_DIR=str(tmp_path), SUPABASE_URL=base,
                  SUPABASE_SERVICE_KEY=key, SUPABASE_BUCKET=bucket)
    calls = []

    def fake_urlopen(req, timeout=None):
        calls.append(req)
        return io.BytesIO(b"{}")
    monkeypatch.setattr(storage.urllib.request, "urlopen", fake_urlopen)

    url = storage.save_photo(_upload("image/jpeg", b"jpeg-bytes"))

    assert len(calls) == 1
    req = calls[0]
    name = req.full_url.rsplit("/", 1)[1]
    assert name.endswith(".jpg")
    assert req.full_url == f"{base}/storage/v1/object/{bucket}/{name}"
    assert req.get_method() == "POST"
    assert req.data == b"jpeg-bytes"
    assert req.get_header("Authorization") == f"Bearer {key}"
    assert req.get_header("Apikey") == key
    assert req.get_header("Content-type") == "image/jpeg"
    assert url == f"{base}/storage/v1/object/public/{bucket}/{name}"
    assert os.listdir(tmp_path) == []  # nothing written locally
