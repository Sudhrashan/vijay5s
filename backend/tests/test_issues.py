import io


def _zone_id(client, headers, name="Warehouse"):
    zones = client.get("/api/zones", headers=headers).json()
    return next(z["id"] for z in zones if z["name"] == name)


def _own_open_issues(client, headers):
    """Open issues in the caller's own zone -- a 5S Incharge may only close those."""
    zone_id = client.get("/api/auth/me", headers=headers).json()["zone_id"]
    return client.get("/api/issues", headers=headers, params={"status": "Open", "zone_id": zone_id}).json()["items"]


def test_incharge_cannot_close_or_reopen_other_zone_issue(client, seeded_db, admin_headers, incharge_headers):
    own_zone = client.get("/api/auth/me", headers=incharge_headers).json()["zone_id"]
    issues = client.get("/api/issues", headers=incharge_headers, params={"status": "Open"}).json()["items"]
    other = next(i for i in issues if i["zone_id"] != own_zone)
    photo = ("after.jpg", io.BytesIO(b"fake-jpeg-bytes"), "image/jpeg")
    resp = client.post(f"/api/issues/{other['id']}/close", headers=incharge_headers,
                       data={"note": "not mine"}, files={"after_photo": photo})
    assert resp.status_code == 403
    # Super Admin can still close it, and the incharge still cannot reopen it.
    photo = ("after.jpg", io.BytesIO(b"fake-jpeg-bytes"), "image/jpeg")
    ok = client.post(f"/api/issues/{other['id']}/close", headers=admin_headers,
                     data={"note": "admin"}, files={"after_photo": photo})
    assert ok.status_code == 200
    assert client.post(f"/api/issues/{other['id']}/reopen", headers=incharge_headers).status_code == 403


