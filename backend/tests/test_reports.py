def test_report_default_range(client, seeded_db, auditor_headers):
    resp = client.get("/api/reports", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "months" in body and "issues" in body
    assert len(body["months"]) == 6  # current cycle shift(-5..0) per stats.report


def test_report_frm_to_params_respected(client, seeded_db, auditor_headers):
    from app.services.stats import current_cycle, shift
    cur = current_cycle()
    frm = shift(cur, -2)
    resp = client.get("/api/reports", headers=auditor_headers, params={"frm": frm, "to": cur})
    assert resp.status_code == 200
    body = resp.json()
    assert body["from"] == frm
    assert body["to"] == cur
    assert len(body["months"]) == 3


def test_report_swaps_reversed_frm_to(client, seeded_db, auditor_headers):
    from app.services.stats import current_cycle, shift
    cur = current_cycle()
    frm = shift(cur, -2)
    # Pass them backwards; stats.report() must swap frm/to rather than erroring.
    resp = client.get("/api/reports", headers=auditor_headers, params={"frm": cur, "to": frm})
    assert resp.status_code == 200
    body = resp.json()
    assert body["from"] == frm
    assert body["to"] == cur


def test_report_filters_by_zone(client, seeded_db, auditor_headers):
    zones = client.get("/api/zones", headers=auditor_headers).json()
    zone = zones[0]
    resp = client.get("/api/reports", headers=auditor_headers, params={"zone_id": zone["id"]})
    assert resp.status_code == 200
    assert all(i["zone"] == zone["name"] for i in resp.json()["issues"])


def test_report_monthly_figures_respect_zone_filter(client, seeded_db, auditor_headers):
    # Regression: months[] used to be plant-wide even when zone_id was given, so an incharge's
    # "my zone" report showed the whole plant's numbers.
    zone = next(z for z in client.get("/api/zones", headers=auditor_headers).json() if z["name"] == "Production")
    plant = client.get("/api/reports", headers=auditor_headers).json()
    scoped = client.get("/api/reports", headers=auditor_headers, params={"zone_id": zone["id"]}).json()
    plant_raised = sum(m["raised"] for m in plant["months"])
    zone_raised = sum(m["raised"] for m in scoped["months"])
    assert 0 < zone_raised < plant_raised
    assert zone_raised == scoped["total"]


def test_report_filters_by_status_and_category(client, seeded_db, auditor_headers):
    resp = client.get("/api/reports", headers=auditor_headers, params={"status": "Closed", "category": "3S"})
    assert resp.status_code == 200
    body = resp.json()
    assert all(i["status"] == "Closed" and i["category"] == "3S" for i in body["issues"])
    assert body["open"] == 0


def test_report_filters_by_auditor(client, seeded_db, auditor_headers):
    users = client.get("/api/users", headers=auditor_headers).json()
    ravi = next(u for u in users if u["emp_id"] == "EMP1021")
    resp = client.get("/api/reports", headers=auditor_headers, params={"auditor_id": ravi["id"]})
    assert resp.status_code == 200
    assert all(i["raised_by"] == ravi["name"] for i in resp.json()["issues"])


def test_export_xlsx(client, seeded_db, auditor_headers):
    resp = client.get("/api/reports/export.xlsx", headers=auditor_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert len(resp.content) > 0


def test_dashboard_default_cycle(client, seeded_db, auditor_headers):
    resp = client.get("/api/dashboard", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "zones" in body and "ageing" in body and "leaders" in body
    assert body["zone_count"] == 11


def test_meta_endpoint(client, seeded_db, auditor_headers):
    resp = client.get("/api/meta", headers=auditor_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["categories"]) == 5
    assert len(body["zones"]) == 11
    assert "current_cycle" in body
