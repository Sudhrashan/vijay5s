from datetime import date, timedelta

PHOTO = ("p.png", b"\x89PNG\r\n\x1a\n", "image/png")


def _future_zone_and_auditor(client, headers):
    zones = client.get("/api/zones", headers=headers).json()
    users = client.get("/api/users", headers=headers).json()
    zone = next(z for z in zones if z["name"] == "Warehouse")
    auditor = next(u for u in users if u["emp_id"] == "EMP1021")  # active Auditor
    return zone, auditor


def _add_finding(client, headers, audit_id, category="1S", remark="Pallets blocking aisle"):
    return client.post(f"/api/audits/{audit_id}/findings", headers=headers,
                       data={"category": category, "remark": remark}, files={"photo": PHOTO})


def test_auditor_can_only_log_findings_on_assigned_audits(client, seeded_db, auditor_headers):
    me = client.get("/api/auth/me", headers=auditor_headers).json()["id"]
    audits = client.get("/api/audits", headers=auditor_headers).json()["items"]
    open_ = [a for a in audits if a["status"] != "Completed"]
    not_mine = next(a for a in open_ if me not in [u["id"] for u in a["auditors"]])
    mine = next(a for a in open_ if me in [u["id"] for u in a["auditors"]])

    denied = _add_finding(client, auditor_headers, not_mine["id"])
    assert denied.status_code == 403
    allowed = _add_finding(client, auditor_headers, mine["id"])
    assert allowed.status_code == 201
    body = allowed.json()
    assert body["category"] == "1S" and body["remark"] == "Pallets blocking aisle" and body["photo_url"]

    assert client.post(f"/api/audits/{not_mine['id']}/complete", headers=auditor_headers).status_code == 403


