# Knowledge.md — Vijay 5S Console project log

Running log of decisions, infrastructure plans, and conventions agreed on for this project,
outside of what's already in `CLAUDE.md`. Read this before re-reading source files — it exists
so future sessions don't need to re-scan every file to recover context already settled.

## Deployment decision (as of 2026-10-30)

- **Phased rollout**: deploy first on the company's existing internal VM (free, sunk cost),
  run a 10-day real-usage trial with actual auditors/auditees, then move to cloud once trust
  is established with management using real usage numbers as justification.
- **Trial VM specs seen so far**: 8GB RAM — more than sufficient (full stack uses well under 2GB).
  Disk size not yet confirmed by user — needs checking before deciding local-disk vs. object
  storage for photos during the trial phase.
- **Why containers matter for this plan**: build everything as the existing docker-compose stack
  (db, redis, api, web/nginx) from day one. This makes "move to cloud" later a lift-and-shift
  (same containers, same env-var config), not a rebuild. Don't hardcode anything that assumes
  "local disk" or "this specific host" — keep config in env vars (DATABASE_URL, REDIS_URL,
  storage backend, etc.).

### Cloud cost estimate (for the eventual pitch to management)

For 50 internal users, photo-heavy usage:
- Single VM (2 vCPU/4GB) + managed Postgres + object storage + backups: **~$40–60/month (~₹3,500–5,000/month)**.
- Photo storage itself is cheap (~$0.02–0.025/GB/month on R2/Spaces) — it is NOT the main cost driver;
  compute + managed DB dominate the bill. Don't let "lots of photos" cause overestimating cost.
- PaaS options (Railway/Render) land in the same ballpark with less ops burden.

### Migration plan internal VM → cloud (when the time comes)

1. Stand up identical docker-compose stack on cloud VM, pointed at a new empty DB.
2. Dry-run `pg_dump`/`pg_restore` + photo file copy while internal VM stays live.
3. Pick low-usage window, do final dump/restore + file copy to catch last changes.
4. Cut DNS over to cloud server.
5. Keep internal VM live read-only for a few days as fallback before decommissioning.
6. **Do NOT regenerate the JWT secret during migration** — copy the `.env` value across, or
   every existing login session/token breaks.

## Database

- **PostgreSQL only** for anything beyond a dev laptop. SQLite is dev-only per CLAUDE.md — not
  safe for 50 concurrent users (file-locking, no real concurrent writes).
- Redis is optional at this scale (50 users, single API instance) — the in-memory hub works fine
  without it. Only add Redis pub/sub if/when running multiple API worker processes.

## Photo storage architecture — IMPORTANT, not yet implemented

**Current state (checked 2026-10-30):** `backend/app/api/routes/issues.py` → `_save_photo()`
saves the raw uploaded file straight to local disk (`settings.UPLOAD_DIR`) with a UUID filename.
No resizing, no thumbnailing, no compression. This WILL cause lag as photo volume grows — phone
camera photos are typically 3–8MB and are currently served at full size everywhere (lists, grids,
dashboard), with no CDN.

**Agreed target architecture (to implement when building the Issues/photo module):**

