# ARCHITECTURE.md — file map for Vijay 5S Console

Purpose: let Claude Code (or any dev) find the right file in one lookup instead of grepping/
reading the whole tree. Read this + `CLAUDE.md` + `Knowledge.md` before touching code — that's
usually enough context without opening every file.

## Rule for future work: one feature = one place in each layer

Every module follows the same 5-file shape. When adding/changing module `<name>`, touch only:

```
backend/app/models/<name>.py          # SQLAlchemy table(s) — only if schema changes
backend/app/services/<name>.py        # business logic (queries, calculations) — business logic NEVER lives in routes
backend/app/api/routes/<name>.py      # thin HTTP layer: validate input, call service, call hub.publish, return
backend/app/schemas/inputs.py         # Pydantic request bodies for this module (shared file, add a class)
frontend/src/pages/<Name>.tsx         # one page = one module, uses useQuery, never polls
```

Never scatter one module's logic across multiple route files. Never put a DB query inside a route
function — route calls a service function, service touches the DB.

## Backend map (`backend/app/`)

| File | Owns |
|---|---|
| `main.py` | FastAPI app instance, registers all routers from `api/routes/` |
| `core/config.py` | env-var driven settings (DATABASE_URL, REDIS_URL, UPLOAD_DIR, JWT secret, etc.) — **all config goes here, never hardcode** |
| `core/security.py` | JWT encode/decode, password hashing |
| `db/session.py` | SQLAlchemy engine/session factory, `get_db` dependency |
| `db/seed.py` | initial data seeding script (dev/demo only) |
| `models/user.py` | User table — roles: Super Admin, 5S Incharge, Auditor |
| `models/zone.py` | Zone table — includes `qr_token` for printable QR sheet |
| `models/issue.py` | Issue table — `before_photo`, `after_photo` fields currently store local file paths (see `Knowledge.md` photo architecture section — this is the part due for a rework to object storage) |
| `models/audit.py` | Audit table — `score` is manual entry for now (no checkpoint-level scoring yet) |
| `models/setting.py` | single-row settings table (escalation days, targets, toggles) |
| `services/stats.py` | Dashboard number-crunching — all aggregation queries live here, not in `routes/dashboard.py` |
| `services/settings_service.py` | get/set settings, re-evaluates open issues when `escalation_days` changes |
| `services/escalation.py` | escalation level logic; has marked hook points for future email/WhatsApp (module #10, not built) |
| `services/serializers.py` | converts ORM objects → dicts/JSON shape sent to frontend (`issue_out()` etc.) |
| `api/deps.py` | `admin_only`, `staff`, `anyone` — role-guard dependencies, used in every route's `Depends()` |
| `api/routes/auth.py` | login, token issuance |
| `api/routes/ws.py` | the one WebSocket endpoint `/ws?token=` |
| `api/routes/issues.py` | issue CRUD + `_save_photo()` (photo upload — see rework note above) |
| `api/routes/dashboard.py` | thin wrapper calling `services/stats.py` |
| `api/routes/users.py` | user CRUD (deactivate only, never delete) |
| `api/routes/audits.py` | audits calendar CRUD, has hook points for notifications (module #10) |
| `api/routes/zones.py` | zone CRUD — **done** |
| `api/routes/reports.py` | filtered report queries + Excel export — **done** |
| `api/routes/settings.py` | settings get/put — **done** |
| `api/routes/meta.py` | misc/lookup endpoints (dropdowns etc.) |
| `realtime/hub.py` | pub/sub fan-out — in-memory by default, Redis-backed when `REDIS_URL` is set. Every mutating route calls `hub.publish` via `bg.add_task` — **never call it synchronously, never skip it on a mutation** |
| `schemas/inputs.py` | all Pydantic request-body models, grouped by module with comments |

## Frontend map (`frontend/src/`)

| File | Owns |
|---|---|
| `main.tsx` | app entry, router setup |
| `api/client.ts` | **the only place that calls `fetch`** — all API calls go through here |
| `api/types.ts` | TypeScript types mirroring backend response shapes |
| `hooks/useLive.ts` | WebSocket listener; `INVALIDATES` map ties topic prefixes → TanStack Query keys. **Adding a new realtime topic = add one line here, nothing else** |
| `lib/auth.tsx` | auth context/provider, token storage |
| `lib/toast.tsx` | toast notification system |
| `lib/format.ts` | date/number formatting helpers |
| `lib/cycle.tsx` | audit-cycle date-range helpers |
| `components/Layout.tsx` | shell: nav, live indicator |
| `components/UI.tsx` | shared buttons/inputs/modals |
| `components/Charts.tsx` | `LineChart`, `BarRow` — reused by Dashboard and Reports |
| `components/Icons.tsx` | icon set |
| `components/Tip.tsx` | tooltip component |
| `pages/*.tsx` | one file per module (see CLAUDE.md module table for status) — pages only call `useQuery`/`useMutation` via `api/client.ts`, no business logic, no manual polling |
| `styles/app.css` | single stylesheet, copied from `docs/prototype.html` — match colors/layout exactly, don't invent new styles |

## Reference docs at project root

| File | Purpose |
|---|---|
| `CLAUDE.md` | stack, conventions, module build order/status — read first, always |
| `Knowledge.md` | running decision log: deployment plan, cost estimates, migration steps, the photo-storage rework that's still pending — read before infra/deploy questions |
| `ARCHITECTURE.md` | this file — file-level map, read before touching code |
| `docs/prototype.html` | the visual/copy source of truth every page must match |

## Why this file exists (token efficiency note)

Instead of globbing the whole repo or reading every file at session start, Claude Code should:
1. Read `CLAUDE.md` (conventions + module status).
2. Read `Knowledge.md` (decisions/infra context, only if the task touches deploy/photos/architecture).
3. Look up the specific file(s) needed for the current module in the tables above.
4. Read only those files.

Keep this file updated whenever a new module moves from STUB to DRAFTED, or a file's responsibility
changes — a stale map costs more tokens later than updating it now.
