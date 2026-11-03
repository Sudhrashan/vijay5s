# Vijay 5S Console — project guide for Claude Code

Real-time 5S audit console for Plant VD01 (Vijay Dairy). Replaces the single-file prototype in `docs/prototype.html`
(open it to see the exact layout, copy and colours each page must match).

**Never read `docs/prototype.html` whole — it is a large single-file app (1000+ lines) and reading it in full
burns excessive context.** Use Grep to find the section/selector/function you need, or Read with an `offset`/`limit`
range once you know which lines matter. Only exception: if the user explicitly asks to see the entire file.

## Stack
- Backend: FastAPI + SQLAlchemy 2 + PostgreSQL (SQLite works for local dev). JWT auth. `backend/app`
- Realtime: one WebSocket `/ws?token=` ; `app/realtime/hub.py` fans out events (Redis pub/sub when REDIS_URL is set)
- Frontend: React 18 + TypeScript + Vite + TanStack Query + React Router. `frontend/src`
- Deploy: docker-compose (db, redis, api, web/nginx). Any container platform works.

## How realtime works (follow this in every module)
1. A mutating API route calls `bg.add_task(hub.publish, "<entity>.<action>", {...})`.
2. `frontend/src/hooks/useLive.ts` maps the topic prefix to query keys in `INVALIDATES` and invalidates them.
3. Pages just use `useQuery`; they refetch automatically. Never poll. Add new prefixes to `INVALIDATES`.

## Conventions
- Routes in `backend/app/api/routes/<module>.py`, registered in `app/main.py`. Business logic in `app/services/`.
- Role guards: `admin_only`, `staff` (Super Admin + 5S Incharge), `anyone` in `app/api/deps.py`.
- Users are deactivated, never deleted. Issue codes are `VD-<1000+id>`.
- UI text: sentence case, plain words, errors say how to fix. CSS lives in `frontend/src/styles/app.css` (copied from prototype).
- Frontend API calls go through `src/api/client.ts` only. Types in `src/api/types.ts`.

## Module order — finish and test each before starting the next
Status key: DRAFTED = code exists but is untested in a browser. STUB = placeholder only.

| # | Module | Backend | Frontend | Status |
|---|--------|---------|----------|--------|
| 1 | Auth + shell (login, layout, live indicator) | routes/auth.py, ws.py | Login, Layout, lib/auth | DRAFTED; API tested |
| 2 | Issues (register, raise, close w/ photo, reopen, CSV) | routes/issues.py | pages/Issues.tsx | DRAFTED; API tested |
| 3 | Dashboard | services/stats.py, routes/dashboard.py | pages/Dashboard.tsx | DRAFTED; API tested |
| 4 | Users | routes/users.py | pages/Users.tsx | DRAFTED |
| 5 | Audits calendar | routes/audits.py | pages/Audits.tsx | DRAFTED |
| 6 | Zones + printable QR sheet | routes/zones.py (done) | pages/Zones.tsx | DRAFTED; API tested |
| 7 | Allocation | PUT /api/allocation (done) | pages/Allocation.tsx | DRAFTED; API tested |
| 8 | Reports + Excel export | routes/reports.py (done) | pages/Reports.tsx | DRAFTED; API tested |
| 9 | Settings (escalation, targets, toggles) | routes/settings.py (done) | pages/Settings.tsx | DRAFTED; API tested |
| 10 | Notifications (email/WhatsApp on escalation, assignment) | hook points marked in services/escalation.py, routes/audits.py | — | TODO |
| 11 | Production hardening (Alembic migrations — done; S3/Blob photo storage, rate limit, tests) | Alembic set up, see backend/alembic/ | — | PARTIAL |
| 12 | Auditor mobile app (photo + 1S-5S category + remark findings) | routes/audits.py: POST /audits/{id}/findings (multipart), GET /audits/{id}/findings, POST /audits/{id}/complete | frontend/src/auditor/* | DRAFTED; API tested |
| 13 | 5S Incharge mobile app (my zone, close/verify issues, reports) | reuses routes/issues.py, routes/reports.py (no new backend) | frontend/src/incharge/* | DRAFTED; API tested |

## Per-module checklist (do this for each row above)
1. Read the matching page in `docs/prototype.html` and match layout and wording.
2. Run the backend and click through the page in the browser with two tabs open: change data in one, confirm the other updates without refresh.
3. `cd frontend && npx tsc --noEmit` must pass. Add a pytest for any new backend logic.
4. Commit, then move to the next row.

## Prototype → real-data mapping for pending pages
- **Zones**: GET /api/zones (open, closed, score, avg_closure, qr_token). QR sheet: render `qrcode` (already in package.json) of `${location.origin}/zone/${qr_token}`; print with `window.print()`. Admin can add zone: POST /api/zones.
- **Allocation**: GET /api/audits?cycle= ; edit chips locally ; "Save allocation" -> PUT /api/allocation {rows:[{audit_id, auditor_ids}]}. Show per-auditor load = zones assigned this cycle.
- **Reports**: GET /api/reports?frm=&to=&zone_id=&auditor_id=&category=&status= ; Excel via `download("/reports/export.xlsx", params, name)`. Reuse `LineChart`, `BarRow`.
- **Settings**: GET/PUT /api/settings. Persist toggles and the three numbers; saving `escalation_days` re-evaluates open issues server-side.

## Known gaps to decide on
- Auditor mobile flow is built (frontend/src/auditor/*) but deliberately excludes QR-scan-to-open-zone and GPS photo
  stamping — descoped by the user. `require_qr`/`gps_stamp` toggles exist in Settings but nothing enforces them yet.
- The 34-question ROE004 scored checklist has been removed entirely. There is no numeric audit score anywhere. The
  auditor flow is now: take a photo, tag it with a 1S-5S category, add a mandatory remark, tap "Add finding"
  (`POST /api/audits/{id}/findings`, multipart: `photo` file + `category` + `remark` form fields, one call per
  photo -- each creates a `Finding` row immediately, found in `backend/app/models/finding.py`). Submitting the audit
  is a separate `POST /api/audits/{id}/complete` (empty body) that requires at least one finding to exist and uses
  the same race-safe "only one auditor's submit wins" conditional UPDATE as before. The Dashboard's old "Zone 5S
  scorecard" score/colour-band column is now a plain "Findings this cycle" count
  (`app/services/stats.zone_finding_counts`), with no colour coding. The admin Audits calendar's audit modal
  (`frontend/src/pages/Audits.tsx`) shows the findings (photo thumbnail + category + remark) logged against an
  audit, read-only, via the same `GET /api/audits/{id}/findings` route; the old manual "5S score (%)" field and
  admin "Mark completed" override are gone -- an audit is completed only via the auditor's own `/complete` call.
- Emails/WhatsApp: only hook points exist (module 10, still TODO).
- No live browser click-through has been done yet for modules 6-13 — all verification so far is `tsc --noEmit` +
  direct Python calls against route functions (no running uvicorn + browser session). Do this before considering any
  of them genuinely "tested" per the per-module checklist above.
- No pytest files exist yet for the new backend logic (checkpoints, audit_responses, zones/allocation/reports/settings
  routes) — the per-module checklist calls for this and it hasn't been done.
