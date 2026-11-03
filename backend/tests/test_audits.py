from datetime import date, timedelta


def _future_zone_and_auditor(client, headers):
    zones = client.get("/api/zones", headers=headers).json()
    users = client.get("/api/users", headers=headers).json()
    zone = next(z for z in zones if z["name"] == "Warehouse")
    auditor = next(u for u in users if u["emp_id"] == "EMP1021")  # active Auditor
    return zone, auditor


def test_auditor_can_only_submit_assigned_audits(client, seeded_db, auditor_headers):
    me = client.get("/api/auth/me", headers=auditor_headers).json()["id"]
    audits = client.get("/api/audits", headers=auditor_headers).json()["items"]
    open_ = [a for a in audits if a["status"] != "Completed"]
    not_mine = next(a for a in open_ if me not in [u["id"] for u in a["auditors"]])
    mine = next(a for a in open_ if me in [u["id"] for u in a["auditors"]])
    cps = client.get("/api/checkpoints", headers=auditor_headers).json()["items"]
    body = {"responses": [{"checkpoint_id": c["id"], "score": 2} for c in cps]}

    denied = client.post(f"/api/audits/{not_mine['id']}/responses", headers=auditor_headers, json=body)
    assert denied.status_code == 403
    allowed = client.post(f"/api/audits/{mine['id']}/responses", headers=auditor_headers, json=body)
    assert allowed.status_code == 200

    # Photos follow the same rule, and are accepted once the score exists.
    photo = ("p.png", b"\x89PNG\r\n\x1a\n", "image/png")
    cp = cps[0]["id"]
    assert client.post(f"/api/audits/{not_mine['id']}/responses/{cp}/photo", headers=auditor_headers,
                       files={"photo": photo}).status_code == 403
    assert client.post(f"/api/audits/{mine['id']}/responses/{cp}/photo", headers=auditor_headers,
                       files={"photo": photo}).status_code == 200


def test_two_auditors_on_one_zone_only_first_submit_counts(client, seeded_db, admin_headers):
    from tests.conftest import _login
    from app.core.config import settings
    users = client.get("/api/users", headers=admin_headers).json()
    a1, a2 = [u for u in users if u["role"] == "Auditor" and u["status"] == "Active"][:2]
    zone = client.get("/api/zones", headers=admin_headers).json()[0]
    audit = client.post("/api/audits", headers=admin_headers,
                        json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=3)),
                              "auditor_ids": [a1["id"], a2["id"]]}).json()
    cps = client.get("/api/checkpoints", headers=admin_headers).json()["items"]
    h1 = _login(client, a1["emp_id"], settings.DEFAULT_USER_PASSWORD)
    h2 = _login(client, a2["emp_id"], settings.DEFAULT_USER_PASSWORD)

    first = client.post(f"/api/audits/{audit['id']}/responses", headers=h1,
                        json={"responses": [{"checkpoint_id": c["id"], "score": 2} for c in cps]})
    assert first.status_code == 200 and first.json()["score"] == 100
    assert first.json()["submitted_by"] == a1["name"] and first.json()["completed_at"]
    second = client.post(f"/api/audits/{audit['id']}/responses", headers=h2,
                         json={"responses": [{"checkpoint_id": c["id"], "score": 0} for c in cps]})
    assert second.status_code == 409
    assert f"by {a1['name']}" in second.json()["detail"]
    # The partner's Home list shows who submitted it.
    listed = client.get("/api/audits", headers=h2, params={"cycle": audit["cycle"]}).json()["items"]
    assert next(x for x in listed if x["id"] == audit["id"])["submitted_by_id"] == a1["id"]
    saved = client.get(f"/api/audits/{audit['id']}/responses", headers=h2).json()["items"]
    assert len(saved) == 34 and all(r["score"] == 2 for r in saved)  # partner's scores were not overwritten