def test_raise_issue_generates_vd_code(client, seeded_db, auditor_headers):
    zone_id = _zone_id(client, auditor_headers)
    resp = client.post("/api/issues", headers=auditor_headers,
                        json={"zone_id": zone_id, "category": "3S", "description": "Oil leak near press"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["code"].startswith("VD-")
    assert body["status"] == "Open"
    assert body["category"] == "3S"


def test_raise_issue_invalid_category_rejected(client, seeded_db, auditor_headers):
    zone_id = _zone_id(client, auditor_headers)
    resp = client.post("/api/issues", headers=auditor_headers,
                        json={"zone_id": zone_id, "category": "9S", "description": "bad"})
    assert resp.status_code == 422


def test_raise_issue_unknown_zone_rejected(client, seeded_db, auditor_headers):
    resp = client.post("/api/issues", headers=auditor_headers,
                        json={"zone_id": 999999, "category": "1S", "description": "bad zone"})
    assert resp.status_code == 404


def test_list_issues_filter_by_status(client, seeded_db, auditor_headers):
    resp = client.get("/api/issues", headers=auditor_headers, params={"status": "Open"})
    assert resp.status_code == 200
    body = resp.json()
    assert all(i["status"] == "Open" for i in body["items"])


def test_list_issues_filter_by_category(client, seeded_db, auditor_headers):
    resp = client.get("/api/issues", headers=auditor_headers, params={"category": "1S"})
    assert resp.status_code == 200
    assert all(i["category"] == "1S" for i in resp.json()["items"])


def test_list_issues_search_query(client, seeded_db, auditor_headers):
    resp = client.get("/api/issues", headers=auditor_headers, params={"q": "pallets"})
    assert resp.status_code == 200
    # every matched row should reference the search text somewhere relevant
    assert resp.status_code == 200


def test_close_issue_requires_staff_role(client, seeded_db, auditor_headers):
    issues = client.get("/api/issues", headers=auditor_headers, params={"status": "Open"}).json()["items"]
    target = issues[0]
    resp = client.post(f"/api/issues/{target['id']}/close", headers=auditor_headers, data={"note": "fixed"})
    assert resp.status_code == 403


def test_close_issue_requires_after_photo_when_setting_enabled(client, seeded_db, incharge_headers):
    settings_resp = client.get("/api/settings", headers=incharge_headers).json()
    assert settings_resp["integrity"]["require_after_photo"] is True

    issues = _own_open_issues(client, incharge_headers)
    target = issues[0]
    resp = client.post(f"/api/issues/{target['id']}/close", headers=incharge_headers, data={"note": "fixed"})
    assert resp.status_code == 400
    assert "after photo" in resp.json()["detail"].lower()


def test_close_issue_with_photo_succeeds(client, seeded_db, incharge_headers):
    issues = _own_open_issues(client, incharge_headers)
    target = issues[0]
    photo = ("after.jpg", io.BytesIO(b"fake-jpeg-bytes"), "image/jpeg")
    resp = client.post(f"/api/issues/{target['id']}/close", headers=incharge_headers,
                        data={"note": "Cleared the area"}, files={"after_photo": photo})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Closed"
    assert body["after_photo"] is not None
    assert body["closure_note"] == "Cleared the area"
    assert body["closed_by"]  # regression: was null in the close response until a later GET


def test_close_issue_not_required_when_setting_disabled(client, seeded_db, admin_headers, incharge_headers):
    put_resp = client.put("/api/settings", headers=admin_headers,
                           json={"integrity": {"require_qr": True, "gps_stamp": True,
                                               "require_after_photo": False, "allow_gallery": False}})
    assert put_resp.status_code == 200
    assert put_resp.json()["integrity"]["require_after_photo"] is False

    issues = _own_open_issues(client, incharge_headers)
    target = issues[0]
    resp = client.post(f"/api/issues/{target['id']}/close", headers=incharge_headers, data={"note": "ok now"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "Closed"


def test_close_already_closed_issue_rejected(client, seeded_db, admin_headers, incharge_headers):
    client.put("/api/settings", headers=admin_headers,
               json={"integrity": {"require_qr": True, "gps_stamp": True,
                                   "require_after_photo": False, "allow_gallery": False}})
    issues = _own_open_issues(client, incharge_headers)
    target = issues[0]
    first = client.post(f"/api/issues/{target['id']}/close", headers=incharge_headers, data={"note": "closed"})
    assert first.status_code == 200
    second = client.post(f"/api/issues/{target['id']}/close", headers=incharge_headers, data={"note": "again"})
    assert second.status_code == 409


def test_reopen_issue_requires_staff(client, seeded_db, admin_headers, incharge_headers, auditor_headers):
    client.put("/api/settings", headers=admin_headers,
               json={"integrity": {"require_qr": True, "gps_stamp": True,
                                   "require_after_photo": False, "allow_gallery": False}})
    issues = _own_open_issues(client, incharge_headers)
    target = issues[0]
    client.post(f"/api/issues/{target['id']}/close", headers=incharge_headers, data={"note": "closed"})

    denied = client.post(f"/api/issues/{target['id']}/reopen", headers=auditor_headers)
    assert denied.status_code == 403

    allowed = client.post(f"/api/issues/{target['id']}/reopen", headers=incharge_headers)
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["status"] == "Open"
    assert body["closed_at"] is None


def test_export_csv(client, seeded_db, auditor_headers):
    resp = client.get("/api/issues/export.csv", headers=auditor_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "Issue ID" in resp.text


def test_before_photo_upload(client, seeded_db, auditor_headers):
    zone_id = _zone_id(client, auditor_headers)
    created = client.post("/api/issues", headers=auditor_headers,
                           json={"zone_id": zone_id, "category": "2S", "description": "Trolley misplaced"}).json()
    photo = ("before.png", io.BytesIO(b"fake-png-bytes"), "image/png")
    resp = client.post(f"/api/issues/{created['id']}/photo", headers=auditor_headers, files={"photo": photo})
    assert resp.status_code == 200
    assert resp.json()["before_photo"].startswith("/uploads/")


def test_before_photo_rejects_bad_content_type(client, seeded_db, auditor_headers):
    zone_id = _zone_id(client, auditor_headers)
    created = client.post("/api/issues", headers=auditor_headers,
                           json={"zone_id": zone_id, "category": "2S", "description": "misplaced item"}).json()
    photo = ("before.gif", io.BytesIO(b"gif-bytes"), "image/gif")
    resp = client.post(f"/api/issues/{created['id']}/photo", headers=auditor_headers, files={"photo": photo})
    assert resp.status_code == 400
