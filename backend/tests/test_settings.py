from datetime import datetime, timedelta


def test_get_settings_any_role(client, seeded_db, auditor_headers):
    resp = client.get("/api/settings", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["escalation_days"] == [7, 15, 30]
    assert "integrity" in body and "notifications" in body


def test_put_settings_requires_admin(client, seeded_db, incharge_headers):
    resp = client.put("/api/settings", headers=incharge_headers, json={"min_score": 80})
    assert resp.status_code == 403


def test_put_settings_persists_scalar(client, seeded_db, admin_headers):
    resp = client.put("/api/settings", headers=admin_headers, json={"min_score": 80})
    assert resp.status_code == 200
    assert resp.json()["min_score"] == 80

    again = client.get("/api/settings", headers=admin_headers).json()
    assert again["min_score"] == 80


def test_put_settings_merges_nested_dict(client, seeded_db, admin_headers):
    resp = client.put("/api/settings", headers=admin_headers,
                       json={"notifications": {"weekly_summary": True, "audit_assigned": True,
                                                "issue_raised": True, "issue_closed": True, "issue_overdue": True}})
    assert resp.status_code == 200
    assert resp.json()["notifications"]["weekly_summary"] is True


def test_put_settings_unknown_key_ignored(client, seeded_db, admin_headers):
    resp = client.put("/api/settings", headers=admin_headers, json={"not_a_real_setting": 123})
    assert resp.status_code == 200
    assert "not_a_real_setting" not in resp.json()


def test_escalation_days_change_reruns_and_bumps_open_issue_levels(client, seeded_db, admin_headers, auditor_headers, db_session):
    from app.models import Issue

    # Raise a fresh issue, then backdate it in the DB so it's old enough to escalate once
    # the thresholds are lowered, but not under the stock [7, 15, 30] thresholds.
    zone_id = client.get("/api/zones", headers=auditor_headers).json()[0]["id"]
    created = client.post("/api/issues", headers=auditor_headers,
                           json={"zone_id": zone_id, "category": "1S", "description": "Stale pallets by dock"}).json()
    issue = db_session.get(Issue, created["id"])
    issue.raised_at = datetime.now() - timedelta(days=10)
    db_session.commit()

    before = client.get("/api/issues", headers=auditor_headers, params={"status": "Open"}).json()["items"]
    before_row = next(i for i in before if i["code"] == created["code"])
    assert before_row["escalation_level"] == 0  # 10 days < 15-day first real threshold check matters below

    # Lower escalation_days so 10-day-old issues now exceed the first threshold.
    resp = client.put("/api/settings", headers=admin_headers, json={"escalation_days": [3, 15, 30]})
    assert resp.status_code == 200

    after = client.get("/api/issues", headers=auditor_headers, params={"status": "Open"}).json()["items"]
    after_row = next(i for i in after if i["code"] == created["code"])
    assert after_row["escalation_level"] == 1


def test_put_settings_without_escalation_days_does_not_rerun(client, seeded_db, admin_headers, auditor_headers, db_session):
    """Changing an unrelated setting should not trigger escalation re-evaluation."""
    from app.models import Issue

    zone_id = client.get("/api/zones", headers=auditor_headers).json()[0]["id"]
    created = client.post("/api/issues", headers=auditor_headers,
                           json={"zone_id": zone_id, "category": "1S", "description": "Old issue not escalated"}).json()
    issue = db_session.get(Issue, created["id"])
    issue.raised_at = datetime.now() - timedelta(days=40)
    issue.escalation_level = 0
    db_session.commit()

    resp = client.put("/api/settings", headers=admin_headers, json={"min_score": 70})
    assert resp.status_code == 200

    rows = client.get("/api/issues", headers=auditor_headers, params={"status": "Open"}).json()["items"]
    row = next(i for i in rows if i["code"] == created["code"])
    # escalation.run() only runs on an escalation_days change, so a 40-day-old issue stays
    # at whatever level it had before (0 here) even though it would qualify for level 3.
    assert row["escalation_level"] == 0
