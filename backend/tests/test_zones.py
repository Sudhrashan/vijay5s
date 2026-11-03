def test_list_zones_any_role(client, seeded_db, auditor_headers):
    resp = client.get("/api/zones", headers=auditor_headers)
    assert resp.status_code == 200
    zones = resp.json()
    assert len(zones) == 11  # matches ZONES in app/db/seed.py
    sample = zones[0]
    assert set(["id", "name", "checkpoints", "qr_token", "open", "closed", "score", "avg_closure"]) <= set(sample)


def test_create_zone_admin_only(client, seeded_db, incharge_headers):
    resp = client.post("/api/zones", headers=incharge_headers, json={"name": "New Zone", "checkpoints": 10})
    assert resp.status_code == 403


def test_create_zone_success(client, seeded_db, admin_headers):
    resp = client.post("/api/zones", headers=admin_headers, json={"name": "Canteen", "checkpoints": 12})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Canteen"
    assert body["checkpoints"] == 12
    assert body["qr_token"]


def test_create_zone_duplicate_name_rejected(client, seeded_db, admin_headers):
    resp = client.post("/api/zones", headers=admin_headers, json={"name": "Warehouse", "checkpoints": 10})
    assert resp.status_code == 409


def test_update_zone(client, seeded_db, admin_headers):
    zones = client.get("/api/zones", headers=admin_headers).json()
    z = next(z for z in zones if z["name"] == "Lab")
    resp = client.patch(f"/api/zones/{z['id']}", headers=admin_headers,
                        json={"name": "Lab", "checkpoints": 18, "incharge_id": z["incharge_id"]})
    assert resp.status_code == 200
    assert resp.json()["checkpoints"] == 18


def test_update_zone_incharge_change_reflected_immediately(client, seeded_db, admin_headers):
    # Regression test: PATCH used to return the zone's stale `incharge` name (or None) in its own
    # response when incharge_id changed, because the SQLAlchemy relationship wasn't refreshed after
    # committing the raw FK column — only a later, separate GET showed the correct name.
    zones = client.get("/api/zones", headers=admin_headers).json()
    users = client.get("/api/users", headers=admin_headers).json()
    incharge = next(u for u in users if u["role"] == "5S Incharge" and u["id"] != zones[0]["incharge_id"])
    z = next(z for z in zones if z["incharge_id"] != incharge["id"])
    resp = client.patch(f"/api/zones/{z['id']}", headers=admin_headers,
                        json={"name": z["name"], "checkpoints": z["checkpoints"], "incharge_id": incharge["id"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["incharge_id"] == incharge["id"]
    assert body["incharge"] == incharge["name"]


def test_update_zone_not_found(client, seeded_db, admin_headers):
    resp = client.patch("/api/zones/999999", headers=admin_headers, json={"name": "No Such Zone", "checkpoints": 5})
    assert resp.status_code == 404


def test_update_zone_requires_admin(client, seeded_db, auditor_headers):
    zones = client.get("/api/zones", headers=auditor_headers).json()
    z = zones[0]
    resp = client.patch(f"/api/zones/{z['id']}", headers=auditor_headers, json={"name": z["name"], "checkpoints": 5})
    assert resp.status_code == 403