def test_finding_requires_photo_category_and_remark(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    aid = scheduled["id"]

    # Missing photo
    resp = client.post(f"/api/audits/{aid}/findings", headers=incharge_headers,
                       data={"category": "1S", "remark": "Some remark here"})
    assert resp.status_code == 422

    # Bad category
    resp = client.post(f"/api/audits/{aid}/findings", headers=incharge_headers,
                       data={"category": "9S", "remark": "Some remark here"}, files={"photo": PHOTO})
    assert resp.status_code == 422

    # Remark too short
    resp = client.post(f"/api/audits/{aid}/findings", headers=incharge_headers,
                       data={"category": "1S", "remark": "ab"}, files={"photo": PHOTO})
    assert resp.status_code == 422

    # Missing remark entirely
    resp = client.post(f"/api/audits/{aid}/findings", headers=incharge_headers,
                       data={"category": "1S"}, files={"photo": PHOTO})
    assert resp.status_code == 422


def test_complete_fails_with_zero_findings(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    resp = client.post(f"/api/audits/{scheduled['id']}/complete", headers=incharge_headers)
    assert resp.status_code == 400


def test_log_findings_then_complete(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    aid = scheduled["id"]
    assert _add_finding(client, incharge_headers, aid, "1S", "Unused pallets in aisle").status_code == 201
    assert _add_finding(client, incharge_headers, aid, "3S", "Oil leak near machine").status_code == 201

    listed = client.get(f"/api/audits/{aid}/findings", headers=incharge_headers).json()["items"]
    assert len(listed) == 2
    assert listed[0]["category"] == "1S" and listed[1]["category"] == "3S"

    resp = client.post(f"/api/audits/{aid}/complete", headers=incharge_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Completed"
    assert "score" not in body


def test_gallery_lists_findings_by_zone_and_category(client, seeded_db, admin_headers, auditor_headers):
    zone, auditor = _future_zone_and_auditor(client, admin_headers)
    scheduled = client.post("/api/audits", headers=admin_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    aid, cyc = scheduled["id"], scheduled["cycle"]
    _add_finding(client, admin_headers, aid, "1S", "Scrap lying near dock")
    _add_finding(client, admin_headers, aid, "3S", "Dust on control panel")

    rows = client.get("/api/findings", headers=admin_headers, params={"cycle": cyc, "zone_id": zone["id"]}).json()["items"]
    mine = [r for r in rows if r["audit_id"] == aid]
    assert {r["category"] for r in mine} == {"1S", "3S"}
    assert all(r["zone"] == "Warehouse" and r["zone_id"] == zone["id"] and r["photo_url"] for r in rows)
    assert auditor["name"] in mine[0]["auditors"]

    only3 = client.get("/api/findings", headers=admin_headers, params={"cycle": cyc, "category": "3S"}).json()["items"]
    assert only3 and all(r["category"] == "3S" for r in only3)

    assert client.get("/api/findings", headers=auditor_headers).status_code == 403


def test_dashboard_counts_findings_live_by_category(client, seeded_db, admin_headers):
    zone, auditor = _future_zone_and_auditor(client, admin_headers)
    scheduled = client.post("/api/audits", headers=admin_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    aid, cyc = scheduled["id"], scheduled["cycle"]

    def snap():
        d = client.get("/api/dashboard", headers=admin_headers, params={"cycle": cyc}).json()
        z = next(r for r in d["zones"] if r["id"] == zone["id"])
        return d["current"], z["findings"]

    before, zone_before = snap()
    _add_finding(client, admin_headers, aid, "2S", "Tools not in shadow board")
    _add_finding(client, admin_headers, aid, "2S", "Labels missing on racks")
    _add_finding(client, admin_headers, aid, "5S", "Checklist not followed")
    after, zone_after = snap()  # audit not submitted yet -- counts must already move

    assert after["findings"] - before["findings"] == 3
    assert [a - b for a, b in zip(after["fcat"], before["fcat"])] == [0, 2, 0, 0, 1]
    assert zone_after - zone_before == 3


def test_complete_blocked_once_completed(client, seeded_db, incharge_headers):
    zone, auditor = _future_zone_and_auditor(client, incharge_headers)
    scheduled = client.post("/api/audits", headers=incharge_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    aid = scheduled["id"]
    _add_finding(client, incharge_headers, aid)
    first = client.post(f"/api/audits/{aid}/complete", headers=incharge_headers)
    assert first.status_code == 200

    second = client.post(f"/api/audits/{aid}/complete", headers=incharge_headers)
    assert second.status_code == 409
    assert "already been submitted" in second.json()["detail"].lower()


def test_two_auditors_on_one_zone_only_first_complete_counts(client, seeded_db, admin_headers):
    from tests.conftest import _login
    from app.core.config import settings
    users = client.get("/api/users", headers=admin_headers).json()
    a1, a2 = [u for u in users if u["role"] == "Auditor" and u["status"] == "Active"][:2]
    zone = client.get("/api/zones", headers=admin_headers).json()[0]
    audit = client.post("/api/audits", headers=admin_headers,
                        json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=3)),
                              "auditor_ids": [a1["id"], a2["id"]]}).json()
    aid = audit["id"]
    h1 = _login(client, a1["emp_id"], settings.DEFAULT_USER_PASSWORD)
    h2 = _login(client, a2["emp_id"], settings.DEFAULT_USER_PASSWORD)

    assert _add_finding(client, h1, aid).status_code == 201

    first = client.post(f"/api/audits/{aid}/complete", headers=h1)
    assert first.status_code == 200
    assert first.json()["submitted_by"] == a1["name"] and first.json()["completed_at"]

    second = client.post(f"/api/audits/{aid}/complete", headers=h2)
    assert second.status_code == 409
    assert f"by {a1['name']}" in second.json()["detail"]

    # The partner's Home list shows who submitted it.
    listed = client.get("/api/audits", headers=h2, params={"cycle": audit["cycle"]}).json()["items"]
    assert next(x for x in listed if x["id"] == aid)["submitted_by_id"] == a1["id"]

    # Findings logged by the first auditor are still there and were not touched.
    saved = client.get(f"/api/audits/{aid}/findings", headers=h2).json()["items"]
    assert len(saved) == 1


def test_list_audits_current_cycle(client, seeded_db, auditor_headers):
    resp = client.get("/api/audits", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body and "cycle" in body
    assert "score" not in body["items"][0]


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
    resp = client.patch("/api/audits/999999", headers=incharge_headers, json={"missed_reason": "x"})
    assert resp.status_code == 404


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


def test_finding_opens_issue_that_incharge_closes_with_after_photo(client, seeded_db, admin_headers):
    zone, auditor = _future_zone_and_auditor(client, admin_headers)
    scheduled = client.post("/api/audits", headers=admin_headers,
                            json={"zone_id": zone["id"], "planned_date": str(date.today() + timedelta(days=5)),
                                  "auditor_ids": [auditor["id"]]}).json()
    aid = scheduled["id"]
    f = _add_finding(client, admin_headers, aid, "3S", "Oil spill near pump").json()
    assert f["issue_id"] and f["issue_status"] == "Open" and f["issue_code"].startswith("VD-")

    issue = next(i for i in client.get("/api/issues", headers=admin_headers).json()["items"] if i["id"] == f["issue_id"])
    assert issue["before_photo"] == f["photo_url"] and issue["description"] == "Oil spill near pump"
    assert issue["category"] == "3S" and issue["status"] == "Open"

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    r = client.post(f"/api/issues/{f['issue_id']}/close", headers=admin_headers,
                    data={"note": "Cleaned"}, files={"after_photo": ("after.png", png, "image/png")})
    assert r.status_code == 200, r.text

    after = client.get(f"/api/audits/{aid}/findings", headers=admin_headers).json()["items"][0]
    assert after["issue_status"] == "Closed" and after["after_photo"]
