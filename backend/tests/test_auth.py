from app.core.config import settings


def test_health_check(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["plant"] == "VD01"


def test_login_success_returns_token_and_user(client, seeded_db):
    resp = client.post("/api/auth/login", json={"emp_id": settings.ADMIN_EMP_ID, "password": settings.ADMIN_PASSWORD})
    assert resp.status_code == 200
    body = resp.json()
    assert "token" in body and body["token"]
    assert body["user"]["emp_id"] == settings.ADMIN_EMP_ID
    assert body["user"]["role"] == "Super Admin"
    assert body["user"]["status"] == "Active"


def test_login_wrong_password_rejected(client, seeded_db):
    resp = client.post("/api/auth/login", json={"emp_id": settings.ADMIN_EMP_ID, "password": "wrong-password"})
    assert resp.status_code == 401
    assert "incorrect" in resp.json()["detail"].lower()


def test_login_unknown_emp_id_rejected(client, seeded_db):
    resp = client.post("/api/auth/login", json={"emp_id": "EMP9999", "password": "whatever"})
    assert resp.status_code == 401


def test_login_case_insensitive_emp_id(client, seeded_db):
    resp = client.post("/api/auth/login", json={"emp_id": settings.ADMIN_EMP_ID.lower(), "password": settings.ADMIN_PASSWORD})
    assert resp.status_code == 200


def test_deactivated_user_cannot_login(client, admin_headers, seeded_db):
    # Find Ravi Kumar (EMP1021, Auditor) and deactivate him via the admin API.
    users = client.get("/api/users", headers=admin_headers).json()
    ravi = next(u for u in users if u["emp_id"] == "EMP1021")
    resp = client.delete(f"/api/users/{ravi['id']}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Inactive"

    login = client.post("/api/auth/login", json={"emp_id": "EMP1021", "password": settings.DEFAULT_USER_PASSWORD})
    assert login.status_code == 401


def test_me_requires_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_returns_current_user(client, auditor_headers):
    resp = client.get("/api/auth/me", headers=auditor_headers)
    assert resp.status_code == 200
    assert resp.json()["emp_id"] == "EMP1021"


def test_me_rejects_garbage_token(client):
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401