def test_list_checkpoints(client, seeded_db, auditor_headers):
    resp = client.get("/api/checkpoints", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["max_score"] == 68
    assert len(body["items"]) == 34


def test_list_audits_current_cycle(client, seeded_db, auditor_headers):
    resp = client.get("/api/audits", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body and "cycle" in body


def test_schedule_audit_requires_staff(client, seeded_db, auditor_headers):
    zone, auditor = _future_zone_and_auditor(client, auditor_headers)
    resp = client.post("/api/audits", headers=auditor_headers,
                        json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                              "auditor_ids": [auditor["id"]]})
    assert resp.status_code == 403


def test_schedule_audit_success(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    planned = date.today() + timedelta(days=5)
    resp = client.post("/api/audits", headers=incharge_headers,
                        json={"zone_id": zone["id"], "planned_date": str(planned), "auditor_ids": [auditor["id"]]})
    assert resp.status_code == 201
    body = resp.json()
    assert body["zone_id"] == zone["id"]
    assert body["cycle"] == planned.strftime("%Y-%m")
    assert [a["id"] for a in body["auditors"]] == [auditor["id"]]


def test_schedule_audit_rejects_inactive_or_non_auditor(client, seeded_db, incharge_headers, admin_headers):
    zone, _ = _future_zone_and_auditor(client, incharge_headers)
    users = client.get("/api/users", headers=incharge_headers).json()
    super_admin = next(u for u in users if u["role"] == "Super Admin")
    resp = client.post("/api/audits", headers=incharge_headers,
                        json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                              "auditor_ids": [super_admin["id"]]})
    assert resp.status_code == 400


def test_schedule_audit_unknown_zone(client, seeded_db, incharge_headers):
    resp = client.post("/api/audits", headers=incharge_headers,
                        json={"zone_id": 999999, "planned_date": str(date.today() + timedelta(days=5)), "auditor_ids": []})
    assert resp.status_code == 404


def test_patch_audit_reschedule_missed_reactivates(client, seeded_db, incharge_headers, db_session):
    from app.models import Audit
    missed = db_session.query(Audit).filter(Audit.status == "Missed").first()
    assert missed is not None, "seed data should contain at least one Missed audit"
    new_date = date.today() + timedelta(days=10)
    resp = client.patch(f"/api/audits/{missed.id}", headers=incharge_headers, json={"planned_date": str(new_date)})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Scheduled"
    assert body["planned_date"] == str(new_date)


def test_patch_audit_missed_requires_reason(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    resp = client.patch(f"/api/audits/{scheduled['id']}", headers=incharge_headers, json={"status": "Missed"})
    assert resp.status_code == 400
    resp2 = client.patch(f"/api/audits/{scheduled['id']}", headers=incharge_headers,
                         json={"status": "Missed", "missed_reason": "Line shutdown"})
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "Missed"


def test_patch_audit_invalid_status_rejected(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    resp = client.patch(f"/api/audits/{scheduled['id']}", headers=incharge_headers, json={"status": "Bogus"})
    assert resp.status_code == 400


def test_patch_audit_not_found(client, seeded_db, incharge_headers):
    resp = client.patch("/api/audits/999999", headers=incharge_headers, json={"score": 90})
    assert resp.status_code == 404


def _checkpoint_ids(client, headers):
    items = client.get("/api/checkpoints", headers=headers).json()["items"]
    return [c["id"] for c in items]


def test_submit_audit_responses_computes_score(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    cps = _checkpoint_ids(client, incharge_headers)
    assert len(cps) == 34
    # Max score on every checkpoint -> 34 * 2 = 68 -> 100%.
    responses = [{"checkpoint_id": cid, "score": 2} for cid in cps]
    resp = client.post(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers, json={"responses": responses})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Completed"
    assert body["score"] == 100

    get_resp = client.get(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers)
    assert get_resp.status_code == 200
    assert len(get_resp.json()["items"]) == 34


def test_submit_audit_responses_partial_score(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    cps = _checkpoint_ids(client, incharge_headers)
    # Score 1 (half of 2) on every checkpoint -> 50%.
    responses = [{"checkpoint_id": cid, "score": 1} for cid in cps]
    resp = client.post(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers, json={"responses": responses})
    assert resp.status_code == 200
    assert resp.json()["score"] == 50


def test_submit_audit_responses_rejects_invalid_checkpoint(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    resp = client.post(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers,
                        json={"responses": [{"checkpoint_id": 999999, "score": 2}]})
    assert resp.status_code == 400


def test_submit_audit_responses_rejects_invalid_score(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    cps = _checkpoint_ids(client, incharge_headers)
    resp = client.post(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers,
                        json={"responses": [{"checkpoint_id": cps[0], "score": 1.25}]})
    assert resp.status_code == 422


def test_submit_audit_responses_blocked_once_completed(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    cps = _checkpoint_ids(client, incharge_headers)
    responses = [{"checkpoint_id": cid, "score": 2} for cid in cps]
    first = client.post(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers, json={"responses": responses})
    assert first.status_code == 200

    second = client.post(f"/api/audits/{scheduled['id']}/responses", headers=incharge_headers, json={"responses": responses})
    assert second.status_code == 409
    assert "already been submitted" in second.json()["detail"].lower()


def test_allocation_save_replaces_not_adds(client, seeded_db, incharge_headers):
    """PUT /api/allocation must REPLACE each audit's auditor list, not append to it."""
    zone, _ = _future_zone_and_auditor(client, incharge_headers)
    users = client.get("/api/users", headers=incharge_headers).json()
    auditors = [u for u in users if u["role"] == "Auditor" and u["status"] == "Active"]
    a1, a2 = auditors[0], auditors[1]

    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=6)),
                                  "auditor_ids": [a1["id"]]}).json()
    assert [a["id"] for a in scheduled["auditors"]] == [a1["id"]]

    # First allocation call sets auditors to [a1, a2].
    resp1 = client.put("/api/allocation", headers=incharge_headers,
                        json={"rows": [{"audit_id": scheduled["id"], "auditor_ids": [a1["id"], a2["id"]]}]})
    assert resp1.status_code == 200
    assert resp1.json()["changed"] == 1

    audits = client.get("/api/audits", headers=incharge_headers,
                        params={"cycle": scheduled["cycle"]}).json()["items"]
    row = next(a for a in audits if a["id"] == scheduled["id"])
    assert sorted(a["id"] for a in row["auditors"]) == sorted([a1["id"], a2["id"]])

    # Second allocation call sets auditors to [a2] only -- must REPLACE, leaving a1 removed.
    resp2 = client.put("/api/allocation", headers=incharge_headers,
                        json={"rows": [{"audit_id": scheduled["id"], "auditor_ids": [a2["id"]]}]})
    assert resp2.status_code == 200
    assert resp2.json()["changed"] == 1

    audits2 = client.get("/api/audits", headers=incharge_headers,
                         params={"cycle": scheduled["cycle"]}).json()["items"]
    row2 = next(a for a in audits2 if a["id"] == scheduled["id"])
    assert [a["id"] for a in row2["auditors"]] == [a2["id"]]


def test_allocation_save_no_change_when_same_set(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=7)),
                                  "auditor_ids": [auditor["id"]]}).json()
    resp = client.put("/api/allocation", headers=incharge_headers,
                       json={"rows": [{"audit_id": scheduled["id"], "auditor_ids": [auditor["id"]]}]})
    assert resp.status_code == 200
    assert resp.json()["changed"] == 0


def test_allocation_requires_staff(client, seeded_db, auditor_headers):
    resp = client.put("/api/allocation", headers=auditor_headers, json={"rows": []})
    assert resp.status_code == 403


def test_allocation_unknown_audit_rejected(client, seeded_db, incharge_headers):
    resp = client.put("/api/allocation", headers=incharge_headers,
                       json={"rows": [{"audit_id": 999999, "auditor_ids": []}]})
    assert resp.status_code == 404


def test_start_cycle_creates_audits(client, seeded_db, incharge_headers):
    from app.services.stats import current_cycle, shift
    future_cycle = shift(current_cycle(), 6)
    resp = client.post("/api/audits/cycle", headers=incharge_headers, json={"cycle": future_cycle})
    assert resp.status_code == 201
    body = resp.json()
    assert body["cycle"] == future_cycle
    assert body["created"] == 11 * 2  # 11 zones x default audits_per_zone_per_month (2)


def test_start_cycle_duplicate_rejected(client, seeded_db, incharge_headers):
    from app.services.stats import current_cycle, shift
    future_cycle = shift(current_cycle(), 7)
    first = client.post("/api/audits/cycle", headers=incharge_headers, json={"cycle": future_cycle})
    assert first.status_code == 201
    second = client.post("/api/audits/cycle", headers=incharge_headers, json={"cycle": future_cycle})
    assert second.status_code == 409