1. On upload, generate two versions server-side (as a background task via `bg.add_task`, same
   pattern already used for the realtime hub publish — don't block the upload response):
   - **Thumbnail**: ~300px wide, ~20–50KB — used in list/grid views (Issues table, Dashboard).
   - **Compressed full-size**: max ~1600px wide, JPEG quality ~80, ~150–400KB — used only when a
     user opens/zooms a single photo.
2. Store both in S3-compatible object storage, not local disk long-term:
   - Internal VM phase: MinIO (self-hosted, S3-compatible, runs in the same docker-compose stack).
   - Cloud phase: Cloudflare R2 (zero egress fees, pairs with Cloudflare CDN for free) or S3.
   - Building against an S3-compatible API from the START (even on internal VM via MinIO) means
     the later cloud migration for photos is a bucket-to-bucket copy, not a code change.
3. Put a CDN in front of the bucket so images are served from edge cache, not through the FastAPI
   app — keeps the API server free of photo-serving load.
4. Frontend: lazy-load thumbnails in list views (`loading="lazy"` / intersection observer), only
   fetch the full compressed photo on click/zoom.

**Net effect:** uploads stay fast (resize happens async in background), list views load tiny
thumbnails from CDN edge cache, full photos are still far smaller than raw camera output. This
should be treated as a requirement, not an optimization, given the user's explicit "store more
number of photos" and "no lagging" requirements — fold it into the Issues module implementation
(module #2 in CLAUDE.md's table) rather than treating it as later hardening.

## Build process rule (2026-10-30)

- **Strictly one module per run, in the order given in CLAUDE.md's module table.** Do not build
  or touch multiple modules in a single pass, even if related. Finish the full per-module
  checklist (match prototype, click-test with two tabs for realtime, `tsc --noEmit`, pytest,
  commit) before starting the next row.
- Reason: building everything at once makes it hard to isolate which change broke what —
  reduces "reverse engineering" effort later when something needs debugging. Small, verified,
  committed steps are the whole point of the per-module checklist already in CLAUDE.md — this
  is a reinforcement of that, not a new rule.
- Practical effect: each response/session should say which single module it's working on, do
  only that module's backend+frontend+test, then stop and wait for confirmation before moving
  to the next row of the table.

## Role-based design reference (2026-10-31)

- Found two extra mockup files at project root: `5S area Incharge.html` and `5s auditor app.html`.
  Both are **login-screen-only** mockups (AI-generated UI, Tailwind-config-based, single page each),
  NOT full multi-screen apps. They are separate from `docs/prototype.html`, which remains the
  primary layout/copy reference for the shared React app already described in CLAUDE.md.
- **Decision (user confirmed 2026-10-31): ONE app, ONE codebase, role-based access** — not two
  separate frontend builds. However, each role's screens should visually reference its matching
  mockup's design language, not just reuse `docs/prototype.html` styling uniformly:
  - **5S Incharge role** → blue theme reference: `5S area Incharge.html` (primary `#00477f`,
    Inter font, Material Symbols icons, rounded-12px inputs, "Vijay 5S Audit" branding).
  - **5S Auditor role** → green/red theme reference: `5s auditor app.html` (primary `#006b3f`,
    secondary `#bb0014`, Work Sans + JetBrains Mono fonts, Material Symbols icons, rounded-xl
    inputs with leading icons, "VIJAY 5S Audit System" branding, "Login to Audit System" button
    text, versioned footer "v1.0 • Powered by Vijay IT").
- **Scope caveat**: since both reference files are login-only, we only have confirmed visual
  direction for the LOGIN screen per role so far. Post-login screens (Dashboard, Issues, etc.)
  have no auditor/incharge-specific mockup yet — continue using `docs/prototype.html` for those
  until/unless the user supplies more role-specific mockups. Don't invent new auditor/incharge
  styling for post-login pages beyond what these two files actually show.
- **Practical implication for Login module (#1, already DRAFTED)**: `frontend/src/pages/Login.tsx`
  needs to be revisited — likely needs either (a) a role selector before showing themed login, or
  (b) detect/ask role first then render the matching themed form, applying the matching color
  tokens only within that login flow. This is a change to an already-DRAFTED module, so treat
  the login/theming rework as its own explicit step — do not fold it silently into unrelated work.

## Open items / not yet decided

- Internal VM's actual disk size and backup status — not yet provided by user. Needed to decide
  whether local-disk photo storage is acceptable even temporarily during the trial, or MinIO
  should be stood up from day one of the trial.
- Whether field auditors need access from outside the office LAN during the trial (affects
  whether VPN/reverse-proxy setup is needed even for the internal-VM phase).
