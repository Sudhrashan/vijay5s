from app.core.config import settings


def test_list_users_any_role(client, seeded_db, auditor_headers):
    resp = client.get("/api/users", headers=auditor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 20


def test_create_user_admin_only(client, seeded_db, auditor_headers):
    resp = client.post("/api/users", headers=auditor_headers,
                        json={"emp_id": "EMP9000", "name": "New Guy", "role": "Auditor"})
    assert resp.status_code == 403


def test_create_user_success(client, seeded_db, admin_headers):
    resp = client.post("/api/users", headers=admin_headers,
                        json={"emp_id": "emp9000", "name": "New Guy", "role": "Auditor", "email": "n@x.com"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["emp_id"] == "EMP9000"  # normalised to uppercase
    assert body["status"] == "Active"

    # default password applies when none supplied
    login = client.post("/api/auth/login", json={"emp_id": "EMP9000", "password": settings.DEFAULT_USER_PASSWORD})
    assert login.status_code == 200


def test_create_user_duplicate_emp_id_rejected(client, seeded_db, admin_headers):
    resp = client.post("/api/users", headers=admin_headers,
                        json={"emp_id": "EMP1021", "name": "Dup", "role": "Auditor"})
    assert resp.status_code == 409


def test_create_user_invalid_role_rejected(client, seeded_db, admin_headers):
    resp = client.post("/api/users", headers=admin_headers,
                        json={"emp_id": "EMP9001", "name": "Bad Role", "role": "Manager"})
    assert resp.status_code == 422


def test_patch_user_updates_fields(client, seeded_db, admin_headers):
    users = client.get("/api/users", headers=admin_headers).json()
    ravi = next(u for u in users if u["emp_id"] == "EMP1021")
    resp = client.patch(f"/api/users/{ravi['id']}", headers=admin_headers, json={"name": "Ravi K. Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Ravi K. Updated"


def test_patch_user_password_changes_login(client, seeded_db, admin_headers):
    users = client.get("/api/users", headers=admin_headers).json()
    ravi = next(u for u in users if u["emp_id"] == "EMP1021")
    resp = client.patch(f"/api/users/{ravi['id']}", headers=admin_headers, json={"password": "newpass123"})
    assert resp.status_code == 200

    old_login = client.post("/api/auth/login", json={"emp_id": "EMP1021", "password": settings.DEFAULT_USER_PASSWORD})
    assert old_login.status_code == 401
    new_login = client.post("/api/auth/login", json={"emp_id": "EMP1021", "password": "newpass123"})
    assert new_login.status_code == 200


def test_patch_user_not_found(client, seeded_db, admin_headers):
    resp = client.patch("/api/users/999999", headers=admin_headers, json={"name": "Nobody"})
    assert resp.status_code == 404


def test_deactivate_user_sets_inactive_never_deletes(client, seeded_db, admin_headers):
    users = client.get("/api/users", headers=admin_headers).json()
    ravi = next(u for u in users if u["emp_id"] == "EMP1021")
    resp = client.delete(f"/api/users/{ravi['id']}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Inactive"

    # Still listed (never deleted), just inactive.
    users_after = client.get("/api/users", headers=admin_headers).json()
    still_there = next(u for u in users_after if u["emp_id"] == "EMP1021")
    assert still_there["status"] == "Inactive"


def test_cannot_deactivate_last_active_super_admin(client, seeded_db, admin_headers):
    users = client.get("/api/users", headers=admin_headers).json()
    admin = next(u for u in users if u["emp_id"] == settings.ADMIN_EMP_ID)
    resp = client.delete(f"/api/users/{admin['id']}", headers=admin_headers)
    assert resp.status_code == 400
    assert "super admin" in resp.json()["detail"].lower()


def test_deactivate_user_requires_admin(client, seeded_db, incharge_headers):
    users = client.get("/api/users", headers=incharge_headers).json()
    ravi = next(u for u in users if u["emp_id"] == "EMP1021")
    resp = client.delete(f"/api/users/{ravi['id']}", headers=incharge_headers)
    assert resp.status_code == 403
